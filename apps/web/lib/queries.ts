import { and, count, desc, eq, getTableColumns, gte, isNull, ne, sql, inArray } from "drizzle-orm";
import { GLOBAL_SUPPRESSION_SOURCES, loadWorkspaceProfile, schema } from "@smartreach/database";
import { getDb } from "./db";
import { summarizeUniboxThreads } from "./unibox-conversations";
import { isUsablePostalAddress } from "./campaign-start-guard";
import { leadsEmailedSql, repliedLeadsSql } from "./analytics";
import { campaignListTotal } from "./audience-summary";
import {
  contactCooldownSince,
  listSendabilityCounts,
  missingListLeadsCountSql,
  missingListLeadsWhere,
} from "./lead-sendability";

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
  suppressions,
} = schema;

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

export function wsCondition(column: any, workspaceId?: string, isDefault = false) {
  if (!workspaceId) return undefined;
  if (workspaceId === "primary-default" || isDefault) {
    return sql`(${column} = ${workspaceId} OR ${column} IS NULL)`;
  }
  return eq(column, workspaceId);
}

/**
 * Which replies belong to a workspace: the Inbox rule (unibox/page.tsx). A
 * reply counts when its campaign or the mailbox it reached is in the
 * workspace; the default workspace also gets replies with neither. Needs the
 * query to leftJoin campaigns (on replies.campaign_id) and sender_accounts
 * (on replies.sender_id).
 */
export function replyWorkspaceCondition(workspaceId: string, isDefault = false) {
  if (workspaceId === "primary-default" || isDefault) {
    return sql`(${campaigns.workspaceId} = ${workspaceId} OR ${senderAccounts.workspaceId} = ${workspaceId} OR (${campaigns.workspaceId} IS NULL AND ${senderAccounts.workspaceId} IS NULL))`;
  }
  return sql`(${campaigns.workspaceId} = ${workspaceId} OR ${senderAccounts.workspaceId} = ${workspaceId})`;
}

