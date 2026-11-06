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
import { buildRunSequence, fetchTargetedLeads, getTargetTitles, loadComplianceIdentity, stableHash } from "./gtm-launch";
import {
  analysisRateLimitError,
  autopilotCountries,
  autopilotSendingWindow,
  deriveRunPhase,
  fillMergeTokens,
  launchBlockers,
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
  identity: { companyName: string; postalAddress: string };
}

export async function loadLaunchContext(db: Db, userId: string): Promise<LaunchContext> {
  const [approved, identity] = await Promise.all([isApprovedToSend(userId), loadComplianceIdentity(db, userId)]);
  return { approved, identity };
}

export function runBlockers(run: RunRow, ctx: LaunchContext): LaunchBlocker[] {
  return launchBlockers({
    icpProfile: run.icpProfile,
    requireGroundedTargeting: Boolean(run.autopilot),
    bookingUrl: run.bookingUrl,
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

export function runLaunchState(run: RunRow, ctx: LaunchContext): RunLaunchState {
  const blockers = runBlockers(run, ctx);
  const launchFailure = readLaunchFailure(run.calibrationProfile);
  const phase = deriveRunPhase({
    status: run.status,
    campaignId: run.campaignId,
    autopilot: Boolean(run.autopilot),
    launchFailure,
    blockers,
  });
  return { phase, blockers, launchFailure };
}

/* ─── Plan preview (what the client reviews before launch) ───────────── */

export interface PlanPreview {
  industries: string[];
  titles: string[];
  countries: string[];
  sendingWindow: string;
  offer: { title?: string; valueProp?: string; cta?: string } | null;
  sampleEmails: Array<{
    step: number;
    delayDays: number;
    recipient: { firstName: string; jobTitle: string; company: string } | null;
    subject: string;
    body: string;
  }>;
}

function windowLabel(): string {
  const w = autopilotSendingWindow();
  return `Monday–Friday, ${w.sendingWindowStart}–${w.sendingWindowEnd} (${w.sendingTimezone.replace(/_/g, " ")})`;
}

/**
 * The plan and the baseline emails, rendered for a real matching prospect.
 * Every live email is additionally personalized per lead at send time.
 */
export function buildPlanPreview(run: RunRow): PlanPreview {
  const industries = ((run.selectedIndustries as string[]) || []).filter(Boolean);
  const titles = getTargetTitles(run);
  const countries = autopilotCountries();
  const sequence = buildRunSequence(run, [], 0);

  let sample: { firstName: string; jobTitle: string; companyName: string; industry: string } | null = null;
  try {
    const leads = fetchTargetedLeads(industries, titles, 1, stableHash(run.id) % 500, { countries });
    sample = leads[0] ?? null;
  } catch {
    sample = null;
  }

  const tokens: Record<string, string> = sample
    ? {
        first_name: sample.firstName || "there",
        company: sample.companyName || "their company",
        job_title: sample.jobTitle || "",
        industry: sample.industry || "",
      }
    : {};

  return {
    industries,
    titles,
    countries,
    sendingWindow: windowLabel(),
    offer: sequence.activeOffer ?? null,
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
