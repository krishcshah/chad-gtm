"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema, encryptSecret } from "@smartreach/database";
import { senderCsvRowSchema } from "@smartreach/validation";
import { normalizeEmail } from "@smartreach/shared";
import { getDb, ensureChadGtmTables } from "./db";
import { requireUser } from "./session";
import { isAdmin } from "./admin";
import {
  importDirectoryLeadsFromCsv,
  getDirectoryStats,
  type IngestionResult,
} from "./leads-directory";

export interface SystemMailboxPoolStats {
  totalMailboxes: number;
  activeMailboxes: number;
  pausedMailboxes: number;
  emailsSentToday: number;
  totalDailyDemand: number;
  averageEmailsPerMailbox: number;
  utilizationStatus: "green" | "yellow" | "red"; // <30 green, 30-49 yellow, >=50 red
  targetPacePerMailbox: number;
  recommendedTotalMailboxes: number;
  recommendToAdd: number;
  mailboxes: Array<{
    id: string;
    senderName: string;
    email: string;
    dailyLimit: number;
    hourlyLimit: number;
    health: number;
    status: string;
    smtpStatus: string;
    imapStatus: string;
    todaySent: number;
    lastSyncAt: string | null;
    createdAt: string;
  }>;
}

export async function getSystemMailboxPoolStats(): Promise<SystemMailboxPoolStats> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }

  const db = getDb();
  await ensureChadGtmTables(db);

  // 1. Fetch all mailboxes where isSystemPool = true
  const poolSenders = await db
    .select()
    .from(schema.senderAccounts)
    .where(
      and(
        eq(schema.senderAccounts.isSystemPool, true),
        isNull(schema.senderAccounts.deletedAt)
      )
    )
    .orderBy(asc(schema.senderAccounts.createdAt));

  const totalMailboxes = poolSenders.length;
  const activeSenders = poolSenders.filter((s) => s.status === "active");
  const activeMailboxes = activeSenders.length;
  const pausedMailboxes = poolSenders.filter((s) => s.status === "paused").length;

  // 2. Fetch today's sent count from usageCounters
  const today = new Date().toISOString().slice(0, 10);
  const senderIds = poolSenders.map((s) => s.id);

  let todaySentMap = new Map<string, number>();
  if (senderIds.length > 0) {
    const usageRows = await db
      .select({
        entityId: schema.usageCounters.entityId,
        count: schema.usageCounters.count,
      })
      .from(schema.usageCounters)
      .where(
        and(
          eq(schema.usageCounters.entityType, "sender"),
          eq(schema.usageCounters.date, today)
        )
      );
    for (const r of usageRows) {
      todaySentMap.set(r.entityId, Number(r.count));
    }
  }

  let emailsSentToday = 0;
  for (const s of poolSenders) {
    emailsSentToday += todaySentMap.get(s.id) || 0;
  }

  // 3. Calculate demand across all active ChadGTM runs
  const activeChadRuns = await db
    .select({ dailyLimit: schema.chadGtmRuns.dailyEmailLimit })
    .from(schema.chadGtmRuns)
    .where(eq(schema.chadGtmRuns.status, "active"));

  let totalDailyDemand = 0;
  for (const run of activeChadRuns) {
    totalDailyDemand += run.dailyLimit || 30;
  }

  // 4. Capacity Formula:
  // Target Pace: 30 emails/day per mailbox
  // Green: < 30 emails/day/mailbox
  // Yellow: 30–49 emails/day/mailbox
  // Red: >= 50 emails/day/mailbox
  const targetPacePerMailbox = 30;
  const averageEmailsPerMailbox =
    activeMailboxes > 0 ? Math.round(emailsSentToday / activeMailboxes) : 0;

  let utilizationStatus: "green" | "yellow" | "red" = "green";
  if (averageEmailsPerMailbox >= 50) {
    utilizationStatus = "red";
  } else if (averageEmailsPerMailbox >= 30) {
    utilizationStatus = "yellow";
  } else {
    utilizationStatus = "green";
  }

  // Recommendation math:
  // recommendedTotal = Math.max(30, Math.ceil(totalDailyEmailDemand / 30))
  // recommendToAdd = Math.max(0, recommendedTotal - currentActiveSystemMailboxes)
  const recommendedTotalMailboxes = Math.max(
    30,
    Math.ceil(totalDailyDemand / targetPacePerMailbox)
  );
  const recommendToAdd = Math.max(0, recommendedTotalMailboxes - activeMailboxes);

  const mailboxes = poolSenders.map((s) => ({
    id: s.id,
    senderName: s.senderName,
    email: s.email,
    dailyLimit: s.dailyLimit,
    hourlyLimit: s.hourlyLimit,
    health: s.health,
    status: s.status,
    smtpStatus: s.smtpStatus,
    imapStatus: s.imapStatus,
    todaySent: todaySentMap.get(s.id) || 0,
    lastSyncAt: s.lastSyncAt,
    createdAt: s.createdAt,
  }));

  return {
    totalMailboxes,
    activeMailboxes,
    pausedMailboxes,
    emailsSentToday,
    totalDailyDemand,
    averageEmailsPerMailbox,
    utilizationStatus,
    targetPacePerMailbox,
    recommendedTotalMailboxes,
    recommendToAdd,
    mailboxes,
  };
}

