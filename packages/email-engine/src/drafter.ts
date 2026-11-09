/**
 * Drafter — writes AI emails ahead of sending.
 *
 * Writing one email takes research, an angle plan and up to three
 * draft + review rounds. Doing that inside the scheduler stalled sending and
 * reply handling, so it runs here instead: its own loop, its own running
 * guard, N drafts in parallel. Each draft is stored on the campaign lead
 * (campaign_leads.draft_*) for its current step, and the scheduler only
 * claims leads whose draft is ready. Nothing here sends anything.
 *
 * Order matches the scheduler's claim order: follow-ups due within a day
 * first, then new leads by priority tier, up to about 1.5 days of the
 * campaign's daily limit ahead. Drafting ignores sending hours, so drafts are
 * ready when the window opens.
 *
 * The step-1 mailbox is only picked at schedule time, so drafts sign off with
 * a stand-in first name that is stored as {{sender_name}} and filled in with
 * the sending mailbox's first name when the email is scheduled. Follow-ups
 * sign with the step-1 mailbox's real first name.
 *
 * Autopilot campaigns never fall back to the generic baseline copy: a failed
 * draft retries with backoff and, after DRAFT_MAX_ATTEMPTS, the lead's
 * remaining sequence is cancelled ('could-not-write'). Manual campaigns keep
 * their old behaviour and send the user's own variant text instead.
 */
import { loadApplicableSuppressions } from "./suppression";
import { matchesSuppression, schema } from "@smartreach/database";
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import type { CampaignRow, EngineDb } from "./db-port";
import {
  generateEmailScriptOnTheFly,
  type GeneratedScript,
  type GenerateOnTheFlyOptions,
  type LeadProfile,
} from "./ai";
import { loadEngineAiOptions } from "./ai-options";
import { leadVars } from "./scheduler";
import {
  COULD_NOT_WRITE_NOTE,
  extractSenderFirstName,
  isAiVariant,
  loadAiStepPlan,
  loadCampaignSequenceSteps,
  loadSentThread,
  parseAiPromptPayload,
  pickVariantEqualWeight,
  readyDraftFilter,
  renderWithVarsAndSpintax,
  WRITING_UNAVAILABLE_PREFIX,
  type AiStepPlan,
  type SequenceStepRow,
  type SequenceVariantRow,
} from "./sequence";
import { loadUnapprovedOwners } from "./owner-approval";

/** Wait after the 1st, 2nd, 3rd, 4th failed draft (minutes). */
export const DRAFT_BACKOFF_MIN = [15, 60, 240, 720] as const;
/** After this many failed drafts the lead's remaining sequence is cancelled. */
export const DRAFT_MAX_ATTEMPTS = 5;
/** Draft new leads up to this many days of the campaign's daily limit ahead. */
export const DRAFT_LOOKAHEAD_DAYS = 1.5;
/** Follow-ups are drafted once they are due within this window. */
export const FOLLOW_UP_HORIZON_MS = 24 * 3_600_000;
/** A draft being written is claimed for this long (a crash frees it). */
const DRAFT_LEASE_MS = 10 * 60_000;
/** At most this many drafts per campaign per pass (keeps passes short and fair). */
const PER_CAMPAIGN_PASS_LIMIT = 60;
/** The model is unavailable: retry those leads after this long. */
const UNAVAILABLE_RETRY_MS = 15 * 60_000;
/** This many "model unavailable" errors in a row stop the pass and cool down. */
const UNAVAILABLE_STOP_AFTER = 3;
const UNAVAILABLE_COOLDOWN_MS = 5 * 60_000;
/** A pass takes at most this many drafts per worker, then plans again. */
const TASKS_PER_WORKER_PER_PASS = 4;
/** A pass starts no new draft after this long, so new campaigns and due follow-ups are planned soon. */
const PASS_TIME_BUDGET_MS = 5 * 60_000;
/**
 * This many failed drafts in a row for one campaign (none written in between)
 * means its brief cannot be written to: further failures spend no attempt
 * (no lead is cancelled), the campaign shows 'writing-unavailable', and only
 * a few probe drafts per pass are tried until one succeeds.
 */
export const CAMPAIGN_FAIL_STREAK = 10;
const STUCK_PROBES_PER_PASS = 2;
const STUCK_RETRY_MS = 60 * 60_000;

/** Stand-in sign-off names: the gate and critic see a name, never a {{placeholder}}. */
export const SENDER_NAME_STAND_INS = ["Ellery", "Corwin", "Tamsin", "Lisandro"] as const;
export const SENDER_NAME_PLACEHOLDER = "{{sender_name}}";

type Env = Record<string, string | undefined>;