export async function getDashboardStats(userId: string, workspaceId?: string, isDefault = false) {
  const db = getDb();
  const t = today();

  // Lazy sync: ensure orphaned leads from deleted lists have deletedAt set
  db.execute(sql`
    UPDATE leads
    SET deleted_at = coalesce(leads.deleted_at, ${nowIso()})
    FROM lead_lists
    WHERE leads.list_id = lead_lists.id
      AND lead_lists.deleted_at IS NOT NULL
      AND leads.deleted_at IS NULL
      AND leads.user_id = ${userId}
  `).catch(() => {});

  const campaignConds = [eq(campaigns.userId, userId), isNull(campaigns.deletedAt)];
  const cWs = wsCondition(campaigns.workspaceId, workspaceId, isDefault);
  if (cWs) campaignConds.push(cWs);

  const leadConds = [eq(leads.userId, userId), isNull(leads.deletedAt)];
  const lWs = wsCondition(leads.workspaceId, workspaceId, isDefault);
  if (lWs) leadConds.push(lWs);

  const senderConds = [eq(senderAccounts.userId, userId), isNull(senderAccounts.deletedAt)];
  const sWs = wsCondition(senderAccounts.workspaceId, workspaceId, isDefault);
  if (sWs) senderConds.push(sWs);

  const jobConds = [eq(campaigns.userId, userId), gte(emailJobs.createdAt, `${t}T00:00:00Z`)];
  if (cWs) jobConds.push(cWs);

  const replyConds = [eq(replies.userId, userId)];
  // Same rule as the Inbox, so Overview's reply count matches it.
  if (workspaceId) replyConds.push(replyWorkspaceCondition(workspaceId, isDefault));

  const contactedConds = [
    eq(campaigns.userId, userId),
    eq(emailJobs.status, "sent"),
    eq(emailJobs.dryRun, false),
  ];
  if (cWs) contactedConds.push(cWs);

  const bounceConds = [
    eq(campaigns.userId, userId),
    eq(emailJobs.status, "bounced"),
    eq(emailJobs.dryRun, false),
  ];
  if (cWs) bounceConds.push(cWs);

  // Opens are counted per lead (lib/analytics.ts), only for this workspace's campaigns.
  const openConds = [eq(campaigns.userId, userId), eq(schema.emailTrackingEvents.type, "open")];
  if (cWs) openConds.push(cWs);

  // Fire aggregates in parallel
  const [
    [campaignRows],
    [usageRows],
    [jobsToday],
    [leadRows],
    [senderRows],
    [replyRows],
    [contactedRows],
    [bounceRows],
    [openRows],
  ] = await Promise.all([
    db
      .select({
        active: count(sql`case when ${campaigns.status} = 'running' then 1 end`),
        scheduled: count(sql`case when ${campaigns.status} = 'scheduled' then 1 end`),
      })
      .from(campaigns)
      .where(and(...campaignConds)),
    db
      .select({
        // Mailbox counters (owner's userId) stay on the UTC day; campaign
        // counters use each campaign's local day, so they cannot be summed here.
        sentToday: sql<number>`coalesce(sum(case when ${usageCounters.entityType} = 'sender' then ${usageCounters.count} else 0 end), 0)`,
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
      .where(and(...jobConds)),
    db
      .select({ total: count(leads.id) })
      .from(leads)
      .innerJoin(leadLists, and(eq(leads.listId, leadLists.id), isNull(leadLists.deletedAt)))
      .where(and(...leadConds)),
    db
      .select({
        total: count(),
        active: count(sql`case when ${senderAccounts.status} = 'active' then 1 end`),
      })
      .from(senderAccounts)
      .where(and(...senderConds)),
    db
      .select({
        total: sql<number>`count(distinct coalesce(${replies.leadId}, lower(${replies.fromEmail})))`,
      })
      .from(replies)
      .leftJoin(campaigns, eq(replies.campaignId, campaigns.id))
      .leftJoin(senderAccounts, eq(replies.senderId, senderAccounts.id))
      .where(and(...replyConds)),
    db
      .select({
        leadsContacted: sql<number>`count(distinct ${emailJobs.leadId})`,
        totalSent: count(),
      })
      .from(emailJobs)
      .innerJoin(campaigns, eq(emailJobs.campaignId, campaigns.id))
      .where(and(...contactedConds)),
    db
      .select({ total: count() })
      .from(emailJobs)
      .innerJoin(campaigns, eq(emailJobs.campaignId, campaigns.id))
      .where(and(...bounceConds)),
    db
      .select({
        total: sql<number>`count(distinct coalesce(${schema.emailTrackingEvents.leadId}, ${schema.emailTrackingEvents.jobId}))`,
      })
      .from(schema.emailTrackingEvents)
      .innerJoin(campaigns, eq(schema.emailTrackingEvents.campaignId, campaigns.id))
      .where(and(...openConds))
      .catch(() => [{ total: 0 }]),
  ]);

  // usageRows.sentToday cross-checks job-row sent count
  const sentFromJobs = Number(jobsToday?.sent ?? 0);
  const sentFromUsage = Number(usageRows?.sentToday ?? 0);
  const leadsContacted = Number(contactedRows?.leadsContacted ?? 0);
  const totalSent = Number(contactedRows?.totalSent ?? 0);
  const replyCount = Number(replyRows?.total ?? 0);
  const bounceCount = Number(bounceRows?.total ?? 0);
  const openedLeads = Number(openRows?.total ?? 0);
  // Every rate is per lead emailed, capped at 100 (lib/analytics.ts).
  const perLead = (n: number) => (leadsContacted > 0 ? Math.min(100, (n / leadsContacted) * 100) : 0);
  const replyRate = perLead(replyCount).toFixed(1);
  const bounceRate = perLead(bounceCount).toFixed(1);
  const openRate = Math.round(perLead(openedLeads));

  return {
    activeCampaigns: Number(campaignRows?.active ?? 0),
    scheduledCampaigns: Number(campaignRows?.scheduled ?? 0),
    emailsQueuedToday: Number(jobsToday?.queued ?? 0),
    emailsSentToday: Math.max(sentFromJobs, sentFromUsage),
    totalSent,
    leadsContacted,
    failedToday: Number(jobsToday?.failed ?? 0),
    bouncedToday: Number(jobsToday?.bounced ?? 0),
    bounceCount,
    bounceRate,
    totalLeads: Number(leadRows?.total ?? 0),
    replyCount,
    replyRate,
    openedLeads,
    openRate,
    senderTotal: Number(senderRows?.total ?? 0),
    senderActive: Number(senderRows?.active ?? 0),
  };
}

/**
 * Where getRecentActivity keeps a row for a workspace: account events (no
 * campaign, or a campaign since deleted) show everywhere; campaign events only
 * in the campaign's workspace (the default one also gets campaigns without one).
 */
export function activityWorkspaceCondition(workspaceId: string, isDefault = false) {
  return sql`(${activityLogs.campaignId} IS NULL OR ${campaigns.id} IS NULL OR ${wsCondition(campaigns.workspaceId, workspaceId, isDefault)})`;
}

export async function getRecentActivity(
  userId: string,
  limit = 20,
  opts?: { workspaceId: string; isDefault?: boolean },
) {
  const db = getDb();
  if (!opts?.workspaceId) {
    return db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }
  const rows = await db
    .select({ log: activityLogs })
    .from(activityLogs)
    .leftJoin(campaigns, eq(activityLogs.campaignId, campaigns.id))
    .where(and(eq(activityLogs.userId, userId), activityWorkspaceCondition(opts.workspaceId, opts.isDefault ?? false)))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
  return rows.map((r) => r.log);
}


/* ─── List pages ───────────────────────────────────────────────────────── */

export async function getActiveCampaigns(userId: string, workspaceId?: string, isDefault = false) {
  const db = getDb();
  const conds = [
    eq(campaigns.userId, userId),
    isNull(campaigns.deletedAt),
  ];
  const cWs = wsCondition(campaigns.workspaceId, workspaceId, isDefault);
  if (cWs) conds.push(cWs);

  return (
    await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        // "Why isn't this sending?" (lib/send-block.ts)
        sendBlockReason: campaigns.sendBlockReason,
        sendingWindowStart: campaigns.sendingWindowStart,
        sendingWindowEnd: campaigns.sendingWindowEnd,
        sendingTimezone: campaigns.sendingTimezone,
        businessDaysOnly: campaigns.businessDaysOnly,
        total: count(campaignLeads.id),
        // Leads emailed and leads who replied (lib/analytics.ts).
        sent: leadsEmailedSql(campaigns.id),
        replied: repliedLeadsSql(campaigns.id),
        // Autopilot: the whole audience, not the batch loaded so far.
        audience: runAudienceSql(campaigns.id),
      })
      .from(campaigns)
      .leftJoin(campaignLeads, eq(campaignLeads.campaignId, campaigns.id))
      .where(and(...conds))
      // campaigns.id is the primary key, so its other columns are allowed too.
      .groupBy(
        campaigns.id,
        campaigns.sendBlockReason,
        campaigns.sendingWindowStart,
        campaigns.sendingWindowEnd,
        campaigns.sendingTimezone,
        campaigns.businessDaysOnly,
      )
      .orderBy(desc(campaigns.createdAt))
      .limit(20)
  ).map(({ audience, ...r }) => {
    const t = campaignListTotal(audience, Number(r.total ?? 0));
    return {
      ...r,
      total: t.total,
      wholeAudience: t.wholeAudience,
      audienceCounting: t.counting,
      sent: Number(r.sent ?? 0),
      replied: Number(r.replied ?? 0),
    };
  });
}

