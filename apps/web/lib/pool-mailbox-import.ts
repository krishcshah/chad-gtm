/**
 * Admin import of shared system-pool mailboxes.
 *
 * Rules:
 * - A mailbox only becomes active after a live SMTP and IMAP login test
 *   passes (IMAP is required: reply detection and the reply agent read it).
 *   A mailbox that fails is saved as "failed" (not used by the scheduler)
 *   with the test message returned to the admin.
 * - At most MAX_POOL_MAILBOXES_PER_DOMAIN pool mailboxes per sending domain,
 *   so one domain's reputation isn't spread over too many inboxes.
 *
 * Network access is injected (`tester`), so this is unit-testable without
 * connecting anywhere.
 */
import type { TestConnectionResult } from "@smartreach/shared";

export const MAX_POOL_MAILBOXES_PER_DOMAIN = 3;

/** Lower-cased domain part of an address ("" when there is none). */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

export function poolDomainCapError(domain: string): string {
  return `${domain} already has ${MAX_POOL_MAILBOXES_PER_DOMAIN} shared mailboxes (the limit per sending domain). Use another domain.`;
}

/** Count pool mailboxes per sending domain. */
export function countPoolMailboxesByDomain(emails: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of emails) {
    const d = emailDomain(e);
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return counts;
}

export type ConnectionTester<T> = (candidate: T) => Promise<TestConnectionResult>;

export interface ConnectionVerdict {
  active: boolean;
  smtpStatus: "ok" | "failed";
  imapStatus: "ok" | "failed";
  status: "active" | "failed";
  health: number;
  /** Null when both logins worked; otherwise what failed, for the admin. */
  error: string | null;
}

/** Decide a pool mailbox's state from a connection test. Both logins must pass. */
export function verdictFromConnectionTest(result: TestConnectionResult): ConnectionVerdict {
  const smtpOk = Boolean(result.smtp?.ok);
  const imapOk = Boolean(result.imap?.ok);
  const problems: string[] = [];
  if (!smtpOk) problems.push(result.smtp?.message || "SMTP login failed");
  if (!imapOk) problems.push(result.imap?.message || "IMAP login failed");
  const active = smtpOk && imapOk;
  return {
    active,
    smtpStatus: smtpOk ? "ok" : "failed",
    imapStatus: imapOk ? "ok" : "failed",
    status: active ? "active" : "failed",
    health: active ? 100 : smtpOk ? 50 : 0,
    error: active ? null : problems.join(" · "),
  };
}

/** Run the tester, turning a thrown error into a failed verdict. */
export async function testPoolMailbox<T>(
  candidate: T,
  tester: ConnectionTester<T>,
): Promise<ConnectionVerdict> {
  try {
    return verdictFromConnectionTest(await tester(candidate));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Connection test failed";
    return {
      active: false,
      smtpStatus: "failed",
      imapStatus: "failed",
      status: "failed",
      health: 0,
      error: message,
    };
  }
}

export interface PoolImportCandidate {
  /** 1-based CSV row number, for messages. */
  row: number;
  email: string;
}

export interface PoolImportPlanItem<T extends PoolImportCandidate> {
  candidate: T;
  verdict: ConnectionVerdict;
}

export interface PoolImportPlan<T extends PoolImportCandidate> {
  /** Rows to save, each with its tested state (active or failed). */
  toInsert: PoolImportPlanItem<T>[];
  /** Rows not saved at all (duplicate, domain cap). */
  rejected: { row: number; error: string }[];
}

/**
 * Decide, row by row, what to save. Rows are checked in order: duplicates and
 * the per-domain cap first (no network), then the live login test.
 * `existingEmails` must be lower-case; `existingDomainCounts` counts current
 * non-deleted pool mailboxes per domain.
 */
