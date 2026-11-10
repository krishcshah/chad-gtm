"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
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
  mailboxPasswordInputError,
  passwordChangeStatus,
  planPoolMailboxImport,
  poolDomainCapError,
  testPoolMailbox,
  type PasswordChangeOutcome,
  type PoolImportCandidate,
} from "./pool-mailbox-import";
import { stripWarmupMarker } from "./sender-warmup";
import { mailboxReadProblem } from "./pool-mailbox-status";
import {
  summarizePoolCapacity,
  type PoolCapacityCampaign,
  type PoolCustomerSummary,
  type UtilizationStatus,
} from "./pool-capacity";
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
  /** Replies to existing conversations sent from pool mailboxes today (counted apart from cold sends). */
  repliesSentToday: number;
  /** Accounts that own pool mailboxes (soft-deleted ones included), most first. */
  poolOwners: Array<{ email: string; count: number }>;
  /** Every pool mailbox is owned by the signed-in admin. */
  ownedByMe: boolean;
  /** Sum of campaigns.dailyLimit over running campaigns that send from the pool. */
  totalDailyDemand: number;
  /** Today's capacity of active pool mailboxes, warm-up ramp included (engine rule). */
  totalDailyCapacity: number;
  utilizationPercent: number;
  utilizationStatus: UtilizationStatus; // <80% green, 80-100% yellow, >100% red
  targetPacePerMailbox: number;
  recommendToAdd: number;
  customers: PoolCustomerSummary[];
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
    /** Replies to existing conversations sent today (not part of the cold cap). */
    repliesToday: number;
    lastSyncAt: string | null;
    /** Why replies to this mailbox are not being read, or null. */
    readProblem: string | null;
    /** Why the engine took it out of rotation (failed mailboxes), or null. */
    failedReason: string | null;
    /** Today's cap with the warm-up ramp (what the engine will actually send). */
    effectiveCap: number;
    warmingUp: boolean;
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
  const repliesTodayMap = new Map<string, number>();
  if (senderIds.length > 0) {
    const usageRows = await db
      .select({
        entityType: schema.usageCounters.entityType,
        entityId: schema.usageCounters.entityId,
        count: schema.usageCounters.count,
      })
      .from(schema.usageCounters)
      .where(
        and(
          inArray(schema.usageCounters.entityType, ["sender", "sender_reply"]),
          eq(schema.usageCounters.date, today)
        )
      );
    for (const r of usageRows) {
      if (r.entityType === "sender_reply") repliesTodayMap.set(r.entityId, Number(r.count));
      else todaySentMap.set(r.entityId, Number(r.count));
    }
  }

  let emailsSentToday = 0;
  let repliesSentToday = 0;
  for (const s of poolSenders) {
    emailsSentToday += todaySentMap.get(s.id) || 0;
    repliesSentToday += repliesTodayMap.get(s.id) || 0;
  }

  // Who owns the pool rows (soft-deleted ones too: they still own sent history).
  const ownerRows = await db
    .select({ userId: schema.senderAccounts.userId, email: schema.users.email, n: sql<number>`count(*)::int` })
    .from(schema.senderAccounts)
    .leftJoin(schema.users, eq(schema.users.id, schema.senderAccounts.userId))
    .where(eq(schema.senderAccounts.isSystemPool, true))
    .groupBy(schema.senderAccounts.userId, schema.users.email);
  const poolOwners = ownerRows
    .map((r) => ({ userId: r.userId, email: r.email ?? "Unknown account", count: Number(r.n) }))
    .sort((a, b) => b.count - a.count);
  const ownedByMe = poolOwners.every((o) => o.userId === user.id);

  // 3. Demand: running campaigns whose senders (the engine's own list, which
  // includes the live pool for autopilot runs) contain a pool mailbox.
  const now = new Date();
  const poolCampaignRows = await loadPoolCampaignDemand(db, now);

  // 4. Capacity with the engine's per-mailbox cap (30 a day, warm-up ramp).
  const targetPacePerMailbox = 30;
  const capacity = summarizePoolCapacity({
    mailboxes: poolSenders.map((s) => ({
      id: s.id,
      status: s.status,
      dailyLimit: s.dailyLimit,
      createdAt: s.createdAt,
    })),
    campaigns: poolCampaignRows,
    now,
  });

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
    repliesToday: repliesTodayMap.get(s.id) || 0,
    lastSyncAt: s.lastSyncAt,
    readProblem: mailboxReadProblem(s),
    failedReason: s.failedReason ?? null,
    effectiveCap: capacity.effectiveCaps.get(s.id) ?? s.dailyLimit,
    warmingUp: (capacity.effectiveCaps.get(s.id) ?? s.dailyLimit) < s.dailyLimit,
    createdAt: s.createdAt,
  }));

  return {
    totalMailboxes,
    activeMailboxes,
    pausedMailboxes,
    emailsSentToday,
    repliesSentToday,
    poolOwners: poolOwners.map(({ email, count }) => ({ email, count })),
    ownedByMe,
    totalDailyDemand: capacity.totalDemand,
    totalDailyCapacity: capacity.totalCapacity,
    utilizationPercent: capacity.utilizationPercent,
    utilizationStatus: capacity.utilizationStatus,
    targetPacePerMailbox,
    recommendToAdd: capacity.recommendToAdd,
    customers: capacity.customers,
    mailboxes,
  };
}

