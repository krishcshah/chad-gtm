import { describe, expect, it } from "vitest";
import { summarizePoolCapacity, utilizationStatusFor, type PoolCapacityCampaign } from "../pool-capacity";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const mailbox = (id: string, over: Partial<{ status: string; dailyLimit: number; createdAt: string | null }> = {}) => ({
  id,
  status: "active",
  dailyLimit: 30,
  createdAt: daysAgo(30),
  ...over,
});

const campaign = (id: string, over: Partial<PoolCapacityCampaign> = {}): PoolCapacityCampaign => ({
  id,
  userId: "u1",
  ownerEmail: "one@example.com",
  name: id,
  dailyLimit: 30,
  sentToday: 0,
  allocatedToday: 30,
  ...over,
});

describe("summarizePoolCapacity", () => {
  it("counts the warm-up ramp: a mailbox added today gives 10, one 5 days old gives 30", () => {
    const s = summarizePoolCapacity({
      mailboxes: [mailbox("new", { createdAt: NOW.toISOString() }), mailbox("old", { createdAt: daysAgo(5) })],
      campaigns: [],
      now: NOW,
    });
    expect(s.effectiveCaps.get("new")).toBe(10);
    expect(s.effectiveCaps.get("old")).toBe(30);
    expect(s.totalCapacity).toBe(40);
  });

  it("counts only active mailboxes toward capacity", () => {
    const s = summarizePoolCapacity({
      mailboxes: [mailbox("a"), mailbox("p", { status: "paused" }), mailbox("f", { status: "failed" })],
      campaigns: [],
      now: NOW,
    });
    expect(s.totalCapacity).toBe(30);
    expect(s.effectiveCaps.get("p")).toBe(30);
  });

  it("puts utilization in bands at 79/80/100/101 percent", () => {
    expect(utilizationStatusFor(79)).toBe("green");
    expect(utilizationStatusFor(80)).toBe("yellow");
    expect(utilizationStatusFor(100)).toBe("yellow");
    expect(utilizationStatusFor(101)).toBe("red");
    // 100 mailbox-capacity → demand maps 1:1 to percent.
    const boxes = [mailbox("a"), mailbox("b"), mailbox("c"), mailbox("d", { dailyLimit: 10 })];
    for (const [demand, status] of [
      [79, "green"],
      [80, "yellow"],
      [100, "yellow"],
      [101, "red"],
    ] as const) {
      const s = summarizePoolCapacity({ mailboxes: boxes, campaigns: [campaign("c", { dailyLimit: demand })], now: NOW });
      expect(s.totalCapacity).toBe(100);
      expect(s.utilizationPercent).toBe(demand);
      expect(s.utilizationStatus).toBe(status);
    }
  });

  it("recommends 0 when demand fits and ceil(gap / 30) otherwise, with no floor of 30", () => {
    const fits = summarizePoolCapacity({ mailboxes: [mailbox("a")], campaigns: [campaign("c", { dailyLimit: 30 })], now: NOW });
    expect(fits.recommendToAdd).toBe(0);
    const over = summarizePoolCapacity({ mailboxes: [mailbox("a")], campaigns: [campaign("c", { dailyLimit: 31 })], now: NOW });
    expect(over.recommendToAdd).toBe(1);
    const more = summarizePoolCapacity({ mailboxes: [mailbox("a")], campaigns: [campaign("c", { dailyLimit: 100 })], now: NOW });
    expect(more.recommendToAdd).toBe(3); // gap 70 → ceil(70/30)
    const empty = summarizePoolCapacity({ mailboxes: [], campaigns: [], now: NOW });
    expect(empty.recommendToAdd).toBe(0);
    expect(empty.utilizationStatus).toBe("green");
  });

  it("groups campaigns per owner and flags starved customers only when over capacity", () => {
    const campaigns = [
      campaign("c1", { userId: "u1", ownerEmail: "one@example.com", dailyLimit: 30, allocatedToday: 20, sentToday: 5 }),
      campaign("c2", { userId: "u1", ownerEmail: "one@example.com", dailyLimit: 20, allocatedToday: 10, sentToday: 3 }),
      campaign("c3", { userId: "u2", ownerEmail: "two@example.com", dailyLimit: 10, allocatedToday: 10, sentToday: 10 }),
    ];
    const over = summarizePoolCapacity({ mailboxes: [mailbox("a")], campaigns, now: NOW });
    expect(over.utilizationStatus).toBe("red");
    expect(over.customers).toEqual([
      {
        userId: "u1",
        ownerEmail: "one@example.com",
        campaigns: 2,
        dailyLimit: 50,
        allocatedToday: 30,
        sentToday: 8,
        starved: true,
      },
      {
        userId: "u2",
        ownerEmail: "two@example.com",
        campaigns: 1,
        dailyLimit: 10,
        allocatedToday: 10,
        sentToday: 10,
        starved: false,
      },
    ]);

    // Same allocation but the pool has room: nobody is "starved".
    const fits = summarizePoolCapacity({
      mailboxes: [mailbox("a"), mailbox("b"), mailbox("c")],
      campaigns,
      now: NOW,
    });
    expect(fits.utilizationStatus).not.toBe("red");
    expect(fits.customers.every((c) => !c.starved)).toBe(true);
  });
});
