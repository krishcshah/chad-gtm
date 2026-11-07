/**
 * Mailbox health rules shared by reply sync, the scheduler and the processor.
 *
 * "Stop sending" and "stop reading" are separate: a paused mailbox (and a
 * retired one, for a grace period) is still read so replies to emails it
 * already sent are recorded and stop the sequence. An inbox login failure is
 * retried with backoff instead of excluding the mailbox for good, and while
 * its inbox can't be read no follow-up goes out from it blind.
 */
import type { EngineDb } from "./db-port";
import { recordSend } from "./rotation";
import { schema } from "@smartreach/database";
import type { TestConnectionResult } from "@smartreach/shared";
import { and, asc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { SenderRow } from "./db-port";

/** Retired (soft-deleted) mailboxes are still read for this many days. */
export const RETIRED_SYNC_GRACE_DAYS = 30;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Wait before retrying a failed inbox login: 15m, 30m, 1h, ... capped at 24h. */
export function imapRetryDelayMs(failCount: number): number {
  const n = Math.max(0, Math.floor(Number(failCount) || 0) - 1);
  // 2^7 * 15m already exceeds 24h; clamp the exponent so it never overflows.
  return Math.min(DAY_MS, 15 * MINUTE_MS * 2 ** Math.min(n, 10));
}

/** The fields the rules below read (a SenderRow, plus deletedAt when loaded). */
export interface MailboxHealthInput {
  imapHost?: string | null;
  imapPasswordEnc?: string | null;
  imapStatus?: string | null;
  imapFailCount?: number | null;
  imapAttemptedAt?: string | null;
  deletedAt?: string | null;
}

/**
 * Whether reply sync should read this mailbox now. Paused and failed sending
 * status do not matter: their replies still have to be recorded.
 */
export function shouldSyncMailbox(sender: MailboxHealthInput, now: Date = new Date()): boolean {
  if (!sender.imapHost || !sender.imapPasswordEnc) return false;
  if (sender.deletedAt) {
    const retiredAt = Date.parse(sender.deletedAt);
    if (!Number.isFinite(retiredAt)) return false;
    if (now.getTime() - retiredAt > RETIRED_SYNC_GRACE_DAYS * DAY_MS) return false;
  }
  if (sender.imapStatus === "failed") {
    if (!sender.imapAttemptedAt) return true;
    const attempted = Date.parse(sender.imapAttemptedAt);
    if (!Number.isFinite(attempted)) return true;
    return now.getTime() - attempted >= imapRetryDelayMs(sender.imapFailCount ?? 1);
  }
  return true;
}

/** The mailbox has an inbox, but logging in to it is failing. */
export function repliesUnreadable(sender: Pick<MailboxHealthInput, "imapHost" | "imapStatus">): boolean {
  return Boolean(sender.imapHost) && sender.imapHost !== "" && sender.imapStatus === "failed";
}

/** campaign_leads.lastError for a follow-up waiting for its own (paused/unreadable) mailbox. */
export const STICKY_MAILBOX_UNAVAILABLE_NOTE = "waiting-for-mailbox";

/** email_jobs.lastError for a follow-up held because its mailbox's replies can't be read. */
export const REPLIES_UNREADABLE_HOLD_REASON =
  "Held: replies to this mailbox can't be read right now, so the follow-up waits.";

/* ─── Replies to existing conversations ───────────────────────────────── */

/**
 * Why a reply to an existing conversation can't go out from this mailbox, or
 * null when it can. Pausing a mailbox stops new outreach only: replies to
 * warm conversations still go out. A failed or retired (soft-deleted) mailbox
 * never sends. A missing mailbox counts as retired (fail closed).
 */
export function replyMailboxBlockReason(
  sender: { status?: string | null; deletedAt?: string | null } | null | undefined,
): "retired" | "failed" | null {
  if (!sender || sender.deletedAt) return "retired";
  if (sender.status === "failed") return "failed";
  return null;
}

export const MAILBOX_OUT_OF_SERVICE_MESSAGE =
  "The mailbox this conversation came from is out of service, so the reply was not sent. AutoGTM has been alerted; try again once it's back.";

/** Thrown before sending when the conversation's mailbox is out of service. Nothing was sent. */
export class MailboxUnavailableError extends Error {
  constructor(message: string = MAILBOX_OUT_OF_SERVICE_MESSAGE) {
    super(message);
    this.name = "MailboxUnavailableError";
  }
}

/**
 * Count a reply sent from a mailbox ('sender_reply' usage counter). Replies are
 * counted apart from cold sends, so they never use up the 30-a-day cold cap.
 * Never throws: the reply is already out.
 */
export async function recordReplySend(
  db: EngineDb,
  opts: { senderId: string; userId: string },
): Promise<void> {
  try {
    await recordSend(db, { userId: opts.userId, entityType: "sender_reply", entityId: opts.senderId });
  } catch (err) {
    console.error("[mailbox-health] could not count a reply send", opts.senderId, err);
  }
}

/* ─── Send failures, recovery and automatic re-tests ───────────────────── */

/** Consecutive mailbox-side send errors before a mailbox is taken out of rotation. */
export const MAILBOX_FAILURE_THRESHOLD = 3;
/** A failed mailbox's login is re-tested at most once per this window. */
export const RETEST_COOLOFF_MS = 6 * 3_600_000;
/** Mailboxes re-tested per sync tick. */
const RETEST_BATCH = 5;
/** Each automatic re-test (SMTP + IMAP login) gives up after this long. */
const RETEST_TIMEOUT_MS = 10_000;

/**
 * Sending status after a mailbox-side send error. A definite auth failure
 * fails the mailbox at once; anything else (timeouts, unreachable server)
 * only after MAILBOX_FAILURE_THRESHOLD errors in a row. Health is display only.
 */
export function senderStatusAfterError<S extends string>(input: {
  currentStatus: S;
  definiteAuth: boolean;
  failureCount: number;
}): S | "failed" {
  if (input.definiteAuth || input.failureCount >= MAILBOX_FAILURE_THRESHOLD) return "failed";
  return input.currentStatus;
}

/**
 * A live send went out: reset the error streak and recover a little health.
 * Best effort; never throws (the email is already out).
 */
export async function noteSenderSendSucceeded(db: EngineDb, senderId: string): Promise<void> {
  try {
    const s = schema.senderAccounts;
    await db
      .update(s)
      .set({ health: sql`LEAST(${s.health} + 2, 100)`, failureCount: 0 })
      .where(and(eq(s.id, senderId), or(lt(s.health, 100), gt(s.failureCount, 0))));
  } catch (err) {
    console.error("[mailbox-health] could not record a successful send", senderId, err);
  }
}

/** Is a failed mailbox due for an automatic login re-test? */
export function dueForRetest(
  sender: { status?: string | null; deletedAt?: string | null; lastRetestAt?: string | null },
  now: Date = new Date(),
): boolean {
  if (sender.status !== "failed" || sender.deletedAt) return false;
  if (!sender.lastRetestAt) return true;
  const last = Date.parse(sender.lastRetestAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= RETEST_COOLOFF_MS;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Login test timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export interface RetestDeps {
  testConnection?: (sender: SenderRow) => Promise<TestConnectionResult>;
}

/**
 * Re-test up to RETEST_BATCH failed mailboxes whose last re-test is older than
 * RETEST_COOLOFF_MS with a real SMTP and IMAP login. Only when BOTH logins pass
 * does a mailbox return to 'active'; a definite auth failure therefore comes
 * back only through a real login, never through time or score decay.
 */
export async function retestFailedSenders(
  db: EngineDb,
  now: Date = new Date(),
  deps: RetestDeps = {},
): Promise<{ tested: number; recovered: number }> {
  const s = schema.senderAccounts;
  const cutoff = new Date(now.getTime() - RETEST_COOLOFF_MS).toISOString();
  const rows: (SenderRow & { deletedAt?: string | null })[] = await db
    .select()
    .from(s)
    .where(and(eq(s.status, "failed"), isNull(s.deletedAt), or(isNull(s.lastRetestAt), lt(s.lastRetestAt, cutoff))))
    .orderBy(asc(sql`coalesce(${s.lastRetestAt}, '')`))
    .limit(RETEST_BATCH);
  const due = rows.filter((r) => dueForRetest(r, now)).slice(0, RETEST_BATCH);
  if (due.length === 0) return { tested: 0, recovered: 0 };

  const test = deps.testConnection ?? (await import("./mailer")).testConnection;
  let tested = 0;
  let recovered = 0;
  for (const sender of due) {
    const nowS = now.toISOString();
    let result: TestConnectionResult;
    try {
      result = await withTimeout(test(sender), RETEST_TIMEOUT_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login test failed";
      result = { smtp: { ok: false, message }, imap: { ok: false, message } };
    }
    tested++;
    const smtpOk = Boolean(result.smtp?.ok);
    const imapOk = Boolean(result.imap?.ok);
    try {
      if (smtpOk && imapOk) {
        // Guarded on 'failed' so an admin's pause in the meantime is kept.
        await db
          .update(s)
          .set({
            status: "active",
            smtpStatus: "ok",
            imapStatus: "ok",
            failureCount: 0,
            failedReason: null,
            imapFailCount: 0,
            health: sql`GREATEST(${s.health}, 60)`,
            lastRetestAt: nowS,
            updatedAt: nowS,
          })
          .where(and(eq(s.id, sender.id), eq(s.status, "failed"), isNull(s.deletedAt)));
        await db.insert(schema.activityLogs).values({
          id: crypto.randomUUID(),
          userId: sender.userId,
          type: "sender.recovered",
          message: `${sender.email} passed an automatic login test and is back in rotation`,
          campaignId: null,
          meta: { senderId: sender.id },
        });
        recovered++;
      } else {
        await db
          .update(s)
          .set({
            lastRetestAt: nowS,
            smtpStatus: smtpOk ? "ok" : "failed",
            imapStatus: imapOk ? "ok" : "failed",
            updatedAt: nowS,
          })
          .where(eq(s.id, sender.id));
      }
    } catch (err) {
      console.error("[mailbox-health] could not record a re-test", sender.id, err);
    }
  }
  return { tested, recovered };
}