/**
 * Running campaigns that send from pool mailboxes, with what they asked for
 * (campaigns.dailyLimit), what they sent today and their fair-share slots
 * today from the engine's own allocator.
 */
async function loadPoolCampaignDemand(db: ReturnType<typeof getDb>, now: Date): Promise<PoolCapacityCampaign[]> {
  const engine = await import("@smartreach/email-engine");
  const running = await db
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.status, "running"), isNull(schema.campaigns.deletedAt)));

  const sendersByCampaign = new Map<string, Awaited<ReturnType<typeof engine.campaignSenders>>>();
  const poolCampaigns: typeof running = [];
  for (const c of running) {
    const senders = await engine.campaignSenders(db as never, c.id);
    if (!senders.some((s) => engine.isPoolSender(s))) continue;
    sendersByCampaign.set(c.id, senders);
    poolCampaigns.push(c);
  }
  if (poolCampaigns.length === 0) return [];

  // An allocation error degrades to 0 allocated, never a crash of the panel.
  const allocated = new Map<string, number>();
  try {
    const plans = await engine.buildPoolPlans(db as never, poolCampaigns as never, sendersByCampaign, now);
    for (const [campaignId, plan] of plans) {
      let total = 0;
      for (const n of plan.quota.values()) total += n;
      allocated.set(campaignId, total);
    }
  } catch (err) {
    console.error("[admin-pool] could not compute today's pool allocation:", err);
  }

  const ownerIds = [...new Set(poolCampaigns.map((c) => c.userId))];
  const owners = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, ownerIds));
  const ownerEmail = new Map(owners.map((o) => [o.id, o.email]));

  const rows: PoolCapacityCampaign[] = [];
  for (const c of poolCampaigns) {
    const sentToday = await engine
      .campaignSentToday(db as never, c.id, engine.campaignDayKey(c, now))
      .catch(() => 0);
    rows.push({
      id: c.id,
      userId: c.userId,
      ownerEmail: ownerEmail.get(c.userId) ?? "Unknown account",
      name: c.name,
      dailyLimit: c.dailyLimit,
      sentToday,
      allocatedToday: allocated.get(c.id) ?? 0,
    });
  }
  return rows;
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

/**
 * Import mailboxes from a CSV. By default they join the shared pool. With
 * `ownerEmail` they are dedicated to that one customer instead (not pool,
 * userId = the customer): they send only that customer's manual campaigns.
 * Both paths run the same real SMTP + IMAP login test and duplicate check.
 */
export async function importSystemMailboxesCsv(
  rows: unknown[],
  opts: { ownerEmail?: string } = {},
): Promise<SystemMailboxImportResult> {
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

  // Dedicated mailboxes: resolve the customer before touching anything.
  const ownerEmailInput = (opts.ownerEmail ?? "").trim().toLowerCase();
  let owner: { userId: string; workspaceId: string | null } | null = null;
  if (opts.ownerEmail !== undefined) {
    const [target] = ownerEmailInput
      ? await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(sql`lower(${schema.users.email}) = ${ownerEmailInput}`)
          .limit(1)
      : [];
    if (!target) {
      return { ok: false, imported: 0, activated: 0, inactive: [], failed: [{ row: 0, error: "No account uses that email" }] };
    }
    // The customer's default workspace (null is backfilled by ensureDefaultWorkspace).
    const [ws] = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.userId, target.id), eq(schema.workspaces.isDefault, true)))
      .limit(1);
    owner = { userId: target.id, workspaceId: ws?.id ?? null };
  }

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
  // The cap protects the shared pool only; dedicated mailboxes skip it.
  const plan = await planPoolMailboxImport({
    candidates,
    existingEmails,
    existingDomainCounts,
    tester: engineConnectionTester,
    enforceDomainCap: owner === null,
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
        userId: owner ? owner.userId : user.id,
        ...(owner ? { workspaceId: owner.workspaceId } : {}),
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
        isSystemPool: owner === null,
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
      // A passing login test starts a clean error streak.
      ...(verdict.active ? { failureCount: 0, failedReason: null, imapFailCount: 0 } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.senderAccounts.id, senderId));

  revalidatePath("/admin");
  if (!verdict.active) {
    return { ok: false, error: `Mailbox left inactive: ${verdict.error}` };
  }
  return { ok: true };
}

