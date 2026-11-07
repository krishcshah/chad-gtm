/**
 * How many emails a campaign can really send per day. Pure and client-safe:
 * the engine (rotation.ts) and the web app use the same numbers, so what the
 * app shows is what actually goes out.
 */

/**
 * Absolute ceiling for any single mailbox, regardless of campaign settings.
 * Shared-pool deliverability depends on this being non-negotiable.
 */
export const HARD_MAX_PER_SENDER_PER_DAY = 30;

/** New mailboxes start here and climb by RAMP_STEP_PER_DAY each day. */
export const RAMP_START_PER_DAY = 10;
export const RAMP_STEP_PER_DAY = 5;

/** One-line explanation of the per-mailbox limit, shown next to the setting. */
export const MAILBOX_LIMIT_NOTE =
  "Each mailbox sends at most 30 emails a day in total (fewer in its first days), shared by every campaign that uses it.";

/**
 * Daily ceiling from mailbox age: 10 on the day it was added, +5 per full day,
 * up to `max` (30). Mailboxes older than the ramp (or with no usable
 * creation time) get `max`, so existing mailboxes are unaffected.
 */
export function rampedDailyCap(
  createdAt: string | Date | null | undefined,
  now: Date = new Date(),
  max: number = HARD_MAX_PER_SENDER_PER_DAY,
): number {
  if (!createdAt) return max;
  const t = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (!Number.isFinite(t)) return max;
  const days = Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
  return Math.min(max, RAMP_START_PER_DAY + RAMP_STEP_PER_DAY * days);
}

/** Today's cap for one sender: its own limit, the campaign's, the hard 30, and the ramp. */
export function senderDailyCap(
  sender: { dailyLimit?: number | null; createdAt?: string | Date | null },
  perCampaignSenderDailyCap: number = HARD_MAX_PER_SENDER_PER_DAY,
  now: Date = new Date(),
): number {
  return Math.min(
    sender.dailyLimit ?? HARD_MAX_PER_SENDER_PER_DAY,
    perCampaignSenderDailyCap ?? HARD_MAX_PER_SENDER_PER_DAY,
    HARD_MAX_PER_SENDER_PER_DAY,
    rampedDailyCap(sender.createdAt, now),
  );
}

export interface CapacityMailbox {
  status: string;
  dailyLimit?: number | null;
  createdAt?: string | Date | null;
  isSystemPool?: boolean | null;
}

export type CapacityLimit = "campaign" | "mailboxes" | "shared-pool";

export interface DailyCapacity {
  /** Emails per day the campaign can send at most. */
  perDay: number;
  /** Which limit sets perDay. */
  limitedBy: CapacityLimit;
  /** What the mailboxes allow this campaign (own + its share of the pool). */
  mailboxTotal: number;
}

/**
 * Effective daily capacity: the campaign limit, or what its mailboxes allow
 * when that is lower. Shared (pool) mailboxes are split evenly between the
 * accounts sending from them.
 */
export function effectiveDailyCapacity(input: {
  campaignDailyLimit: number;
  perMailboxLimit?: number | null;
  mailboxes: readonly CapacityMailbox[];
  poolUsers?: number;
  now?: Date;
}): DailyCapacity {
  const now = input.now ?? new Date();
  const perMailbox = input.perMailboxLimit ?? HARD_MAX_PER_SENDER_PER_DAY;
  let own = 0;
  let poolRaw = 0;
  for (const m of input.mailboxes) {
    if (m.status !== "active") continue;
    const cap = Math.max(0, senderDailyCap(m, perMailbox, now));
    if (m.isSystemPool) poolRaw += cap;
    else own += cap;
  }
  const poolUsers = Math.max(1, Math.floor(input.poolUsers ?? 1));
  const pool = Math.floor(poolRaw / poolUsers);
  const mailboxTotal = own + pool;
  const campaignDailyLimit = Math.max(0, Math.floor(input.campaignDailyLimit || 0));
  const perDay = Math.min(campaignDailyLimit, mailboxTotal);
  const limitedBy: CapacityLimit =
    campaignDailyLimit <= mailboxTotal ? "campaign" : poolUsers > 1 && pool < poolRaw ? "shared-pool" : "mailboxes";
  return { perDay, limitedBy, mailboxTotal };
}

const LIMITED_BY_COPY: Record<CapacityLimit, string> = {
  campaign: "your campaign limit",
  mailboxes: "its mailboxes",
  "shared-pool": "its share of the shared mailboxes",
};

/** "Up to 60 a day (limited by its mailboxes)". */
export function capacityLabel(cap: Pick<DailyCapacity, "perDay" | "limitedBy">): string {
  return `Up to ${cap.perDay.toLocaleString("en-US")} a day (limited by ${LIMITED_BY_COPY[cap.limitedBy]})`;
}
