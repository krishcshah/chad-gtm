/**
 * Server side of "what can our mailboxes send for you right now": loads the
 * pool mailboxes and every running campaign that sends from them, then applies
 * the pure estimate in pool-capacity.ts.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import type { Db } from "./db";
import { estimateCustomerPoolShare, type CustomerPoolShare } from "./pool-capacity";

export async function loadCustomerPoolShare(
  db: Db,
  userId: string,
  opts: { now?: Date; campaignId?: string | null } = {},
): Promise<CustomerPoolShare> {
  const mailboxes = await db
    .select({
      id: schema.senderAccounts.id,
      status: schema.senderAccounts.status,
      dailyLimit: schema.senderAccounts.dailyLimit,
      createdAt: schema.senderAccounts.createdAt,
      imapHost: schema.senderAccounts.imapHost,
      imapStatus: schema.senderAccounts.imapStatus,
    })
    .from(schema.senderAccounts)
    .where(and(eq(schema.senderAccounts.isSystemPool, true), isNull(schema.senderAccounts.deletedAt)));

  // Running campaigns that send from the pool. EXISTS, not a join: every
  // Autopilot campaign is attached to every pool mailbox.
  const campaigns = await db
    .select({
      id: schema.campaigns.id,
      userId: schema.campaigns.userId,
      dailyLimit: schema.campaigns.dailyLimit,
    })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.status, "running"),
        isNull(schema.campaigns.deletedAt),
        sql`exists (select 1 from ${schema.campaignSenders} cs join ${schema.senderAccounts} sa on sa.id = cs.sender_id where cs.campaign_id = ${schema.campaigns.id} and sa.is_system_pool = true)`,
      ),
    );

  return estimateCustomerPoolShare({
    mailboxes,
    campaigns,
    userId,
    campaignId: opts.campaignId ?? undefined,
    now: opts.now,
  });
}

/** Same, but a database error gives null (the page then shows the general wording). */
export async function loadCustomerPoolShareSafe(
  db: Db,
  userId: string,
  opts: { campaignId?: string | null } = {},
): Promise<CustomerPoolShare | null> {
  try {
    return await loadCustomerPoolShare(db, userId, opts);
  } catch (err) {
    console.error("[pool-share] could not estimate pool capacity:", err instanceof Error ? err.message : err);
    return null;
  }
}