export interface MailboxPasswordResult {
  ok: boolean;
  error?: string;
  /** Set when saved: what the mailbox does now. */
  outcome?: PasswordChangeOutcome;
}

/**
 * Change a shared pool mailbox's password after it was changed at the mail
 * provider. The new password is tested with a real SMTP and IMAP login first
 * and only saved when both pass, so a typo never replaces a working password.
 * Stored encrypted with the current ENCRYPTION_KEY; never logged or returned.
 */
export async function changeSystemMailboxPassword(
  senderId: string,
  input: { password: string; imapPassword?: string },
): Promise<MailboxPasswordResult> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }
  const password = typeof input?.password === "string" ? input.password : "";
  const imapInput = typeof input?.imapPassword === "string" ? input.imapPassword : undefined;
  const inputError = mailboxPasswordInputError({ password, imapPassword: imapInput });
  if (inputError) return { ok: false, error: inputError };
  const imapPassword = imapInput ? imapInput : password;

  const db = getDb();
  await ensureChadGtmTables(db);

  const [sender] = await db
    .select()
    .from(schema.senderAccounts)
    .where(
      and(
        eq(schema.senderAccounts.id, senderId),
        eq(schema.senderAccounts.isSystemPool, true),
        isNull(schema.senderAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (!sender) return { ok: false, error: "Mailbox not found in the shared pool" };

  const smtpPasswordEnc = encryptSecret(password);
  const imapPasswordEnc = encryptSecret(imapPassword);
  const verdict = await testPoolMailbox({ ...sender, smtpPasswordEnc, imapPasswordEnc }, (s) =>
    engineConnectionTester({ probe: s as never }),
  );
  if (!verdict.active) {
    return { ok: false, error: `Not saved: the login failed with the new password. ${verdict.error ?? ""}`.trim() };
  }

  const domain = emailDomain(sender.email);
  const poolMailboxes = await db
    .select({ id: schema.senderAccounts.id, email: schema.senderAccounts.email })
    .from(schema.senderAccounts)
    .where(and(eq(schema.senderAccounts.isSystemPool, true), isNull(schema.senderAccounts.deletedAt)));
  const sameDomainOthers = poolMailboxes.filter((r) => r.id !== senderId && emailDomain(r.email) === domain).length;
  const next = passwordChangeStatus({ currentStatus: sender.status, sameDomainOthers });

  await db
    .update(schema.senderAccounts)
    .set({
      smtpPasswordEnc,
      imapPasswordEnc,
      status: next.status,
      health: verdict.health,
      smtpStatus: verdict.smtpStatus,
      imapStatus: verdict.imapStatus,
      // Both logins work now: start a clean error streak.
      failureCount: 0,
      failedReason: null,
      imapFailCount: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(schema.senderAccounts.id, senderId), eq(schema.senderAccounts.isSystemPool, true)));

  revalidatePath("/admin");
  return { ok: true, outcome: next.outcome };
}

/**
 * Retire a shared pool mailbox for good: soft delete (history is kept).
 * Running campaigns stop listing it, so follow-ups it was due to send rotate
 * to other pool mailboxes; reply sync keeps reading its inbox for 30 days.
 */
export async function retireSystemMailbox(senderId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }

  const db = getDb();
  await ensureChadGtmTables(db);

  const [sender] = await db
    .select({ id: schema.senderAccounts.id })
    .from(schema.senderAccounts)
    .where(
      and(
        eq(schema.senderAccounts.id, senderId),
        eq(schema.senderAccounts.isSystemPool, true),
        isNull(schema.senderAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (!sender) return { ok: false, error: "Mailbox not found in the shared pool" };

  const now = new Date().toISOString();
  await db
    .update(schema.senderAccounts)
    .set({ deletedAt: now, status: "paused", updatedAt: now })
    .where(and(eq(schema.senderAccounts.id, senderId), eq(schema.senderAccounts.isSystemPool, true)));

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Make the signed-in admin the owner of every shared pool mailbox (retired
 * ones included), filed under no workspace. Afterwards the previous owner can
 * delete their account without taking the pool with it.
 */
export async function takeOverMailboxPoolAction(): Promise<{ ok: boolean; moved?: number; error?: string }> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }

  const db = getDb();
  await ensureChadGtmTables(db);
  try {
    const moved = await db
      .update(schema.senderAccounts)
      .set({ userId: user.id, workspaceId: null, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.senderAccounts.isSystemPool, true), ne(schema.senderAccounts.userId, user.id)))
      .returning({ id: schema.senderAccounts.id });
    revalidatePath("/admin");
    return { ok: true, moved: moved.length };
  } catch (err: unknown) {
    console.error("[admin-pool] take over failed:", err);
    return { ok: false, error: "The pool could not be taken over. Try again." };
  }
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