export async function listLeadLists(
  userId: string,
  workspaceId?: string,
  isDefault = false,
  opts: { withSendability?: boolean } = {},
) {
  const db = getDb();
  const conds = [eq(leadLists.userId, userId), isNull(leadLists.deletedAt)];
  const lWs = wsCondition(leadLists.workspaceId, workspaceId, isDefault);
  if (lWs) conds.push(lWs);

  const rows = await db
    .select({
      id: leadLists.id,
      name: leadLists.name,
      createdAt: leadLists.createdAt,
      leadCount: count(leads.id),
      // Used by an Autopilot (pool) campaign: same rule as pool-campaign-guard.
      isAutopilot: sql<boolean>`exists (
        select 1 from ${campaigns}
        where ${campaigns.leadListId} = ${leadLists.id} and ${campaigns.deletedAt} is null
          and (
            exists (select 1 from ${schema.chadGtmRuns} where ${schema.chadGtmRuns.campaignId} = ${campaigns.id})
            or exists (
              select 1 from ${campaignSenders}
              inner join ${senderAccounts} on ${senderAccounts.id} = ${campaignSenders.senderId}
              where ${campaignSenders.campaignId} = ${campaigns.id} and ${senderAccounts.isSystemPool} = true
            )
          )
      )`,
    })
    .from(leadLists)
    .leftJoin(leads, and(eq(leads.listId, leadLists.id), isNull(leads.deletedAt)))
    .where(and(...conds))
    .groupBy(leadLists.id)
    .orderBy(desc(leadLists.createdAt));

  // How many leads a new campaign would email (#31); only the wizard asks.
  const sendability = opts.withSendability
    ? await listSendabilityCounts(db, userId, rows.map((r) => r.id))
    : null;
  return rows.map((r) => ({
    ...r,
    leadCount: Number(r.leadCount ?? 0),
    isAutopilot: Boolean(r.isAutopilot),
    sendableCount: sendability?.get(r.id)?.sendable ?? null,
    contactedCount: sendability?.get(r.id)?.contacted ?? null,
  }));
}

