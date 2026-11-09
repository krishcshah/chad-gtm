/**
 * Server-side helpers for the autopilot launch state machine.
 *
 * Deliberately NOT a "use server" module: these take a trusted user id and are
 * only called from server actions and server components.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import type { Db } from "./db";
import { isApprovedToSend } from "./approval";
import { isPostalAddressMissing } from "./postal-hold-policy";
import {
  LEADS_PER_CAMPAIGN,
  buildRunSequence,
  fetchTargetedLeadsAsync,
  getTargetTitles,
  launchAudienceCountsAsync,
  loadComplianceIdentity,
  runStrictRoles,
  runTeamSizes,
  stableHash,
} from "./gtm-launch";
import { loadWorkspaceLeadSettings } from "./lead-conversations-server";
import {
  analysisRateLimitError,
  autopilotCountries,
  autopilotSendingWindow,
  deriveRunPhase,
  fillMergeTokens,
  launchBlockers,
  launchClaimActive,
  readLaunchFailure,
  resolveSpintax,
  type LaunchBlocker,
  type LaunchFailure,
  type RunPhase,
} from "./autopilot-policy";

type RunRow = typeof schema.chadGtmRuns.$inferSelect;

/* ─── Rate limit ─────────────────────────────────────────────────────── */

/**
 * Website analyses started by a user since `since`. Every analysis creates an
 * agent_runs row (research retries included) and/or a chad_gtm_runs row (the
 * legacy path when the agent runtime is off or fails), so the larger of the
 * two counts is the number of analyses.
 */
export async function countAnalysesSince(db: Db, userId: string, since: string): Promise<number> {
  const [agentRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.agentRuns)
    .where(
      and(
        eq(schema.agentRuns.userId, userId),
        eq(schema.agentRuns.kind, "gtm_analysis"),
        gte(schema.agentRuns.createdAt, since),
      ),
    );
  const [runRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.chadGtmRuns)
    .where(and(eq(schema.chadGtmRuns.userId, userId), gte(schema.chadGtmRuns.createdAt, since)));
  return Math.max(Number(agentRow?.n || 0), Number(runRow?.n || 0));
}

/** null when the user may start another analysis, otherwise the error to show. */
export async function analysisRateLimit(db: Db, userId: string, now = new Date()): Promise<string | null> {
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const lastDay = await countAnalysesSince(db, userId, dayAgo);
  const lastHour = lastDay === 0 ? 0 : await countAnalysesSince(db, userId, hourAgo);
  return analysisRateLimitError({ lastHour, lastDay });
}

/* ─── Readiness ──────────────────────────────────────────────────────── */

export interface LaunchContext {
  approved: boolean;
  /** The sender identity of the run's workspace: what its emails' footer carries. */
  identity: { companyName: string; postalAddress: string };
  /** The workspace booking link (Settings › Lead conversations); runs without their own use it. */
  defaultBookingUrl?: string | null;
  /** The name of the workspace `identity` belongs to. */
  workspaceName?: string;
}

/**
 * `workspaceId`: the run's workspace (null = the user's default workspace).
 * Leave it out and the default workspace's booking link is used.
 */
export async function loadLaunchContext(
  db: Db,
  userId: string,
  opts: { workspaceId?: string | null } = {},
): Promise<LaunchContext> {
  const [approved, wsIdentity, defaultBookingUrl] = await Promise.all([
    isApprovedToSend(userId),
    // The run's workspace identity, never the account-wide row (#73).
    loadComplianceIdentity(db, userId, opts.workspaceId ?? null),
    loadWorkspaceLeadSettings(db, userId, opts.workspaceId && opts.workspaceId !== "primary-default" ? opts.workspaceId : null)
      .then((s) => s.bookingUrl)
      .catch(() => null),
  ]);
  const identity = { companyName: wsIdentity.companyName, postalAddress: wsIdentity.postalAddress };
  return { approved, identity, defaultBookingUrl, workspaceName: wsIdentity.workspaceName ?? "" };
}

/** The link the agent sends for this run: its own, else the workspace default. */
export function runBookingUrl(run: Pick<RunRow, "bookingUrl">, ctx: Pick<LaunchContext, "defaultBookingUrl">): string | null {
  return run.bookingUrl || ctx.defaultBookingUrl || null;
}

export function runBlockers(run: RunRow, ctx: LaunchContext): LaunchBlocker[] {
  return launchBlockers({
    icpProfile: run.icpProfile,
    requireGroundedTargeting: Boolean(run.autopilot),
    bookingUrl: runBookingUrl(run, ctx),
    requireBookingUrl: Boolean(run.autopilot),
    identity: ctx.identity,
    approved: ctx.approved,
  });
}

export interface RunLaunchState {
  phase: RunPhase;
  blockers: LaunchBlocker[];
  launchFailure: LaunchFailure | null;
}

