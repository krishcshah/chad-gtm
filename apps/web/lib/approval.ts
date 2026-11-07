import { eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";

/**
 * Sending from the shared mailbox pool requires an approved account.
 * New sign-ups can explore the app, research their site and draft campaigns,
 * but nothing is sent until an admin approves them (admin console).
 *
 * Set SIGNUP_APPROVAL_REQUIRED="false" to let every account send immediately.
 */
export const APPROVAL_REQUIRED_ERROR =
  "Your account is waiting for approval. We review every new account before it can send from our mailboxes.";

export function approvalRequired(): boolean {
  return (process.env.SIGNUP_APPROVAL_REQUIRED ?? "true").toLowerCase() !== "false";
}

/** Sending from the shared pool was switched off for this account by an admin. */
export const SENDING_REVOKED_ERROR =
  "Sending is paused by AutoGTM. Contact support to find out why and turn it back on.";

/**
 * approved: may send. pending: never approved yet. revoked: was approved, then
 * an admin revoked it. Pending and revoked both block sending; only the copy differs.
 */
export type SendAccess = "approved" | "pending" | "revoked";

export async function getSendAccess(userId: string): Promise<SendAccess> {
  if (!approvalRequired()) return "approved";
  const db = getDb();
  const [row] = await db
    .select({
      role: schema.users.role,
      approvedAt: schema.users.approvedAt,
      approvalRevokedAt: schema.users.approvalRevokedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!row) return "pending";
  if (row.role === "admin" || row.approvedAt != null) return "approved";
  return row.approvalRevokedAt != null ? "revoked" : "pending";
}

export async function isApprovedToSend(userId: string): Promise<boolean> {
  return (await getSendAccess(userId)) === "approved";
}

/** Throws SENDING_REVOKED_ERROR or APPROVAL_REQUIRED_ERROR unless the account may send. */
export async function assertCanSend(userId: string): Promise<void> {
  const access = await getSendAccess(userId);
  if (access === "revoked") throw new Error(SENDING_REVOKED_ERROR);
  if (access === "pending") throw new Error(APPROVAL_REQUIRED_ERROR);
}

/** True for either "may not send" error thrown by assertCanSend. */
export function isSendAccessError(message: string): boolean {
  return message === APPROVAL_REQUIRED_ERROR || message === SENDING_REVOKED_ERROR;
}