export async function importSystemMailboxesCsv(
  rows: unknown[]
): Promise<{ ok: boolean; imported: number; failed: { row: number; error: string }[] }> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }

  const db = getDb();
  await ensureChadGtmTables(db);

  const failed: { row: number; error: string }[] = [];
  let imported = 0;

  const existing = await db
    .select({ email: schema.senderAccounts.email })
    .from(schema.senderAccounts)
    .where(isNull(schema.senderAccounts.deletedAt));
  const existingSet = new Set(existing.map((r) => r.email.toLowerCase()));

  for (let i = 0; i < rows.length; i++) {
    const parsed = senderCsvRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      failed.push({
        row: i + 1,
        error: parsed.error.issues[0]?.message ?? "Invalid row format",
      });
      continue;
    }

    const email = normalizeEmail(parsed.data.email).toLowerCase();
    if (existingSet.has(email)) {
      failed.push({ row: i + 1, error: `${email} is already in the system` });
      continue;
    }

    try {
      await db.insert(schema.senderAccounts).values({
        userId: user.id,
        senderName: parsed.data.senderName,
        email,
        smtpHost: parsed.data.smtpHost,
        smtpPort: parsed.data.smtpPort,
        smtpUsername: parsed.data.smtpUsername,
        smtpPasswordEnc: encryptSecret(parsed.data.smtpPassword),
        smtpSecurity: parsed.data.smtpSecurity,
        imapHost: parsed.data.imapHost || "",
        imapPort: parsed.data.imapPort || 993,
        imapUsername: parsed.data.imapUsername || "",
        imapPasswordEnc: parsed.data.imapPassword ? encryptSecret(parsed.data.imapPassword) : "",
        dailyLimit: Math.min(30, parsed.data.dailyLimit || 30), // Target pace 30
        hourlyLimit: parsed.data.hourlyLimit || 10,
        fromName: parsed.data.senderName,
        replyTo: "",
        timezone: parsed.data.timezone || "UTC",
        signature: parsed.data.signature || "",
        status: "active",
        health: 100,
        smtpStatus: "untested",
        imapStatus: "untested",
        isSystemPool: true,
      });
      existingSet.add(email);
      imported++;
    } catch (err: any) {
      failed.push({ row: i + 1, error: err?.message || "Failed to save into database" });
    }
  }

  revalidatePath("/admin");
  return { ok: true, imported, failed };
}

export async function toggleSystemMailboxStatus(
  senderId: string,
  newStatus: "active" | "paused"
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }

  const db = getDb();
  await ensureChadGtmTables(db);

  await db
    .update(schema.senderAccounts)
    .set({
      status: newStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(schema.senderAccounts.id, senderId),
        eq(schema.senderAccounts.isSystemPool, true)
      )
    );

  revalidatePath("/admin");
  return { ok: true };
}

export async function importDirectoryLeadsAction(
  records: Record<string, string>[]
): Promise<{ ok: boolean; result?: IngestionResult; error?: string }> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }

  try {
    const result = await importDirectoryLeadsFromCsv(records, "admin_bulk_upload.csv");
    revalidatePath("/admin");
    return { ok: true, result };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to import leads." };
  }
}

export async function getDirectoryStatsForAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }

  return getDirectoryStats();
}
