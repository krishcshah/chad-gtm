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
