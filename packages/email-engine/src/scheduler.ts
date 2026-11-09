/**
 * Scheduler — turns due campaign_leads into due email_jobs.
 *
 * Runs on a timer (Cron Trigger on Workers, setInterval locally, or inside
 * the Next.js dev runtime). For every running campaign that is inside its
 * sending window it atomically claims a batch of queued leads, computes a
 * randomized schedule inside [minDelaySec … maxDelaySec], assigns senders via
 * round-robin rotation, and inserts durable jobs.
 *
 * Everything is persistent: if the process dies, claimed campaign_leads stay
 * "scheduled" and jobs stay "pending" — the next tick (or the processor's
 * stuck-job recovery) picks them up. Emails are NEVER sent from HTTP
 * requests; they only flow through email_jobs → processor.
 */
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  loadWorkspaceProfile,
  matchesSuppression,
  schema,
} from "@smartreach/database";
import {
  addSeconds,
  effectiveGapRange,
  isBusinessDay,
  minutesSinceMidnight,
  MAX_GAP_SEC,
  nowIso,
  PACING_HORIZON_SEC,
  parseTimeToMinutes,
} from "@smartreach/shared";
import { and, asc, desc, eq, exists, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { CampaignRow, EngineDb, SenderRow } from "./db-port";
import {
  claimableDraftFilter,
  dueQueuedLeadFilter,
  extractSenderFirstName,
  loadAiStepPlan,
  loadCampaignSequenceSteps,
  resolveStepContent,
  WRITING_UNAVAILABLE_PREFIX,
  writingUnavailable,
  type StoredDraft,
} from "./sequence";
import {
  campaignDayKey,
  campaignSentToday,
  loadDailyUsage,
  pickSenderIndex,
  senderHasCapacity,
  takeHourlySnapshot,
} from "./rotation";
import { isEngineDryRun } from "./queue-mode";
import { appUrl, engineBatchSize } from "./env";
import { loadApplicableSuppressions } from "./suppression";
import { buildPoolPlans, isPoolSender, withinPoolShare, type CampaignPoolPlan } from "./pool-allocation";
import { htmlAboveSignature, joinSignature, stripWarmupMarker } from "./signature";
import { loadUnapprovedOwners, OWNER_NOT_APPROVED_NOTE } from "./owner-approval";
import { createMailboxPacer, nextFreeFromQueued } from "./pacing";
import { repliesUnreadable, STICKY_MAILBOX_UNAVAILABLE_NOTE } from "./mailbox-health";

/** Shown on the campaign when it cannot send because the postal address is missing. */
export const MISSING_POSTAL_ADDRESS_NOTE = "missing-postal-address";
/** activity_logs.type of the "campaign cannot send" note (meta.reason says why). */
export const CAMPAIGN_BLOCKED_LOG_TYPE = "campaign_blocked";
export const MISSING_POSTAL_ADDRESS_MESSAGE =
  "is not sending: add your business postal address in Settings. Every cold email must show it (CAN-SPAM).";
/** A blocked campaign gets at most one note per this window. */
const BLOCKED_NOTE_EVERY_MS = 24 * 3_600_000;
/** Follow-ups wait this long for their step-1 mailbox to have capacity again. */
const STICKY_DEFER_SEC = 3600;
const RESCHEDULE_PAD_MIN = 5;
/** scheduleCampaign note: every mailbox is booked to the pacing horizon (normal sending, not a block). */
export const PACED_NOTE = "paced";
/** scheduleCampaign note: emails are waiting to be written because the AI model is unavailable. */
export const WRITING_UNAVAILABLE_NOTE = WRITING_UNAVAILABLE_PREFIX;

/**
 * Notes from scheduleCampaign / schedulerTick that explain why a running
 * campaign is not sending. Stored on campaigns.send_block_reason (only when
 * it changes) so the web app can say it in one line.
 */
export const SEND_BLOCK_REASONS = [
  "outside-window",
  "daily-limit",
  "pool-share-used",
  "senders-exhausted",
  "all-paused",
  "no-senders",
  "owner-not-approved",
  "missing-postal-address",
  "missing-list",
  "missing-list-or-template",
  "writing-unavailable",
] as const;
export type SendBlockReason = (typeof SEND_BLOCK_REASONS)[number];

/**
 * The block reason a scheduleCampaign result implies: null when it sent (or
 * has nothing to explain), the note when it is a known reason, undefined when
 * nothing should change (a lost claim race says nothing about the campaign).
 */
export function sendBlockFor(r: { enqueued: number; note?: string }): string | null | undefined {
  if (r.enqueued > 0) return null;
  if (r.note === "claim-race") return undefined;
  if (r.note && (SEND_BLOCK_REASONS as readonly string[]).includes(r.note)) return r.note;
  return null;
}

/**
 * Store the campaign's block reason when it changed (undefined = leave it).
 * Never throws: a bookkeeping problem must not break scheduling.
 */
export async function recordSendBlock(
  db: EngineDb,
  campaign: Pick<CampaignRow, "id" | "sendBlockReason">,
  reason: string | null | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (reason === undefined) return;
  if (reason === (campaign.sendBlockReason ?? null)) return;
  try {
    await db
      .update(schema.campaigns)
      .set({ sendBlockReason: reason, sendBlockSince: reason ? now.toISOString() : null })
      .where(eq(schema.campaigns.id, campaign.id));
    campaign.sendBlockReason = reason;
  } catch (err) {
    console.error(`[scheduler] could not record send block for campaign ${campaign.id}:`, err);
  }
}

export interface TickResult {
  started: number;
  enqueued: number;
  completed: number;
  rescheduled: number;
  skipped: string[]; // human-readable reasons (tests + debugging)
}

/** Promote due scheduled campaigns → running. */
export async function startDueCampaigns(db: EngineDb, now = new Date()): Promise<number> {
  const due: CampaignRow[] = await db
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.status, "scheduled"), lte(schema.campaigns.scheduledAt, now.toISOString()), isNull(schema.campaigns.deletedAt)));
  for (const c of due) {
    await db
      .update(schema.campaigns)
      .set({ status: "running", startedAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(schema.campaigns.id, c.id));
    await log(db, c.userId, "campaign_started", `Campaign "${c.name}" started`, c.id);
  }
  return due.length;
}