export interface LeadsPageParams {
  listId?: string;
  workspaceId?: string;
  isDefault?: boolean;
  /** Case-insensitive match on email, firstName, lastName, company (P03). */
  search?: string;
  status?: string;
  cursor?: string; // id of last row from previous page
  pageSize?: number;
}

/**
 * The strongest Blocklist entry that applies to a lead row's email (#32):
 * the owner's own rows (any source) or anyone's global opt-outs, matched by
 * address or "@domain". Global sources come first. NULL when none applies.
 */
export function leadBlockSourceSql() {
  const globals = sql.join(
    GLOBAL_SUPPRESSION_SOURCES.map((s) => sql`${s}`),
    sql`, `,
  );
  return sql<string | null>`(
    select ${suppressions.source} from ${suppressions}
    where (${suppressions.userId} = ${leads.userId} or ${suppressions.source} in (${globals}))
      and (lower(${suppressions.value}) = lower(${leads.email})
        or lower(${suppressions.value}) = '@' || split_part(lower(${leads.email}), '@', 2))
    order by case when ${suppressions.source} in (${globals}) then 0 else 1 end
    limit 1
  )`;
}

/**
 * Cursor-paginated leads for list detail / fetchLeadsPage.
 * Optional listId scopes to one list; optional search ILIKE-filters
 * email | firstName | lastName | company (P03 — already present).
 */
export async function listLeads(userId: string, params: LeadsPageParams) {
  const db = getDb();
  const size = Math.min(params.pageSize ?? 50, 200);
  const conds = [eq(leads.userId, userId), isNull(leads.deletedAt)];
  const lWs = wsCondition(leads.workspaceId, params.workspaceId, params.isDefault);
  if (lWs) conds.push(lWs);
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
    .select({ ...getTableColumns(leads), blockSource: leadBlockSourceSql() })
    .from(leads)
    .where(and(...conds))
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(size + 1);
  const hasMore = rows.length > size;
  const items = rows.slice(0, size);
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
}

