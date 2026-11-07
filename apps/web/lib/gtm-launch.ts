/**
 * Campaign provisioning for AutoGTM runs.
 *
 * Shared by the manual calibration wizard and one-URL autopilot. Deliberately
 * NOT a "use server" module: these helpers take a trusted user/workspace id and
 * must never be callable from the browser.
 */
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { ensureOutreachSpintax, loadWorkspaceProfile, normalizeEmail, schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import type { Db } from "./db";
import { CONTACT_COOLDOWN_DAYS, recentlyContactedEmails, suppressedEmailsFor } from "./contact-guards";
import {
  getDirectoryFacets,
  getMatchingDirectoryLeadsForExport,
  searchLeadMatcherPreview,
  type DirectoryAccessLevel,
  type DirectoryLead,
} from "./leads-directory";
import type { CampaignResearchContext } from "./ai";
import { ensureCampaignLeadSnapshot } from "./campaign-drafts";
import { assertCanSend } from "./approval";
import { modeFromRun } from "./lead-conversations";
import {
  LAUNCH_AUDIENCE_NOTE,
  LAUNCH_CLAIM_TTL_MS,
  LAUNCH_FAILURE_MESSAGES,
  autopilotCountries,
  autopilotSendingWindow,
  clampAutopilotDaily,
  complianceProblems,
  isAllowedCountry,
  pickWorkAddress,
  teamSizeValuesForBrackets,
  withChosenOfferFirst,
  type LaunchFailureCode,
} from "./autopilot-policy";

type RunRow = typeof schema.chadGtmRuns.$inferSelect;

export { CONTACT_COOLDOWN_DAYS, recentlyContactedEmails, suppressedEmailsFor };
/** Leads provisioned per autopilot campaign. */
export const LEADS_PER_CAMPAIGN = 500;

export function buildCampaignContext(
  run: RunRow,
  activeOffer: { title?: string; angle?: string; valueProp?: string; cta?: string }
): CampaignResearchContext {
  const overview = (run.businessOverview as any) || {};
  const icp = (run.icpProfile as any) || {};
  const isOwnOffer = /autogtm|chadgtm|smartreach/i.test(`${run.url || ""} ${run.companyName || ""}`);

  return {
    companyName: run.companyName || "our company",
    companySummary: overview.summary,
    valueProposition: activeOffer.valueProp,
    angle: activeOffer.angle,
    cta: activeOffer.cta,
    offerTitle: activeOffer.title,
    painPoints: Array.isArray(icp.painPoints) ? icp.painPoints : [],
    targetTitles: Array.isArray(icp.targetTitles) ? icp.targetTitles : [],
    isOutboundInfrastructure: isOwnOffer,
  };
}

export function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getTargetTitles(run: RunRow): string[] {
  const icp = (run.icpProfile as any) || {};
  const flat = Array.isArray(icp.targetTitles) ? icp.targetTitles : [];
  const personaTitles = Array.isArray(icp.personas)
    ? icp.personas.flatMap((p: any) => (Array.isArray(p?.titles) ? p.titles : []))
    : [];
  return Array.from(
    new Set(
      [...flat, ...personaTitles].map((t) => String(t || "").trim()).filter((t) => t.length >= 2)
    )
  ).slice(0, 8);
}

/**
 * Leads every pool campaign may contact: a work address that is not a
 * consumer/ISP mailbox, in one of AUTOPILOT_COUNTRIES. The address on the
 * returned lead is replaced by that work address.
 */
export function toContactableLeads(rows: DirectoryLead[], countries: string[]): DirectoryLead[] {
  const out: DirectoryLead[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isAllowedCountry(row.country, countries)) continue;
    const address = pickWorkAddress(row);
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, email: address });
  }
  return out;
}

export type DirectoryQuery = (
  params: Parameters<typeof getMatchingDirectoryLeadsForExport>[0],
  maxRows: number,
  offset: number
) => DirectoryLead[];