/** Is the campaign inside its sending window right now? */
export function isInSendingWindow(c: CampaignRow, now: Date): boolean {
  if (c.businessDaysOnly && !isBusinessDay(now, c.sendingTimezone)) return false;
  const mins = minutesSinceMidnight(now, c.sendingTimezone);
  const start = parseTimeToMinutes(c.sendingWindowStart);
  const end = parseTimeToMinutes(c.sendingWindowEnd);
  if (start === end) return true; // treat identical start/end as "all day"
  if (start === 0 && end >= 1439) return true; // 00:00 to 23:59 is all day
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end; // overnight window
}

function nextWindowStart(c: CampaignRow, now: Date): Date {
  // Schedule for the next top-of-window, padded a few minutes. Exact wall
  // clock doesn't matter — on resume the scheduler just continues.
  const d = new Date(now);
  d.setUTCMinutes(d.getUTCMinutes() + RESCHEDULE_PAD_MIN);
  return d;
}

/** Fetch a campaign's assigned senders (joined, ordered deterministically). */
export async function campaignSenders(db: EngineDb, campaignId: string): Promise<SenderRow[]> {
  // Attached mailboxes, including retired (soft-deleted) ones so we can tell
  // "the pool mailboxes this campaign used were retired" from "nothing is
  // attached" (never attached, or detached by the user).
  const attached: SenderRow[] = await db
    .select({ sender: schema.senderAccounts })
    .from(schema.campaignSenders)
    .innerJoin(schema.senderAccounts, eq(schema.campaignSenders.senderId, schema.senderAccounts.id))
    .where(eq(schema.campaignSenders.campaignId, campaignId))
    .orderBy(asc(schema.campaignSenders.createdAt))
    .then((rows: any[]) => rows.map((r) => r.sender as SenderRow));

  const directSenders = attached.filter((s) => !(s as SenderRow & { deletedAt?: string | null }).deletedAt);
  // Live pool: only for campaigns launched on pool mailboxes (at least one
  // attached row, retired or not, is a pool mailbox). Anything else keeps
  // exactly its attached mailboxes.
  if (!attached.some((s) => (s as SenderRow & { isSystemPool?: boolean }).isSystemPool === true)) {
    return directSenders;
  }

  // RUNNING autopilot campaigns (a chad_gtm_runs row of the same owner) send
  // from the live pool, so mailboxes imported after launch help running
  // campaigns and a run whose launch mailboxes were paused or retired keeps
  // sending. Manual campaigns, paused/finished campaigns and campaigns with
  // nothing attached (e.g. a user detached the pool senders) never do. The
  // campaign's own status decides, the same field the scheduler sends by.
  const runRows: { campaignStatus: string; runUserId: string; campaignUserId: string }[] = await db
    .select({
      campaignStatus: schema.campaigns.status,
      runUserId: schema.chadGtmRuns.userId,
      campaignUserId: schema.campaigns.userId,
    })
    .from(schema.chadGtmRuns)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.chadGtmRuns.campaignId))
    .where(eq(schema.chadGtmRuns.campaignId, campaignId))
    .limit(1);
  if (!poolFallbackAllowed(runRows[0])) return directSenders;

  // Every status: a paused or failed step-1 mailbox must still be found by
  // resolveStickySender so its follow-ups defer instead of switching
  // mailbox. New step-1 picks stay gated on status 'active' (senderHasCapacity).
  const poolSenders: SenderRow[] = await db
    .select()
    .from(schema.senderAccounts)
    .where(and(eq(schema.senderAccounts.isSystemPool, true), isNull(schema.senderAccounts.deletedAt)))
    .orderBy(asc(schema.senderAccounts.createdAt));
  return mergeSendersById(directSenders, poolSenders);
}

/** Union of two sender lists, deduplicated by id, ordered by createdAt (stable). */
export function mergeSendersById(a: readonly SenderRow[], b: readonly SenderRow[]): SenderRow[] {
  const byId = new Map<string, SenderRow>();
  for (const s of [...a, ...b]) if (!byId.has(s.id)) byId.set(s.id, s);
  const created = (s: SenderRow) => String((s as SenderRow & { createdAt?: string | null }).createdAt ?? "");
  return [...byId.values()].sort((x, y) => created(x).localeCompare(created(y)));
}

/**
 * True when the campaign still has attachment rows and every attached
 * mailbox is a retired (soft-deleted) system-pool mailbox. An empty
 * attachment list (never attached, or detached) is false.
 */
export function onlyRetiredPoolSenders(attached: readonly SenderRow[]): boolean {
  return (
    attached.length > 0 &&
    attached.every((s) => {
      const row = s as SenderRow & { deletedAt?: string | null; isSystemPool?: boolean };
      return Boolean(row.deletedAt) && row.isSystemPool === true;
    })
  );
}

