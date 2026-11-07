/**
 * Server side of "how many emails a day can this campaign really send":
 * counts the accounts sharing the pool mailboxes, then applies the shared
 * rule (effectiveDailyCapacity in @smartreach/shared), so the numbers match
 * what the engine enforces.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { effectiveDailyCapacity, type CapacityMailbox, type DailyCapacity } from "@smartreach/shared";
import type { Db } from "./db";

/** Accounts with a running campaign that sends from the shared pool. */
export async function loadPoolUserCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${schema.campaigns.userId})` })
    .from(schema.campaigns)
    .innerJoin(schema.campaignSenders, eq(schema.campaignSenders.campaignId, schema.campaigns.id))
    .innerJoin(schema.senderAccounts, eq(schema.senderAccounts.id, schema.campaignSenders.senderId))
    .where(
      and(
        inArray(schema.campaigns.status, ["running"]),
        isNull(schema.campaigns.deletedAt),
        eq(schema.senderAccounts.isSystemPool, true),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Effective capacity for one campaign. When it uses pool mailboxes, the pool
 * is split between the accounts sending from it (at least this one).
 */
export async function loadCampaignCapacity(
  db: Db,
  campaign: { dailyLimit: number; maxEmailsPerSenderPerDay: number },
  senders: readonly CapacityMailbox[],
  now: Date = new Date(),
): Promise<DailyCapacity> {
  const usesPool = senders.some((s) => s.isSystemPool && s.status === "active");
  let poolUsers = 1;
  if (usesPool) {
    try {
      const n = await loadPoolUserCount(db);
      poolUsers = Math.max(1, n);
    } catch (err) {
      console.error("[sending-capacity] pool user count failed:", err instanceof Error ? err.message : err);
    }
  }
  return effectiveDailyCapacity({
    campaignDailyLimit: campaign.dailyLimit,
    perMailboxLimit: campaign.maxEmailsPerSenderPerDay,
    mailboxes: senders,
    poolUsers,
    now,
  });
}
