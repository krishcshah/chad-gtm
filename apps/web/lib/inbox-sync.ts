/**
 * "Check for new replies" in the Inbox (#70).
 *
 * Pool users own no mailboxes, so checking only the user's own mailboxes
 * checked nothing. The candidates are the user's own mailboxes in the active
 * workspace plus every mailbox that sent for one of the user's campaigns in
 * the last 30 days (shared pool and paused mailboxes included). Replies found
 * there are attributed to their real owner, exactly as the background worker
 * does.
 *
 * Deliberately NOT a "use server" module: called from a server action with a
 * trusted user id.
 */
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { shouldSyncMailbox, type MailboxHealthInput } from "@smartreach/email-engine/mailbox-health";
import { wsCondition } from "./queries";

/** A mailbox synced this recently counts as checked and is not read again. */
export const RECENT_SYNC_MS = 60_000;
/** At most this many mailboxes are read per click (the rest wait for the worker). */
export const MAX_MAILBOXES_PER_CHECK = 25;
/** Mailboxes that sent for the user's campaigns within this window are checked. */
export const RECENT_SEND_DAYS = 30;
/** Each mailbox gets this long before it is given up on for this click. */
export const MAILBOX_SYNC_TIMEOUT_MS = 10_000;

export type MailboxCandidate = MailboxHealthInput & {
  id: string;
  lastSyncAt?: string | null;
  /** Latest send for one of the user's campaigns (null for an own mailbox with no recent send). */
  lastUsedAt?: string | null;
};

/**
 * Which candidates to read now. Mailboxes synced in the last minute are
 * skipped but counted as checked; the rest must pass shouldSyncMailbox (an
 * inbox, not retired too long ago, not inside an IMAP-failure back-off).
 * Capped at MAX_MAILBOXES_PER_CHECK, most recently used first. Pure.
 */
export function pickMailboxesToCheck<T extends MailboxCandidate>(
  rows: T[],
  now: Date = new Date(),
): { toSync: T[]; recentlyChecked: number } {
  const seen = new Set<string>();
  const toSync: T[] = [];
  let recentlyChecked = 0;
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    const synced = row.lastSyncAt ? Date.parse(row.lastSyncAt) : NaN;
    if (Number.isFinite(synced) && now.getTime() - synced >= 0 && now.getTime() - synced < RECENT_SYNC_MS) {
      recentlyChecked++;
      continue;
    }
    if (!shouldSyncMailbox(row, now)) continue;
    toSync.push(row);
  }
  const usedAt = (r: T) => (r.lastUsedAt ? Date.parse(r.lastUsedAt) : NaN);
  toSync.sort((a, b) => {
    const ua = usedAt(a);
    const ub = usedAt(b);
    if (Number.isFinite(ua) !== Number.isFinite(ub)) return Number.isFinite(ua) ? -1 : 1;
    if (Number.isFinite(ua) && ub !== ua) return ub - ua;
    return a.id.localeCompare(b.id);
  });
  return { toSync: toSync.slice(0, MAX_MAILBOXES_PER_CHECK), recentlyChecked };
}

/** The user's own mailboxes in the workspace plus the mailboxes behind their recent sends. */
export async function loadInboxSyncCandidates(
  db: any,
  input: { userId: string; workspaceId: string; isDefault: boolean; now?: Date },
): Promise<MailboxCandidate[]> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - RECENT_SEND_DAYS * 86_400_000).toISOString();
  const sa = schema.senderAccounts;

  const own: MailboxCandidate[] = await db
    .select()
    .from(sa)
    .where(
      and(
        eq(sa.userId, input.userId),
        isNull(sa.deletedAt),
        sql`${sa.imapHost} != ''`,
        wsCondition(sa.workspaceId, input.workspaceId, input.isDefault),
      ),
    );

  const used: Array<{ senderId: string; lastUsedAt: string | null }> = await db
    .select({ senderId: schema.emailJobs.senderId, lastUsedAt: sql<string | null>`max(${schema.emailJobs.sentAt})` })
    .from(schema.emailJobs)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.emailJobs.campaignId))
    .where(
      and(
        eq(schema.campaigns.userId, input.userId),
        inArray(schema.emailJobs.status, ["sent", "bounced"]),
        gt(schema.emailJobs.sentAt, since),
      ),
    )
    .groupBy(schema.emailJobs.senderId);
  const lastUsed = new Map(used.map((u) => [String(u.senderId), u.lastUsedAt ?? null]));

  const ownIds = new Set(own.map((s) => s.id));
  const otherIds = [...lastUsed.keys()].filter((id) => !ownIds.has(id));
  // Any status (paused included); retired ones only within the same window.
  const others: MailboxCandidate[] = otherIds.length
    ? await db
        .select()
        .from(sa)
        .where(and(inArray(sa.id, otherIds), or(isNull(sa.deletedAt), gt(sa.deletedAt, since))))
    : [];

  return [...own, ...others].map((s) => ({ ...s, lastUsedAt: lastUsed.get(s.id) ?? null }));
}

/** One mailbox's sync result: `foundByOwner` splits `found` by customer. */
export type MailboxSyncOutcome = { found: number; foundByOwner?: Record<string, number>; error?: string };

/**
 * New replies this user can see. A shared pool mailbox records replies for
 * every customer it sends for, so only the ones filed under this user count
 * (#70); without a split, nothing is claimed.
 */
export function foundForUser(outcome: MailboxSyncOutcome, userId: string): number {
  return outcome.foundByOwner?.[userId] ?? 0;
}

/** Run `fn` with a time limit; a timeout or error resolves to `{ found: 0, error }`. */
export async function withSyncTimeout(
  fn: () => Promise<MailboxSyncOutcome>,
  ms = MAILBOX_SYNC_TIMEOUT_MS,
): Promise<MailboxSyncOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`IMAP sync timeout (${Math.round(ms / 1000)}s)`)), ms);
      }),
    ]);
  } catch (e) {
    return { found: 0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