/**
 * May a campaign whose pool mailboxes were retired fall back to the current
 * system pool? Only when it is a RUNNING campaign of an autopilot run of the
 * same owner; manual campaigns (no run) never do. Keyed on the campaign's
 * status, not the run's, so the two can never disagree in the engine.
 */
export function poolFallbackAllowed(
  run: { campaignStatus: string; runUserId: string; campaignUserId: string } | undefined | null,
): boolean {
  if (!run) return false; // manual campaign
  if (run.campaignStatus !== "running") return false;
  return Boolean(run.runUserId) && run.runUserId === run.campaignUserId;
}

/** The heart of the scheduler: enqueue due work for one campaign. */
export interface ScheduleContext {
  /** Pre-loaded senders (schedulerTick already loaded them for fair sharing). */
  senders?: SenderRow[];
  /** This campaign's fair share of the pool mailboxes for today. */
  pool?: CampaignPoolPlan;
}

export async function scheduleCampaign(
  db: EngineDb,
  campaign: CampaignRow,
  now = new Date(),
  ctx: ScheduleContext = {},
): Promise<{ enqueued: number; note?: string }> {
  const nowIsoS = now.toISOString();

  // Never enqueue outside the sender's sending window / non-business-day.
  if (!isInSendingWindow(campaign, now)) return { enqueued: 0, note: "outside-window" };

  // Daily campaign cap
  // Counted per day in the campaign's own timezone.
  const sentToday = await campaignSentToday(db, campaign.id, campaignDayKey(campaign, now));
  if (sentToday >= campaign.dailyLimit) return { enqueued: 0, note: "daily-limit" };
  let budget = Math.min(engineBatchSize(), campaign.dailyLimit - sentToday);

  const senders = ctx.senders ?? (await campaignSenders(db, campaign.id));
  if (senders.length === 0) return { enqueued: 0, note: "no-senders" };
  // Failed mailboxes count as paused here too (pickSenderIndex never used
  // them), so "every mailbox is paused/failed" reads as a warning.
  const activeSenders = senders.filter((s) => s.status === "active");
  if (activeSenders.length === 0) return { enqueued: 0, note: "all-paused" };
  const pool = ctx.pool;
  // Drafts may omit list/template; scheduler only runs scheduled/running but guard anyway.
  if (!campaign.leadListId) {
    return { enqueued: 0, note: "missing-list" };
  }
  const sequenceSteps = await loadCampaignSequenceSteps(db, campaign.id);
  if (!campaign.templateId && sequenceSteps.length === 0) {
    return { enqueued: 0, note: "missing-list-or-template" };
  }
  // AI-written steps are drafted ahead (drafter.ts): only leads with a ready
  // draft for their step are claimed, and nothing here calls the AI.
  const { plan: aiPlan, variantsByStep } = await loadAiStepPlan(db, sequenceSteps);

  // Every cold email carries the sender's postal address (CAN-SPAM). The
  // processor adds the footer at send time; without an address nothing is
  // enqueued, so the client sees a clear reason instead of silent sends.
  // The address is the campaign's workspace's (an unknown workspace reads blank and holds).
  const profile = await loadWorkspaceProfile(db, { userId: campaign.userId, workspaceId: campaign.workspaceId ?? null });
  if (!profile.postalAddress.trim()) {
    await noteCampaignBlocked(db, campaign, MISSING_POSTAL_ADDRESS_NOTE, MISSING_POSTAL_ADDRESS_MESSAGE, now);
    return { enqueued: 0, note: MISSING_POSTAL_ADDRESS_NOTE };
  }
  // Base for {{unsubscribe_url}} when a template references it. Always
  // AutoGTM's page (a stored workspace_settings.unsubscribe_base_url is
  // ignored) so every opt-out is recorded and suppressed across campaigns.
  const unsubBase = appUrl();
  const dryRun = isEngineDryRun();

  // Each mailbox waits gap.min..gap.max seconds between two of its emails
  // (across ticks and campaigns), so claim only what the mailboxes can take
  // inside the pacing horizon; the rest stays queued for later ticks.
  const gap = effectiveGapRange(campaign.minDelaySec, campaign.maxDelaySec);
  const claimLimit = Math.max(
    1,
    Math.min(budget, activeSenders.length * Math.ceil(PACING_HORIZON_SEC / gap.min)),
  );

  // Skip leads that already replied anywhere in this campaign (stopOnReply)
  // and any campaign_leads already scheduled/sent — atomic claim does the rest.
  const claimable: { id: string; leadId: string; stepPosition: number }[] = await db
    .select({
      id: schema.campaignLeads.id,
      leadId: schema.campaignLeads.leadId,
      stepPosition: schema.campaignLeads.stepPosition,
    })
    .from(schema.campaignLeads)
    .where(
      and(
        eq(schema.campaignLeads.campaignId, campaign.id),
        dueQueuedLeadFilter(nowIsoS),
        claimableDraftFilter(aiPlan),
        // stop-after-reply is enforced at claim time and again at send time
        campaign.stopOnReply
          ? notExistsReplied(db, campaign.id)
          : sql`1=1`,
      ),
    )
    // Due follow-ups first so every lead gets all three emails on time, then
    // Autopilot's priority tiers (1 target titles, 2 other decision-makers,
    // 3 everyone else; null last), then oldest first.
    .orderBy(
      desc(schema.campaignLeads.stepPosition),
      sql`${schema.campaignLeads.priority} asc nulls last`,
      asc(schema.campaignLeads.createdAt),
    )
    .limit(claimLimit);

  if (claimable.length === 0) {
    // Queued rows of people who replied are never claimed (Stop on reply
    // turned on after the reply, a lead set to Won/Lost by hand, a reply
    // stop cut short): cancel them so the campaign can finish.
    if (campaign.stopOnReply) await cancelRepliedQueuedLeads(db, campaign.id, nowIsoS);
    // Nothing queued → maybe complete
    const remaining = await pendingWork(db, campaign.id);
    // An Autopilot campaign with contacts still to load is between batches,
    // not finished: the audience top-up adds the next tier shortly.
    if (remaining === 0 && (campaign as { audienceOpen?: boolean }).audienceOpen) {
      return { enqueued: 0, note: "waiting-for-leads" };
    }
    if (remaining === 0) {
      await db
        .update(schema.campaigns)
        .set({ status: "completed", completedAt: nowIsoS, updatedAt: nowIsoS })
        .where(eq(schema.campaigns.id, campaign.id));
      // Mirror it on the linked Autopilot run (display only): a failure here
      // never affects sending.
      try {
        await db
          .update(schema.chadGtmRuns)
          .set({ status: "completed", updatedAt: nowIsoS })
          .where(
            and(
              eq(schema.chadGtmRuns.campaignId, campaign.id),
              inArray(schema.chadGtmRuns.status, ["active", "paused"]),
            ),
          );
      } catch (err) {
        console.error("[scheduler] could not mark the Autopilot run completed", campaign.id, err);
      }
      // Lead funnel status is owned by send/reply/bounce/unsub (F03d).
      // Do not stamp "completed" here — that value is outside the lead enum
      // and would clobber contacted/replied/bounced.
      await log(db, campaign.userId, "campaign_completed", `Campaign "${campaign.name}" finished`, campaign.id);
      return { enqueued: 0, note: "completed" };
    }
    // Emails are waiting to be written and the model is down: say so.
    if (aiPlan.positions.length > 0 && (await writingUnavailable(db, campaign.id))) {
      return { enqueued: 0, note: WRITING_UNAVAILABLE_NOTE };
    }
    return { enqueued: 0, note: "waiting-retry" };
  }

  // Sender availability (loaded before claiming so a fully booked campaign
  // does not claim and unclaim leads every tick).
  const daily = await loadDailyUsage(db, activeSenders.map((s) => s.id));
  const hourly = takeHourlySnapshot();
  // No new lead goes to a mailbox whose inbox can't be read (its replies
  // would go unseen); follow-ups already there wait for it (resolveStickySender).
  const allowSender = (s: SenderRow) => withinPoolShare(pool, s) && !repliesUnreadable(s);
  // Pacing: the latest email booked (or just sent) on each mailbox, from any campaign.
  const pacer = createMailboxPacer({
    now,
    nextFreeAt: nextFreeFromQueued(await loadMailboxLastSends(db, activeSenders.map((s) => s.id), now), gap.min),
    gap,
  });
  // Follow-ups bypass the fair share (they must use their step-1 mailbox).
  const hasFollowUps = claimable.some((r) => (r.stepPosition ?? 1) > 1);
  const anyCapacity = activeSenders.some(
    (s) =>
      senderHasCapacity(s, daily, hourly, campaign.maxEmailsPerSenderPerDay, now) && (hasFollowUps || allowSender(s)),
  );
  if (!anyCapacity) {
    // Out of fair share (or every mailbox at cap): try again shortly.
    const until = addSeconds(now, pool ? 900 : 3600).toISOString();
    await db
      .update(schema.campaigns)
      .set({ senderCapUntil: until, updatedAt: nowIsoS })
      .where(eq(schema.campaigns.id, campaign.id));
    return { enqueued: 0, note: pool ? "pool-share-used" : "senders-exhausted" };
  }
  // Every usable mailbox is already booked to the pacing horizon: claim
  // nothing and try again next tick (follow-ups are not horizon-gated).
  const anyPaceRoom = activeSenders.some(
    (s) =>
      senderHasCapacity(s, daily, hourly, campaign.maxEmailsPerSenderPerDay, now) &&
      allowSender(s) &&
      pacer.canTake(s.id),
  );
  if (!hasFollowUps && !anyPaceRoom) return { enqueued: 0, note: PACED_NOTE };

  // Atomically claim (skip if another worker beat us)
  const ids = claimable.map((r) => r.id);
  const claimed: { id: string }[] = await db
    .update(schema.campaignLeads)
    .set({ status: "scheduled", updatedAt: nowIsoS })
    .where(and(inArray(schema.campaignLeads.id, ids), eq(schema.campaignLeads.status, "queued")))
    .returning({ id: schema.campaignLeads.id });
  if (claimed.length === 0) return { enqueued: 0, note: "claim-race" };
  budget = Math.min(budget, claimed.length);

  // Load lead + draft data for rendering
  const claimedRows: Array<{ id: string; leadId: string; stepPosition: number } & Partial<StoredDraft>> = await db
    .select({
      id: schema.campaignLeads.id,
      leadId: schema.campaignLeads.leadId,
      stepPosition: schema.campaignLeads.stepPosition,
      draftStep: schema.campaignLeads.draftStep,
      draftVariantId: schema.campaignLeads.draftVariantId,
      draftSubject: schema.campaignLeads.draftSubject,
      draftBodyText: schema.campaignLeads.draftBodyText,
      draftBodyHtml: schema.campaignLeads.draftBodyHtml,
      draftStatus: schema.campaignLeads.draftStatus,
    })
    .from(schema.campaignLeads)
    .where(inArray(schema.campaignLeads.id, claimed.map((c) => c.id)));
  const leadIds = claimedRows.map((r) => r.leadId);
  const leadRows: any[] = await db
    .select()
    .from(schema.leads)
    .where(inArray(schema.leads.id, leadIds));
  const leadById = new Map<string, any>(leadRows.map((l) => [l.id, l]));

  // F15: suppressions — this user's list plus global opt-outs (unsubscribe,
  // bounce, complaint) recorded under any user.
  const suppressedValues = await loadApplicableSuppressions(
    db,
    campaign.userId,
    leadRows.map((l) => String(l.email ?? "")),
  );

  // Sticky sender: follow-ups go from the mailbox (and persona) that sent step 1.
  const stickyByClId = await loadStickySenders(
    db,
    claimedRows.filter((r) => (r.stepPosition ?? 1) > 1).map((r) => r.id),
  );

  // Rolling cursor so consecutive jobs land on different senders; the pacer
  // spaces each mailbox's emails by the campaign's gap.
  let cursor = campaign.lastSenderIdx;
  let enqueued = 0;
  // Track rows we finished (enqueued or cancelled) so senders-exhausted
  // unclaim does not reset already-handled leads (slice(enqueued) was wrong
  // when suppressions/missing leads appeared mid-batch).
  const handledIds = new Set<string>();
  let exhausted = false;
  let paced = false;

  for (const cl of claimedRows) {
    // A follow-up must go from its step-1 mailbox, so the fair share does
    // not gate it (the mailbox's hard daily/hourly cap still does); it is
    // counted against the share below, leaving less room for new leads.
    const sticky = resolveStickySender({
      stepPosition: cl.stepPosition ?? 1,
      stickySenderId: stickyByClId.get(cl.id) ?? null,
      senders,
      hasCapacity: (s) => senderHasCapacity(s, daily, hourly, campaign.maxEmailsPerSenderPerDay, now),
    });
    if (sticky.kind === "defer") {
      // Same mailbox is busy today, paused, or its replies can't be read:
      // wait for it rather than switching persona or sending blind.
      await db
        .update(schema.campaignLeads)
        .set({
          status: "queued",
          scheduledFor: addSeconds(now, STICKY_DEFER_SEC).toISOString(),
          lastError: sticky.reason === "unavailable" ? STICKY_MAILBOX_UNAVAILABLE_NOTE : "waiting-for-step-1-mailbox",
          updatedAt: nowIsoS,
        })
        .where(eq(schema.campaignLeads.id, cl.id));
      handledIds.add(cl.id);
      continue;
    }
    const pick =
      sticky.kind === "use"
        ? { sender: sticky.sender, index: cursor }
        : pickSenderIndex(activeSenders, daily, hourly, cursor, campaign.maxEmailsPerSenderPerDay, {
            now,
            allow: (s) => allowSender(s) && pacer.canTake(s.id),
          });
    if (!pick) {
      // No mailbox (or fair share) left for a new lead. Leave it queued and
      // keep going: follow-ups later in the batch may still use their
      // step-1 mailbox. Without any, stop here. A mailbox that only waits
      // for its pacing gap is not exhausted: the next tick books it.
      const roomLeft = activeSenders.some(
        (s) => senderHasCapacity(s, daily, hourly, campaign.maxEmailsPerSenderPerDay, now) && allowSender(s),
      );
      if (roomLeft) paced = true;
      else exhausted = true;
      if (!hasFollowUps) break;
      continue;
    }

    const lead = leadById.get(cl.leadId);
    if (!lead) {
      await db
        .update(schema.campaignLeads)
        .set({ status: "cancelled", lastError: "lead-missing", updatedAt: nowIsoS })
        .where(eq(schema.campaignLeads.id, cl.id));
      handledIds.add(cl.id);
      continue;
    }

    // F15: skip suppressed emails/domains — cancel campaign_lead, do not enqueue
    if (matchesSuppression(lead.email, suppressedValues)) {
      await db
        .update(schema.campaignLeads)
        .set({ status: "cancelled", lastError: "suppressed", updatedAt: nowIsoS })
        .where(eq(schema.campaignLeads.id, cl.id));
      handledIds.add(cl.id);
      continue;
    }

    // Resolve {{unsubscribe_url}} only when content references it — do not auto-inject.
    const unsubToken = createUnsubscribeToken(campaign.userId, lead.email);
    const unsubUrl = buildUnsubscribeUrl(unsubBase, unsubToken);
    const senderFirstName = extractSenderFirstName(pick.sender);
    const vars = {
      ...leadVars(lead),
      unsubscribe_url: unsubUrl,
      sender_name: senderFirstName,
      senderName: senderFirstName,
    };
    // The draft's {{sender_name}} becomes this mailbox's first name (follow-ups: the step-1 mailbox).
    const stepRow = sequenceSteps.find((s) => s.position === (cl.stepPosition ?? 1));
    const content = await resolveStepContent(db, {
      campaignId: campaign.id,
      stepPosition: cl.stepPosition ?? 1,
      templateId: campaign.templateId,
      vars,
      steps: sequenceSteps,
      campaignLeadId: cl.id,
      draft: storedDraftOf(cl),
      variants: stepRow ? variantsByStep.get(stepRow.id) : undefined,
    });
    if ("error" in content) {
      await db
        .update(schema.campaignLeads)
        .set({ status: "queued", lastError: content.error, updatedAt: nowIsoS })
        .where(eq(schema.campaignLeads.id, cl.id));
      handledIds.add(cl.id);
      continue;
    }
    // Signature goes on BOTH parts so text and HTML match. A text-format
    // step sends no stored HTML: the processor derives it from the text.
    const bodyText = content.bodyText.trim() ? appendSignature(content.bodyText, pick.sender) : "";
    const bodyHtml =
      content.format === "html" && content.bodyHtml.trim()
        ? appendSignatureHtml(content.bodyHtml, pick.sender)
        : "";

    // Book this mailbox's next slot (sticky follow-ups skip the horizon gate).
    const scheduleAt = pacer.take(pick.sender.id);
    try {
      await db
        .insert(schema.emailJobs)
        .values({
          id: crypto.randomUUID(),
          campaignId: campaign.id,
          campaignLeadId: cl.id,
          senderId: pick.sender.id,
          leadId: cl.leadId,
          toEmail: lead.email,
          subject: content.subject,
          bodyText,
          bodyHtml,
          stepPosition: content.stepPosition,
          sequenceStepId: content.sequenceStepId,
          variantId: content.variantId,
          status: "pending",
          scheduledFor: scheduleAt.toISOString(),
          attempts: 0,
          maxAttempts: campaign.retryFailed ? campaign.retryCount : 1,
          dryRun,
        })
        .onConflictDoNothing();

      await db
        .update(schema.campaignLeads)
        .set({ scheduledFor: scheduleAt.toISOString(), updatedAt: nowIsoS })
        .where(eq(schema.campaignLeads.id, cl.id));
      // Leave leads.status as "new" until send success promotes it to "contacted".

      // advance rotation + randomized pace (sticky picks keep the cursor)
      cursor = pick.index;
      daily.set(pick.sender.id, (daily.get(pick.sender.id) ?? 0) + 1);
      hourly.set(pick.sender.id, (hourly.get(pick.sender.id) ?? 0) + 1);
      if (pool && isPoolSender(pick.sender)) {
        pool.used.set(pick.sender.id, (pool.used.get(pick.sender.id) ?? 0) + 1);
      }
      handledIds.add(cl.id);
      enqueued++;
      if (--budget <= 0) break;
    } catch (err: any) {
      console.error(`[scheduler] Failed to enqueue lead ${cl.id}:`, err);
      // Unclaim lead so it doesn't stay permanently stuck in 'scheduled'
      await db
        .update(schema.campaignLeads)
        .set({ status: "queued", lastError: String(err?.message || err), updatedAt: nowIsoS })
        .where(eq(schema.campaignLeads.id, cl.id));
      handledIds.add(cl.id);
    }
  }

  // Ensure any untouched claimed leads are returned to 'queued' state
  const remainingIds = claimedRows.filter((r) => !handledIds.has(r.id)).map((r) => r.id);
  if (remainingIds.length > 0) {
    await db
      .update(schema.campaignLeads)
      .set({ status: "queued", updatedAt: nowIsoS })
      .where(inArray(schema.campaignLeads.id, remainingIds));
  }
  if (exhausted) {
    // Every sender exhausted for new leads → park briefly.
    const until = addSeconds(now, pool ? 900 : 3600).toISOString();
    await db
      .update(schema.campaigns)
      .set({ senderCapUntil: until, lastSenderIdx: cursor, updatedAt: nowIsoS })
      .where(eq(schema.campaigns.id, campaign.id));
    return { enqueued, note: pool ? "pool-share-used" : "senders-exhausted" };
  }

  await db
    .update(schema.campaigns)
    .set({ lastSenderIdx: cursor, updatedAt: nowIsoS })
    .where(eq(schema.campaigns.id, campaign.id));
  return enqueued === 0 && paced ? { enqueued, note: PACED_NOTE } : { enqueued };
}

