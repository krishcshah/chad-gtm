import { and, count, desc, eq, gte, isNull, sql, inArray } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";

const {
  campaigns,
  campaignLeads,
  campaignSenders,
  emailJobs,
  leadLists,
  leads,
  replies,
  senderAccounts,
  activityLogs,
  usageCounters,
} = schema;

const today = () => new Date().toISOString().slice(0, 10);

export async function getDashboardStats(userId: string) {
  const db = getDb();
  const t = today();

  // Fire all six independent aggregates in parallel — one Neon hop (~120ms)
  // instead of six sequential hops (~720ms). This is the dashboard's hot path.
  const [
    [campaignRows],
    [usageRows],
    [jobsToday],
    [leadRows],
    [senderRows],
    [replyRows],
  ] = await Promise.all([
    db
      .select({
        active: count(sql`case when ${campaigns.status} = 'running' then 1 end`),
        scheduled: count(sql`case when ${campaigns.status} = 'scheduled' then 1 end`),
      })
      .from(campaigns)
      .where(and(eq(campaigns.userId, userId), isNull(campaigns.deletedAt))),
    db
      .select({
        // SUM of campaign counters — COUNT() was wrong (row count ≠ sends) and
        // was incorrectly folded into "Queued today".
        sentToday: sql<number>`coalesce(sum(case when ${usageCounters.entityType} = 'campaign' then ${usageCounters.count} else 0 end), 0)`,
      })
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.date, t))),
    db
      .select({
        sent: count(sql`case when ${emailJobs.status} = 'sent' then 1 end`),
        queued: count(sql`case when ${emailJobs.status} in ('pending','retry','processing') then 1 end`),
        failed: count(sql`case when ${emailJobs.status} = 'failed' then 1 end`),
        bounced: count(sql`case when ${emailJobs.status} = 'bounced' then 1 end`),
      })
      .from(emailJobs)
      .innerJoin(campaigns, eq(emailJobs.campaignId, campaigns.id))
      .where(and(eq(campaigns.userId, userId), gte(emailJobs.createdAt, `${t}T00:00:00Z`))),
    db
      .select({ total: count() })
      .from(leads)
      .where(and(eq(leads.userId, userId), isNull(leads.deletedAt))),
    db
      .select({
        total: count(),
        active: count(sql`case when ${senderAccounts.status} = 'active' then 1 end`),
      })
      .from(senderAccounts)
      .where(and(eq(senderAccounts.userId, userId), isNull(senderAccounts.deletedAt))),
    db
      .select({ total: count() })
      .from(replies)
      .where(eq(replies.userId, userId)),
  ]);

  // usageRows.sentToday cross-checks job-row sent count (both should agree after recordSend).
  const sentFromJobs = Number(jobsToday?.sent ?? 0);
  const sentFromUsage = Number(usageRows?.sentToday ?? 0);
  return {
    activeCampaigns: Number(campaignRows?.active ?? 0),
    scheduledCampaigns: Number(campaignRows?.scheduled ?? 0),
    emailsQueuedToday: Number(jobsToday?.queued ?? 0),
    emailsSentToday: Math.max(sentFromJobs, sentFromUsage),
    failedToday: Number(jobsToday?.failed ?? 0),
    bouncedToday: Number(jobsToday?.bounced ?? 0),
    totalLeads: Number(leadRows?.total ?? 0),
    replyCount: Number(replyRows?.total ?? 0),
    senderTotal: Number(senderRows?.total ?? 0),
    senderActive: Number(senderRows?.active ?? 0),
  };
}

export async function getRecentActivity(userId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.userId, userId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}


/* ─── List pages ───────────────────────────────────────────────────────── */

export async function getActiveCampaigns(userId: string) {
  const db = getDb();
  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      total: count(campaignLeads.id),
      sent: count(sql`case when ${campaignLeads.status} in ('sent','replied') then 1 end`),
      replied: count(sql`case when ${campaignLeads.status} = 'replied' then 1 end`),
    })
    .from(campaigns)
    .leftJoin(campaignLeads, eq(campaignLeads.campaignId, campaigns.id))
    .where(and(eq(campaigns.userId, userId), isNull(campaigns.deletedAt), inArray(campaigns.status, ["running", "scheduled", "paused"])))
    .groupBy(campaigns.id)
    .orderBy(desc(campaigns.createdAt))
    .limit(8);
}

export async function listLeadLists(userId: string) {
  const db = getDb();
  return db
    .select({
      id: leadLists.id,
      name: leadLists.name,
      createdAt: leadLists.createdAt,
      leadCount: count(leads.id),
    })
    .from(leadLists)
    .leftJoin(leads, and(eq(leads.listId, leadLists.id), isNull(leads.deletedAt)))
    .where(and(eq(leadLists.userId, userId), isNull(leadLists.deletedAt)))
    .groupBy(leadLists.id)
    .orderBy(desc(leadLists.createdAt));
}

export interface LeadsPageParams {
  listId?: string;
  search?: string;
  status?: string;
  cursor?: string; // id of last row from previous page
  pageSize?: number;
}

