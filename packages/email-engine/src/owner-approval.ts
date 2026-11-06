/**
 * Engine-side account approval.
 *
 * The web app refuses to start campaigns for accounts that are not approved,
 * but an admin can revoke approval while campaigns are running. The engine
 * re-checks on every tick so revoking approval stops sends: campaigns whose
 * owner is not approved are skipped by the scheduler (note
 * "owner-not-approved"), and already-queued jobs are handed back.
 *
 * Same rule as apps/web/lib/approval.ts: approved = role 'admin' OR
 * approved_at set; SIGNUP_APPROVAL_REQUIRED="false" turns the check off.
 */
import { schema } from "@smartreach/database";
import { inArray } from "drizzle-orm";
import type { EngineDb } from "./db-port";

export const OWNER_NOT_APPROVED_NOTE = "owner-not-approved";

export function ownerApprovalRequired(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SIGNUP_APPROVAL_REQUIRED ?? "true").trim().toLowerCase() !== "false";
}

export function isOwnerApproved(row: { role?: string | null; approvedAt?: unknown } | undefined | null): boolean {
  if (!row) return false;
  return row.role === "admin" || row.approvedAt != null;
}

/**
 * Owners (of `userIds`) that may NOT send right now. Unknown users count as
 * not approved. Empty when approval is turned off.
 */
export async function loadUnapprovedOwners(
  db: EngineDb,
  userIds: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ownerApprovalRequired(env) || ids.length === 0) return new Set();
  const rows: Array<{ id: string; role: string | null; approvedAt: unknown }> = await db
    .select({ id: schema.users.id, role: schema.users.role, approvedAt: schema.users.approvedAt })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));
  const approved = new Set(rows.filter(isOwnerApproved).map((r) => r.id));
  return new Set(ids.filter((id) => !approved.has(id)));
}
