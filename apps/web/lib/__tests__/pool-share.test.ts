import { describe, expect, it } from "vitest";
import { allocatePoolCapacity } from "../../../../packages/email-engine/src/pool-allocation";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "@smartreach/database";
import { estimateCustomerPoolShare, poolCapacityMessage } from "../pool-capacity";
import { loadCustomerPoolShare } from "../pool-share";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const box = (id: string, over: Partial<{ status: string; dailyLimit: number; createdAt: string | null }> = {}) => ({
  id,
  status: "active",
  dailyLimit: 30,
  createdAt: daysAgo(30),
  ...over,
});
const boxes = (n: number) => Array.from({ length: n }, (_, i) => box(`m${i}`));

describe("estimateCustomerPoolShare", () => {
  it("gives a customer alone the whole pool: 10 mailboxes × 30", () => {
    const s = estimateCustomerPoolShare({ mailboxes: boxes(10), campaigns: [], userId: "me", now: NOW });
    expect(s).toEqual({ activeMailboxes: 10, totalDailyCapacity: 300, availableToYou: 300 });
  });

  it("counts only active mailboxes, with the new-mailbox ramp", () => {
    const s = estimateCustomerPoolShare({
      mailboxes: [box("a"), box("new", { createdAt: NOW.toISOString() }), box("p", { status: "paused" })],
      campaigns: [],
      userId: "me",
      now: NOW,
    });
    expect(s.activeMailboxes).toBe(2);
    expect(s.totalDailyCapacity).toBe(40);
  });

  it("splits evenly with customers who want more than an equal share", () => {
    const s = estimateCustomerPoolShare({
      mailboxes: boxes(10),
      campaigns: [
        { userId: "a", dailyLimit: 500 },
        { userId: "b", dailyLimit: 500 },
      ],
      userId: "me",
      now: NOW,
    });
    expect(s.availableToYou).toBe(100);
  });

  it("leaves small asks whole and gives the rest out evenly", () => {
    const s = estimateCustomerPoolShare({
      mailboxes: boxes(10),
      campaigns: [
        { userId: "a", dailyLimit: 30 },
        { userId: "b", dailyLimit: 500 },
      ],
      userId: "me",
      now: NOW,
    });
    // 300 − 30 = 270 split between b and me.
    expect(s.availableToYou).toBe(135);
  });

  it("adds up one customer's campaigns and ignores the customer's own", () => {
    const s = estimateCustomerPoolShare({
      mailboxes: boxes(4),
      campaigns: [
        { userId: "a", dailyLimit: 20 },
        { userId: "a", dailyLimit: 20 },
        { userId: "me", dailyLimit: 500 },
      ],
      userId: "me",
      now: NOW,
    });
    // a asks 40 of 120 (under an equal 60): me gets 80.
    expect(s.availableToYou).toBe(80);
  });

  it("is 0 with no mailboxes in service", () => {
    const s = estimateCustomerPoolShare({
      mailboxes: [box("p", { status: "paused" })],
      campaigns: [{ userId: "a", dailyLimit: 60 }],
      userId: "me",
      now: NOW,
    });
    expect(s).toEqual({ activeMailboxes: 0, totalDailyCapacity: 0, availableToYou: 0 });
  });

  it("matches the engine's allocator (within one email) when the customer asks for the maximum", () => {
    const cases: Array<{ boxes: number; others: Array<[string, number]> }> = [
      { boxes: 10, others: [] },
      { boxes: 10, others: [["a", 500], ["b", 60]] },
      { boxes: 7, others: [["a", 30], ["b", 45], ["c", 500]] },
      { boxes: 3, others: [["a", 500], ["a", 500], ["b", 10]] },
    ];
    for (const c of cases) {
      const mailboxes = boxes(c.boxes);
      const ids = mailboxes.map((m) => m.id);
      const campaigns = c.others.map(([userId, dailyLimit]) => ({ userId, dailyLimit }));
      const alloc = allocatePoolCapacity(
        mailboxes.map((m) => ({ id: m.id, capacity: 30 })),
        [
          ...campaigns.map((x, i) => ({ id: `c${i}`, userId: x.userId, senderIds: ids, demand: x.dailyLimit })),
          { id: "mine", userId: "me", senderIds: ids, demand: 500 },
        ],
      );
      const engine = [...(alloc.get("mine")?.values() ?? [])].reduce((a, b) => a + b, 0);
      const est = estimateCustomerPoolShare({ mailboxes, campaigns, userId: "me", now: NOW }).availableToYou;
      expect(Math.abs(engine - est)).toBeLessThanOrEqual(1);
      expect(est).toBeLessThanOrEqual(engine);
    }
  });
});

