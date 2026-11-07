import { and, eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { timeAgo } from "@smartreach/shared";
import {
  REPLIES_UNREADABLE_HOLD_REASON,
  STICKY_MAILBOX_UNAVAILABLE_NOTE,
} from "@smartreach/email-engine/mailbox-health";

/** Replies last read longer ago than this are flagged on the admin pool row. */
const STALE_SYNC_MS = 2 * 3_600_000;

/**
 * Why this mailbox's replies are not being read, or null when they are.
 * Shown on the admin pool row ("Replies not read").
 */
export function mailboxReadProblem(
  m: { imapHost?: string | null; imapStatus?: string | null; lastSyncAt: string | null },
  now: Date = new Date(),
): string | null {
  if (!m.imapHost) return null;
  if (m.imapStatus === "failed") return "Inbox login failing, replies are not being read";
  const last = m.lastSyncAt ? Date.parse(m.lastSyncAt) : NaN;
  if (!Number.isFinite(last)) return "Replies have not been read yet";
  if (now.getTime() - last > STALE_SYNC_MS) return `Replies last read ${timeAgo(m.lastSyncAt)}`;
  return null;
}

/**
 * Follow-ups of this campaign waiting for their own mailbox: queued because
 * it is paused or its inbox can't be read, or held on it for the same reason.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function countHeldFollowUps(db: any, campaignId: string): Promise<number> {
  const [queued] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.campaignLeads)
    .where(
      and(
        eq(schema.campaignLeads.campaignId, campaignId),
        eq(schema.campaignLeads.status, "queued"),
        eq(schema.campaignLeads.lastError, STICKY_MAILBOX_UNAVAILABLE_NOTE),
      ),
    );
  const [held] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.emailJobs)
    .where(
      and(
        eq(schema.emailJobs.campaignId, campaignId),
        eq(schema.emailJobs.status, "pending"),
        eq(schema.emailJobs.lastError, REPLIES_UNREADABLE_HOLD_REASON),
      ),
    );
  return Number(queued?.n ?? 0) + Number(held?.n ?? 0);
}