export async function listSenders(userId: string, workspaceId?: string, isDefault = false) {
  const db = getDb();
  const t = today();
  const conds = [eq(senderAccounts.userId, userId), isNull(senderAccounts.deletedAt)];
  const sWs = wsCondition(senderAccounts.workspaceId, workspaceId, isDefault);
  if (sWs) conds.push(sWs);

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
      signature: senderAccounts.signature,
      fromName: senderAccounts.fromName,
      replyTo: senderAccounts.replyTo,
      timezone: senderAccounts.timezone,
      smtpHost: senderAccounts.smtpHost,
      smtpPort: senderAccounts.smtpPort,
      smtpUsername: senderAccounts.smtpUsername,
      smtpSecurity: senderAccounts.smtpSecurity,
      imapHost: senderAccounts.imapHost,
      imapPort: senderAccounts.imapPort,
      imapUsername: senderAccounts.imapUsername,
      createdAt: senderAccounts.createdAt,
      isSystemPool: senderAccounts.isSystemPool,
      usedToday: sql<number>`coalesce(${usage.count}, 0)`,
    })
    .from(senderAccounts)
    .leftJoin(usage, eq(usage.id, senderAccounts.id))
    .where(and(...conds))
    .orderBy(desc(senderAccounts.createdAt));
}

export async function listTemplates(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.emailTemplates)
    .where(
      and(
        eq(schema.emailTemplates.userId, userId),
        isNull(schema.emailTemplates.deletedAt),
        // Templates Autopilot made for its runs are not offered in the wizard (#105).
        ne(schema.emailTemplates.source, "autopilot"),
      ),
    )
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
    .select({
      id: leadLists.id,
      name: leadLists.name,
      createdAt: leadLists.createdAt,
      totalLeads: count(leads.id),
    })
    .from(leadLists)
    .leftJoin(leads, and(eq(leads.listId, leadLists.id), isNull(leads.deletedAt)))
    .where(and(eq(leadLists.id, id), eq(leadLists.userId, userId), isNull(leadLists.deletedAt)))
    .groupBy(leadLists.id)
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
  /** Leads in the campaign; for an Autopilot run, its whole matching audience (campaignListTotal). */
  total: number;
  /** Autopilot: `total` is the whole matching audience, not the contacts loaded so far. */
  wholeAudience?: boolean;
  /** Autopilot: the audience is still being counted (`total` is what is loaded so far). */
  audienceCounting?: boolean;
  /** Leads emailed (each lead once, non-dry-run sends), not emails. */
  sent: number;
  /** Leads who replied, not reply messages. */
  replied: number;
  failed: number;
  bounced: number;
  /** The Autopilot run that manages this campaign, or null for a manual campaign. */
  autopilotRunId: string | null;
}

/** An Autopilot run's stored audience for the campaign in `campaignIdCol` (null for manual campaigns). */
function runAudienceSql(campaignIdCol: unknown) {
  return sql<unknown>`(select r.audience from chad_gtm_runs r where r.campaign_id = ${campaignIdCol} order by r.created_at desc limit 1)`;
}

export async function listCampaigns(userId: string, workspaceId?: string, isDefault = false): Promise<CampaignRow[]> {
  const db = getDb();
  const conds = [eq(campaigns.userId, userId), isNull(campaigns.deletedAt)];
  const cWs = wsCondition(campaigns.workspaceId, workspaceId, isDefault);
  if (cWs) conds.push(cWs);

  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      scheduledAt: campaigns.scheduledAt,
      total: count(campaignLeads.id),
      sent: leadsEmailedSql(campaigns.id),
      replied: repliedLeadsSql(campaigns.id),
      failed: count(sql`case when ${campaignLeads.status} = 'failed' then 1 end`),
      // Bounces live on email_jobs (permanent SMTP); campaign_leads stay "failed".
      bounced: sql<number>`coalesce((
        select count(*)::int from email_jobs ej
        where ej.campaign_id = ${campaigns.id} and ej.status = 'bounced'
      ), 0)`,
      autopilotRunId: sql<string | null>`(select r.id from chad_gtm_runs r where r.campaign_id = ${campaigns.id} limit 1)`,
      audience: runAudienceSql(campaigns.id),
    })
    .from(campaigns)
    .leftJoin(campaignLeads, eq(campaignLeads.campaignId, campaigns.id))
    .where(and(...conds))
    .groupBy(campaigns.id)
    .orderBy(desc(campaigns.createdAt));
  return rows.map(({ audience, ...r }) => {
    const t = campaignListTotal(audience, Number(r.total ?? 0));
    return {
      ...r,
      total: t.total,
      wholeAudience: t.wholeAudience,
      audienceCounting: t.counting,
      sent: Number(r.sent ?? 0),
      replied: Number(r.replied ?? 0),
      failed: Number(r.failed ?? 0),
      bounced: Number(r.bounced ?? 0),
      autopilotRunId: r.autopilotRunId ?? null,
    };
  }) as CampaignRow[];
}