export function runLaunchState(
  run: RunRow,
  ctx: LaunchContext,
  /** The linked campaign: its status decides live/paused/completed once launched. */
  campaign?: { status: string; deletedAt: string | null } | null,
): RunLaunchState {
  const blockers = runBlockers(run, ctx);
  const launchFailure = readLaunchFailure(run.calibrationProfile);
  const phase = deriveRunPhase({
    status: run.status,
    campaignId: run.campaignId,
    autopilot: Boolean(run.autopilot),
    launchFailure,
    blockers,
    // The engine holds every send while the postal address is blank.
    postalHeld: isPostalAddressMissing(ctx.identity.postalAddress),
    launchInProgress: launchClaimActive(run.launchStartedAt),
    campaignStatus: campaign?.status ?? null,
    campaignDeleted: Boolean(campaign?.deletedAt),
  });
  return { phase, blockers, launchFailure };
}

/* ─── Plan preview (what the client reviews before launch) ───────────── */

export interface PlanPreview {
  industries: string[];
  titles: string[];
  /** The run's company-size brackets ('11-50', ...); optional for older callers. */
  companySizes?: string[];
  countries: string[];
  sendingWindow: string;
  offer: { title?: string; valueProp?: string; cta?: string } | null;
  /** Who a launch picks from, split the way launch picks (#56). Optional for older callers. */
  audience?: PlanAudience;
  /**
   * The pool mailbox the samples are shown as sent from (#66): its From name
   * and the signature the engine appends. Absent when no mailbox is available.
   */
  sender?: { name: string; signature: string; poolSize: number };
  sampleEmails: Array<{
    step: number;
    delayDays: number;
    recipient: { firstName: string; jobTitle: string; company: string } | null;
    subject: string;
    body: string;
  }>;
}

export interface PlanAudience {
  roleMatches: number;
  otherRoles: number;
  perRun: number;
  /** Only people with the job titles; others in the industries are never added. */
  strictRoles: boolean;
  /** Company size narrowed the counts too. */
  bySize?: boolean;
  /** The directory count failed or timed out: show no numbers, never a zero. */
  unavailable?: boolean;
}

function windowLabel(): string {
  const w = autopilotSendingWindow();
  return `Monday–Friday, ${w.sendingWindowStart}–${w.sendingWindowEnd} (${w.sendingTimezone.replace(/_/g, " ")})`;
}

/**
 * The plan and the baseline emails, rendered for a real matching prospect.
 * Every live email is additionally personalized per lead at send time.
 */
export async function buildPlanPreview(
  run: RunRow,
  senderCompany?: string,
  persona?: { name: string; firstName: string; signature: string; poolSize: number } | null
): Promise<PlanPreview> {
  const industries = ((run.selectedIndustries as string[]) || []).filter(Boolean);
  const titles = getTargetTitles(run);
  const countries = autopilotCountries();
  // The launched emails name the workspace's legal sender, so the preview does too.
  const sequence = buildRunSequence({ ...run, companyName: senderCompany?.trim() || run.companyName }, [], 0);

  // The same company-size and job-title filters launch uses (#57).
  const teamSizes = runTeamSizes(run);
  const strictRoles = runStrictRoles(run);
  let sample: { firstName: string; jobTitle: string; companyName: string; industry: string } | null = null;
  try {
    // Read in the directory worker, like the counts below.
    const leads = await fetchTargetedLeadsAsync(industries, titles, 1, stableHash(run.id) % 500, {
      countries,
      teamSizes,
      strictRoles,
    });
    sample = leads[0] ?? null;
  } catch {
    sample = null;
  }

  // Counts run in the directory worker: a count over millions of rows never freezes the page.
  const counts = await launchAudienceCountsAsync({ industries, titles, teamSizes, countries });
  const audience: PlanAudience = {
    ...counts,
    perRun: LEADS_PER_CAMPAIGN,
    strictRoles,
    bySize: teamSizes.length > 0,
  };

  const tokens: Record<string, string> = sample
    ? {
        first_name: sample.firstName || "there",
        company: sample.companyName || "their company",
        job_title: sample.jobTitle || "",
        industry: sample.industry || "",
      }
    : {};
  // Signed the way the engine signs: the sending mailbox's first name.
  if (persona && persona.poolSize > 0 && persona.firstName) tokens.sender_name = persona.firstName;

  const companySizes = (run.icpProfile as { companySizes?: unknown } | null)?.companySizes;
  return {
    industries,
    titles,
    companySizes: Array.isArray(companySizes) ? companySizes.map((s) => String(s)).filter(Boolean) : [],
    countries,
    sendingWindow: windowLabel(),
    offer: sequence.activeOffer ?? null,
    audience,
    ...(persona && persona.poolSize > 0
      ? { sender: { name: persona.name, signature: persona.signature, poolSize: persona.poolSize } }
      : {}),
    sampleEmails: sequence.steps.map((step, i) => ({
      step: i + 1,
      delayDays: step.delayDays,
      recipient: sample
        ? { firstName: sample.firstName, jobTitle: sample.jobTitle, company: sample.companyName }
        : null,
      subject: fillMergeTokens(resolveSpintax(step.subject, i), tokens),
      body: fillMergeTokens(resolveSpintax(step.bodyText, i), tokens),
    })),
  };
}
