/**
 * Per-mailbox pacing. Each mailbox waits a random gap (gap.min..gap.max
 * seconds) between two of its emails, across scheduler ticks and campaigns:
 * the scheduler seeds `nextFreeAt` from the jobs already queued on each
 * mailbox, then books new jobs one gap apart. Pure: no database access.
 */
import { PACING_HORIZON_SEC, randomBetween } from "@smartreach/shared";

export interface MailboxPacerOptions {
  now: Date;
  /** Earliest time each mailbox may send its next email (missing = now). */
  nextFreeAt: Map<string, Date>;
  gap: { min: number; max: number };
  /** New leads are only booked this far ahead (seconds). */
  horizonSec?: number;
  rand?: (min: number, max: number) => number;
}

export interface MailboxPacer {
  /** Whether the mailbox's next free slot is inside the booking horizon. */
  canTake(senderId: string): boolean;
  /** Books the mailbox's next slot and returns when the email should go. */
  take(senderId: string): Date;
}

export function createMailboxPacer(opts: MailboxPacerOptions): MailboxPacer {
  const { now, nextFreeAt, gap } = opts;
  const horizonSec = opts.horizonSec ?? PACING_HORIZON_SEC;
  const rand = opts.rand ?? randomBetween;
  const horizonMs = now.getTime() + horizonSec * 1000;

  const nextSlot = (senderId: string): number => {
    const free = nextFreeAt.get(senderId)?.getTime();
    return free != null && Number.isFinite(free) && free > now.getTime() ? free : now.getTime();
  };

  return {
    canTake(senderId) {
      return nextSlot(senderId) <= horizonMs;
    },
    take(senderId) {
      const at = new Date(Math.max(now.getTime() + rand(0, 5) * 1000, nextSlot(senderId)));
      nextFreeAt.set(senderId, new Date(at.getTime() + rand(gap.min, gap.max) * 1000));
      return at;
    },
  };
}

/**
 * Seeds `nextFreeAt` from the latest send already booked (or just made) on
 * each mailbox. Rows with a missing or unreadable time are ignored.
 */
export function nextFreeFromQueued(
  rows: Array<{ senderId?: string | null; lastAt?: string | Date | null }>,
  gapMinSec: number,
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const r of rows) {
    if (!r?.senderId || r.lastAt == null) continue;
    const t = (r.lastAt instanceof Date ? r.lastAt : new Date(r.lastAt)).getTime();
    if (!Number.isFinite(t)) continue;
    const next = new Date(t + gapMinSec * 1000);
    const prev = map.get(r.senderId);
    if (!prev || next > prev) map.set(r.senderId, next);
  }
  return map;
}