export interface TargetedLeadOptions {
  countries?: string[];
  query?: DirectoryQuery;
  /** Directory team-size facet values (runTeamSizes); applies to every query. */
  teamSizes?: string[];
  /** Only people with the target job titles: no industry-only top-up. */
  strictRoles?: boolean;
}

/**
 * Prefer leads whose titles match the ICP, then (unless strictRoles) top up
 * with industry-only matches. Prevents a campaign from starving when title
 * formats vary wildly. Only work addresses in the allowed countries are ever
 * returned. roleMatches is how many leads came from the job-title query.
 */
export function fetchTargetedLeadsWithSplit(
  industries: string[],
  targetTitles: string[],
  desired: number,
  offset: number,
  options: TargetedLeadOptions = {}
): { leads: DirectoryLead[]; roleMatches: number } {
  const countries = options.countries ?? autopilotCountries();
  const query: DirectoryQuery = options.query ?? getMatchingDirectoryLeadsForExport;
  const teamSizes = options.teamSizes && options.teamSizes.length > 0 ? options.teamSizes : undefined;
  const base = {
    industries: industries.length > 0 ? industries : undefined,
    countries,
    hasEmail: true,
    hasWorkEmail: true,
    ...(teamSizes ? { teamSizes } : {}),
  };
  // A small share of "work" addresses are ISP mailboxes; over-fetch to cover them.
  const fetchSize = Math.ceil(desired * 1.25) + 5;
  if (targetTitles.length === 0) {
    const leads = toContactableLeads(query(base, fetchSize, offset), countries).slice(0, desired);
    return { leads, roleMatches: leads.length };
  }

  const targeted = toContactableLeads(query({ ...base, jobTitles: targetTitles }, fetchSize, offset), countries).slice(
    0,
    desired
  );
  const roleMatches = targeted.length;
  if (targeted.length >= desired || options.strictRoles) return { leads: targeted, roleMatches };

  const seen = new Set(targeted.map((lead) => lead.email.toLowerCase()));
  let fallback = toContactableLeads(query(base, desired * 3, offset), countries);
  if (fallback.length === 0 && offset > 0) {
    // Niche industries can have fewer rows than the rotation offset.
    fallback = toContactableLeads(query(base, desired * 3, 0), countries);
  }
  for (const lead of fallback) {
    if (targeted.length >= desired) break;
    const key = lead.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targeted.push(lead);
  }
  return { leads: targeted, roleMatches };
}

/** fetchTargetedLeadsWithSplit, leads only. */
export function fetchTargetedLeads(
  industries: string[],
  targetTitles: string[],
  desired: number,
  offset: number,
  options: TargetedLeadOptions = {}
): DirectoryLead[] {
  return fetchTargetedLeadsWithSplit(industries, targetTitles, desired, offset, options).leads;
}

/**
 * The run's company sizes ('11-50', ...) as the directory's team-size facet
 * values. [] (no size filter) when none parse or the facet list is unavailable.
 */
export function runTeamSizes(
  run: Pick<RunRow, "icpProfile">,
  facets: () => string[] = () => getDirectoryFacets().teamSizes.map((v) => v.value)
): string[] {
  const brackets = (run.icpProfile as { companySizes?: unknown } | null)?.companySizes;
  if (!Array.isArray(brackets) || brackets.length === 0) return [];
  let available: string[] = [];
  try {
    available = facets();
  } catch {
    available = [];
  }
  return teamSizeValuesForBrackets(brackets.map((b) => String(b ?? "")), available);
}

/** icpProfile.strictRoles: only contact people with the target job titles. */
export function runStrictRoles(run: Pick<RunRow, "icpProfile">): boolean {
  return Boolean((run.icpProfile as { strictRoles?: unknown } | null)?.strictRoles);
}

export { LAUNCH_AUDIENCE_NOTE };

export interface LaunchAudienceCounts {
  /** Matching contacts with one of the target job titles (and company size, when set). */
  roleMatches: number;
  /** Others in the same industries that launch tops a run up with. */
  otherRoles: number;
}