export async function getCampaign(userId: string, id: string, workspaceId?: string, isDefault = false) {
  const db = getDb();
  const conds = [eq(campaigns.id, id), eq(campaigns.userId, userId), isNull(campaigns.deletedAt)];
  const cWs = wsCondition(campaigns.workspaceId, workspaceId, isDefault);
  if (cWs) conds.push(cWs);

  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(...conds))
    .limit(1);
  if (!c) return null;
  // Parallel: reads are independent of one another.
  const [[stats], senders, [leadListRow], [runRow]] = await Promise.all([
    db
      .select({
        total: count(campaignLeads.id),
        pending: count(sql`case when ${campaignLeads.status} = 'pending' then 1 end`),
        // Leads emailed and leads who replied (lib/analytics.ts).
        sent: leadsEmailedSql(id),
        replied: repliedLeadsSql(id),
        failed: count(sql`case when ${campaignLeads.status} = 'failed' then 1 end`),
        bounced: sql<number>`coalesce((
          select count(*)::int from email_jobs ej
          where ej.campaign_id = ${id} and ej.status = 'bounced'
        ), 0)`,
        // When the campaign took its copy of the list (#40): publish, even
        // for a scheduled campaign that hasn't started yet.
        copiedAt: sql<string | null>`min(${campaignLeads.createdAt})`,
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
        dailyLimit: senderAccounts.dailyLimit,
        createdAt: senderAccounts.createdAt,
        isSystemPool: senderAccounts.isSystemPool,
      })
      .from(campaignSenders)
      .innerJoin(senderAccounts, eq(senderAccounts.id, campaignSenders.senderId))
      .where(eq(campaignSenders.campaignId, id)),
    c.leadListId
      ? db
          .select({
            name: leadLists.name,
            deletedAt: leadLists.deletedAt,
            // Leads added to the list after the campaign took its copy (#40):
            // the same rules and dedupe "Add N new leads" uses, so it adds N.
            newListLeads: missingListLeadsCountSql(
              missingListLeadsWhere({
                ownerId: c.userId,
                campaignId: id,
                leadListId: c.leadListId,
                since: contactCooldownSince(),
              }),
            ),
          })
          .from(leadLists)
          .where(and(eq(leadLists.id, c.leadListId), eq(leadLists.userId, userId)))
          .limit(1)
      : Promise.resolve([]),
    // The Autopilot run that manages this campaign, if any.
    db
      .select({ id: schema.chadGtmRuns.id })
      .from(schema.chadGtmRuns)
      .where(eq(schema.chadGtmRuns.campaignId, id))
      .limit(1),
  ]);
  return {
    ...c,
    leadListName: leadListRow?.name ?? null,
    leadListDeleted: Boolean(leadListRow?.deletedAt),
    newListLeads: leadListRow && !leadListRow.deletedAt ? Number(leadListRow.newListLeads ?? 0) : 0,
    // Start date, or for a scheduled campaign the date it took its copy.
    leadListCopiedAt: (c.startedAt ?? (stats?.copiedAt as string | null | undefined) ?? null) as string | null,
    autopilotRunId: (runRow?.id as string | undefined) ?? null,
    isAutopilot: Boolean(runRow),
    stats: stats
      ? {
          total: Number(stats.total ?? 0),
          pending: Number(stats.pending ?? 0),
          sent: Number(stats.sent ?? 0),
          replied: Number(stats.replied ?? 0),
          failed: Number(stats.failed ?? 0),
          bounced: Number(stats.bounced ?? 0),
        }
      : { total: 0, pending: 0, sent: 0, replied: 0, failed: 0, bounced: 0 },
    senders,
  };
}

/**
 * The workspace's compliance postal address ("" when none is saved, or the
 * workspace is not the user's). null = the user's default workspace.
 */