export async function listLeads(userId: string, params: LeadsPageParams) {
  const db = getDb();
  const size = Math.min(params.pageSize ?? 50, 200);
  const conds = [eq(leads.userId, userId), isNull(leads.deletedAt)];
  if (params.listId) conds.push(eq(leads.listId, params.listId));
  if (params.status) conds.push(eq(leads.status, params.status as never));
  if (params.search) {
    const q = `%${params.search}%`;
    conds.push(
      sql`(${leads.email} ilike ${q} or ${leads.firstName} ilike ${q} or ${leads.lastName} ilike ${q} or ${leads.company} ilike ${q})`,
    );
  }
  if (params.cursor) {
    conds.push(
      sql`(${leads.createdAt}, ${leads.id}) < (select ${leads.createdAt}, ${leads.id} from ${leads} where ${leads.id} = ${params.cursor})`,
    );
  }
  const rows = await db
    .select()
    .from(leads)
    .where(and(...conds))
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(size + 1);
  const hasMore = rows.length > size;
  const items = rows.slice(0, size);
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
}

export async function listSenders(userId: string) {
  const db = getDb();
  const t = today();
  const usage = db.$with("usage").as(
    db
      .select({ id: usageCounters.entityId, count: usageCounters.count })
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.date, t), eq(usageCounters.entityType, "sender"))),
  );
  return db
    .with(usage)
    .select({
      id: senderAccounts.id,
      senderName: senderAccounts.senderName,
      email: senderAccounts.email,
      status: senderAccounts.status,
      health: senderAccounts.health,
      smtpStatus: senderAccounts.smtpStatus,
      imapStatus: senderAccounts.imapStatus,
      dailyLimit: senderAccounts.dailyLimit,
      hourlyLimit: senderAccounts.hourlyLimit,
      repliedCount: senderAccounts.repliedCount,
      lastSyncAt: senderAccounts.lastSyncAt,
      usedToday: sql<number>`coalesce(${usage.count}, 0)`,
    })
    .from(senderAccounts)
    .leftJoin(usage, eq(usage.id, senderAccounts.id))
    .where(and(eq(senderAccounts.userId, userId), isNull(senderAccounts.deletedAt)))
    .orderBy(desc(senderAccounts.createdAt));
}

export async function listTemplates(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.emailTemplates)
    .where(and(eq(schema.emailTemplates.userId, userId), isNull(schema.emailTemplates.deletedAt)))
    .orderBy(desc(schema.emailTemplates.updatedAt));
}

export async function getTemplate(userId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.emailTemplates)
    .where(
      and(
        eq(schema.emailTemplates.id, id),
        eq(schema.emailTemplates.userId, userId),
        isNull(schema.emailTemplates.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getLeadList(userId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(leadLists)
    .where(and(eq(leadLists.id, id), eq(leadLists.userId, userId), isNull(leadLists.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listTags(userId: string) {
  const db = getDb();
  return db.select().from(schema.leadTags).where(eq(schema.leadTags.userId, userId)).orderBy(schema.leadTags.name);
}

export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  createdAt: string | null;
  scheduledAt: string | null;
  total: number;
  sent: number;
  replied: number;
  failed: number;
  bounced: number;
}

export async function listCampaigns(userId: string): Promise<CampaignRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      scheduledAt: campaigns.scheduledAt,
      total: count(campaignLeads.id),
      sent: count(sql`case when ${campaignLeads.status} in ('sent','replied') then 1 end`),
      replied: count(sql`case when ${campaignLeads.status} = 'replied' then 1 end`),
      failed: count(sql`case when ${campaignLeads.status} = 'failed' then 1 end`),
      // Bounces live on email_jobs (permanent SMTP); campaign_leads stay "failed".
      bounced: sql<number>`coalesce((
        select count(*)::int from email_jobs ej
        where ej.campaign_id = ${campaigns.id} and ej.status = 'bounced'
      ), 0)`,
    })
    .from(campaigns)
    .leftJoin(campaignLeads, eq(campaignLeads.campaignId, campaigns.id))
    .where(and(eq(campaigns.userId, userId), isNull(campaigns.deletedAt)))
    .groupBy(campaigns.id)
    .orderBy(desc(campaigns.createdAt));
  return rows.map((r) => ({ ...r, bounced: Number(r.bounced ?? 0) })) as CampaignRow[];
}

export async function getCampaign(userId: string, id: string) {
  const db = getDb();
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId), isNull(campaigns.deletedAt)))
    .limit(1);
  if (!c) return null;
  // Parallel: these two reads are independent of one another.
  const [[stats], senders] = await Promise.all([
    db
      .select({
        total: count(campaignLeads.id),
        sent: count(sql`case when ${campaignLeads.status} in ('sent','replied') then 1 end`),
        replied: count(sql`case when ${campaignLeads.status} = 'replied' then 1 end`),
        failed: count(sql`case when ${campaignLeads.status} = 'failed' then 1 end`),
        bounced: sql<number>`coalesce((
          select count(*)::int from email_jobs ej
          where ej.campaign_id = ${id} and ej.status = 'bounced'
        ), 0)`,
      })
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, id)),
    db
      .select({
        id: senderAccounts.id,
        senderName: senderAccounts.senderName,
        email: senderAccounts.email,
        status: senderAccounts.status,
        health: senderAccounts.health,
      })
      .from(campaignSenders)
      .innerJoin(senderAccounts, eq(senderAccounts.id, campaignSenders.senderId))
      .where(eq(campaignSenders.campaignId, id)),
  ]);
  return {
    ...c,
    stats: stats
      ? { ...stats, bounced: Number(stats.bounced ?? 0) }
      : { total: 0, sent: 0, replied: 0, failed: 0, bounced: 0 },
    senders,
  };
}

/** Postal is optional — always true so start/publish UI is never blocked. */
export async function hasWorkspacePostalAddress(_userId: string): Promise<boolean> {
  return true;
}

export async function listReplies(userId: string, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(replies)
    .where(eq(replies.userId, userId))
    .orderBy(desc(replies.receivedAt))
    .limit(limit);
}
