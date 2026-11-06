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
  MAX_POOL_MAILBOXES_PER_DOMAIN,
  countPoolMailboxesByDomain,
  emailDomain,
  planPoolMailboxImport,
  poolDomainCapError,
  testPoolMailbox,
  type PoolImportCandidate,
} from "./pool-mailbox-import";
import { stripWarmupMarker } from "./sender-warmup";
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

type PoolCsvCandidate = PoolImportCandidate & {
  data: ReturnType<typeof senderCsvRowSchema.parse>;
  /** Sender-shaped row with encrypted secrets, as the engine's tester expects. */
  probe: Record<string, unknown>;
};

async function engineConnectionTester(candidate: { probe: Record<string, unknown> }) {
  const { testConnection } = await import("@smartreach/email-engine/mailer");
  return testConnection(candidate.probe as never);
}

export interface SystemMailboxImportResult {
  ok: boolean;
  /** Rows saved (active + inactive). */
  imported: number;
  /** Saved and live: SMTP and IMAP login both worked. */
  activated: number;
  /** Saved but inactive because a login test failed; fix and re-activate. */
  inactive: { row: number; email: string; error: string }[];
  /** Rows not saved. */
  failed: { row: number; error: string }[];
}

export async function importSystemMailboxesCsv(rows: unknown[]): Promise<SystemMailboxImportResult> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }

  const db = getDb();
  await ensureChadGtmTables(db);

  const failed: { row: number; error: string }[] = [];
  const inactive: SystemMailboxImportResult["inactive"] = [];
  let imported = 0;
  let activated = 0;

  const existing = await db
    .select({ email: schema.senderAccounts.email, isSystemPool: schema.senderAccounts.isSystemPool })
    .from(schema.senderAccounts)
    .where(isNull(schema.senderAccounts.deletedAt));
  const existingEmails = new Set(existing.map((r) => r.email.toLowerCase()));
  const existingDomainCounts = countPoolMailboxesByDomain(
    existing.filter((r) => r.isSystemPool).map((r) => r.email),
  );

  const candidates: PoolCsvCandidate[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = senderCsvRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      failed.push({
        row: i + 1,
        error: parsed.error.issues[0]?.message ?? "Invalid row format",
      });
      continue;
    }
    const d = parsed.data;
    const email = normalizeEmail(d.email).toLowerCase();
    candidates.push({
      row: i + 1,
      email,
      data: d,
      probe: {
        email,
        fromName: d.senderName,
        replyTo: "",
        smtpHost: d.smtpHost,
        smtpPort: d.smtpPort,
        smtpUsername: d.smtpUsername,
        smtpPasswordEnc: encryptSecret(d.smtpPassword),
        smtpSecurity: d.smtpSecurity,
        imapHost: d.imapHost || "",
        imapPort: d.imapPort || 993,
        imapUsername: d.imapUsername || "",
        imapPasswordEnc: d.imapPassword ? encryptSecret(d.imapPassword) : "",
      },
    });
  }

  // Duplicates and the per-domain cap are checked before any login test.
  const plan = await planPoolMailboxImport({
    candidates,
    existingEmails,
    existingDomainCounts,
    tester: engineConnectionTester,
  });
  failed.push(...plan.rejected);

  for (const { candidate, verdict } of plan.toInsert) {
    const d = candidate.data;
    const probe = candidate.probe as {
      smtpPasswordEnc: string;
      imapPasswordEnc: string;
    };
    try {
      await db.insert(schema.senderAccounts).values({
        userId: user.id,
        senderName: d.senderName,
        email: candidate.email,
        smtpHost: d.smtpHost,
        smtpPort: d.smtpPort,
        smtpUsername: d.smtpUsername,
        smtpPasswordEnc: probe.smtpPasswordEnc,
        smtpSecurity: d.smtpSecurity,
        imapHost: d.imapHost || "",
        imapPort: d.imapPort || 993,
        imapUsername: d.imapUsername || "",
        imapPasswordEnc: probe.imapPasswordEnc,
        dailyLimit: Math.min(30, d.dailyLimit || 30), // Target pace 30
        hourlyLimit: d.hourlyLimit || 10,
        fromName: d.senderName,
        replyTo: "",
        timezone: d.timezone || "UTC",
        signature: stripWarmupMarker(d.signature || ""),
        status: verdict.status,
        health: verdict.health,
        smtpStatus: verdict.smtpStatus,
        imapStatus: verdict.imapStatus,
        isSystemPool: true,
      });
      imported++;
      if (verdict.active) activated++;
      else inactive.push({ row: candidate.row, email: candidate.email, error: verdict.error ?? "Login test failed" });
    } catch (err: any) {
      failed.push({ row: candidate.row, error: err?.message || "Failed to save into database" });
    }
  }

  failed.sort((a, b) => a.row - b.row);
  revalidatePath("/admin");
  return { ok: true, imported, activated, inactive, failed };
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

  const [sender] = await db
    .select()
    .from(schema.senderAccounts)
    .where(
      and(
        eq(schema.senderAccounts.id, senderId),
        eq(schema.senderAccounts.isSystemPool, true),
        isNull(schema.senderAccounts.deletedAt)
      )
    )
    .limit(1);
  if (!sender) return { ok: false, error: "Mailbox not found" };

  if (newStatus === "paused") {
    await db
      .update(schema.senderAccounts)
      .set({ status: "paused", updatedAt: new Date().toISOString() })
      .where(eq(schema.senderAccounts.id, senderId));
    revalidatePath("/admin");
    return { ok: true };
  }

  // Activation: re-check the per-domain cap and require a live SMTP + IMAP login.
  const domain = emailDomain(sender.email);
  const poolOnDomain = await db
    .select({ id: schema.senderAccounts.id, email: schema.senderAccounts.email })
    .from(schema.senderAccounts)
    .where(and(eq(schema.senderAccounts.isSystemPool, true), isNull(schema.senderAccounts.deletedAt)));
  const sameDomain = poolOnDomain.filter((r) => r.id !== senderId && emailDomain(r.email) === domain);
  if (sameDomain.length >= MAX_POOL_MAILBOXES_PER_DOMAIN) {
    return { ok: false, error: poolDomainCapError(domain) };
  }

  const verdict = await testPoolMailbox(sender, (s) => engineConnectionTester({ probe: s as never }));
  await db
    .update(schema.senderAccounts)
    .set({
      status: verdict.status,
      health: verdict.health,
      smtpStatus: verdict.smtpStatus,
      imapStatus: verdict.imapStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.senderAccounts.id, senderId));

  revalidatePath("/admin");
  if (!verdict.active) {
    return { ok: false, error: `Mailbox left inactive: ${verdict.error}` };
  }
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