function storedDraftOf(row: Partial<StoredDraft>): StoredDraft {
  return {
    draftStep: row.draftStep ?? null,
    draftVariantId: row.draftVariantId ?? null,
    draftSubject: row.draftSubject ?? null,
    draftBodyText: row.draftBodyText ?? null,
    draftBodyHtml: row.draftBodyHtml ?? null,
    draftStatus: row.draftStatus ?? null,
  };
}

/**
 * Latest email booked on each mailbox (pending, processing or retry jobs, from
 * any campaign) or sent in the last MAX_GAP_SEC, so the gap holds across
 * ticks and campaigns.
 */
async function loadMailboxLastSends(
  db: EngineDb,
  senderIds: string[],
  now: Date,
): Promise<Array<{ senderId: string; lastAt: string | null }>> {
  if (senderIds.length === 0) return [];
  const recent = addSeconds(now, -MAX_GAP_SEC).toISOString();
  const rows: Array<{ senderId: string; lastAt: string | null }> = await db
    .select({
      senderId: schema.emailJobs.senderId,
      lastAt: sql<string | null>`max(case when ${schema.emailJobs.status} = 'sent' then ${schema.emailJobs.sentAt} else ${schema.emailJobs.scheduledFor} end)`,
    })
    .from(schema.emailJobs)
    .where(
      and(
        inArray(schema.emailJobs.senderId, senderIds),
        or(
          inArray(schema.emailJobs.status, ["pending", "processing", "retry"]),
          and(eq(schema.emailJobs.status, "sent"), gte(schema.emailJobs.sentAt, recent)),
        ),
      ),
    )
    .groupBy(schema.emailJobs.senderId);
  return Array.isArray(rows) ? rows : [];
}

