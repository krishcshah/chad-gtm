/**
 * Shared mailbox pool: capacity vs. demand, with the engine's own numbers.
 *
 * Capacity uses senderDailyCap (the 30-a-day ceiling and the new-mailbox
 * ramp), the same function the engine's rotation re-exports, so the admin
 * panel never shows more room than the engine will use. Demand is the daily
 * volume of running campaigns that send from the pool. Pure and unit-tested.
 */
import { HARD_MAX_PER_SENDER_PER_DAY, senderDailyCap } from "@smartreach/shared";

export type UtilizationStatus = "green" | "yellow" | "red";

export interface PoolCapacityMailbox {
  id: string;
  status: string;
  dailyLimit: number;
  createdAt: string | null;
  imapHost?: string | null;
  imapStatus?: string | null;
}

/**
 * The engine sends no new outreach from a mailbox whose replies it can't read
 * (same rule as the engine's repliesUnreadable in mailbox-health.ts).
 */
export function mailboxRepliesUnreadable(m: Pick<PoolCapacityMailbox, "imapHost" | "imapStatus">): boolean {
  return Boolean(m.imapHost) && m.imapStatus === "failed";
}

export interface PoolCapacityCampaign {
  id: string;
  userId: string;
  ownerEmail: string;
  name: string;
  /** campaigns.dailyLimit: what the customer asked for. */
  dailyLimit: number;
  sentToday: number;
  /** Today's fair-share slots from the engine (buildPoolPlans). */
  allocatedToday: number;
}

export interface PoolCustomerSummary {
  userId: string;
  ownerEmail: string;
  campaigns: number;
  dailyLimit: number;
  allocatedToday: number;
  sentToday: number;
  /** The pool is over capacity and this customer is getting less than they asked for. */
  starved: boolean;
}

export interface PoolCapacitySummary {
  /** mailbox id → today's effective cap (ramp included). */
  effectiveCaps: Map<string, number>;
  totalCapacity: number;
  totalDemand: number;
  utilizationPercent: number;
  utilizationStatus: UtilizationStatus;
  recommendToAdd: number;
  customers: PoolCustomerSummary[];
}

/** green under 80%, yellow 80–100%, red over 100%. */
export function utilizationStatusFor(percent: number): UtilizationStatus {
  if (percent > 100) return "red";
  if (percent >= 80) return "yellow";
  return "green";
}

export function summarizePoolCapacity(input: {
  mailboxes: PoolCapacityMailbox[];
  campaigns: PoolCapacityCampaign[];
  now?: Date;
}): PoolCapacitySummary {
  const now = input.now ?? new Date();
  const effectiveCaps = new Map<string, number>();
  let totalCapacity = 0;
  for (const m of input.mailboxes) {
    const cap = senderDailyCap(m, HARD_MAX_PER_SENDER_PER_DAY, now);
    effectiveCaps.set(m.id, cap);
    if (m.status === "active") totalCapacity += cap;
  }

  const totalDemand = input.campaigns.reduce((sum, c) => sum + Math.max(0, Number(c.dailyLimit) || 0), 0);
  const utilizationPercent = Math.round((100 * totalDemand) / Math.max(1, totalCapacity));
  const utilizationStatus = utilizationStatusFor(utilizationPercent);
  const recommendToAdd =
    totalDemand > totalCapacity ? Math.ceil((totalDemand - totalCapacity) / HARD_MAX_PER_SENDER_PER_DAY) : 0;

  const byUser = new Map<string, PoolCustomerSummary>();
  for (const c of input.campaigns) {
    const row = byUser.get(c.userId) ?? {
      userId: c.userId,
      ownerEmail: c.ownerEmail,
      campaigns: 0,
      dailyLimit: 0,
      allocatedToday: 0,
      sentToday: 0,
      starved: false,
    };
    row.campaigns += 1;
    row.dailyLimit += Math.max(0, Number(c.dailyLimit) || 0);
    row.allocatedToday += Math.max(0, Number(c.allocatedToday) || 0);
    row.sentToday += Math.max(0, Number(c.sentToday) || 0);
    byUser.set(c.userId, row);
  }
  const customers = [...byUser.values()]
    .map((r) => ({ ...r, starved: utilizationStatus === "red" && r.allocatedToday < r.dailyLimit }))
    .sort((a, b) => b.dailyLimit - a.dailyLimit || a.ownerEmail.localeCompare(b.ownerEmail));

  return {
    effectiveCaps,
    totalCapacity,
    totalDemand,
    utilizationPercent,
    utilizationStatus,
    recommendToAdd,
    customers,
  };
}

/* ─── One customer's view of the pool ─────────────────────────────────── */

