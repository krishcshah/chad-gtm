/**
 * The shared mailbox pool is owned (sender_accounts.user_id) by the admin who
 * imported it and belongs to no workspace. Deleting that admin's account, or a
 * workspace that still holds pool rows, would cascade to every pool mailbox and
 * every customer's sent history and replies, so both are refused.
 *
 * Server-only helpers; not a "use server" module.
 */
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export { POOL_OWNER_DELETE_BLOCKED, WORKSPACE_HOLDS_POOL_ERROR } from "./pool-ownership-messages";

/**
 * Pool mailboxes this user owns, soft-deleted ones included: a retired mailbox
 * still owns its sent history and replies.
 */
export async function countPoolMailboxesOwnedBy(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.senderAccounts)
    .where(and(eq(schema.senderAccounts.userId, userId), eq(schema.senderAccounts.isSystemPool, true)));
  return Number(row?.n ?? 0);
}

/** Whether any pool mailbox (soft-deleted included) is filed under this workspace. */
export async function workspaceHoldsPoolMailboxes(db: Db, workspaceId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.senderAccounts.id })
    .from(schema.senderAccounts)
    .where(and(eq(schema.senderAccounts.workspaceId, workspaceId), eq(schema.senderAccounts.isSystemPool, true)))
    .limit(1);
  return rows.length > 0;
}