// Exported for tests. One sign-off: a bare "{{sender_name}}" line before a
// signature that starts with that name is dropped (shared joinSignature).
export function appendSignature(body: string, sender: SenderRow): string {
  return joinSignature(body, sender.signature);
}

export function appendSignatureHtml(html: string, sender: SenderRow): string {
  const sig = stripWarmupMarker(sender.signature);
  if (!sig) return html;
  html = htmlAboveSignature(html, sig);
  const block = /<[a-z][\s\S]*>/i.test(sig)
    ? sig
    : sig
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\r?\n/g, "<br>");
  const sigHtml = `<p>${block}</p>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${sigHtml}</body>`);
  return `${html}\n${sigHtml}`;
}

export type StickyDecision =
  | { kind: "use"; sender: SenderRow }
  | { kind: "defer"; reason: "unavailable" | "capacity" }
  | { kind: "rotate" };

/**
 * Follow-ups (step > 1) reuse the mailbox that sent step 1 so the lead sees
 * one person in one thread. Switch only when that mailbox is gone from the
 * campaign (retired by an admin, or detached). When it is paused, failed or
 * its replies can't be read, wait for it ('unavailable'): a follow-up from
 * another persona, or one sent while a reply may be sitting unread, is worse
 * than a late one. When it is merely at capacity, wait too ('capacity').
 */
