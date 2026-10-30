/**
 * Sender rotation — round-robin over a campaign's senders while respecting:
 *   - status     (skip paused / failed)
 *   - daily cap  (usage_counters; also the campaign's per-sender daily cap)
 *   - hourly cap (best-effort in-process bucket, reset each hour)
 *
 * `pickSenderIndex` is pure so it can be unit-tested without a database.
 */
import { schema } from "@smartreach/database";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { EngineDb, SenderRow } from "./db-port";

let cachedHourly = new Map<string, number>();
let cachedHourlyStamp = "";

function hourStamp(d: Date): string {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

/** Approximate hourly usage; authoritative daily numbers live in usage_counters. */
export function takeHourlySnapshot(): Map<string, number> {
  return cachedHourly;
}
export function noteHourlySend(senderId: string): void {
  const stamp = hourStamp(new Date());
  if (stamp !== cachedHourlyStamp) {
    cachedHourly = new Map();
    cachedHourlyStamp = stamp;
  }
  cachedHourly.set(senderId, (cachedHourly.get(senderId) ?? 0) + 1);
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function loadDailyUsage(
  db: EngineDb,
  senderIds: string[],
  date = todayKey(),
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (senderIds.length === 0) return map;
  const rows: { entityId: string; count: number }[] = await db
    .select({ entityId: schema.usageCounters.entityId, count: schema.usageCounters.count })
    .from(schema.usageCounters)
    .where(
      and(
        eq(schema.usageCounters.entityType, "sender"),
        eq(schema.usageCounters.date, date),
        inArray(schema.usageCounters.entityId, senderIds),
      ),
    );
  for (const r of rows) map.set(r.entityId, Number(r.count));
  return map;
}

/**
 * Absolute ceiling for any single mailbox, regardless of campaign settings.
 * Shared-pool deliverability depends on this being non-negotiable.
 */
export const HARD_MAX_PER_SENDER_PER_DAY = 30;

/**
 * Pick the next usable sender starting after `lastSenderIdx` (round-robin).
 * Returns the sender + its index, or null when every sender is exhausted.
 */
export function pickSenderIndex(
  senders: SenderRow[],
  daily: Map<string, number>,
  hourly: Map<string, number>,
  lastSenderIdx: number,
  perCampaignSenderDailyCap: number,
): { sender: SenderRow; index: number } | null {
  if (senders.length === 0) return null;
  for (let step = 1; step <= senders.length; step++) {
    const index = (lastSenderIdx + step) % senders.length;
    const s = senders[index]!;
    if (s.status !== "active") continue;
    const usedToday = daily.get(s.id) ?? 0;
    const cap = Math.min(
      s.dailyLimit,
      perCampaignSenderDailyCap,
      HARD_MAX_PER_SENDER_PER_DAY,
    );
    if (usedToday >= cap) continue;
    const usedHour = hourly.get(s.id) ?? 0;
    if (usedHour >= s.hourlyLimit) continue;
    return { sender: s, index };
  }
  return null;
}

/**
 * Atomic increment via the unique (entity_type, entity_id, date) index.
 * Read-then-write would let overlapping workers both observe 29 and send #31.
 */
export async function recordSend(
  db: EngineDb,
  opts: { userId: string; entityType: "sender" | "campaign"; entityId: string; date?: string },
): Promise<number> {
  const date = opts.date ?? todayKey();
  try {
    const rows: { count: number }[] = await db
      .insert(schema.usageCounters)
      .values({
        id: crypto.randomUUID(),
        userId: opts.userId,
        entityType: opts.entityType,
        entityId: opts.entityId,
        date,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [
          schema.usageCounters.entityType,
          schema.usageCounters.entityId,
          schema.usageCounters.date,
        ],
        set: { count: sql`${schema.usageCounters.count} + 1` },
      })
      .returning({ count: schema.usageCounters.count });
    return Number(rows[0]?.count ?? 1);
  } catch {
    // Fallback for drivers that do not support RETURNING on upsert.
    const existing: { id: string; count: number }[] = await db
      .select({ id: schema.usageCounters.id, count: schema.usageCounters.count })
      .from(schema.usageCounters)
      .where(
        and(
          eq(schema.usageCounters.entityType, opts.entityType),
          eq(schema.usageCounters.entityId, opts.entityId),
          eq(schema.usageCounters.date, date),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      const next = Number(existing[0]!.count) + 1;
      await db
        .update(schema.usageCounters)
        .set({ count: next })
        .where(eq(schema.usageCounters.id, existing[0]!.id));
      return next;
    }
    return 0;
  }
}

/**
 * Atomically reserve one send slot for a sender and its campaign.
 *
 * The unique (entity_type, entity_id, date) index plus a conditional upsert
 * makes this safe across overlapping workers: the update only increments while
 * the stored count is below the cap, and returns no row otherwise.
 */
export async function reserveSendSlot(
  db: EngineDb,
  opts: {
    userId: string;
    senderId: string;
    campaignId: string;
    senderCap: number;
    campaignCap: number;
    date?: string;
  },
): Promise<{ ok: true } | { ok: false; reason: "sender-cap" | "campaign-cap" }> {
  const date = opts.date ?? todayKey();

  const reserve = async (entityType: "sender" | "campaign", entityId: string, cap: number) => {
    const rows: { count: number }[] = await db
      .insert(schema.usageCounters)
      .values({
        id: crypto.randomUUID(),
        userId: opts.userId,
        entityType,
        entityId,
        date,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [
          schema.usageCounters.entityType,
          schema.usageCounters.entityId,
          schema.usageCounters.date,
        ],
        set: { count: sql`${schema.usageCounters.count} + 1` },
        setWhere: sql`${schema.usageCounters.count} < ${cap}`,
      })
      .returning({ count: schema.usageCounters.count });
    return rows.length > 0;
  };

  const senderOk = await reserve("sender", opts.senderId, opts.senderCap);
  if (!senderOk) return { ok: false, reason: "sender-cap" };

  let campaignOk = false;
  try {
    campaignOk = await reserve("campaign", opts.campaignId, opts.campaignCap);
  } catch (err) {
    await releaseSendSlot(db, {
      userId: opts.userId,
      senderId: opts.senderId,
      date,
    });
    throw err;
  }
  if (!campaignOk) {
    await releaseSendSlot(db, {
      userId: opts.userId,
      senderId: opts.senderId,
      campaignId: undefined,
      date,
    });
    return { ok: false, reason: "campaign-cap" };
  }

  return { ok: true };
}

/** Release a reservation after a failed send (never goes below zero). */
export async function releaseSendSlot(
  db: EngineDb,
  opts: {
    userId: string;
    senderId?: string;
    campaignId?: string;
    date?: string;
  },
): Promise<void> {
  const date = opts.date ?? todayKey();
  const decrement = async (entityType: "sender" | "campaign", entityId: string) => {
    await db
      .update(schema.usageCounters)
      .set({ count: sql`GREATEST(${schema.usageCounters.count} - 1, 0)` })
      .where(
        and(
          eq(schema.usageCounters.entityType, entityType),
          eq(schema.usageCounters.entityId, entityId),
          eq(schema.usageCounters.date, date),
        ),
      );
  };
  if (opts.senderId) await decrement("sender", opts.senderId);
  if (opts.campaignId) await decrement("campaign", opts.campaignId);
}

/** How many sends has this campaign done today? */
export async function campaignSentToday(
  db: EngineDb,
  campaignId: string,
  date = todayKey(),
): Promise<number> {
  const rows: { count: number }[] = await db
    .select({ count: schema.usageCounters.count })
    .from(schema.usageCounters)
    .where(
      and(
        eq(schema.usageCounters.entityType, "campaign"),
        eq(schema.usageCounters.entityId, campaignId),
        eq(schema.usageCounters.date, date),
      ),
    )
    .limit(1);
  return rows.length ? Number(rows[0]!.count) : 0;
}

/** Fetch all active shared system pool mailboxes. */
export async function getActiveSystemPoolSenders(db: EngineDb): Promise<SenderRow[]> {
  const rows = await db
    .select()
    .from(schema.senderAccounts)
    .where(
      and(
        eq(schema.senderAccounts.isSystemPool, true),
        eq(schema.senderAccounts.status, "active"),
        sql`${schema.senderAccounts.deletedAt} is null`,
      ),
    )
    .orderBy(sql`${schema.senderAccounts.createdAt} ASC`);
  return rows as SenderRow[];
}

export { sql };