/**
 * How many directory contacts a launch picks from, split the way launch
 * picks them: title matches first, then others in the same industries.
 * Counts only; zero on any directory error.
 */
export function launchAudienceCounts(input: {
  industries: string[];
  titles: string[];
  teamSizes?: string[];
  countries: string[];
}): LaunchAudienceCounts {
  try {
    const teamSizes = input.teamSizes && input.teamSizes.length > 0 ? input.teamSizes : undefined;
    const sizeFilter = teamSizes ? { teamSizes } : {};
    const everyone = searchLeadMatcherPreview(input.industries, input.countries, 1, 1, sizeFilter).total;
    if (input.titles.length === 0) return { roleMatches: everyone, otherRoles: 0 };
    const roleMatches = searchLeadMatcherPreview(input.industries, input.countries, 1, 1, {
      jobTitles: input.titles,
      ...sizeFilter,
    }).total;
    return { roleMatches, otherRoles: Math.max(0, everyone - roleMatches) };
  } catch {
    return { roleMatches: 0, otherRoles: 0 };
  }
}

export function compactCustomFields(raw: Record<string, string> | undefined): Record<string, string> {
  if (!raw) return {};
  const skip = /^(email|first|last|full|name|job|title|company|industry|location|city|state|country|phone|website|linkedin)/i;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= 12) break;
    if (skip.test(key)) continue;
    const text = String(value ?? "").trim();
    if (!text) continue;
    out[key] = text.slice(0, 200);
  }
  return out;
}

/**
 * Contact fields copied from a directory record into the owner's lead list.
 *
 * Autopilot needs the address to send, plus name/title/company to personalise.
 * Phone, LinkedIn and the raw source attributes are paywalled directory data:
 * an account without directory access ("none") must not be able to harvest
 * them by launching (and pausing) autopilot runs, so they are only kept for
 * "paid" and "admin".
 */
export function directoryLeadContactFields(
  dl: Pick<DirectoryLead, "linkedinUrl" | "phone" | "rawAttributes">,
  level: DirectoryAccessLevel
): { linkedin: string | null; phone: string | null; customFields: Record<string, string> } {
  if (level === "none") return { linkedin: null, phone: null, customFields: {} };
  return {
    linkedin: dl.linkedinUrl || null,
    phone: dl.phone || null,
    customFields: compactCustomFields(dl.rawAttributes),
  };
}

/** The owner's directory access level; "none" whenever it can't be established. */
export async function launchDirectoryAccess(db: Db, userId: string): Promise<DirectoryAccessLevel> {
  try {
    const [user]: Array<{ id: string; email: string | null; role: string | null; emailVerified: boolean | null }> =
      await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          role: schema.users.role,
          emailVerified: schema.users.emailVerified,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
    if (!user) return "none";
    const { getDirectoryAccessLevel } = await import("./b2b-access");
    return await getDirectoryAccessLevel(user);
  } catch {
    return "none";
  }
}

/** Plain, offer-grounded opener used when no swipe samples were approved. */
export function defaultOpenerFromOffer(
  companyName: string,
  offer: { title?: string; valueProp?: string; cta?: string; angle?: string }
): { subject: string; bodyText: string; bodyHtml: string } {
  const value = (offer.valueProp || `${companyName} helps teams like {{company}} move faster.`).trim();
  const cta = (offer.cta || "Worth a quick look?").trim();
  const subjectSeed = (offer.title || offer.angle || "quick idea").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const subject = subjectSeed.split(/\s+/).slice(0, 4).join(" ") || "quick idea";
  const bodyText = `{Hi|Hey} {{first_name}},\n\n${value}\n\n${cta}\n\n{{sender_name}}`;
  const bodyHtml = `<p>{Hi|Hey} {{first_name}},</p><p>${value}</p><p>${cta}</p><p>{{sender_name}}</p>`;
  return { subject, bodyText, bodyHtml };
}

