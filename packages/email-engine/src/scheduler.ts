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
  ensurePostalFooter,
  ensureUnsubscribeFooter,
  matchesSuppression,
  renderTemplate,
  schema,
} from "@smartreach/database";
import {
  addSeconds,
  isBusinessDay,
  minutesSinceMidnight,
  nowIso,
  parseTimeToMinutes,
  randomBetween,
} from "@smartreach/shared";
import { and, asc, desc, eq, exists, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { CampaignRow, EngineDb, SenderRow } from "./db-port";
import {
  campaignSentToday,
  loadDailyUsage,
  pickSenderIndex,
  takeHourlySnapshot,
} from "./rotation";

const BATCH_SIZE = Number(process.env.ENGINE_BATCH_SIZE ?? 25);
const RESCHEDULE_PAD_MIN = 5;

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
  return db
    .select({ sender: schema.senderAccounts })
    .from(schema.campaignSenders)
    .innerJoin(schema.senderAccounts, eq(schema.campaignSenders.senderId, schema.senderAccounts.id))
    .where(and(eq(schema.campaignSenders.campaignId, campaignId), isNull(schema.senderAccounts.deletedAt)))
    .orderBy(asc(schema.campaignSenders.createdAt))
    .then((rows: any[]) => rows.map((r) => r.sender as SenderRow));
}

