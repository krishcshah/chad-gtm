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
  "Your account is waiting for approval. We review every new account before it can send from our mailboxes. You'll get an email when you're approved.";

export function approvalRequired(): boolean {
  return (process.env.SIGNUP_APPROVAL_REQUIRED ?? "true").toLowerCase() !== "false";
}

export async function isApprovedToSend(userId: string): Promise<boolean> {
  if (!approvalRequired()) return true;
  const db = getDb();
  const [row] = await db
    .select({ role: schema.users.role, approvedAt: schema.users.approvedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!row) return false;
  return row.role === "admin" || row.approvedAt != null;
}

/** Throws APPROVAL_REQUIRED_ERROR unless the account may send. */
export async function assertCanSend(userId: string): Promise<void> {
  if (!(await isApprovedToSend(userId))) throw new Error(APPROVAL_REQUIRED_ERROR);
}
