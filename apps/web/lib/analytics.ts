/**
 * Campaign metrics: one definition, used on every page.
 *
 *  Emails sent     email_jobs with status 'sent' and dry_run = false (follow-ups included)
 *  Leads emailed   distinct lead_id of those jobs
 *  Replies         distinct coalesce(lead_id, lower(from_email)) in replies (people, not messages)
 *  Opens           distinct coalesce(lead_id, job_id) of 'open' tracking events
 *  Reply, open and bounce rates = that count / leads emailed, capped at 100
 */
import { and, count, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import type { VariantStatRow } from "./variant-stats";

const { campaigns, emailJobs, replies, emailTrackingEvents } = schema;

/** Leads emailed for the campaign id in `campaignIdCol` (a column or a literal id). */
export function leadsEmailedSql(campaignIdCol: unknown): SQL<number> {
  return sql<number>`coalesce((select count(distinct ej.lead_id)::int from email_jobs ej where ej.campaign_id = ${campaignIdCol} and ej.status = 'sent' and ej.dry_run = false), 0)`;
}

/** Leads (or addresses, without a lead) who replied to the campaign in `campaignIdCol`. */
export function repliedLeadsSql(campaignIdCol: unknown): SQL<number> {
  return sql<number>`coalesce((select count(distinct coalesce(r.lead_id, lower(r.from_email)))::int from replies r where r.campaign_id = ${campaignIdCol}), 0)`;
}

export type CampaignTotals = {
  /** Every delivered email, follow-ups included. */
  emailsSent: number;
  /** Each lead counted once. */
  leadsEmailed: number;
  repliedLeads: number;
  openedLeads: number;
  bouncedEmails: number;
};

/** Lifetime totals for one campaign (the caller checks ownership). */
export async function getCampaignTotals(campaignId: string): Promise<CampaignTotals> {
  const db = getDb();
  const [[sentRow], [replyRow], [openRow], [bounceRow]] = await Promise.all([
    db
      .select({ emails: count(), leads: sql<number>`count(distinct ${emailJobs.leadId})` })
      .from(emailJobs)
      .where(and(eq(emailJobs.campaignId, campaignId), eq(emailJobs.status, "sent"), eq(emailJobs.dryRun, false))),
    db
      .select({ n: sql<number>`count(distinct coalesce(${replies.leadId}, lower(${replies.fromEmail})))` })
      .from(replies)
      .where(eq(replies.campaignId, campaignId)),
    db
      .select({
        n: sql<number>`count(distinct coalesce(${emailTrackingEvents.leadId}, ${emailTrackingEvents.jobId}))`,
      })
      .from(emailTrackingEvents)
      .where(and(eq(emailTrackingEvents.campaignId, campaignId), eq(emailTrackingEvents.type, "open")))
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(emailJobs)
      .where(and(eq(emailJobs.campaignId, campaignId), eq(emailJobs.status, "bounced"), eq(emailJobs.dryRun, false))),
  ]);
  return {
    emailsSent: Number(sentRow?.emails ?? 0),
    leadsEmailed: Number(sentRow?.leads ?? 0),
    repliedLeads: Number(replyRow?.n ?? 0),
    openedLeads: Number(openRow?.n ?? 0),
    bouncedEmails: Number(bounceRow?.n ?? 0),
  };
}

/** Reply, open and bounce rates per lead emailed (never per email). */
export function campaignRates(t: CampaignTotals) {
  return computeAnalyticsRates(t.leadsEmailed, t.repliedLeads, t.bouncedEmails, t.openedLeads);
}

export type AnalyticsRangeInput = {
  campaignId?: string;
  from: string; // ISO date YYYY-MM-DD (or full ISO; date part used)
  to: string;
};

export type AnalyticsSummary = {
  leadsContacted: number;
  replyCount: number;
  bounceCount: number;
  replyRate: number; // percent 0–100; 0 if contacted=0
  bounceRate: number;
  openRate: number | null;
  clickRate: number | null;
  openCount?: number;
  clickCount?: number;
};

export type AnalyticsSeriesPoint = {
  date: string; // YYYY-MM-DD
  sent: number;
  contacted: number;
  replies: number;
  bounces: number;
};

/** Normalize to YYYY-MM-DD (UTC date part of an ISO string). */
export function toDateKey(isoOrDate: string): string {
  const s = isoOrDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${isoOrDate}`);
  return d.toISOString().slice(0, 10);
}

export function rangeBounds(from: string, to: string): { fromKey: string; toKey: string; fromIso: string; toIso: string } {
  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);
  return {
    fromKey,
    toKey,
    fromIso: `${fromKey}T00:00:00.000Z`,
    toIso: `${toKey}T23:59:59.999Z`,
  };
}

/** Inclusive UTC calendar days from..to. Empty if from > to. */
export function eachDateInclusive(from: string, to: string): string[] {
  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);
  if (fromKey > toKey) return [];
  const out: string[] = [];
  const cur = new Date(`${fromKey}T00:00:00.000Z`);
  const end = new Date(`${toKey}T00:00:00.000Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Pure rate helpers — calculate reply, bounce, open, and click rates. */
export function computeAnalyticsRates(
  leadsContacted: number,
  replyCount: number,
  bounceCount: number,
  openCount: number = 0,
  clickCount: number = 0,
): Pick<AnalyticsSummary, "replyRate" | "bounceRate" | "openRate" | "clickRate"> {
  const replyRate = leadsContacted === 0 ? 0 : Math.min(100, (replyCount / leadsContacted) * 100);
  const bounceRate = leadsContacted === 0 ? 0 : Math.min(100, (bounceCount / leadsContacted) * 100);
  const openRate = leadsContacted === 0 ? 0 : Math.min(100, (openCount / leadsContacted) * 100);
  const clickRate = leadsContacted === 0 ? 0 : Math.min(100, (clickCount / leadsContacted) * 100);
  return {
    replyRate,
    bounceRate,
    openRate,
    clickRate,
  };
}

export function buildAnalyticsSummary(counts: {
  leadsContacted: number;
  replyCount: number;
  bounceCount: number;
  openCount?: number;
  clickCount?: number;
}): AnalyticsSummary {
  const openCount = counts.openCount ?? 0;
  const clickCount = counts.clickCount ?? 0;
  const rates = computeAnalyticsRates(
    counts.leadsContacted,
    counts.replyCount,
    counts.bounceCount,
    openCount,
    clickCount,
  );
  return {
    leadsContacted: counts.leadsContacted,
    replyCount: counts.replyCount,
    bounceCount: counts.bounceCount,
    openCount,
    clickCount,
    ...rates,
  };
}

async function assertCampaignOwned(userId: string, campaignId: string | undefined): Promise<void> {
  if (!campaignId) return;
  const db = getDb();
  const [row] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId), isNull(campaigns.deletedAt)))
    .limit(1);
  if (!row) throw new Error("Campaign not found");
}