describe("poolCapacityMessage", () => {
  const share = { activeMailboxes: 10, totalDailyCapacity: 300, availableToYou: 120 };

  it("only states the capacity when the choice fits", () => {
    const m = poolCapacityMessage(share, 60);
    expect(m.text).toBe("Right now our mailboxes can send about 120 emails a day for you.");
    expect(m.expect).toBeNull();
    expect(m.expectedPerDay).toBe(60);
  });

  it("says what to expect when the choice is above it, and keeps the choice", () => {
    const m = poolCapacityMessage(share, 500);
    expect(m.tone).toBe("warning");
    expect(m.expect).toContain("Expect about 120 a day until more mailboxes are added.");
    expect(m.expect).toContain("We keep your choice of 500");
    expect(m.expectedPerDay).toBe(120);
  });

  it("says sending is paused with no mailboxes", () => {
    const m = poolCapacityMessage({ activeMailboxes: 0, totalDailyCapacity: 0, availableToYou: 0 }, 60);
    expect(m.text).toBe("Sending is paused until we add mailboxes to our pool.");
    expect(m.expectedPerDay).toBe(0);
  });

  it("says the mailboxes are full when there is room for nobody else", () => {
    const m = poolCapacityMessage({ activeMailboxes: 2, totalDailyCapacity: 60, availableToYou: 0 }, 60);
    expect(m.text).toBe("Our mailboxes are full right now, so sending waits for room.");
    expect(m.expect).toContain("Your choice of 60 a day is saved");
    expect(m.expectedPerDay).toBe(0);
  });
});

describe("what really goes out", () => {
  it("leaves out mailboxes whose replies can't be read (no new outreach goes from them)", () => {
    const s = estimateCustomerPoolShare({
      mailboxes: [
        ...boxes(6),
        ...[1, 2, 3, 4].map((i) => ({ ...box(`bad${i}`), imapHost: "imap.example.com", imapStatus: "failed" })),
        { ...box("untested"), imapHost: "imap.example.com", imapStatus: "untested" },
      ],
      campaigns: [],
      userId: "me",
      now: NOW,
    });
    expect(s.activeMailboxes).toBe(7);
    expect(s.totalDailyCapacity).toBe(210);
  });

  it("splits a customer's share across their running campaigns for one run's page", () => {
    const s = estimateCustomerPoolShare({
      mailboxes: boxes(10),
      campaigns: [
        { id: "c1", userId: "me", dailyLimit: 500 },
        { id: "c2", userId: "me", dailyLimit: 500 },
        { id: "x", userId: "a", dailyLimit: 500 },
      ],
      userId: "me",
      campaignId: "c1",
      now: NOW,
    });
    expect(s).toMatchObject({ availableToYou: 75, forCampaign: true, yourCampaigns: 2, customerShare: 150 });
    // A run not yet running counts as one more campaign.
    const fresh = estimateCustomerPoolShare({
      mailboxes: boxes(10),
      campaigns: [{ id: "c1", userId: "me", dailyLimit: 500 }],
      userId: "me",
      campaignId: "new",
      now: NOW,
    });
    expect(fresh).toMatchObject({ availableToYou: 150, yourCampaigns: 2 });
  });
});

describe("loadCustomerPoolShare", () => {
  it("reads pool mailboxes with reply health, and running pool campaigns with EXISTS (no join fan-out)", async () => {
    const real: any = drizzle.mock({ schema });
    const queries: string[] = [];
    const results = [
      [{ ...box("m1"), imapHost: "", imapStatus: "untested" }],
      [
        { id: "c1", userId: "me", dailyLimit: 60 },
        { id: "o1", userId: "a", dailyLimit: 500 },
      ],
    ];
    const db: any = {
      select: (cols: any) => {
        const qb = real.select(cols);
        const wrap = (q: any): any =>
          new Proxy(q, {
            get(t, p) {
              if (p === "then") {
                queries.push(t.toSQL().sql);
                const r = Promise.resolve(results.shift() ?? []);
                return r.then.bind(r);
              }
              const v = t[p];
              return typeof v === "function" ? (...a: any[]) => wrap(v.apply(t, a)) : v;
            },
          });
        return wrap(qb);
      },
    };
    const s = await loadCustomerPoolShare(db, "me", { campaignId: "c1", now: NOW });
    expect(queries[0]).toContain('"imap_status"');
    expect(queries[0]).toMatch(/"is_system_pool" = \$\d+ and "sender_accounts"\."deleted_at" is null/);
    expect(queries[1]).toContain("exists (select 1 from");
    expect(queries[1]).not.toMatch(/inner join/i);
    expect(queries[1]).toMatch(/"campaigns"\."status" = \$\d+/);
    expect(queries[1]).toContain('"campaigns"."deleted_at" is null');
    expect(s).toMatchObject({ activeMailboxes: 1, forCampaign: true });
  });
});