export interface CustomerPoolShare {
  /** Pool mailboxes in service right now. */
  activeMailboxes: number;
  /** What all of them can send today (ramp included). */
  totalDailyCapacity: number;
  /**
   * Emails a day this customer can expect under fair sharing. When the
   * estimate is for one campaign (`forCampaign`), that campaign's part of it.
   */
  availableToYou: number;
  /** Set when availableToYou is one campaign's part of the customer's share. */
  forCampaign?: boolean;
  /** This customer's running pool campaigns that split their share (with forCampaign). */
  yourCampaigns?: number;
  /** The customer's whole share (with forCampaign). */
  customerShare?: number;
}

/**
 * Estimate what one customer can send a day from the shared pool. The engine
 * (allocatePoolCapacity) hands slots round-robin by customer, so the result is
 * max-min fair: customers asking for less than an equal split keep what they
 * asked for, and the rest is split evenly. The customer is assumed to want as
 * much as they can get; others are counted at their campaigns' daily limits.
 */
export function estimateCustomerPoolShare(input: {
  mailboxes: PoolCapacityMailbox[];
  /** Running pool campaigns (any customer): owner and daily limit. */
  campaigns: Array<{ id?: string; userId: string; dailyLimit: number }>;
  userId: string;
  /**
   * Estimate for this one campaign: the engine splits a customer's slots
   * round-robin across their running campaigns, so each gets an even part.
   */
  campaignId?: string;
  now?: Date;
}): CustomerPoolShare {
  const now = input.now ?? new Date();
  let totalDailyCapacity = 0;
  let activeMailboxes = 0;
  for (const m of input.mailboxes) {
    // Paused mailboxes and ones whose replies can't be read take no new outreach.
    if (m.status !== "active" || mailboxRepliesUnreadable(m)) continue;
    activeMailboxes += 1;
    totalDailyCapacity += Math.max(0, senderDailyCap(m, HARD_MAX_PER_SENDER_PER_DAY, now));
  }

  const others = new Map<string, number>();
  for (const c of input.campaigns) {
    if (c.userId === input.userId) continue;
    others.set(c.userId, (others.get(c.userId) ?? 0) + Math.max(0, Math.floor(Number(c.dailyLimit) || 0)));
  }
  const demands = [...others.values()].filter((d) => d > 0).sort((a, b) => a - b);

  // Water-fill: settle the smallest asks first; the customer takes an equal share of what is left.
  let remaining = totalDailyCapacity;
  let sharers = demands.length + 1;
  for (const d of demands) {
    if (d > remaining / sharers) break;
    remaining -= d;
    sharers -= 1;
  }
  const availableToYou = Math.max(0, Math.floor(remaining / sharers));
  if (!input.campaignId) return { activeMailboxes, totalDailyCapacity, availableToYou };

  const own = new Set(input.campaigns.filter((c) => c.userId === input.userId && c.id).map((c) => c.id!));
  own.add(input.campaignId);
  return {
    activeMailboxes,
    totalDailyCapacity,
    availableToYou: Math.floor(availableToYou / own.size),
    forCampaign: true,
    yourCampaigns: own.size,
    customerShare: availableToYou,
  };
}

export interface PoolCapacityMessage {
  tone: "info" | "warning";
  /** What the pool can send for this customer right now. */
  text: string;
  /** What to expect when the chosen number is above that, else null. */
  expect: string | null;
  /** Emails a day the forecast should assume. */
  expectedPerDay: number;
}

/** Plain words for the emails-per-day control. Keeps the customer's choice; only the forecast changes. */
export function poolCapacityMessage(share: CustomerPoolShare, chosenPerDay: number): PoolCapacityMessage {
  const chosen = Math.max(0, Math.floor(chosenPerDay || 0));
  if (share.activeMailboxes === 0 || share.totalDailyCapacity === 0) {
    return {
      tone: "warning",
      text: "Sending is paused until we add mailboxes to our pool.",
      expect: `Your choice of ${chosen.toLocaleString("en-US")} a day is saved, and sending starts on its own once they are added.`,
      expectedPerDay: 0,
    };
  }
  if (share.availableToYou === 0) {
    return {
      tone: "warning",
      text: "Our mailboxes are full right now, so sending waits for room.",
      expect: `Your choice of ${chosen.toLocaleString("en-US")} a day is saved, and sending starts on its own as room opens up.`,
      expectedPerDay: 0,
    };
  }
  const x = share.availableToYou.toLocaleString("en-US");
  const split =
    share.forCampaign && (share.yourCampaigns ?? 1) > 1
      ? ` Your ${share.yourCampaigns} running campaigns share about ${(share.customerShare ?? 0).toLocaleString("en-US")} a day.`
      : "";
  const text = `Right now our mailboxes can send about ${x} emails a day for ${share.forCampaign ? "this campaign" : "you"}.${split}`;
  if (chosen <= share.availableToYou) return { tone: "info", text, expect: null, expectedPerDay: chosen };
  return {
    tone: "warning",
    text,
    expect: `Expect about ${x} a day until more mailboxes are added. We keep your choice of ${chosen.toLocaleString("en-US")} and send more as room opens up.`,
    expectedPerDay: share.availableToYou,
  };
}