/** Lowercase only a leading capital so proper nouns later in the sentence survive. */
export function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** A launch that could not complete; `code` drives the client-facing state. */
export class LaunchError extends Error {
  constructor(
    readonly code: LaunchFailureCode,
    message: string = LAUNCH_FAILURE_MESSAGES[code]
  ) {
    super(message);
    this.name = "LaunchError";
  }
}

/**
 * Another launch of the same run holds the claim (or already linked a
 * campaign). Nothing was created by this attempt.
 */
export class LaunchInProgressError extends Error {
  constructor(message = "This campaign is already launching.") {
    super(message);
    this.name = "LaunchInProgressError";
  }
}

/**
 * Undo a launch that failed part-way, newest rows first (FK order). Deleting
 * the campaign cascades its steps, variants, senders, campaign leads and
 * jobs; deleting the list cascades its leads. Then release the claim.
 * Best effort: failures are logged, never thrown, so the caller can rethrow
 * the original error.
 */
async function undoFailedLaunch(
  db: Db,
  runId: string,
  claimedAt: string,
  created: { campaignId: string | null; templateId: string | null; listId: string | null }
): Promise<void> {
  const steps: Array<[string, () => Promise<unknown>]> = [];
  const { campaignId, templateId, listId } = created;
  if (campaignId) {
    steps.push(["campaign", () => db.delete(schema.campaigns).where(eq(schema.campaigns.id, campaignId))]);
  }
  if (templateId) {
    steps.push(["template", () => db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.id, templateId))]);
  }
  if (listId) {
    steps.push(["lead list", () => db.delete(schema.leadLists).where(eq(schema.leadLists.id, listId))]);
  }
  // Only release our own claim; a newer launch may hold it after the TTL.
  steps.push([
    "claim",
    () =>
      db
        .update(schema.chadGtmRuns)
        .set({ launchStartedAt: null })
        .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.launchStartedAt, claimedAt))),
  ]);
  for (const [label, step] of steps) {
    try {
      await step();
    } catch (err) {
      console.error(`[gtm-launch] cleanup of ${label} failed`, { runId, error: err });
    }
  }
}

export const COMPLIANCE_REQUIRED_ERROR =
  "Add your company name and physical postal address (Settings → Compliance) before launching. Anti-spam law requires them in every email.";

/**
 * The sender identity CAN-SPAM requires in every email. With `workspaceId`
 * (null = the default workspace) it is that workspace's (#73); without it,
 * the legacy account row, for callers not yet scoped to a workspace.
 */
export async function loadComplianceIdentity(
  db: Db,
  userId: string,
  workspaceId?: string | null
): Promise<{ companyName: string; postalAddress: string; workspaceName?: string }> {
  if (workspaceId !== undefined) {
    const ws = await loadWorkspaceProfile(db, { userId, workspaceId });
    return { companyName: ws.companyName, postalAddress: ws.postalAddress, workspaceName: ws.workspaceName };
  }
  const [row] = await db
    .select({
      companyName: schema.workspaceSettings.companyName,
      postalAddress: schema.workspaceSettings.postalAddress,
    })
    .from(schema.workspaceSettings)
    .where(eq(schema.workspaceSettings.userId, userId))
    .limit(1);
  return { companyName: row?.companyName ?? "", postalAddress: row?.postalAddress ?? "" };
}

const DEFAULT_OFFER = {
  title: "Direct Value Offer",
  angle: "Direct ROI",
  valueProp: "Accelerate your team's workflow and output.",
  cta: "Open to a brief look?",
};

export interface RunSequence {
  activeOffer: { title?: string; angle?: string; valueProp?: string; cta?: string };
  subject: string;
  bodyText: string;
  bodyHtml: string;
  steps: Array<{ delayDays: number; subject: string; bodyText: string; prompt: string }>;
}

/**
 * The baseline 3-step sequence for a run: what is sent when on-the-fly
 * personalization is unavailable, and what the client previews before launch.
 */
