/**
 * Fair sharing of system-pool mailboxes.
 *
 * Every autopilot campaign is attached to the same pool mailboxes, and each
 * mailbox has a hard daily ceiling (30, lower while ramping). Without
 * allocation, whichever campaign the scheduler visits first takes the whole
 * pool and later clients sit at zero sends. Each tick we split every pool
 * mailbox's daily capacity across the campaigns that can use it, one slot at
 * a time, round-robin over USERS first (so one client with five campaigns
 * cannot outweigh a client with one) and then over that user's campaigns.
 *
 * `allocatePoolCapacity` is pure and unit-tested; `buildPoolPlans` loads the
 * inputs from the database.
 */
import { schema } from "@smartreach/database";
import { and, inArray, lt, gte, sql } from "drizzle-orm";
import type { CampaignRow, EngineDb, SenderRow } from "./db-port";
import { HARD_MAX_PER_SENDER_PER_DAY, senderDailyCap } from "./rotation";
import { dueQueuedLeadFilter } from "./sequence";

export interface PoolSenderCapacity {
  id: string;
  /** Total sends this mailbox may make today (ramped cap). */
  capacity: number;
}

export interface PoolCampaignDemand {
  id: string;
  userId: string;
  /** Pool mailboxes this campaign may send from. */
  senderIds: string[];
  /** Sends this campaign could use today, including ones already made. */
  demand: number;
  /** Tie-breaker: campaigns that sent less today go first. */
  sentToday?: number;
}

/** campaignId → senderId → slots for today (includes slots already used). */
export type PoolAllocation = Map<string, Map<string, number>>;

export function allocatePoolCapacity(
  senders: PoolSenderCapacity[],
  campaigns: PoolCampaignDemand[],
): PoolAllocation {
  const alloc: PoolAllocation = new Map(campaigns.map((c) => [c.id, new Map<string, number>()]));
  const remaining = new Map(campaigns.map((c) => [c.id, Math.max(0, Math.floor(c.demand))]));
  const byUser = new Map<string, number>();
  const byCampaign = new Map<string, number>();
  const order = new Map(campaigns.map((c, i) => [c.id, i]));

  // Hand out ONE slot per mailbox per pass, cycling over the mailboxes, so a
  // campaign's share is spread across every mailbox it can use. (Filling the
  // first mailbox before moving on gave small campaigns 0 slots on later
  // mailboxes, and follow-ups sticky to those mailboxes waited forever.)
  const capacity = new Map(senders.map((s) => [s.id, Math.max(0, Math.floor(s.capacity))]));
  const eligibleBySender = new Map(senders.map((s) => [s.id, campaigns.filter((c) => c.senderIds.includes(s.id))]));
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const sender of senders) {
      if ((capacity.get(sender.id) ?? 0) <= 0) continue;
      const open = (eligibleBySender.get(sender.id) ?? []).filter((c) => (remaining.get(c.id) ?? 0) > 0);
      if (open.length === 0) continue;
      // 1) the user with the fewest slots so far
      const users = [...new Set(open.map((c) => c.userId))];
      users.sort((a, b) => (byUser.get(a) ?? 0) - (byUser.get(b) ?? 0) || a.localeCompare(b));
      const userId = users[0]!;
      // 2) that user's campaign with the fewest slots so far
      const mine = open.filter((c) => c.userId === userId);
      mine.sort(
        (a, b) =>
          (byCampaign.get(a.id) ?? 0) - (byCampaign.get(b.id) ?? 0) ||
          (a.sentToday ?? 0) - (b.sentToday ?? 0) ||
          (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );
      const c = mine[0]!;
      const m = alloc.get(c.id)!;
      m.set(sender.id, (m.get(sender.id) ?? 0) + 1);
      byUser.set(userId, (byUser.get(userId) ?? 0) + 1);
      byCampaign.set(c.id, (byCampaign.get(c.id) ?? 0) + 1);
      remaining.set(c.id, (remaining.get(c.id) ?? 0) - 1);
      capacity.set(sender.id, (capacity.get(sender.id) ?? 0) - 1);
      progressed = true;
    }
  }
  return alloc;
}

/** A campaign's fair share of the pool for today, and what it has used. */
export interface CampaignPoolPlan {
  quota: Map<string, number>;
  used: Map<string, number>;
}