/** ENGINE_DRAFT_CONCURRENCY: emails written in parallel (default 6). */
export function draftConcurrency(env: Env = process.env): number {
  const n = Number(env.ENGINE_DRAFT_CONCURRENCY ?? 6);
  return Number.isFinite(n) && n >= 1 ? Math.min(50, Math.floor(n)) : 6;
}

/** ENGINE_DRAFT_INTERVAL_MS: how often a drafter pass starts (default 20 s). */
export function draftIntervalMs(env: Env = process.env): number {
  const n = Number(env.ENGINE_DRAFT_INTERVAL_MS ?? 20_000);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 20_000;
}

/** How long to wait after the `attempts`-th failed draft. */
export function draftBackoffMs(attempts: number): number {
  const i = Math.max(1, Math.floor(attempts)) - 1;
  return DRAFT_BACKOFF_MIN[Math.min(i, DRAFT_BACKOFF_MIN.length - 1)]! * 60_000;
}

/**
 * True when the error says the model itself is unavailable (no key, auth,
 * rate limit, provider or network down), not that this one draft was poor.
 * Those failures do not count toward giving up on a lead: the campaign shows
 * 'writing-unavailable'. A 400 or an empty/blocked answer is about this
 * lead's prompt, so it spends an attempt like any poor draft.
 */
export function isModelUnavailableError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? "");
  // Quality failures quote the critic's notes, which may contain any word.
  if (/^(draft failed quality checks|the model returned no usable email)/i.test(msg)) return false;
  const status = /api error \((\d{3})\)/i.exec(msg);
  if (status) {
    const s = Number(status[1]);
    return s === 401 || s === 403 || s === 408 || s === 429 || s >= 500;
  }
  return /no ai (api key|model) configured|fetch failed|abort|timed? ?out|econn|enotfound|eai_again|socket hang up|network error/i.test(
    msg,
  );
}

/** Failed drafts in a row per campaign (reset by any written draft). In memory. */
const failStreak = new Map<string, number>();

/** True when this campaign's recent drafts all failed (see CAMPAIGN_FAIL_STREAK). */
export function campaignWritingStuck(campaignId: string): boolean {
  return (failStreak.get(campaignId) ?? 0) >= CAMPAIGN_FAIL_STREAK;
}

/** A stand-in first name that does not appear anywhere in the lead or the campaign brief. */
export function pickStandInName(haystack: Array<string | null | undefined>): string {
  const text = haystack.filter(Boolean).join(" ").toLowerCase();
  return SENDER_NAME_STAND_INS.find((n) => !text.includes(n.toLowerCase())) ?? SENDER_NAME_STAND_INS[0];
}

/** Swap the stand-in name for {{sender_name}} (filled in at schedule time). */
export function withSenderPlaceholder(text: string, standIn: string): string {
  return text.replace(new RegExp(`\\b${standIn}\\b`, "g"), SENDER_NAME_PLACEHOLDER);
}

export type DraftGenerator = (o: GenerateOnTheFlyOptions) => Promise<GeneratedScript>;

export interface DrafterOptions {
  now?: Date;
  concurrency?: number;
  /** Writes one email (default: the copywriter via generateEmailScriptOnTheFly). */
  generate?: DraftGenerator;
  env?: Env;
}

export interface DraftPassResult {
  campaigns: number;
  /** Drafts stored ready this pass. */
  drafted: number;
  /** Drafts that failed and will be retried. */
  failed: number;
  /** Leads cancelled because no acceptable email could be written. */
  gaveUp: number;
  /** Manual campaigns that fell back to the user's own variant text. */
  fellBack: number;
  /** Ready drafts waiting to be sent (all drafted campaigns). */
  ready: number;
  /** Failed drafts waiting for their retry time (as of the start of the pass). */
  waiting: number;
  /** The pass stopped early because the model is unavailable. */
  modelUnavailable: boolean;
  /** The pass wrote nothing: the model was found unavailable a few minutes ago. */
  coolingDown: boolean;
  skipped: string[];
}

interface CampaignPlan {
  campaign: CampaignRow;
  autopilot: boolean;
  steps: SequenceStepRow[];
  plan: AiStepPlan;
  variantsByStep: Map<string, SequenceVariantRow[]>;
  suppressed: string[];
  leads: Map<string, any>;
}

interface DraftTask {
  cp: CampaignPlan;
  id: string;
  leadId: string;
  stepPosition: number;
}

type DraftOutcome = "drafted" | "failed" | "gave-up" | "fell-back" | "unavailable" | "skipped";

/* ─── Campaign selection ─────────────────────────────────────────────── */

/**
 * Autopilot campaigns (linked from a chad_gtm_runs row, or built from an
 * Autopilot template) never send generic copy. A failed lookup counts as
 * Autopilot: holding an email is safer than sending a generic one.
 */