export function buildRunSequence(run: RunRow, approvedSamples: any[] = [], selectedOfferIndex = 0): RunSequence {
  // Launch always passes the workspace sender name; this fallback only shows in previews.
  const companyName = run.companyName || "your company";
  const calibratedProfile = (run.calibrationProfile as any) || {};
  const offers = (run.offers as any[]) || [];
  const activeOffer = offers[selectedOfferIndex] || offers[0] || DEFAULT_OFFER;

  // Baseline copy: approved swipe sample > calibrated template > offer-grounded opener.
  const offerOpener = defaultOpenerFromOffer(companyName, activeOffer);
  const primarySample = approvedSamples[0] || {
    subject: calibratedProfile.calibratedSubjectTemplate || offerOpener.subject,
    bodyText: calibratedProfile.calibratedBodyTemplate || offerOpener.bodyText,
    bodyHtml: calibratedProfile.calibratedBodyTemplate ? "" : offerOpener.bodyHtml,
  };

  const subject = primarySample.subject || offerOpener.subject;
  const bodyText = ensureOutreachSpintax(primarySample.bodyText || offerOpener.bodyText);
  const bodyHtml = ensureOutreachSpintax(primarySample.bodyHtml || `<p>${bodyText.replace(/\n/g, "<br/>")}</p>`);

  const reSubject = subject.toLowerCase().startsWith("re:") ? subject : `re: ${subject}`;
  const steps: RunSequence["steps"] = [
    {
      delayDays: 0,
      subject,
      bodyText,
      prompt: [
        calibratedProfile.customAiInstruction ||
          `Company: ${companyName}. Value offer: ${activeOffer.valueProp}. Angle: ${activeOffer.angle}. Call to action: ${activeOffer.cta}. Write a first-touch cold email in 35-70 words. No pleasantries, no self-intro, no feature dump. One specific observation, one friction, one low-friction permission question.`,
        `SPINTAX: include {Hi|Hey|Hello} and at least one other {a|b} variant group. Never spin names, companies, numbers, or factual claims.`,
        `Do not mention DNS, mailboxes, inbox warmup, or deliverability unless the campaign explicitly asks for it.`,
      ].join("\n\n"),
    },
    {
      delayDays: 3,
      subject: reSubject,
      bodyText: ensureOutreachSpintax(
        `Hi {{first_name}},\n\nOne more thought on this — ${lowerFirst((activeOffer.valueProp || "").replace(/\.$/, "")) || "happy to share how it would apply to {{company}}"}.\n\nWorth a look, or should I leave it?\n\n{{sender_name}}`
      ),
      prompt: `Write follow-up #1 (sent 3 days after initial message) for ${companyName}. Recipient is {{job_title}} at {{company}}. Never say "just checking in" or "following up". Add one new, specific reason this matters, grounded in: ${activeOffer.valueProp}. Strictly under 35 words. Low-friction permission CTA.`,
    },
    {
      delayDays: 4,
      subject: reSubject,
      bodyText: ensureOutreachSpintax(
        `Hi {{first_name}},\n\nAssuming the timing isn't right for {{company}}.\n\nShould I close the loop for now, or check back next quarter?\n\n{{sender_name}}`
      ),
      prompt: `Write follow-up #2 (final breakup email, sent 7 days after initial outreach) for ${companyName}. Recipient is {{job_title}} at {{company}}. Zero guilt, polite permission close. Under 25 words. Ask if we should close the loop or check back next quarter.`,
    },
  ];

  return { activeOffer, subject, bodyText, bodyHtml, steps };
}

export interface LaunchRunInput {
  run: RunRow;
  userId: string;
  workspaceId: string | null;
  dailyLimit: number;
  approvedSamples: any[];
  selectedOfferIndex?: number;
  /** Owner's directory access; looked up (fail closed to "none") when omitted. */
  directoryAccess?: DirectoryAccessLevel;
}

