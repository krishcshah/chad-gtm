"use server";

import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema } from "@smartreach/database";
import { requireUser } from "./session";
import { getDb } from "./db";
import { isAdmin } from "./admin";
import { getUserDetailedActivity } from "./admin-analytics";
import {
  isValidUserId,
  latestWebsiteByUser,
  toApprovalRows,
  type AccountApprovalsPayload,
} from "./account-approvals";
import { buildApprovalEmail } from "./system-emails";

export async function fetchUserDetailAction(targetUserId: string) {
  const user = await requireUser();
  return await getUserDetailedActivity(user, targetUserId);
}

/** Server-side admin gate for every action below. */
async function requireAdminUser() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Unauthorized: Admin privileges required.");
  return user;
}

const PENDING_LIMIT = 200;
const RECENT_APPROVED_LIMIT = 25;

/** Accounts waiting for approval (newest first) plus recently approved ones. */
export async function listAccountApprovalsAction(): Promise<AccountApprovalsPayload> {
  await requireAdminUser();
  const db = getDb();
  const columns = {
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    emailVerified: schema.users.emailVerified,
    createdAt: schema.users.createdAt,
    approvedAt: schema.users.approvedAt,
  };

  const [pendingUsers, approvedUsers] = await Promise.all([
    db
      .select(columns)
      .from(schema.users)
      .where(and(isNull(schema.users.approvedAt), ne(schema.users.role, "admin")))
      .orderBy(desc(schema.users.createdAt))
      .limit(PENDING_LIMIT),
    db
      .select(columns)
      .from(schema.users)
      .where(and(isNotNull(schema.users.approvedAt), ne(schema.users.role, "admin")))
      .orderBy(desc(schema.users.approvedAt))
      .limit(RECENT_APPROVED_LIMIT),
  ]);

  const ids = [...pendingUsers, ...approvedUsers].map((u) => u.id);
  const runs = ids.length
    ? await db
        .select({
          userId: schema.chadGtmRuns.userId,
          url: schema.chadGtmRuns.url,
          createdAt: schema.chadGtmRuns.createdAt,
        })
        .from(schema.chadGtmRuns)
        .where(inArray(schema.chadGtmRuns.userId, ids))
    : [];
  const websites = latestWebsiteByUser(runs);

  const { isSystemMailerConfigured } = await import("@smartreach/email-engine/system-mailer");
  return {
    pending: toApprovalRows(pendingUsers, websites),
    recentlyApproved: toApprovalRows(approvedUsers, websites),
    emailOnApprove: isSystemMailerConfigured(),
  };
}

export type ApprovalActionResult =
  | { ok: true; emailed: boolean; warning?: string }
  | { ok: false; error: string };

/** Approve an account to send from the shared pool; emails the user when possible. */
export async function approveUserAction(targetUserId: string): Promise<ApprovalActionResult> {
  try {
    await requireAdminUser();
    if (!isValidUserId(targetUserId)) return { ok: false, error: "Invalid user id." };
    const db = getDb();
    const [row] = await db
      .update(schema.users)
      .set({ approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.users.id, targetUserId), isNull(schema.users.approvedAt)))
      .returning({ email: schema.users.email, name: schema.users.name });
    revalidatePath("/admin");
    if (!row) return { ok: true, emailed: false, warning: "Account was already approved (or no longer exists)." };

    const { isSystemMailerConfigured, sendSystemEmail } = await import("@smartreach/email-engine/system-mailer");
    if (!isSystemMailerConfigured()) {
      return { ok: true, emailed: false, warning: "Approved. No system mailer configured, so no email was sent." };
    }
    try {
      const email = buildApprovalEmail({ name: row.name, appUrl: process.env.APP_URL });
      await sendSystemEmail({ to: row.email, ...email });
      return { ok: true, emailed: true };
    } catch (err) {
      console.error("[approveUserAction] approval email failed:", err instanceof Error ? err.message : err);
      return { ok: true, emailed: false, warning: "Approved, but the approval email could not be sent." };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not approve account." };
  }
}

/** Revoke approval: the account keeps its data but can no longer send. Admins can't be revoked. */
export async function revokeUserApprovalAction(targetUserId: string): Promise<ApprovalActionResult> {
  try {
    const admin = await requireAdminUser();
    if (!isValidUserId(targetUserId)) return { ok: false, error: "Invalid user id." };
    if (targetUserId === admin.id) return { ok: false, error: "You can't revoke your own account." };
    const db = getDb();
    const rows = await db
      .update(schema.users)
      .set({ approvedAt: null, updatedAt: new Date() })
      .where(and(eq(schema.users.id, targetUserId), ne(schema.users.role, "admin")))
      .returning({ id: schema.users.id });
    revalidatePath("/admin");
    if (rows.length === 0) return { ok: false, error: "Account not found, or it is an admin." };
    return { ok: true, emailed: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not revoke approval." };
  }
}