export function resolveStickySender(input: {
  stepPosition: number;
  stickySenderId: string | null;
  senders: SenderRow[];
  hasCapacity: (s: SenderRow) => boolean;
}): StickyDecision {
  if (input.stepPosition <= 1 || !input.stickySenderId) return { kind: "rotate" };
  const s = input.senders.find((x) => x.id === input.stickySenderId);
  if (!s || (s as SenderRow & { deletedAt?: string | null }).deletedAt) return { kind: "rotate" };
  if (s.status !== "active" || repliesUnreadable(s)) return { kind: "defer", reason: "unavailable" };
  return input.hasCapacity(s) ? { kind: "use", sender: s } : { kind: "defer", reason: "capacity" };
}

/** campaign_lead id → sender of its earliest sent step. */
async function loadStickySenders(db: EngineDb, campaignLeadIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (campaignLeadIds.length === 0) return out;
  const rows: { campaignLeadId: string; senderId: string; stepPosition: number }[] = await db
    .select({
      campaignLeadId: schema.emailJobs.campaignLeadId,
      senderId: schema.emailJobs.senderId,
      stepPosition: schema.emailJobs.stepPosition,
    })
    .from(schema.emailJobs)
    .where(
      and(
        inArray(schema.emailJobs.campaignLeadId, campaignLeadIds),
        inArray(schema.emailJobs.status, ["sent", "bounced"]),
      ),
    )
    .orderBy(asc(schema.emailJobs.stepPosition));
  for (const r of rows) if (!out.has(r.campaignLeadId)) out.set(r.campaignLeadId, r.senderId);
  return out;
}