/**
 * Provision list → leads → template → campaign → 3-step AI sequence → pool
 * senders → lead snapshot, then flip the run to active.
 *
 * Every precondition (approval, CAN-SPAM identity, pool capacity, leads) is
 * checked before anything is written, and the campaign is created as a draft
 * and only switched to "running" once fully provisioned, so a failure part-way
 * never leaves a live campaign behind.
 *
 * The run is claimed (launch_started_at) before the first write, so a second
 * concurrent launch throws LaunchInProgressError without creating anything.
 * A failure part-way deletes what this launch created and releases the claim.
 */
export async function launchRunCampaign(db: Db, input: LaunchRunInput): Promise<{ campaignId: string; leadCount: number }> {
  const { run, userId, workspaceId } = input;
  const approvedSamples = Array.isArray(input.approvedSamples) ? input.approvedSamples : [];
  const dailyLimit = clampAutopilotDaily(input.dailyLimit);
  const industries = (run.selectedIndustries as string[]) || [];
  const dateStr = new Date().toISOString().slice(0, 10);
  const calibratedProfile = (run.calibrationProfile as any) || {};

  // Only approved accounts may send from the shared pool.
  await assertCanSend(userId);

  // CAN-SPAM: the sender's identity and postal address go in every email.
  // The campaign's workspace's identity, the one its footer will carry.
  const identity = await loadComplianceIdentity(db, userId, workspaceId ?? null);
  if (Object.keys(complianceProblems(identity)).length > 0) {
    throw new Error(COMPLIANCE_REQUIRED_ERROR);
  }
  // One sender per workspace: the email body, per-lead prompts and the agent
  // name the legal sender the footer names, never the researched company.
  const senderRun: RunRow = { ...run, companyName: identity.companyName.trim() || run.companyName };
  // List, template and campaign names keep the researched company.
  const companyName = run.companyName || identity.companyName || "your company";

  // Fail before writing anything if there is no capacity to send from.
  const systemSenders: Array<{ id: string }> = await db
    .select({ id: schema.senderAccounts.id })
    .from(schema.senderAccounts)
    .where(
      and(
        eq(schema.senderAccounts.isSystemPool, true),
        eq(schema.senderAccounts.status, "active"),
        isNull(schema.senderAccounts.deletedAt)
      )
    );
  if (systemSenders.length === 0) {
    throw new LaunchError("no_senders");
  }

  // The offer chosen in setup goes first: the sequence, the agent and every
  // screen read offers[0] (#51).
  const offers = withChosenOfferFirst(((run.offers as any[]) ?? []) as any[], input.selectedOfferIndex ?? 0);

  // Leads: over-fetch, then drop anyone another campaign contacted recently.
  // Company size and "only these job titles" apply here too (#57).
  const leadOffset = stableHash(run.id) % 5000;
  const { leads: candidates, roleMatches: roleMatchCount } = fetchTargetedLeadsWithSplit(
    industries,
    getTargetTitles(run),
    LEADS_PER_CAMPAIGN * 2,
    leadOffset,
    { teamSizes: runTeamSizes(run), strictRoles: runStrictRoles(run) }
  );
  // Title-query leads come first in `candidates`.
  const roleEmails = new Set(candidates.slice(0, roleMatchCount).map((c) => c.email.toLowerCase()));
  const candidateEmails = candidates.map((c) => c.email.toLowerCase());
  const contacted = await recentlyContactedEmails(db, candidateEmails);
  // Opt-outs: the owner's suppressions plus global unsubscribes/bounces/complaints.
  const suppressed = await suppressedEmailsFor(db, userId, candidateEmails);
  const matchingDirectoryLeads = candidates
    .filter((c) => {
      const e = c.email.toLowerCase();
      return !contacted.has(e) && !suppressed.has(e);
    })
    .slice(0, LEADS_PER_CAMPAIGN);

  if (matchingDirectoryLeads.length === 0) {
    throw new LaunchError(candidates.length > 0 ? "all_contacted" : "no_leads");
  }
  const roleMatched = matchingDirectoryLeads.filter((l) => roleEmails.has(l.email.toLowerCase())).length;
  const launchAudience = {
    roleMatches: roleMatched,
    otherRoles: matchingDirectoryLeads.length - roleMatched,
    at: nowIso(),
  };

  // Paywalled contact details (phone, LinkedIn, raw attributes) only for
  // accounts with directory access.
  const directoryAccess = input.directoryAccess ?? (await launchDirectoryAccess(db, userId));

  // Claim the run before the first write. Postgres re-checks the WHERE after
  // taking the row lock, so of two concurrent launches (double click, two
  // tabs, Retry while launching) exactly one gets a row back.
  const claimedAt = nowIso();
  const claimed: Array<{ id: string }> = await db
    .update(schema.chadGtmRuns)
    .set({ launchStartedAt: claimedAt, updatedAt: claimedAt })
    .where(
      and(
        eq(schema.chadGtmRuns.id, run.id),
        eq(schema.chadGtmRuns.userId, userId),
        isNull(schema.chadGtmRuns.campaignId),
        // A deleted draft never launches (#55).
        isNull(schema.chadGtmRuns.dismissedAt),
        or(
          isNull(schema.chadGtmRuns.launchStartedAt),
          lt(schema.chadGtmRuns.launchStartedAt, new Date(Date.now() - LAUNCH_CLAIM_TTL_MS).toISOString())
        )
      )
    )
    .returning({ id: schema.chadGtmRuns.id });
  if (claimed.length === 0) {
    throw new LaunchInProgressError();
  }

  // Everything created below is deleted again if the launch fails part-way.
  const created: { listId: string | null; templateId: string | null; campaignId: string | null } = {
    listId: null,
    templateId: null,
    campaignId: null,
  };
  let campaignId: string;
  try {
    const listId = crypto.randomUUID();
    created.listId = listId;
    await db.insert(schema.leadLists).values({
      id: listId,
      userId,
      workspaceId,
      name: `${companyName} AutoGTM Leads (${dateStr})`,
    });

    const CHUNK = 100;
    for (let i = 0; i < matchingDirectoryLeads.length; i += CHUNK) {
      const batch = matchingDirectoryLeads.slice(i, i + CHUNK);
      await db
        .insert(schema.leads)
        .values(
          batch.map((dl) => ({
            id: crypto.randomUUID(),
            userId,
            workspaceId,
            listId,
            email: normalizeEmail(dl.email),
            firstName: dl.firstName,
            lastName: dl.lastName,
            company: dl.companyName,
            website: dl.companyWebsite,
            jobTitle: dl.jobTitle,
            location: dl.location,
            industry: dl.industry,
            status: "new" as const,
            ...directoryLeadContactFields(dl, directoryAccess),
            tags: ["autogtm", "b2b-verified"],
          }))
        )
        .onConflictDoNothing();
    }

    const sequence = buildRunSequence({ ...senderRun, offers }, approvedSamples, 0);
    const { activeOffer, subject: finalSubject, bodyText: finalBodyText, bodyHtml: finalBodyHtml, steps } = sequence;

    const templateId = crypto.randomUUID();
    created.templateId = templateId;
    await db.insert(schema.emailTemplates).values({
      id: templateId,
      userId,
      name: `${companyName} Calibrated Template`,
      subject: finalSubject,
      bodyText: finalBodyText,
      bodyHtml: finalBodyHtml,
      format: "text",
      // Made by Autopilot: kept out of the manual wizard's template list (#105).
      source: "autopilot",
    });

    campaignId = crypto.randomUUID();
    created.campaignId = campaignId;
    await db.insert(schema.campaigns).values({
      id: campaignId,
      userId,
      workspaceId,
      name: `AutoGTM: ${companyName}`,
      // Draft until fully provisioned; flipped to running at the end.
      status: "draft",
      leadListId: listId,
      templateId,
      dailyLimit,
      minDelaySec: 45,
      maxDelaySec: 120,
      maxEmailsPerSenderPerDay: 30, // hard per-mailbox ceiling
      stopOnReply: true,
      retryFailed: true,
      trackOpens: true,
      // The run's reply mode carries over: the campaign is where it is stored from now on.
      leadConversationMode: modeFromRun(run.replyAgentMode),
      // Business hours, Monday–Friday, in the prospects' timezone (AUTOPILOT_TIMEZONE).
      ...autopilotSendingWindow(),
    });

    const styleExemplars: Array<{ subject: string; bodyText: string; recipientTitle?: string }> =
      Array.isArray(calibratedProfile.styleExemplars) && calibratedProfile.styleExemplars.length > 0
        ? calibratedProfile.styleExemplars
        : approvedSamples
            .filter((s) => s && s.approved !== false)
            .slice(0, 3)
            .map((s) => ({ subject: s.subject || "", bodyText: s.bodyText || "", recipientTitle: s.recipientTitle }));

    const sendContext = buildCampaignContext({ ...senderRun, offers }, activeOffer);
    const stepPrompt = (instruction: string) =>
      JSON.stringify({
        instruction,
        context: sendContext,
        styleExamples: styleExemplars,
        negativeConstraints: calibratedProfile.rejectionConstraints || [],
        requireSpintax: true,
      });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const stepId = crypto.randomUUID();
      await db.insert(schema.sequenceSteps).values({
        id: stepId,
        campaignId,
        position: i + 1,
        delayDays: step.delayDays,
      });
      await db.insert(schema.sequenceStepVariants).values({
        id: crypto.randomUUID(),
        stepId,
        label: "A",
        subject: step.subject,
        bodyText: step.bodyText,
        bodyHtml: i === 0 ? finalBodyHtml : `<p>${step.bodyText.replace(/\n/g, "<br/>")}</p>`,
        aiGenerateOnTheFly: true,
        aiPrompt: stepPrompt(step.prompt),
      });
    }

    await db
      .insert(schema.campaignSenders)
      .values(systemSenders.map((s) => ({ campaignId, senderId: s.id })))
      .onConflictDoNothing();

    const snapshot = await ensureCampaignLeadSnapshot(db, campaignId, listId);
    if (snapshot === 0) {
      // Fail closed: the snapshot's #31 rules left everyone out. The 90-day
      // check above already covers the owner's recent campaigns, so the people
      // left out are queued in another of the owner's live campaigns (no two
      // sequences in parallel). Matches existed, so this is all_contacted.
      throw new LaunchError("all_contacted");
    }

    // Link the run while the campaign is still a draft, and only if no other
    // launch linked one first. Releases the claim in the same write.
    const { launchFailure: _cleared, ...profileWithoutFailure } = calibratedProfile;
    const linked: Array<{ id: string }> = await db
      .update(schema.chadGtmRuns)
      .set({
        status: "active",
        campaignId,
        dailyEmailLimit: dailyLimit,
        approvedEmailSamples: approvedSamples,
        offers,
        calibrationProfile: { ...profileWithoutFailure, launchAudience },
        launchStartedAt: null,
        updatedAt: nowIso(),
      })
      .where(and(eq(schema.chadGtmRuns.id, run.id), isNull(schema.chadGtmRuns.campaignId)))
      .returning({ id: schema.chadGtmRuns.id });
    if (linked.length === 0) {
      throw new LaunchInProgressError();
    }
  } catch (err) {
    await undoFailedLaunch(db, run.id, claimedAt, created);
    throw err;
  }

  // Only now can anything send. If this write fails the run points at a
  // draft campaign, which shows as Paused and Resume runs the normal checks.
  const startedAt = nowIso();
  await db
    .update(schema.campaigns)
    .set({ status: "running", startedAt, updatedAt: startedAt })
    .where(eq(schema.campaigns.id, campaignId));

  return { campaignId, leadCount: matchingDirectoryLeads.length };
}