/** The heart of the scheduler: enqueue due work for one campaign. */
export async function scheduleCampaign(
  db: EngineDb,
  campaign: CampaignRow,
  now = new Date(),
): Promise<{ enqueued: number; note?: string }> {
  const nowIsoS = now.toISOString();

  // Never enqueue outside the sender's sending window / non-business-day.
  if (!isInSendingWindow(campaign, now)) return { enqueued: 0, note: "outside-window" };

  // Daily campaign cap
  const sentToday = await campaignSentToday(db, campaign.id);
  if (sentToday >= campaign.dailyLimit) return { enqueued: 0, note: "daily-limit" };
  let budget = Math.min(BATCH_SIZE, campaign.dailyLimit - sentToday);

  const senders = await campaignSenders(db, campaign.id);
  if (senders.length === 0) return { enqueued: 0, note: "no-senders" };
  const activeSenders = senders.filter((s) => s.status !== "paused");
  if (activeSenders.length === 0) return { enqueued: 0, note: "all-paused" };

  // Skip leads that already replied anywhere in this campaign (stopOnReply)
  // and any campaign_leads already scheduled/sent — atomic claim does the rest.
  const claimable: { id: string; leadId: string }[] = await db
    .select({ id: schema.campaignLeads.id, leadId: schema.campaignLeads.leadId })
    .from(schema.campaignLeads)
    .where(
      and(
        eq(schema.campaignLeads.campaignId, campaign.id),
        eq(schema.campaignLeads.status, "queued"),
        // stop-after-reply is enforced at claim time and again at send time
        campaign.stopOnReply
          ? notExistsReplied(db, campaign.id)
          : sql`1=1`,
      ),
    )
    .orderBy(asc(schema.campaignLeads.createdAt))
    .limit(budget);

  if (claimable.length === 0) {
    // Nothing queued → maybe complete
    const remaining = await pendingWork(db, campaign.id);
    if (remaining === 0) {
      await db
        .update(schema.campaigns)
        .set({ status: "completed", completedAt: nowIsoS, updatedAt: nowIsoS })
        .where(eq(schema.campaigns.id, campaign.id));
      await db
        .update(schema.leads)
        .set({ status: "completed", updatedAt: nowIsoS })
        .where(
          and(
            eq(schema.leads.listId, campaign.leadListId),
            inArray(schema.leads.id, sentLeadIdsSubquery(campaign.id)),
          ),
        );
      await log(db, campaign.userId, "campaign_completed", `Campaign "${campaign.name}" finished`, campaign.id);
      return { enqueued: 0, note: "completed" };
    }
    return { enqueued: 0, note: "waiting-retry" };
  }

  // Atomically claim (skip if another worker beat us)
  const ids = claimable.map((r) => r.id);
  const claimed: { id: string }[] = await db
    .update(schema.campaignLeads)
    .set({ status: "scheduled", updatedAt: nowIsoS })
    .where(and(inArray(schema.campaignLeads.id, ids), eq(schema.campaignLeads.status, "queued")))
    .returning({ id: schema.campaignLeads.id });
  if (claimed.length === 0) return { enqueued: 0, note: "claim-race" };
  budget = Math.min(budget, claimed.length);

  // Load lead + template data for rendering
  const claimedRows: { id: string; leadId: string }[] = await db
    .select({ id: schema.campaignLeads.id, leadId: schema.campaignLeads.leadId })
    .from(schema.campaignLeads)
    .where(inArray(schema.campaignLeads.id, claimed.map((c) => c.id)));
  const leadIds = claimedRows.map((r) => r.leadId);
  const leadRows: any[] = await db
    .select()
    .from(schema.leads)
    .where(inArray(schema.leads.id, leadIds));
  const leadById = new Map<string, any>(leadRows.map((l) => [l.id, l]));
  const tplRows: any[] = await db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.id, campaign.templateId))
    .limit(1);
  const tpl = tplRows[0];
  if (!tpl) {
    // Unclaim so the next tick can retry once a template exists — do not leave
    // campaign_leads stuck in "scheduled" with no email_jobs.
    await db
      .update(schema.campaignLeads)
      .set({ status: "queued", updatedAt: nowIsoS })
      .where(inArray(schema.campaignLeads.id, claimed.map((c) => c.id)));
    return { enqueued: 0, note: "template-missing" };
  }

  // F15: load suppressions for this workspace (emails + domains)
  const suppressionRows: { value: string }[] = await db
    .select({ value: schema.suppressions.value })
    .from(schema.suppressions)
    .where(eq(schema.suppressions.userId, campaign.userId));
  const suppressedValues = suppressionRows.map((r) => r.value);

  // F16/F17: workspace postal address + unsub base
  const settingsRows: any[] = await db
    .select()
    .from(schema.workspaceSettings)
    .where(eq(schema.workspaceSettings.userId, campaign.userId))
    .limit(1);
  const settings = settingsRows[0] as
    | { postalAddress?: string; companyName?: string; unsubscribeBaseUrl?: string }
    | undefined;
  const postalAddress = (settings?.postalAddress ?? "").trim();
  const companyName = (settings?.companyName ?? "").trim();
  const unsubBase =
    (settings?.unsubscribeBaseUrl ?? "").trim() ||
    process.env.BETTER_AUTH_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";


  // Sender availability
  const daily = await loadDailyUsage(db, activeSenders.map((s) => s.id));
  const hourly = takeHourlySnapshot();

  // Rolling cursor so consecutive jobs land on different senders, and a
  // growing schedule so delays accumulate across the batch.
  let cursor = campaign.lastSenderIdx;
  let scheduleAt = new Date(now.getTime() + randomBetween(0, 5) * 1000);
  let enqueued = 0;
  // Track rows we finished (enqueued or cancelled) so senders-exhausted
  // unclaim does not reset already-handled leads (slice(enqueued) was wrong
  // when suppressions/missing leads appeared mid-batch).
  const handledIds = new Set<string>();

  for (const cl of claimedRows) {
    const pick = pickSenderIndex(
      activeSenders,
      daily,
      hourly,
      cursor,
      campaign.maxEmailsPerSenderPerDay,
    );
    if (!pick) {
      // Every sender exhausted → unclaim only untouched rows, park briefly.
      const remainingIds = claimedRows.filter((r) => !handledIds.has(r.id)).map((r) => r.id);
      if (remainingIds.length > 0) {
        await db
          .update(schema.campaignLeads)
          .set({ status: "queued", updatedAt: nowIsoS })
          .where(inArray(schema.campaignLeads.id, remainingIds));
      }
      const until = addSeconds(now, 3600).toISOString();
      await db
        .update(schema.campaigns)
        .set({ senderCapUntil: until, updatedAt: nowIsoS })
        .where(eq(schema.campaigns.id, campaign.id));
      return { enqueued, note: "senders-exhausted" };
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

    const vars = leadVars(lead);
    const subject = renderTemplate(tpl.subject, vars);
    let bodyText =
      tpl.format === "text"
        ? appendSignature(renderTemplate(tpl.bodyText, vars), pick.sender)
        : renderTemplate(tpl.bodyText, vars);
    let bodyHtml =
      tpl.format === "html"
        ? appendSignature(renderTemplate(tpl.bodyHtml, vars), pick.sender)
        : renderTemplate(tpl.bodyHtml, vars);

    const unsubToken = createUnsubscribeToken(campaign.userId, lead.email);
    const unsubUrl = buildUnsubscribeUrl(unsubBase, unsubToken);
    bodyText = ensureUnsubscribeFooter(bodyText, { unsubUrl, asHtml: false });
    bodyHtml = ensureUnsubscribeFooter(bodyHtml || bodyText, { unsubUrl, asHtml: true });
    if (postalAddress) {
      bodyText = ensurePostalFooter(bodyText, { postalAddress, companyName, asHtml: false });
      bodyHtml = ensurePostalFooter(bodyHtml, { postalAddress, companyName, asHtml: true });
    }

    await db.insert(schema.emailJobs).values({
      id: crypto.randomUUID(),
      campaignId: campaign.id,
      campaignLeadId: cl.id,
      senderId: pick.sender.id,
      leadId: cl.leadId,
      toEmail: lead.email,
      subject,
      bodyText,
      bodyHtml,
      status: "pending",
      scheduledFor: scheduleAt.toISOString(),
      attempts: 0,
      maxAttempts: campaign.retryFailed ? campaign.retryCount : 1,
    });
    await db
      .update(schema.campaignLeads)
      .set({ scheduledFor: scheduleAt.toISOString(), updatedAt: nowIsoS })
      .where(eq(schema.campaignLeads.id, cl.id));
    await db
      .update(schema.leads)
      .set({ status: "queued", updatedAt: nowIsoS })
      .where(eq(schema.leads.id, cl.leadId));

    // advance rotation + randomized pace
    cursor = pick.index;
    daily.set(pick.sender.id, (daily.get(pick.sender.id) ?? 0) + 1);
    scheduleAt = addSeconds(
      scheduleAt,
      randomBetween(campaign.minDelaySec, campaign.maxDelaySec),
    );
    handledIds.add(cl.id);
    enqueued++;
    if (--budget <= 0) break;
  }

  await db
    .update(schema.campaigns)
    .set({ lastSenderIdx: cursor, updatedAt: nowIsoS })
    .where(eq(schema.campaigns.id, campaign.id));
  return { enqueued };
}