export function isPoolSender(s: SenderRow): boolean {
  return Boolean((s as SenderRow & { isSystemPool?: boolean }).isSystemPool);
}

/** May this campaign enqueue one more job on `s` under its fair share? */
export function withinPoolShare(plan: CampaignPoolPlan | undefined, s: SenderRow): boolean {
  if (!plan || !isPoolSender(s)) return true;
  return (plan.used.get(s.id) ?? 0) < (plan.quota.get(s.id) ?? 0);
}

function utcDayBounds(now: Date): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Build fair-share plans for every campaign that sends from pool mailboxes.
 * Usage counts today's jobs per (campaign, mailbox) that are queued, in
 * flight or sent, so the share holds across ticks.
 */
export async function buildPoolPlans(
  db: EngineDb,
  campaigns: CampaignRow[],
  sendersByCampaign: Map<string, SenderRow[]>,
  now: Date = new Date(),
): Promise<Map<string, CampaignPoolPlan>> {
  const plans = new Map<string, CampaignPoolPlan>();
  const poolSenders = new Map<string, SenderRow>();
  const poolCampaigns = campaigns.filter((c) => {
    const pool = (sendersByCampaign.get(c.id) ?? []).filter((s) => isPoolSender(s) && s.status === "active");
    for (const s of pool) poolSenders.set(s.id, s);
    return pool.length > 0;
  });
  if (poolCampaigns.length === 0) return plans;

  const campaignIds = poolCampaigns.map((c) => c.id);
  const senderIds = [...poolSenders.keys()];
  const { start, end } = utcDayBounds(now);

  const usageRows: { campaignId: string; senderId: string; n: number }[] = await db
    .select({
      campaignId: schema.emailJobs.campaignId,
      senderId: schema.emailJobs.senderId,
      n: sql<number>`count(*)`,
    })
    .from(schema.emailJobs)
    .where(
      and(
        inArray(schema.emailJobs.campaignId, campaignIds),
        inArray(schema.emailJobs.senderId, senderIds),
        inArray(schema.emailJobs.status, ["pending", "processing", "retry", "sent", "bounced"]),
        gte(sql`coalesce(${schema.emailJobs.sentAt}, ${schema.emailJobs.scheduledFor})`, start),
        lt(sql`coalesce(${schema.emailJobs.sentAt}, ${schema.emailJobs.scheduledFor})`, end),
      ),
    )
    .groupBy(schema.emailJobs.campaignId, schema.emailJobs.senderId);

  const dueRows: { campaignId: string; n: number }[] = await db
    .select({ campaignId: schema.campaignLeads.campaignId, n: sql<number>`count(*)` })
    .from(schema.campaignLeads)
    .where(and(inArray(schema.campaignLeads.campaignId, campaignIds), dueQueuedLeadFilter(now.toISOString())))
    .groupBy(schema.campaignLeads.campaignId);

  const used = new Map<string, Map<string, number>>(campaignIds.map((id) => [id, new Map()]));
  const usedTotal = new Map<string, number>();
  for (const r of usageRows) {
    used.get(r.campaignId)?.set(r.senderId, Number(r.n));
    usedTotal.set(r.campaignId, (usedTotal.get(r.campaignId) ?? 0) + Number(r.n));
  }
  const due = new Map(dueRows.map((r) => [r.campaignId, Number(r.n)]));

  const allocation = allocatePoolCapacity(
    senderIds.map((id) => ({
      id,
      capacity: senderDailyCap(poolSenders.get(id)! as SenderRow & { createdAt?: string }, HARD_MAX_PER_SENDER_PER_DAY, now),
    })),
    poolCampaigns.map((c) => {
      const usedToday = usedTotal.get(c.id) ?? 0;
      return {
        id: c.id,
        userId: c.userId,
        senderIds: (sendersByCampaign.get(c.id) ?? []).filter(isPoolSender).map((s) => s.id),
        demand: Math.min(Math.max(0, c.dailyLimit), usedToday + (due.get(c.id) ?? 0)),
        sentToday: usedToday,
      };
    }),
  );

  for (const c of poolCampaigns) {
    plans.set(c.id, { quota: allocation.get(c.id) ?? new Map(), used: used.get(c.id) ?? new Map() });
  }
  return plans;
}