export function leadVars(lead: any): Record<string, string> {
  const cf = (lead.customFields ?? {}) as Record<string, string>;
  return {
    ...normalizeKeys(cf),
    email: lead.email ?? "",
    first_name: lead.firstName ?? "",
    firstName: lead.firstName ?? "",
    last_name: lead.lastName ?? "",
    lastName: lead.lastName ?? "",
    company: lead.company ?? "",
    website: lead.website ?? "",
    linkedin: lead.linkedin ?? "",
    job_title: lead.jobTitle ?? "",
    jobTitle: lead.jobTitle ?? "",
    location: lead.location ?? "",
    phone: lead.phone ?? "",
    industry: lead.industry ?? "",
  };
}

function normalizeKeys(cf: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cf)) out[k.toLowerCase().replace(/\s+/g, "_")] = v;
  return out;
}

function notExistsReplied(db: EngineDb, campaignId: string) {
  // The person replied to any of the owner's campaigns: a reply marks every
  // lead row of theirs (lead-outcomes.stopLeadAfterReply), so the lead status
  // covers other campaigns too.
  return sql`NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = campaign_leads.lead_id AND l.status IN ('replied','interested','meeting_booked','won','lost'))`;
}

/** campaign_leads.last_error of a queued row cancelled because the person replied. */
export const REPLIED_QUEUED_CANCEL_REASON = "lead-replied";

/**
 * Cancel this campaign's queued rows whose person replied (the rows
 * notExistsReplied keeps from being claimed), so pendingWork can reach 0.
 * Only for campaigns with Stop on reply on.
 */
async function cancelRepliedQueuedLeads(db: EngineDb, campaignId: string, nowIsoS: string): Promise<void> {
  await db
    .update(schema.campaignLeads)
    .set({ status: "cancelled", lastError: REPLIED_QUEUED_CANCEL_REASON, updatedAt: nowIsoS })
    .where(
      and(
        eq(schema.campaignLeads.campaignId, campaignId),
        eq(schema.campaignLeads.status, "queued"),
        sql`EXISTS (SELECT 1 FROM leads l WHERE l.id = campaign_leads.lead_id AND l.status IN ('replied','interested','meeting_booked','won','lost'))`,
      ),
    );
}