export async function planPoolMailboxImport<T extends PoolImportCandidate>(opts: {
  candidates: T[];
  existingEmails: ReadonlySet<string>;
  existingDomainCounts: ReadonlyMap<string, number>;
  tester: ConnectionTester<T>;
  /**
   * Default true. False for dedicated (one-customer, non-pool) mailboxes:
   * the shared-pool per-domain cap does not apply to them. Every other check
   * (duplicates, missing domain, login test) still runs.
   */
  enforceDomainCap?: boolean;
}): Promise<PoolImportPlan<T>> {
  const enforceDomainCap = opts.enforceDomainCap !== false;
  const seen = new Set(opts.existingEmails);
  const domainCounts = new Map(opts.existingDomainCounts);
  const toInsert: PoolImportPlanItem<T>[] = [];
  const rejected: PoolImportPlan<T>["rejected"] = [];

  for (const candidate of opts.candidates) {
    const email = candidate.email.trim().toLowerCase();
    if (seen.has(email)) {
      rejected.push({ row: candidate.row, error: `${email} is already in the system` });
      continue;
    }
    const domain = emailDomain(email);
    if (!domain) {
      rejected.push({ row: candidate.row, error: `${email} has no domain` });
      continue;
    }
    if (enforceDomainCap && (domainCounts.get(domain) ?? 0) >= MAX_POOL_MAILBOXES_PER_DOMAIN) {
      rejected.push({ row: candidate.row, error: poolDomainCapError(domain) });
      continue;
    }
    seen.add(email);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    toInsert.push({ candidate, verdict: await testPoolMailbox(candidate, opts.tester) });
  }

  return { toInsert, rejected };
}

export const POOL_ACTIVATION_NEEDS_TEST_ERROR =
  "Shared mailboxes go live only after a passing SMTP and IMAP login test. Run Retest Connection first.";

/**
 * Error when a mailbox may not be switched to active by hand: shared pool
 * mailboxes need both logins verified ("ok") first. Null when allowed.
 */
export function poolActivationBlocker(sender: {
  isSystemPool?: boolean | null;
  smtpStatus?: string | null;
  imapStatus?: string | null;
}): string | null {
  if (!sender.isSystemPool) return null;
  return sender.smtpStatus === "ok" && sender.imapStatus === "ok"
    ? null
    : POOL_ACTIVATION_NEEDS_TEST_ERROR;
}

/** True when a patch changes login details, so earlier test results no longer hold. */
export function patchChangesCredentials(patch: Record<string, unknown>): boolean {
  return [
    "smtpHost",
    "smtpPort",
    "smtpUsername",
    "smtpPasswordEnc",
    "smtpSecurity",
    "imapHost",
    "imapPort",
    "imapUsername",
    "imapPasswordEnc",
  ].some((k) => k in patch);
}

/* ─── Changing a pool mailbox's password ─────────────────────────────── */

/** Longest password accepted from the admin form. */
export const MAX_MAILBOX_PASSWORD_LENGTH = 512;

/**
 * Check the passwords typed in the admin form. Passwords are used exactly as
 * typed (no trimming: a space can be part of a password). An empty IMAP
 * password means "same as SMTP", the usual cPanel setup.
 */
export function mailboxPasswordInputError(input: { password: string; imapPassword?: string }): string | null {
  const values = [input.password, input.imapPassword ?? ""];
  if (!input.password || !input.password.trim()) return "Enter the new password.";
  if (input.imapPassword !== undefined && input.imapPassword !== "" && !input.imapPassword.trim()) {
    return "The IMAP password can't be only spaces.";
  }
  if (values.some((v) => v.length > MAX_MAILBOX_PASSWORD_LENGTH)) return "That password is too long.";
  return null;
}

export type PasswordChangeOutcome =
  /** Saved; the mailbox sends (it was active, or was failing and is active again). */
  | "active"
  /** Saved; it stays paused because an admin paused it. */
  | "paused"
  /** Saved and the logins work, but its domain is over the pool cap, so it was not re-activated. */
  | "domain_cap";

/**
 * What saving a tested new password does to the mailbox. Only called after
 * both logins passed with the new password (a failing password is never
 * saved). A mailbox an admin paused stays paused; one that was failing
 * (usually because the password changed at the provider) goes back to active
 * unless its domain is now over the per-domain cap.
 */
export function passwordChangeStatus(input: {
  currentStatus: string;
  /** Other non-retired pool mailboxes on the same domain. */
  sameDomainOthers: number;
}): { status: "active" | "paused" | "failed"; outcome: PasswordChangeOutcome } {
  if (input.currentStatus === "paused") return { status: "paused", outcome: "paused" };
  if (input.currentStatus === "active") return { status: "active", outcome: "active" };
  if (input.sameDomainOthers >= MAX_POOL_MAILBOXES_PER_DOMAIN) return { status: "paused", outcome: "domain_cap" };
  return { status: "active", outcome: "active" };
}