/**
 * Distinct leads with ≥1 successful (non-dry-run) send in range.
 * Sent series = raw job send count; contacted = unique leads.
 */
export async function getAnalyticsSummaryForUser(
  userId: string,
  input: AnalyticsRangeInput,
): Promise<AnalyticsSummary> {
  const { fromKey, toKey, fromIso, toIso } = rangeBounds(input.from, input.to);
  if (fromKey > toKey) {
    return buildAnalyticsSummary({ leadsContacted: 0, replyCount: 0, bounceCount: 0 });
  }

  await assertCampaignOwned(userId, input.campaignId);
  const db = getDb();
  const campaignId = input.campaignId;

  const jobBase = and(
    eq(campaigns.userId, userId),
    eq(emailJobs.dryRun, false),
    campaignId ? eq(emailJobs.campaignId, campaignId) : undefined,
  );

  const trackingBase = and(
    eq(emailTrackingEvents.userId, userId),
    campaignId ? eq(emailTrackingEvents.campaignId, campaignId) : undefined,
    gte(emailTrackingEvents.createdAt, fromIso),
    lte(emailTrackingEvents.createdAt, toIso),
  );

  const [[contactedRow], [replyRow], [bounceRow], [openRow], [clickRow]] = await Promise.all([
    db
      .select({
        n: sql<number>`count(distinct ${emailJobs.leadId})`,
      })
      .from(emailJobs)
      .innerJoin(campaigns, eq(emailJobs.campaignId, campaigns.id))
      .where(
        and(
          jobBase,
          eq(emailJobs.status, "sent"),
          gte(emailJobs.sentAt, fromIso),
          lte(emailJobs.sentAt, toIso),
        ),
      ),
    db
      .select({ n: sql<number>`count(distinct coalesce(${replies.leadId}, ${replies.fromEmail}))` })
      .from(replies)
      .where(
        and(
          eq(replies.userId, userId),
          gte(replies.receivedAt, fromIso),
          lte(replies.receivedAt, toIso),
          campaignId ? eq(replies.campaignId, campaignId) : undefined,
        ),
      ),
    db
      .select({ n: count() })
      .from(emailJobs)
      .innerJoin(campaigns, eq(emailJobs.campaignId, campaigns.id))
      .where(
        and(
          jobBase,
          eq(emailJobs.status, "bounced"),
          // permanent SMTP failures may lack sentAt — use updatedAt
          gte(emailJobs.updatedAt, fromIso),
          lte(emailJobs.updatedAt, toIso),
        ),
      ),
    db
      .select({
        n: sql<number>`count(distinct coalesce(${emailTrackingEvents.leadId}, ${emailTrackingEvents.jobId}))`,
      })
      .from(emailTrackingEvents)
      .where(and(trackingBase, eq(emailTrackingEvents.type, "open")))
      .catch(() => [{ n: 0 }]),
    db
      .select({
        n: sql<number>`count(distinct coalesce(${emailTrackingEvents.leadId}, ${emailTrackingEvents.jobId}))`,
      })
      .from(emailTrackingEvents)
      .where(and(trackingBase, eq(emailTrackingEvents.type, "click")))
      .catch(() => [{ n: 0 }]),
  ]);

  return buildAnalyticsSummary({
    leadsContacted: Number(contactedRow?.n ?? 0),
    replyCount: Number(replyRow?.n ?? 0),
    bounceCount: Number(bounceRow?.n ?? 0),
    openCount: Number(openRow?.n ?? 0),
    clickCount: Number(clickRow?.n ?? 0),
  });
}