function appendSignature(body: string, sender: SenderRow): string {
  return sender.signature ? `${body}\n\n${sender.signature}` : body;
}

export function leadVars(lead: any): Record<string, string> {
  const cf = (lead.customFields ?? {}) as Record<string, string>;
  return {
    ...normalizeKeys(cf),
    email: lead.email ?? "",
    first_name: lead.firstName ?? "",
    last_name: lead.lastName ?? "",
    company: lead.company ?? "",
    website: lead.website ?? "",
    linkedin: lead.linkedin ?? "",
    job_title: lead.jobTitle ?? "",
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
  // campaign_leads.lead_id NOT IN (select lead_id from campaign_leads where campaign & replied)
  return sql`NOT EXISTS (SELECT 1 FROM campaign_leads cr WHERE cr.campaign_id = ${campaignId} AND cr.lead_id = campaign_leads.lead_id AND cr.status = 'replied')`;
}

function sentLeadIdsSubquery(campaignId: string) {
  return sql`(SELECT lead_id FROM campaign_leads WHERE campaign_id = ${campaignId} AND status IN ('sent','completed'))` as any;
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

  const running: CampaignRow[] = await db
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.status, "running"), isNull(schema.campaigns.deletedAt)));

  for (const c of running) {
    try {
      if (c.senderCapUntil && c.senderCapUntil > now.toISOString()) {
        result.skipped.push(`${c.name}: all senders at cap`);
        continue;
      }
      if (!isInSendingWindow(c, now)) {
        result.rescheduled++;
        result.skipped.push(`${c.name}: outside window`);
        continue;
      }
      const r = await scheduleCampaign(db, c, now);
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

async function log(db: EngineDb, userId: string, type: string, message: string, campaignId?: string) {
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId,
    type,
    message,
    campaignId: campaignId ?? null,
  });
}