export async function isAutopilotCampaign(
  db: EngineDb,
  campaign: Pick<CampaignRow, "id" | "templateId">,
): Promise<boolean> {
  try {
    const runs: Array<{ id: string }> = await db
      .select({ id: schema.chadGtmRuns.id })
      .from(schema.chadGtmRuns)
      .where(eq(schema.chadGtmRuns.campaignId, campaign.id))
      .limit(1);
    if (Array.isArray(runs) && runs.length > 0) return true;
    if (!campaign.templateId) return false;
    const tpl: Array<{ source: string | null }> = await db
      .select({ source: schema.emailTemplates.source })
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, campaign.templateId))
      .limit(1);
    return tpl[0]?.source === "autopilot";
  } catch (err) {
    console.error(`[drafter] could not tell whether campaign ${campaign.id} is Autopilot:`, err);
    return true;
  }
}

/** The person replied anywhere (same rule as the scheduler's stop-on-reply claim). */
const notReplied = sql`NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = campaign_leads.lead_id AND l.status IN ('replied','interested','meeting_booked','won','lost'))`;

/** SQL: no usable draft for the current step yet. */
function needsDraft(variantIds: string[]) {
  const c = schema.campaignLeads;
  return or(
    isNull(c.draftStatus),
    ne(c.draftStatus, "ready"),
    isNull(c.draftStep),
    ne(c.draftStep, c.stepPosition),
    isNull(c.draftVariantId),
    variantIds.length > 0 ? notInArray(c.draftVariantId, variantIds) : sql`1=1`,
  );
}

/** SQL: not waiting for a retry and not being written elsewhere. */
function draftDue(nowIso: string) {
  const c = schema.campaignLeads;
  return or(isNull(c.draftRetryAt), sql`${c.draftRetryAt} = ''`, lte(c.draftRetryAt, nowIso));
}

/** SQL: the email is due before `horizonIso` (or has no wait). */
function dueBy(horizonIso: string) {
  const c = schema.campaignLeads;
  return or(isNull(c.scheduledFor), sql`${c.scheduledFor} = ''`, lte(c.scheduledFor, horizonIso));
}

/** Drafts of one kind (follow-up or new lead, by priority) for a campaign's queued leads. */
interface DraftCountRow {
  followUp: boolean;
  priority: number | null;
  /** Ready to send. */
  ready: number;
  /** Failed and waiting to retry, or being written, at the current step. */
  pending: number;
  failed: number;
}

/**
 * Draft counts for a campaign's queued leads, by follow-up/new and priority.
 * Only rows that hold a draft are read (campaign_leads_draft_idx), never the
 * whole queued audience.
 */
async function draftCounts(db: EngineDb, campaignId: string, variantIds: string[]): Promise<DraftCountRow[]> {
  const c = schema.campaignLeads;
  const followUp = sql<boolean>`(${c.stepPosition} > 1)`;
  const rows: Array<Record<string, unknown>> = await db
    .select({
      followUp,
      priority: c.priority,
      ready: sql<number>`count(*) filter (where ${readyDraftFilter(variantIds)})`,
      pending: sql<number>`count(*) filter (where ${c.draftStatus} in ('failed','drafting') and ${c.draftStep} = ${c.stepPosition})`,
      failed: sql<number>`count(*) filter (where ${c.draftStatus} = 'failed')`,
    })
    .from(c)
    .where(and(eq(c.campaignId, campaignId), eq(c.status, "queued"), inArray(c.draftStatus, ["ready", "failed", "drafting"])))
    .groupBy(followUp, c.priority);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    followUp: r.followUp === true || r.followUp === "t" || r.followUp === "true",
    priority: r.priority == null ? null : Number(r.priority),
    ready: Number(r.ready ?? 0),
    pending: Number(r.pending ?? 0),
    failed: Number(r.failed ?? 0),
  }));
}

/**
 * Drafts that will be sent before a new lead of priority `p` (null = no
 * priority, sorts last): all follow-ups, and new leads at that priority or
 * higher. Failed and in-progress drafts count too, so drafts that keep
 * failing never pull in more and more new leads.
 */
export function draftsAheadOf(rows: DraftCountRow[], p: number | null): number {
  let n = 0;
  for (const r of rows) {
    const ahead = r.followUp || p == null || (r.priority != null && r.priority <= p);
    if (ahead) n += r.ready + r.pending;
  }
  return n;
}

/**
 * The leads to draft next for one campaign, in the scheduler's claim order:
 * follow-ups due within a day (always), then new leads by priority until
 * about DRAFT_LOOKAHEAD_DAYS of the daily limit is drafted ahead. The
 * look-ahead counts only drafts that go out before the next new lead, so a
 * higher tier added later is drafted at once, ahead of ready lower tiers.
 */