export async function getAnalyticsSeriesForUser(
  userId: string,
  input: AnalyticsRangeInput & { granularity?: "day" },
): Promise<{ points: AnalyticsSeriesPoint[] }> {
  const { fromKey, toKey, fromIso, toIso } = rangeBounds(input.from, input.to);
  const days = eachDateInclusive(fromKey, toKey);
  if (days.length === 0) return { points: [] };

  await assertCampaignOwned(userId, input.campaignId);
  const db = getDb();
  const campaignId = input.campaignId;

  const jobBase = and(
    eq(campaigns.userId, userId),
    eq(emailJobs.dryRun, false),
    campaignId ? eq(emailJobs.campaignId, campaignId) : undefined,
  );

  const dayExpr = (col: unknown) => sql<string>`substr(${col}, 1, 10)`;

  const [sentRows, contactedRows, replyRows, bounceRows] = await Promise.all([
    db
      .select({
        date: dayExpr(emailJobs.sentAt),
        n: count(),
      })
      .from(emailJobs)
      .innerJoin(campaigns, eq(emailJobs.campaignId, campaigns.id))
      .where(
        and(
          jobBase,
          eq(emailJobs.status, "sent"),
          gte(emailJobs.sentAt, fromIso),
          lte(emailJobs.sentAt, toIso),
        ),
      )
      .groupBy(dayExpr(emailJobs.sentAt)),
    db
      .select({
        date: dayExpr(emailJobs.sentAt),
        n: sql<number>`count(distinct ${emailJobs.leadId})`,
      })
      .from(emailJobs)
      .innerJoin(campaigns, eq(emailJobs.campaignId, campaigns.id))
      .where(
        and(
          jobBase,
          eq(emailJobs.status, "sent"),
          gte(emailJobs.sentAt, fromIso),
          lte(emailJobs.sentAt, toIso),
        ),
      )
      .groupBy(dayExpr(emailJobs.sentAt)),
    db
      .select({
        date: dayExpr(replies.receivedAt),
        n: sql<number>`count(distinct coalesce(${replies.leadId}, ${replies.fromEmail}))`,
      })
      .from(replies)
      .where(
        and(
          eq(replies.userId, userId),
          gte(replies.receivedAt, fromIso),
          lte(replies.receivedAt, toIso),
          campaignId ? eq(replies.campaignId, campaignId) : undefined,
        ),
      )
      .groupBy(dayExpr(replies.receivedAt)),
    db
      .select({
        date: dayExpr(emailJobs.updatedAt),
        n: count(),
      })
      .from(emailJobs)
      .innerJoin(campaigns, eq(emailJobs.campaignId, campaigns.id))
      .where(
        and(
          jobBase,
          eq(emailJobs.status, "bounced"),
          gte(emailJobs.updatedAt, fromIso),
          lte(emailJobs.updatedAt, toIso),
        ),
      )
      .groupBy(dayExpr(emailJobs.updatedAt)),
  ]);

  const sentMap = new Map(sentRows.map((r) => [r.date, Number(r.n)]));
  const contactedMap = new Map(contactedRows.map((r) => [r.date, Number(r.n)]));
  const replyMap = new Map(replyRows.map((r) => [r.date, Number(r.n)]));
  const bounceMap = new Map(bounceRows.map((r) => [r.date, Number(r.n)]));

  const points: AnalyticsSeriesPoint[] = days.map((date) => ({
    date,
    sent: sentMap.get(date) ?? 0,
    contacted: contactedMap.get(date) ?? 0,
    replies: replyMap.get(date) ?? 0,
    bounces: bounceMap.get(date) ?? 0,
  }));

  return { points };
}

