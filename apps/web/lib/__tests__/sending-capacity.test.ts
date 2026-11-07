import { describe, expect, it, vi } from "vitest";
import {
  capacityLabel,
  effectiveDailyCapacity,
  HARD_MAX_PER_SENDER_PER_DAY,
  MAILBOX_LIMIT_NOTE,
} from "@smartreach/shared";
import { HARD_MAX_PER_SENDER_PER_DAY as ENGINE_MAX, senderDailyCap } from "@smartreach/email-engine/rotation";
import { loadCampaignCapacity } from "../sending-capacity";

const NOW = new Date("2026-11-06T12:00:00Z");
const OLD = "2026-01-01T00:00:00Z";
const own = (over: Record<string, unknown> = {}) => ({ status: "active", dailyLimit: 50, createdAt: OLD, ...over });
const pool = (over: Record<string, unknown> = {}) => own({ isSystemPool: true, ...over });

describe("effectiveDailyCapacity", () => {
  it("two mature mailboxes cap a 500/day campaign at 60", () => {
    expect(effectiveDailyCapacity({ campaignDailyLimit: 500, mailboxes: [own(), own()], now: NOW })).toEqual({
      perDay: 60,
      limitedBy: "mailboxes",
      mailboxTotal: 60,
    });
  });

  it("a low campaign limit is the limit", () => {
    expect(effectiveDailyCapacity({ campaignDailyLimit: 20, mailboxes: [own(), own()], now: NOW })).toMatchObject({
      perDay: 20,
      limitedBy: "campaign",
    });
  });

  it("pool mailboxes are split between the accounts using them", () => {
    expect(
      effectiveDailyCapacity({ campaignDailyLimit: 500, mailboxes: [pool(), pool()], poolUsers: 3, now: NOW }),
    ).toMatchObject({ perDay: 20, limitedBy: "shared-pool" });
  });

  it("a mailbox added today counts 10 (ramp)", () => {
    const fresh = own({ createdAt: NOW.toISOString() });
    expect(effectiveDailyCapacity({ campaignDailyLimit: 500, mailboxes: [fresh], now: NOW }).perDay).toBe(10);
  });

  it("paused and failed mailboxes count 0", () => {
    const r = effectiveDailyCapacity({
      campaignDailyLimit: 500,
      mailboxes: [own({ status: "paused" }), own({ status: "failed" })],
      now: NOW,
    });
    expect(r).toMatchObject({ perDay: 0, mailboxTotal: 0, limitedBy: "mailboxes" });
  });

  it("the per-mailbox campaign setting lowers each mailbox", () => {
    expect(
      effectiveDailyCapacity({ campaignDailyLimit: 500, perMailboxLimit: 12, mailboxes: [own(), own()], now: NOW }).perDay,
    ).toBe(24);
  });
});

describe("capacityLabel", () => {
  it("names the limit that applies", () => {
    expect(capacityLabel({ perDay: 60, limitedBy: "mailboxes" })).toBe("Up to 60 a day (limited by its mailboxes)");
    expect(capacityLabel({ perDay: 20, limitedBy: "campaign" })).toBe("Up to 20 a day (limited by your campaign limit)");
    expect(capacityLabel({ perDay: 20, limitedBy: "shared-pool" })).toBe(
      "Up to 20 a day (limited by its share of the shared mailboxes)",
    );
    expect(MAILBOX_LIMIT_NOTE).toContain("30");
  });
});

describe("engine uses the same caps", () => {
  it("rotation re-exports the shared ceiling and ramp", () => {
    expect(ENGINE_MAX).toBe(HARD_MAX_PER_SENDER_PER_DAY);
    expect(senderDailyCap({ dailyLimit: 500 }, 500, NOW)).toBe(30);
  });
});

describe("loadCampaignCapacity", () => {
  function db(n: number | Error) {
    const c: any = {};
    for (const m of ["from", "innerJoin", "where"]) c[m] = () => c;
    c.then = (res: any, rej: any) => (n instanceof Error ? Promise.reject(n) : Promise.resolve([{ n }])).then(res, rej);
    return { select: vi.fn(() => c) } as any;
  }

  it("splits the pool by the accounts sending from it", async () => {
    const d = db(3);
    const cap = await loadCampaignCapacity(d, { dailyLimit: 500, maxEmailsPerSenderPerDay: 30 }, [pool(), pool()], NOW);
    expect(cap).toMatchObject({ perDay: 20, limitedBy: "shared-pool" });
  });

  it("skips the count without pool mailboxes and survives a failed count", async () => {
    const d = db(5);
    await loadCampaignCapacity(d, { dailyLimit: 500, maxEmailsPerSenderPerDay: 30 }, [own()], NOW);
    expect(d.select).not.toHaveBeenCalled();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await loadCampaignCapacity(db(new Error("down")), { dailyLimit: 500, maxEmailsPerSenderPerDay: 30 }, [pool()], NOW);
    expect(failed.perDay).toBe(30);
  });
});
