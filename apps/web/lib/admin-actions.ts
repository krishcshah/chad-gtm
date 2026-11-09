"use server";

import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema } from "@smartreach/database";
import { requireUser } from "./session";
import { getDb } from "./db";
import { isAdmin } from "./admin";
import { getUserDetailedActivity } from "./admin-analytics";
import {
  isValidUserId,
  latestApprovalLaunchByUser,
  latestWebsiteByUser,
  toApprovalRows,
  type AccountApprovalsPayload,
} from "./account-approvals";
import { after } from "next/server";
import { approvalLaunchView, approvalOutcomeText, type ApprovalLaunchNote, type ApprovalLaunchView } from "./approval-copy";

export async function fetchUserDetailAction(targetUserId: string) {
  const user = await requireUser();
  return await getUserDetailedActivity(user, targetUserId);
}

/**
 * Next.js redirect()/notFound() work by throwing. A try/catch that turns every
 * error into { ok: false, error } would swallow them and show "NEXT_REDIRECT"
 * instead of sending an expired session to /login, so rethrow those.
 */
function rethrowIfNavigation(err: unknown): void {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND")) {
    throw err;
  }
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
    approvalRevokedAt: schema.users.approvalRevokedAt,
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

  // How each recent approval's launch went (calibration_profile.approvalLaunch on the run).
  const approvedIds = approvedUsers.map((u) => u.id);
  const cp = schema.chadGtmRuns.calibrationProfile;
  const launchRows = approvedIds.length
    ? await db
        .select({
          id: schema.chadGtmRuns.id,
          userId: schema.chadGtmRuns.userId,
          campaignId: schema.chadGtmRuns.campaignId,
          record: sql<unknown>`${cp}->'approvalLaunch'`,
        })
        .from(schema.chadGtmRuns)
        .where(and(inArray(schema.chadGtmRuns.userId, approvedIds), sql`(${cp}->'approvalLaunch') is not null`))
        .catch((err) => {
          console.error("[listAccountApprovalsAction] launch status lookup failed:", err instanceof Error ? err.message : err);
          return [] as Array<{ id: string; userId: string; campaignId: string | null; record: unknown }>;
        })
    : [];
  const launches = latestApprovalLaunchByUser(launchRows);

  const { isSystemMailerConfigured } = await import("@smartreach/email-engine/system-mailer");
  return {
    pending: toApprovalRows(pendingUsers, websites),
    recentlyApproved: toApprovalRows(approvedUsers, websites, launches),
    emailOnApprove: isSystemMailerConfigured(),
  };
}

export type ApprovalActionResult =
  | {
      ok: true;
      /** An email to the user is queued (it goes out after the launch is tried). */
      emailQueued: boolean;
      warning?: string;
      /** What approving does (approve only): "launching" runs in the background. */
      launch?: ApprovalLaunchNote["kind"];
      /** Admin-facing result, e.g. "Approved. Launching their campaign now." */
      outcome?: string;
      /** The approvals-list badge for this account right after approving. */
      launchView?: ApprovalLaunchView | null;
    }
  | { ok: false; error: string };

/**
 * Run `task` after the response is sent (next/server after()), so the admin's
 * request never waits on a launch. Outside a request (scripts, tests) it runs
 * as a fire-and-forget promise; the web process is long-running. Never throws.
 */
function runAfterResponse(label: string, task: () => Promise<void>): void {
  const safe = async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[${label}] background task failed:`, err instanceof Error ? err.message : err);
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}

/**
 * Approve an account to send from the shared pool. Returns at once: the one
 * run that was only waiting on approval launches in the background, then the
 * user is emailed what happened; the approvals list shows how it went.
 * Temporary launch failures retry on their own (lib/autopilot-advance.ts).
 */
export async function approveUserAction(targetUserId: string): Promise<ApprovalActionResult> {
  try {
    await requireAdminUser();
    if (!isValidUserId(targetUserId)) return { ok: false, error: "Invalid user id." };
    const db = getDb();
    // Read before the update clears it: a revoked account is being re-approved.
    const [before] = await db
      .select({ revokedAt: schema.users.approvalRevokedAt })
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .limit(1);
    const reapproved = before?.revokedAt != null;
    const [row] = await db
      .update(schema.users)
      .set({ approvedAt: new Date(), approvalRevokedAt: null, updatedAt: new Date() })
      .where(and(eq(schema.users.id, targetUserId), isNull(schema.users.approvedAt)))
      .returning({ email: schema.users.email, name: schema.users.name });
    revalidatePath("/admin");
    if (!row) return { ok: true, emailQueued: false, warning: "Account was already approved (or no longer exists)." };

    const advance = await import("./autopilot-advance");
    // Quick: picks the run and records the queued launch. Never fails the approval.
    const plan = await advance.beginApprovalLaunch(targetUserId, { reapproved }).catch((err) => {
      console.error("[approveUserAction] could not plan the launch:", err instanceof Error ? err.message : err);
      return null;
    });
    runAfterResponse("approveUserAction", () => advance.finishApprovalLaunch(targetUserId, plan));

    const note: ApprovalLaunchNote = plan?.note ?? { kind: "failed" };
    const outcome = approvalOutcomeText(note, reapproved, Boolean(plan?.latestRunId));
    const runId = "runId" in note ? note.runId : undefined;
    const launchView =
      plan && runId
        ? approvalLaunchView(
            {
              state: note.kind === "launching" ? "launching" : "done",
              note,
              approvedAt: new Date().toISOString(),
              attempts: 0,
              nextAttemptAt: null,
              emailPending: false,
              reapproved,
              notStarted: plan.notStarted,
              updatedAt: new Date().toISOString(),
            },
            { id: runId, campaignId: null },
          )
        : null;
    const { isSystemMailerConfigured } = await import("@smartreach/email-engine/system-mailer");
    const mailer = isSystemMailerConfigured();
    return {
      ok: true,
      emailQueued: mailer,
      launch: note.kind,
      outcome,
      launchView,
      ...(mailer ? {} : { warning: `${outcome} No system mailer configured, so no email will be sent.` }),
    };
  } catch (err) {
    rethrowIfNavigation(err);
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
      .set({ approvedAt: null, approvalRevokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.users.id, targetUserId), ne(schema.users.role, "admin")))
      .returning({ id: schema.users.id });
    revalidatePath("/admin");
    if (rows.length === 0) return { ok: false, error: "Account not found, or it is an admin." };
    return { ok: true, emailQueued: false };
  } catch (err) {
    rethrowIfNavigation(err);
    return { ok: false, error: err instanceof Error ? err.message : "Could not revoke approval." };
  }
}