export async function getWorkspacePostalAddress(userId: string, workspaceId: string | null): Promise<string> {
  const profile = await loadWorkspaceProfile(getDb(), { userId, workspaceId });
  return profile.postalAddress;
}

/**
 * True when the workspace has a usable physical postal address (CAN-SPAM).
 * Campaigns that send are refused without one (see campaign-start-guard.ts).
 */
export async function hasWorkspacePostalAddress(userId: string, workspaceId: string | null): Promise<boolean> {
  return isUsablePostalAddress(await getWorkspacePostalAddress(userId, workspaceId));
}

const MAX_REPLY_SCAN = 1000;

/** Raw rows to read so one chatty conversation does not fill the thread page. */
function replyScanLimit(threadLimit: number): number {
  const n = Number.isFinite(threadLimit) && threadLimit > 0 ? Math.floor(threadLimit) : 1;
  return Math.min(MAX_REPLY_SCAN, Math.max(n, n * 20));
}

/**
 * One row per conversation for Prism.
 * `threadKey` is the RFC822 root when In-Reply-To / References are present on
 * the row; otherwise `uniboxConversationKey` (lead + campaign + normalized subject).
 * Those header columns are not on `replies`, so today's rows use the fallback.
 * `readAt` is not written. `limit` counts threads.
 * Legacy `listReplies(userId, limit)` still works.
 */
export async function listUniboxConversations(
  userId: string,
  limitOrOpts: number | { limit?: number; tag?: string | null } = 50,
) {
  const db = getDb();
  const opts = typeof limitOrOpts === "number" ? { limit: limitOrOpts } : limitOrOpts;
  const limit = opts.limit ?? 50;
  const conds = [eq(replies.userId, userId)];
  if (opts.tag != null) {
    conds.push(eq(replies.tag, opts.tag as never));
  }
  const rows = await db
    .select()
    .from(replies)
    .where(and(...conds))
    .orderBy(desc(replies.receivedAt))
    .limit(replyScanLimit(limit));
  return summarizeUniboxThreads(rows).slice(0, limit);
}

export async function listReplies(
  userId: string,
  limitOrOpts: number | { limit?: number; tag?: string | null } = 50,
) {
  return listUniboxConversations(userId, limitOrOpts);
}

/* ─── Suppressions / blocklist (F15a) ──────────────────────────────────── */

export interface SuppressionsPageParams {
  workspaceId?: string;
  isDefault?: boolean;
  cursor?: string;
  limit?: number;
  search?: string;
  kind?: "email" | "domain";
}

/**
 * Cursor-paginated suppressions for the session user.
 * Optional search ILIKE on value; optional kind filter.
 * The blocklist is account-wide (enforced across every workspace), so every
 * entry is listed whatever the active workspace; workspaceId/isDefault are
 * ignored and each row says which workspace it was added in.
 */
export async function listSuppressions(userId: string, params: SuppressionsPageParams) {
  const db = getDb();
  const size = Math.min(params.limit ?? 50, 200);
  const conds = [eq(suppressions.userId, userId)];
  if (params.kind) conds.push(eq(suppressions.kind, params.kind));
  if (params.search) {
    const q = `%${params.search}%`;
    conds.push(sql`${suppressions.value} ilike ${q}`);
  }
  if (params.cursor) {
    conds.push(
      sql`(${suppressions.createdAt}, ${suppressions.id}) < (select ${suppressions.createdAt}, ${suppressions.id} from ${suppressions} where ${suppressions.id} = ${params.cursor})`,
    );
  }
  const rows = await db
    .select({
      id: suppressions.id,
      value: suppressions.value,
      kind: suppressions.kind,
      reason: suppressions.reason,
      source: suppressions.source,
      createdAt: suppressions.createdAt,
      workspaceName: schema.workspaces.name,
    })
    .from(suppressions)
    .leftJoin(schema.workspaces, eq(schema.workspaces.id, suppressions.workspaceId))
    .where(and(...conds))
    .orderBy(desc(suppressions.createdAt), desc(suppressions.id))
    .limit(size + 1);
  const hasMore = rows.length > size;
  const items = rows.slice(0, size);
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}