export async function selectDraftTargets(
  db: EngineDb,
  campaign: Pick<CampaignRow, "id" | "dailyLimit"> & { stopOnReply?: boolean },
  plan: AiStepPlan,
  now: Date,
): Promise<{ targets: Array<{ id: string; leadId: string; stepPosition: number }>; ready: number; failed: number }> {
  const c = schema.campaignLeads;
  const nowIso = now.toISOString();
  const countRows = await draftCounts(db, campaign.id, plan.variantIds);
  const counts = {
    ready: countRows.reduce((s, r) => s + r.ready, 0),
    failed: countRows.reduce((s, r) => s + r.failed, 0),
  };
  const base = and(
    eq(c.campaignId, campaign.id),
    eq(c.status, "queued"),
    inArray(c.stepPosition, plan.positions),
    needsDraft(plan.variantIds),
    draftDue(nowIso),
    // Never for people who replied, unless the campaign keeps sending after a reply.
    campaign.stopOnReply === false ? sql`1=1` : notReplied,
  );
  const order = [desc(c.stepPosition), sql`${c.priority} asc nulls last`, asc(c.createdAt)];
  const cols = { id: c.id, leadId: c.leadId, stepPosition: c.stepPosition };

  const followUps: Array<{ id: string; leadId: string; stepPosition: number }> = await db
    .select(cols)
    .from(c)
    .where(and(base, gt(c.stepPosition, 1), dueBy(new Date(now.getTime() + FOLLOW_UP_HORIZON_MS).toISOString())))
    .orderBy(...order)
    .limit(PER_CAMPAIGN_PASS_LIMIT);

  const target = Math.ceil(Math.max(1, Number(campaign.dailyLimit) || 0) * DRAFT_LOOKAHEAD_DAYS);
  const roomAt = (p: number | null) =>
    Math.min(PER_CAMPAIGN_PASS_LIMIT - followUps.length, target - draftsAheadOf(countRows, p) - followUps.length);
  // Most room is for a top-priority lead; the first candidate's tier sets the real room.
  const best = roomAt(Number.NEGATIVE_INFINITY);
  let fresh: Array<{ id: string; leadId: string; stepPosition: number }> = [];
  if (best > 0 && plan.positions.includes(1)) {
    const candidates: Array<{ id: string; leadId: string; stepPosition: number; priority?: number | null }> = await db
      .select({ ...cols, priority: c.priority })
      .from(c)
      .where(and(base, eq(c.stepPosition, 1), dueBy(nowIso)))
      .orderBy(...order)
      .limit(best);
    const first = candidates[0];
    if (first) {
      const room = roomAt(first.priority == null ? null : Number(first.priority));
      fresh = candidates.slice(0, Math.max(0, room)).map(({ id, leadId, stepPosition }) => ({ id, leadId, stepPosition }));
    }
  }
  return { targets: [...followUps, ...fresh], ready: counts.ready, failed: counts.failed };
}

/* ─── Writing one draft ──────────────────────────────────────────────── */

async function defaultGenerate(o: GenerateOnTheFlyOptions): Promise<GeneratedScript> {
  // Without a key there is nothing to call: fail fast as "unavailable".
  if (!o.apiKey?.trim()) throw new Error("No AI API key configured for on-the-fly generation");
  return generateEmailScriptOnTheFly(o);
}

