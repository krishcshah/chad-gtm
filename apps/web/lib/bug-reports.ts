import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { requireUser } from "./session";
import { isAdmin, requireAdmin } from "./admin";

export type BugReportStatus = "open" | "investigating" | "resolved" | "closed";

export interface BugReportDTO {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  workspaceId: string | null;
  heading: string;
  description: string;
  url: string | null;
  status: BugReportStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Normal user submits a new bug report.
 */
export async function submitBugReportForUser(
  userId: string,
  userEmail: string,
  userName: string | null,
  workspaceId: string | null,
  data: {
    heading: string;
    description: string;
    url?: string | null;
  }
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const heading = data.heading?.trim();
  const description = data.description?.trim();

  if (!heading || heading.length < 3) {
    return { ok: false, error: "Please enter a descriptive bug heading (at least 3 characters)." };
  }
  if (!description || description.length < 5) {
    return { ok: false, error: "Please provide a short description of what happened." };
  }

  const db = getDb();
  const reportId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db.insert(schema.bugReports).values({
    id: reportId,
    userId,
    userEmail,
    userName: userName || null,
    workspaceId: workspaceId || null,
    heading,
    description,
    url: data.url?.trim() || null,
    status: "open",
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  return { ok: true, id: reportId };
}

/**
 * Returns bug reports submitted by a specific user.
 */
export async function listUserBugReports(userId: string): Promise<BugReportDTO[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.bugReports)
    .where(eq(schema.bugReports.userId, userId))
    .orderBy(desc(schema.bugReports.createdAt))
    .limit(100);

  return rows as BugReportDTO[];
}

/**
 * Admin view: lists all bug reports received across all users.
 */
export async function listAllBugReportsForAdmin(currentUser: { email?: string | null }): Promise<BugReportDTO[]> {
  requireAdmin(currentUser);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.bugReports)
    .orderBy(desc(schema.bugReports.createdAt))
    .limit(500);

  return rows as BugReportDTO[];
}

/**
 * Admin action: update status of a bug report.
 */
export async function updateBugReportStatusForAdmin(
  currentUser: { email?: string | null },
  reportId: string,
  status: BugReportStatus
): Promise<{ ok: boolean; error?: string }> {
  requireAdmin(currentUser);
  const db = getDb();
  const nowIso = new Date().toISOString();

  await db
    .update(schema.bugReports)
    .set({
      status,
      updatedAt: nowIso,
    })
    .where(eq(schema.bugReports.id, reportId));

  return { ok: true };
}