async function pendingWork(db: EngineDb, campaignId: string): Promise<number> {
  const rows: { n: number }[] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.campaignLeads)
    .where(
      and(
        eq(schema.campaignLeads.campaignId, campaignId),
        inArray(schema.campaignLeads.status, ["queued", "scheduled"]),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/** Full scheduler tick — all runnable campaigns. */
export async function schedulerTick(db: EngineDb, now = new Date()): Promise<TickResult> {
  const result: TickResult = { started: 0, enqueued: 0, completed: 0, rescheduled: 0, skipped: [] };
  result.started = await startDueCampaigns(db, now);

  const allRunning: CampaignRow[] = await db
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.status, "running"), isNull(schema.campaigns.deletedAt)));

  // Approval can be revoked while campaigns run: skip campaigns whose owner
  // is not approved (role <> 'admin' AND approved_at IS NULL), unless
  // SIGNUP_APPROVAL_REQUIRED="false". If the lookup fails, send nothing.
  let unapproved: Set<string>;
  let approvalKnown = true;
  try {
    unapproved = await loadUnapprovedOwners(db, allRunning.map((c) => c.userId));
  } catch (err) {
    console.error("[scheduler] owner approval lookup failed:", err);
    unapproved = new Set(allRunning.map((c) => c.userId));
    approvalKnown = false;
  }
  const running: CampaignRow[] = [];
  for (const c of allRunning) {
    if (unapproved.has(c.userId)) {
      result.skipped.push(`${c.name}: ${OWNER_NOT_APPROVED_NOTE}`);
      // Only a real lookup says the owner is not approved; a failed one
      // must not show "Sending is paused by AutoGTM" to everyone.
      if (approvalKnown) await recordSendBlock(db, c, "owner-not-approved", now);
    } else running.push(c);
  }

  // Fair sharing: campaigns inside their window split the pool mailboxes'
  // daily capacity (round-robin over users, then campaigns), and the ones
  // that sent least today are scheduled first.
  const inWindow = running.filter((c) => isInSendingWindow(c, now));
  const sendersByCampaign = new Map<string, SenderRow[]>();
  const sentToday = new Map<string, number>();
  for (const c of inWindow) {
    try {
      sendersByCampaign.set(c.id, await campaignSenders(db, c.id));
      sentToday.set(c.id, await campaignSentToday(db, c.id, campaignDayKey(c, now)));
    } catch (err) {
      console.error(`[scheduler] campaign ${c.id} senders failed:`, err);
    }
  }
  let poolPlans = new Map<string, CampaignPoolPlan>();
  try {
    poolPlans = await buildPoolPlans(db, inWindow.filter((c) => sendersByCampaign.has(c.id)), sendersByCampaign, now);
  } catch (err) {
    console.error("[scheduler] pool allocation failed:", err);
  }
  const ordered = [...running].sort((a, b) => (sentToday.get(a.id) ?? 0) - (sentToday.get(b.id) ?? 0));

  for (const c of ordered) {
    try {
      if (c.senderCapUntil && c.senderCapUntil > now.toISOString()) {
        result.skipped.push(`${c.name}: all senders at cap`);
        continue;
      }
      if (!isInSendingWindow(c, now)) {
        result.rescheduled++;
        result.skipped.push(`${c.name}: outside window`);
        await recordSendBlock(db, c, "outside-window", now);
        continue;
      }
      const r = await scheduleCampaign(db, c, now, {
        senders: sendersByCampaign.get(c.id),
        pool: poolPlans.get(c.id),
      });
      await recordSendBlock(db, c, sendBlockFor(r), now);
      if (r.note === "completed") result.completed++;
      result.enqueued += r.enqueued;
      if (r.note && r.enqueued === 0 && r.note !== "completed") result.skipped.push(`${c.name}: ${r.note}`);
    } catch (err) {
      // Never let one bad campaign break the tick
      console.error(`[scheduler] campaign ${c.id} failed:`, err);
      result.skipped.push(`${c.name}: error`);
    }
  }
  return result;
}

/**
 * Record, at most once per day per campaign and reason, that a running
 * campaign cannot send, so the web app can show it (activity_logs row with
 * type CAMPAIGN_BLOCKED_LOG_TYPE, campaign_id set, meta.reason = note).
 * Never throws: a logging problem must not break scheduling.
 */
export async function noteCampaignBlocked(
  db: EngineDb,
  campaign: Pick<CampaignRow, "id" | "userId" | "name">,
  reason: string,
  message: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const since = new Date(now.getTime() - BLOCKED_NOTE_EVERY_MS).toISOString();
    const recent: { id: string }[] = await db
      .select({ id: schema.activityLogs.id })
      .from(schema.activityLogs)
      .where(
        and(
          eq(schema.activityLogs.campaignId, campaign.id),
          eq(schema.activityLogs.type, CAMPAIGN_BLOCKED_LOG_TYPE),
          gte(schema.activityLogs.createdAt, since),
          sql`${schema.activityLogs.meta}->>'reason' = ${reason}`,
        ),
      )
      .limit(1);
    if (recent.length > 0) return false;
    await db.insert(schema.activityLogs).values({
      id: crypto.randomUUID(),
      userId: campaign.userId,
      type: CAMPAIGN_BLOCKED_LOG_TYPE,
      message: `Campaign "${campaign.name}" ${message}`,
      campaignId: campaign.id,
      meta: { reason, since: now.toISOString() },
    });
    return true;
  } catch (err) {
    console.error(`[scheduler] could not record blocked note for campaign ${campaign.id}:`, err);
    return false;
  }
}

async function log(db: EngineDb, userId: string, type: string, message: string, campaignId?: string) {
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId,
    type,
    message,
    campaignId: campaignId ?? null,
  });
}