function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((b) => `<p>${b.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Claim the lead for drafting (another pass or process may be on it). */
async function leaseDraft(db: EngineDb, task: DraftTask, now: Date): Promise<boolean> {
  const c = schema.campaignLeads;
  const nowIso = now.toISOString();
  const rows: Array<{ id: string }> = await db
    .update(c)
    .set({
      draftStatus: "drafting",
      // Attempts count per step: a draft left over from another step starts again.
      draftAttempts: sql`case when ${c.draftStep} = ${task.stepPosition} then ${c.draftAttempts} else 0 end`,
      draftStep: task.stepPosition,
      draftRetryAt: new Date(now.getTime() + DRAFT_LEASE_MS).toISOString(),
    })
    .where(
      and(
        eq(c.id, task.id),
        eq(c.status, "queued"),
        eq(c.stepPosition, task.stepPosition),
        draftDue(nowIso),
        // Another drafter may have just stored it: never re-write a ready draft.
        needsDraft(task.cp.plan.variantIds),
      ),
    )
    .returning({ id: c.id });
  return Array.isArray(rows) && rows.length > 0;
}

/** Only touch the row while it is still queued at the drafted step. */
function stillAtStep(task: DraftTask) {
  const c = schema.campaignLeads;
  return and(eq(c.id, task.id), eq(c.status, "queued"), eq(c.stepPosition, task.stepPosition));
}

async function storeReady(
  db: EngineDb,
  task: DraftTask,
  draft: { variantId: string; subject: string; bodyText: string; bodyHtml: string; error?: string | null },
  now: Date,
): Promise<void> {
  await db
    .update(schema.campaignLeads)
    .set({
      draftStatus: "ready",
      draftStep: task.stepPosition,
      draftVariantId: draft.variantId,
      draftSubject: draft.subject,
      draftBodyText: draft.bodyText,
      draftBodyHtml: draft.bodyHtml,
      draftRetryAt: null,
      draftError: draft.error ?? null,
      draftedAt: now.toISOString(),
    })
    .where(stillAtStep(task));
}

async function cancelLead(db: EngineDb, task: DraftTask, reason: string, now: Date, extra: Record<string, unknown> = {}) {
  await db
    .update(schema.campaignLeads)
    .set({ status: "cancelled", lastError: reason, updatedAt: now.toISOString(), ...extra })
    .where(stillAtStep(task));
}

/** Write (or fall back, or fail) the draft for one lead. Never throws. */
export async function draftOne(
  db: EngineDb,
  task: DraftTask,
  opts: { now: Date; generate: DraftGenerator; aiOptions: { apiKey?: string | null; provider?: string; model?: string } },
): Promise<DraftOutcome> {
  const { cp, stepPosition } = task;
  const now = opts.now;
  try {
    if (!(await leaseDraft(db, task, now))) return "skipped";
    const lead = cp.leads.get(task.leadId);
    if (!lead) {
      await cancelLead(db, task, "lead-missing", now);
      return "skipped";
    }
    if (matchesSuppression(lead.email, cp.suppressed)) {
      await cancelLead(db, task, "suppressed", now);
      return "skipped";
    }
    const step = cp.steps.find((s) => s.position === stepPosition);
    const picked = step ? pickVariantEqualWeight(cp.variantsByStep.get(step.id) ?? []) : null;
    if (!step || !picked) {
      await failDraft(db, task, new Error("sequence-variant-missing"), now);
      return "failed";
    }
    // A step can mix AI and hand-written variants: a hand-written pick needs no writing.
    if (!isAiVariant(picked)) {
      await storeReady(db, task, { variantId: picked.id, subject: picked.subject, bodyText: picked.bodyText, bodyHtml: picked.bodyHtml }, now);
      return "drafted";
    }

    try {
      const written = await writeAiDraft(db, task, lead, picked, opts);
      await storeReady(db, task, { variantId: picked.id, ...written }, now);
      failStreak.delete(cp.campaign.id);
      return "drafted";
    } catch (err) {
      if (!cp.autopilot) {
        // Manual campaign: the user's own variant text, as before.
        console.warn(`[drafter] AI writing failed for manual campaign ${cp.campaign.id}; using the variant text:`, (err as Error)?.message || err);
        await storeReady(
          db,
          task,
          {
            variantId: picked.id,
            subject: picked.subject,
            bodyText: picked.bodyText,
            bodyHtml: picked.bodyHtml,
            error: String((err as Error)?.message || err).slice(0, 500),
          },
          now,
        );
        return "fell-back";
      }
      return await failDraft(db, task, err, now);
    }
  } catch (err) {
    console.error(`[drafter] draft for campaign lead ${task.id} failed:`, err);
    return "skipped";
  }
}

/** Record a failed Autopilot draft: retry with backoff, or give up on the lead. */
async function failDraft(db: EngineDb, task: DraftTask, err: unknown, now: Date): Promise<DraftOutcome> {
  const c = schema.campaignLeads;
  const message = String((err as Error)?.message || err).slice(0, 500);
  if (isModelUnavailableError(err)) {
    // Not this lead's fault: no attempt is spent, the campaign shows why it waits.
    await db
      .update(c)
      .set({
        draftStatus: "failed",
        draftRetryAt: new Date(now.getTime() + UNAVAILABLE_RETRY_MS).toISOString(),
        draftError: `${WRITING_UNAVAILABLE_PREFIX}: ${message}`,
      })
      .where(stillAtStep(task));
    return "unavailable";
  }
  const campaignId = task.cp.campaign.id;
  const streak = (failStreak.get(campaignId) ?? 0) + 1;
  failStreak.set(campaignId, streak);
  if (streak >= CAMPAIGN_FAIL_STREAK) {
    // Every recent draft for this campaign failed: the brief, not the lead,
    // is the problem. Spend no attempt (nobody is cancelled) and say so.
    await db
      .update(c)
      .set({
        draftStatus: "failed",
        draftRetryAt: new Date(now.getTime() + STUCK_RETRY_MS).toISOString(),
        draftError: `${WRITING_UNAVAILABLE_PREFIX}: every recent draft failed: ${message}`.slice(0, 500),
      })
      .where(stillAtStep(task));
    if (streak === CAMPAIGN_FAIL_STREAK) {
      console.warn(`[drafter] campaign ${campaignId}: ${streak} drafts in a row failed; holding its emails until one succeeds`);
    }
    return "failed";
  }
  const rows: Array<{ attempts: number }> = await db
    .select({ attempts: c.draftAttempts })
    .from(c)
    .where(eq(c.id, task.id))
    .limit(1);
  const attempts = Number(rows?.[0]?.attempts ?? 0) + 1;
  if (attempts >= DRAFT_MAX_ATTEMPTS) {
    // Never a generic email: stop this lead's sequence instead.
    await cancelLead(db, task, COULD_NOT_WRITE_NOTE, now, {
      draftStatus: "failed",
      draftAttempts: attempts,
      draftRetryAt: null,
      draftError: message,
    });
    return "gave-up";
  }
  await db
    .update(c)
    .set({
      draftStatus: "failed",
      draftAttempts: attempts,
      draftRetryAt: new Date(now.getTime() + draftBackoffMs(attempts)).toISOString(),
      draftError: message,
    })
    .where(stillAtStep(task));
  return "failed";
}

/** The copywriter call, with a stand-in sign-off name swapped for {{sender_name}}. */
async function writeAiDraft(
  db: EngineDb,
  task: DraftTask,
  lead: any,
  picked: SequenceVariantRow,
  opts: { generate: DraftGenerator; aiOptions: { apiKey?: string | null; provider?: string; model?: string } },
): Promise<{ subject: string; bodyText: string; bodyHtml: string }> {
  const stepPosition = task.stepPosition;
  // Follow-ups go from the step-1 mailbox, already known: sign with its real
  // name so the thread reads as one sender. Step 1 uses a stand-in.
  const threadSender = stepPosition > 1 ? await loadThreadSenderName(db, task.id) : null;
  const standIn =
    threadSender ??
    pickStandInName([lead.firstName, lead.lastName, lead.company, lead.email, lead.jobTitle, picked.aiPrompt]);
  const finish = (text: string) => (threadSender ? text : withSenderPlaceholder(text, standIn));
  const vars: Record<string, string> = {
    ...leadVars(lead),
    unsubscribe_url: "",
    sender_name: standIn,
    senderName: standIn,
  };
  const leadProfile: LeadProfile = {
    email: vars.email || lead.email || "",
    firstName: vars.first_name || lead.firstName || null,
    lastName: vars.last_name || lead.lastName || null,
    company: vars.company || lead.company || null,
    jobTitle: vars.job_title || lead.jobTitle || null,
    website: vars.website || lead.website || null,
    industry: vars.industry || lead.industry || null,
    location: vars.location || lead.location || null,
    customFields: lead.customFields || null,
  };
  // Follow-ups build on what was actually sent in this thread.
  const prior = stepPosition > 1 ? await loadSentThread(db, task.id) : [];
  const firstSubject = prior.find((p) => p.step === 1)?.subject?.trim();
  const payload = parseAiPromptPayload(picked.aiPrompt || "");
  const generated = await opts.generate({
    lead: leadProfile,
    customInstruction: payload.instruction,
    campaignContext: payload.campaignContext,
    styleExamples: payload.styleExamples,
    negativeConstraints: payload.negativeConstraints,
    requireSpintax: payload.requireSpintax,
    senderName: standIn,
    stepPosition,
    priorEmails: prior,
    threadSubject: firstSubject,
    fallbackSubject: renderWithVarsAndSpintax(picked.subject, vars),
    fallbackBody: renderWithVarsAndSpintax(picked.bodyText, vars),
    vars,
    apiKey: opts.aiOptions.apiKey,
    provider: opts.aiOptions.provider,
    model: opts.aiOptions.model,
    // Never heuristic copy: a failure is retried, never sent.
    onFailure: "throw",
  });
  const bodyText = String(generated?.bodyText || "").trim();
  if (!bodyText) throw new Error("The model returned no usable email");
  const html = String(generated.bodyHtml || "").trim() || textToHtml(bodyText);
  return {
    subject: finish(String(generated.subject || picked.subject || "").trim()),
    bodyText: finish(bodyText),
    bodyHtml: finish(html),
  };
}

/** First name of the mailbox that sent this lead's earliest email (null if none yet). */
async function loadThreadSenderName(db: EngineDb, campaignLeadId: string): Promise<string | null> {
  const jobs: Array<{ senderId: string | null }> = await db
    .select({ senderId: schema.emailJobs.senderId })
    .from(schema.emailJobs)
    .where(and(eq(schema.emailJobs.campaignLeadId, campaignLeadId), inArray(schema.emailJobs.status, ["sent", "bounced"])))
    .orderBy(asc(schema.emailJobs.stepPosition))
    .limit(1);
  const senderId = jobs?.[0]?.senderId;
  if (!senderId) return null;
  const senders: Array<{ senderName: string | null; fromName: string | null; email: string | null }> = await db
    .select({
      senderName: schema.senderAccounts.senderName,
      fromName: schema.senderAccounts.fromName,
      email: schema.senderAccounts.email,
    })
    .from(schema.senderAccounts)
    .where(eq(schema.senderAccounts.id, senderId))
    .limit(1);
  return senders?.[0] ? extractSenderFirstName(senders[0]) : null;
}

/* ─── One pass ───────────────────────────────────────────────────────── */

let modelDownUntil = 0;

/** Campaigns that may need drafts: running, or starting within a day. */
async function draftableCampaigns(db: EngineDb, now: Date): Promise<CampaignRow[]> {
  const soon = new Date(now.getTime() + FOLLOW_UP_HORIZON_MS).toISOString();
  return db
    .select()
    .from(schema.campaigns)
    .where(
      and(
        isNull(schema.campaigns.deletedAt),
        or(
          eq(schema.campaigns.status, "running"),
          and(eq(schema.campaigns.status, "scheduled"), lte(schema.campaigns.scheduledAt, soon)),
        ),
      ),
    );
}

async function planCampaign(
  db: EngineDb,
  campaign: CampaignRow,
  now: Date,
  result: DraftPassResult,
  maxTasks: number,
): Promise<DraftTask[]> {
  const steps = await loadCampaignSequenceSteps(db, campaign.id);
  if (steps.length === 0) return [];
  const { plan, variantsByStep } = await loadAiStepPlan(db, steps);
  if (plan.positions.length === 0) return [];
  result.campaigns++;
  const sel = await selectDraftTargets(db, campaign, plan, now);
  result.ready += sel.ready;
  result.waiting += sel.failed;
  // A campaign whose drafts keep failing only gets a couple of probes.
  sel.targets = sel.targets.slice(0, campaignWritingStuck(campaign.id) ? STUCK_PROBES_PER_PASS : maxTasks);
  if (sel.targets.length === 0) return [];
  const leadRows: any[] = await db
    .select()
    .from(schema.leads)
    .where(inArray(schema.leads.id, sel.targets.map((t) => t.leadId)));
  const suppressed = await loadApplicableSuppressions(
    db,
    campaign.userId,
    leadRows.map((l) => String(l.email ?? "")),
  );
  const cp: CampaignPlan = {
    campaign,
    autopilot: await isAutopilotCampaign(db, campaign),
    steps,
    plan,
    variantsByStep,
    suppressed,
    leads: new Map(leadRows.map((l) => [l.id, l])),
  };
  return sel.targets.map((t) => ({ cp, id: t.id, leadId: t.leadId, stepPosition: Number(t.stepPosition) || 1 }));
}

/** Round-robin across campaigns so one large campaign never starves the rest. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]!);
  return out;
}

/** Rotates which campaign goes first, so a capped pass is fair over time. */
let passRotation = 0;

/**
 * This pass's work, at most `max` drafts: due follow-ups of every campaign
 * first, then new leads, round-robin, starting from a rotating campaign.
 */
export function orderPassTasks<T extends { stepPosition: number }>(lists: T[][], max: number, rotation = 0): T[] {
  const n = lists.length;
  const start = n > 0 ? ((rotation % n) + n) % n : 0;
  const rotated = [...lists.slice(start), ...lists.slice(0, start)];
  const followUps = interleave(rotated.map((l) => l.filter((t) => t.stepPosition > 1)));
  const fresh = interleave(rotated.map((l) => l.filter((t) => t.stepPosition <= 1)));
  return [...followUps, ...fresh].slice(0, Math.max(0, max));
}

/**
 * One drafter pass over every campaign that needs drafts. Safe to run while
 * the scheduler, processor and reply agent run: it only writes draft columns
 * (and cancels leads it must never email).
 */
export async function drafterPass(db: EngineDb, opts: DrafterOptions = {}): Promise<DraftPassResult> {
  const now = opts.now ?? new Date();
  const result: DraftPassResult = {
    campaigns: 0,
    drafted: 0,
    failed: 0,
    gaveUp: 0,
    fellBack: 0,
    ready: 0,
    waiting: 0,
    modelUnavailable: false,
    coolingDown: false,
    skipped: [],
  };
  const all = await draftableCampaigns(db, now);
  if (all.length === 0) return result;
  let unapproved: Set<string>;
  try {
    unapproved = await loadUnapprovedOwners(db, all.map((c) => c.userId));
  } catch (err) {
    console.error("[drafter] owner approval lookup failed:", err);
    return result;
  }
  // A pass is short (a few drafts per worker, a time budget), then plans
  // again: new campaigns and newly due follow-ups wait minutes, not hours.
  const concurrency = Math.max(1, opts.concurrency ?? draftConcurrency(opts.env));
  const maxTasks = concurrency * TASKS_PER_WORKER_PER_PASS;
  const lists: DraftTask[][] = [];
  for (const c of all) {
    if (unapproved.has(c.userId)) continue;
    try {
      lists.push(await planCampaign(db, c, now, result, maxTasks));
    } catch (err) {
      console.error(`[drafter] campaign ${c.id} planning failed:`, err);
      result.skipped.push(`${c.name}: error`);
    }
  }
  const tasks = orderPassTasks(lists, maxTasks, passRotation);
  passRotation = (passRotation + 1) % 1_000_000;
  if (tasks.length === 0) return result;
  if (Date.now() < modelDownUntil) {
    result.modelUnavailable = true;
    result.coolingDown = true;
    return result;
  }

  const generate = opts.generate ?? defaultGenerate;
  const aiOptions = await loadEngineAiOptions(db, "");
  let unavailableRun = 0;
  let next = 0;
  const deadline = Date.now() + PASS_TIME_BUDGET_MS;
  const worker = async () => {
    while (next < tasks.length && !result.modelUnavailable && Date.now() < deadline) {
      const task = tasks[next++]!;
      const outcome = await draftOne(db, task, { now: opts.now ?? new Date(), generate, aiOptions });
      if (outcome === "unavailable") {
        if (++unavailableRun >= UNAVAILABLE_STOP_AFTER) {
          result.modelUnavailable = true;
          modelDownUntil = Date.now() + UNAVAILABLE_COOLDOWN_MS;
        }
        continue;
      }
      if (outcome !== "skipped") unavailableRun = 0;
      if (outcome === "drafted") result.drafted++;
      else if (outcome === "fell-back") result.fellBack++;
      else if (outcome === "failed") result.failed++;
      else if (outcome === "gave-up") result.gaveUp++;
    }
  };
  const n = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: n }, worker));
  if (result.drafted + result.fellBack > 0 && !result.modelUnavailable) modelDownUntil = 0;
  return result;
}

/* ─── Loop, guard and stats ──────────────────────────────────────────── */

let running: Promise<void> | null = null;
const totals = { drafted: 0, failed: 0, gaveUp: 0, fellBack: 0 };
let gauges = { ready: 0, waiting: 0 };

function record(r: DraftPassResult) {
  totals.drafted += r.drafted;
  totals.failed += r.failed;
  totals.gaveUp += r.gaveUp;
  totals.fellBack += r.fellBack;
  gauges = { ready: r.ready + r.drafted + r.fellBack, waiting: r.waiting };
}

/**
 * Start a drafter pass unless one is already running in this process.
 * Returns at once (never waits for the pass): true when a pass started.
 */
export function kickDrafter(db: EngineDb, opts: DrafterOptions = {}): boolean {
  if (running) return false;
  running = drafterPass(db, opts)
    .then((r) => {
      record(r);
      if (r.drafted || r.failed || r.gaveUp || r.fellBack || (r.modelUnavailable && !r.coolingDown)) {
        console.log(
          `[drafter] drafted=${r.drafted} failed=${r.failed} gaveUp=${r.gaveUp} fellBack=${r.fellBack} ready=${r.ready} waiting=${r.waiting}` +
            (r.modelUnavailable ? " model-unavailable" : ""),
        );
      }
    })
    .catch((err) => console.error("[drafter] pass failed:", err))
    .finally(() => {
      running = null;
    });
  return true;
}

/** True while a pass runs in this process. */
export function drafterRunning(): boolean {
  return running !== null;
}

/** Resolves when the current pass (if any) is done. For tests and shutdown. */
export async function drafterIdle(): Promise<void> {
  while (running) await running;
}

/** Drafter numbers for the heartbeat: counts since the last call, plus current gauges. */
export function takeDrafterStats(): {
  drafted: number;
  failed: number;
  gaveUp: number;
  fellBack: number;
  ready: number;
  waiting: number;
  running: number;
} {
  const out = { ...totals, ...gauges, running: running ? 1 : 0 };
  totals.drafted = totals.failed = totals.gaveUp = totals.fellBack = 0;
  return out;
}

/** Test hook: forget counters and the model cool-down. */
export function resetDrafterState(): void {
  totals.drafted = totals.failed = totals.gaveUp = totals.fellBack = 0;
  gauges = { ready: 0, waiting: 0 };
  modelDownUntil = 0;
  failStreak.clear();
  passRotation = 0;
}

/** The drafter's own loop (alongside, not inside, the send tick). Idempotent per pass. */
export function startDrafterLoop(db: EngineDb, options: { intervalMs?: number } = {}): () => void {
  const intervalMs = options.intervalMs ?? draftIntervalMs();
  kickDrafter(db);
  const timer = setInterval(() => kickDrafter(db), intervalMs);
  return () => clearInterval(timer);
}