/**
 * Sent, non-dry-run jobs of one campaign grouped by sequence step and A/B
 * variant. Opens count leads with an open event on that job; replies count
 * leads who replied to this campaign after that job was sent.
 */
export async function getVariantStatsForCampaign(userId: string, campaignId: string): Promise<VariantStatRow[]> {
  await assertCampaignOwned(userId, campaignId);
  const db = getDb();
  const { sequenceStepVariants } = schema;
  const rows = await db
    .select({
      stepPosition: emailJobs.stepPosition,
      variantId: emailJobs.variantId,
      label: sequenceStepVariants.label,
      pausedAt: sequenceStepVariants.pausedAt,
      sent: sql<number>`count(*)`,
      leads: sql<number>`count(distinct ${emailJobs.leadId})`,
      opened: sql<number>`count(distinct ${emailJobs.leadId}) filter (where exists (
        select 1 from ${emailTrackingEvents}
        where ${emailTrackingEvents.jobId} = ${emailJobs.id} and ${emailTrackingEvents.type} = 'open'
      ))`,
      replied: sql<number>`count(distinct ${emailJobs.leadId}) filter (where exists (
        select 1 from ${replies}
        where ${replies.campaignId} = ${emailJobs.campaignId}
          and ${replies.leadId} = ${emailJobs.leadId}
          and ${replies.receivedAt} >= ${emailJobs.sentAt}
      ))`,
    })
    .from(emailJobs)
    .leftJoin(sequenceStepVariants, eq(sequenceStepVariants.id, emailJobs.variantId))
    .where(
      and(
        eq(emailJobs.campaignId, campaignId),
        eq(emailJobs.status, "sent"),
        eq(emailJobs.dryRun, false),
        sql`${emailJobs.variantId} is not null`,
      ),
    )
    .groupBy(emailJobs.stepPosition, emailJobs.variantId, sequenceStepVariants.label, sequenceStepVariants.pausedAt);

  return rows.map((r) => ({
    stepPosition: Number(r.stepPosition),
    variantId: String(r.variantId),
    label: r.label ?? null,
    pausedAt: r.pausedAt ?? null,
    sent: Number(r.sent) || 0,
    leads: Number(r.leads) || 0,
    opened: Number(r.opened) || 0,
    replied: Number(r.replied) || 0,
  }));
}
