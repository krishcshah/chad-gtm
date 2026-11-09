import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  waiting: vi.fn(),
  pick: vi.fn(),
  insert: vi.fn(),
  priorities: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../campaign-drafts", () => ({ ensureCampaignLeadSnapshot: mocks.snapshot }));
vi.mock("../gtm-launch", () => ({
  directoryLeadContactFields: () => ({}),
  launchDirectoryAccess: async () => "none",
  toContactableLeads: (rows: unknown[]) => rows,
}));
vi.mock("../autopilot-audience", async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    waitingNewLeads: mocks.waiting,
    pickNextLeads: mocks.pick,
    insertAudienceLeads: mocks.insert,
    applyPriorities: mocks.priorities,
    audienceGates: () => ({ contactable: (r: unknown[]) => r, blocked: async () => new Set() }),
  };
});

import { schema } from "@smartreach/database";
import { topUpAutopilotAudiences, type TopUpOptions } from "../autopilot-topup";
import { newAudienceState, type AudienceState } from "../autopilot-audience";

/** matched: whether a guarded UPDATE finds its row (.returning() gives [] when not). */
function fakeDb(campaigns: any[], lockOk = true, matched: (table: unknown, set: any) => boolean = () => true) {
  const updates: Array<{ table: unknown; set: any }> = [];
  const db: any = {
    execute: vi.fn(async () => ({ rows: [{ ok: lockOk }] })),
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => campaigns }) }) }),
    update: (table: unknown) => ({
      set: (set: any) => ({
        where: () => {
          updates.push({ table, set });
          const done: any = Promise.resolve(undefined);
          done.returning = async () => (matched(table, set) ? [{ id: "x" }] : []);
          return done;
        },
      }),
    }),
  };
  const audienceWrites = () => updates.filter((u) => u.table === schema.chadGtmRuns && u.set.audience).map((u) => u.set.audience as AudienceState);
  const campaignWrites = () => updates.filter((u) => u.table === schema.campaigns).map((u) => u.set);
  return { db, updates, audienceWrites, campaignWrites };
}

const state = (over: Partial<AudienceState> = {}): AudienceState => ({
  ...newAudienceState({ industries: ["Logistics"], targetTitles: ["coo"], countries: ["United States"], fingerprint: "fp1" }),
  ...over,
});

const campaign = (over: Partial<any> = {}) => ({
  campaignId: "c1",
  listId: "l1",
  userId: "u1",
  workspaceId: "w1",
  dailyLimit: 60,
  status: "running",
  audienceOpen: true,
  runId: "r1",
  audience: state(),
  ...over,
});

const opts = (over: Partial<TopUpOptions> = {}): TopUpOptions => ({
  fingerprint: () => "fp1",
  count: () => 1,
  newRowsMatch: async () => true,
  ...over,
});

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("topUpAutopilotAudiences", () => {
  it("never overwrites a rescan requested while the pass was running", async () => {
    // Regression: saveAudience wrote back the fingerprint read at the start of the pass.
    mocks.waiting.mockResolvedValue(10);
    mocks.pick.mockResolvedValue({ picked: [], state: { ...state(), added: 2 }, scanned: 0 });
    const { db, updates } = fakeDb([campaign()], true, (table) => table !== schema.chadGtmRuns);
    const count = vi.fn(() => 1);
    const r = await topUpAutopilotAudiences(db, opts({ count }));
    // The save was tried once, guarded on the fingerprint it read, and refused.
    expect(updates.filter((u) => u.table === schema.chadGtmRuns)).toHaveLength(1);
    expect(count).not.toHaveBeenCalled();
    expect(r.counted).toBe(0);
  });

  it("saves only when the stored fingerprint is still the one read", async () => {
    const { db } = fakeDb([campaign({ audience: { ...state(), countedAt: null } })]);
    const where = vi.fn();
    const origUpdate = db.update;
    db.update = (table: unknown) => {
      const u = origUpdate(table);
      return {
        set: (set: any) => {
          const w = u.set(set);
          return { where: (cond: unknown) => (where(table, cond), w.where(cond)) };
        },
      };
    };
    await topUpAutopilotAudiences(db, opts({ maxCounts: 1 }));
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const dialect = new PgDialect();
    const runWheres = where.mock.calls.filter((c) => c[0] === schema.chadGtmRuns).map((c) => dialect.sqlToQuery(c[1] as any));
    expect(runWheres.length).toBeGreaterThan(0);
    for (const q of runWheres) {
      expect(q.sql).toMatch(/coalesce\(.*->>'fingerprint', ''\) = \$\d/);
      expect(q.params).toContain("fp1");
    }
  });

  it("ends counting at the pass maximum and keeps the COUNTs that finished", async () => {
    let t = 0;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => t);
    try {
      const seen: Array<number | undefined> = [];
      // Each COUNT takes 2 minutes; the pass may count for 5.
      const count = vi.fn(async (_p: unknown, o?: { timeoutMs?: number }) => {
        seen.push(o?.timeoutMs);
        if ((o?.timeoutMs ?? Infinity) < 2 * 60_000) {
          t += o!.timeoutMs!;
          throw new Error("Directory query timed out after 60s.");
        }
        t += 2 * 60_000;
        return 7;
      });
      const pending = { ...state(), countedAt: null };
      const { db, audienceWrites } = fakeDb([
        campaign({ audience: pending }),
        campaign({ campaignId: "c2", runId: "r2", audience: pending }),
      ]);
      mocks.waiting.mockResolvedValue(1000);
      const r = await topUpAutopilotAudiences(db, opts({ count, countBudgetMs: 2 * 60_000, countPassMaxMs: 5 * 60_000 }));
      // 2 + 2 minutes, then the third COUNT gets only the 1 minute left and is stopped.
      expect(seen).toEqual([5 * 60_000, 3 * 60_000, 60_000]);
      expect(r.counted).toBe(0);
      const last = audienceWrites().at(-1)!;
      expect(last.countProgress).toEqual({ p1: 7, all: 7 });
      // Not a failure: no backoff.
      expect(last.countFailures).toBeUndefined();
      // The second audience was not started (the budget was used).
      expect(count).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
  });

  it("does nothing when another process holds the lock", async () => {
    const { db } = fakeDb([campaign()], false);
    expect((await topUpAutopilotAudiences(db, opts())).skipped).toBe("locked");
    expect(mocks.waiting).not.toHaveBeenCalled();
  });

  it("leaves a campaign alone while about a week of new leads is waiting", async () => {
    mocks.waiting.mockResolvedValue(100); // 60/day → 20 new leads/day → low = 100
    const { db } = fakeDb([campaign()]);
    const r = await topUpAutopilotAudiences(db, opts({ maxCounts: 0 }));
    expect(r).toMatchObject({ checked: 1, refilled: 0 });
    expect(mocks.pick).not.toHaveBeenCalled();
  });

  it("refills a low campaign in priority order and keeps the cursor", async () => {
    mocks.waiting.mockResolvedValue(10);
    const next = { ...state(), added: 2 };
    mocks.pick.mockResolvedValue({ picked: [{ lead: {}, tier: 1 }, { lead: {}, tier: 2 }], state: next, scanned: 2 });
    mocks.insert.mockResolvedValue(new Map([["a", 1], ["b", 2]]));
    const { db, audienceWrites } = fakeDb([campaign()]);
    const r = await topUpAutopilotAudiences(db, opts({ maxCounts: 0 }));
    expect(mocks.pick.mock.calls[0]![1]).toBe(200); // two weeks of new leads
    expect(mocks.snapshot).toHaveBeenCalledWith(db, "c1", "l1", { onlyMissing: true });
    expect(mocks.priorities).toHaveBeenCalled();
    expect(audienceWrites()[0]).toBe(next);
    expect(r).toMatchObject({ refilled: 1, added: 2, closed: 0 });
  });

  it("closes the audience once every tier is used up, and says why", async () => {
    mocks.waiting.mockResolvedValue(0);
    mocks.pick.mockResolvedValue({ picked: [], state: { ...state(), exhausted: true }, scanned: 0 });
    const { db, audienceWrites, campaignWrites } = fakeDb([campaign()]);
    const r = await topUpAutopilotAudiences(db, opts({ maxCounts: 0, now: () => new Date(7) }));
    expect(campaignWrites().some((s) => s.audienceOpen === false)).toBe(true);
    expect(audienceWrites()[0]).toMatchObject({ closedReason: "exhausted", closedAt: new Date(7).toISOString() });
    expect(r.closed).toBe(1);
  });

  it("closes an audience it can't read instead of retrying forever", async () => {
    const { db, campaignWrites } = fakeDb([campaign({ audience: {} })]);
    await topUpAutopilotAudiences(db, opts());
    expect(campaignWrites().some((s) => s.audienceOpen === false)).toBe(true);
  });

  it("counts pending tier totals in the background", async () => {
    mocks.waiting.mockResolvedValue(1000);
    const { db, audienceWrites } = fakeDb([campaign()]);
    const r = await topUpAutopilotAudiences(db, opts({ count: (p: any) => (p.jobTitles ? 2 : 10), now: () => new Date(9) }));
    expect(r.counted).toBe(1);
    const saved = audienceWrites().at(-1)!;
    expect(saved.countedAt).toBe(new Date(9).toISOString());
    expect(saved.tiers["1"].total + saved.tiers["2"].total + saved.tiers["3"].total).toBe(10);
  });

  it("keeps totals pending when a count fails, and backs off before trying again", async () => {
    mocks.waiting.mockResolvedValue(1000);
    const { db, audienceWrites } = fakeDb([campaign()]);
    const r = await topUpAutopilotAudiences(db, opts({ count: () => Promise.reject(new Error("timeout")), now: () => new Date(1000) }));
    expect(r.counted).toBe(0);
    const failed = audienceWrites()[0]!;
    expect(failed).toMatchObject({ countedAt: null, countFailures: 1, countAttemptAt: new Date(1000).toISOString() });
    // Five minutes later: still backing off (ten minutes after one failure).
    const count = vi.fn(() => 1);
    const again = fakeDb([campaign({ audience: failed })]);
    expect((await topUpAutopilotAudiences(again.db, opts({ count, now: () => new Date(1000 + 5 * 60_000) }))).counted).toBe(0);
    expect(count).not.toHaveBeenCalled();
    const later = fakeDb([campaign({ audience: failed })]);
    expect((await topUpAutopilotAudiences(later.db, opts({ count, now: () => new Date(1000 + 10 * 60_000) }))).counted).toBe(1);
    expect(later.audienceWrites().at(-1)!.countFailures).toBeUndefined();
  });

  it("counts the oldest attempt first and stops starting counts after the time budget", async () => {
    mocks.waiting.mockResolvedValue(1000);
    const tried = (industry: string, at: number) => ({ ...state(), industries: [industry], countAttemptAt: new Date(at).toISOString() });
    const rows = [
      campaign({ campaignId: "c-new", runId: "r-new", audience: tried("Newer", 9_000) }),
      campaign({ campaignId: "c-old", runId: "r-old", audience: tried("Older", 1_000) }),
    ];
    const { db, audienceWrites } = fakeDb(rows);
    const r = await topUpAutopilotAudiences(db, opts({ maxCounts: 1, count: () => 1, now: () => new Date(20 * 60_000) }));
    expect(r.counted).toBe(1);
    expect(audienceWrites().filter((a) => a.countedAt).map((a) => a.industries[0])).toEqual(["Older"]);

    const budget = fakeDb(rows);
    const count = vi.fn(() => 1);
    expect((await topUpAutopilotAudiences(budget.db, opts({ count, countBudgetMs: 0 }))).counted).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });

  it("stamps the directory on an older audience without starting over", async () => {
    mocks.waiting.mockResolvedValue(1000);
    const old = { ...state(), fingerprint: undefined, tiers: { ...state().tiers, "3": { total: 0, cursor: 500, added: 3, exhausted: false } } };
    const { db, audienceWrites } = fakeDb([campaign({ audience: old })]);
    const r = await topUpAutopilotAudiences(db, opts({ maxCounts: 0 }));
    expect(r.rescanned).toBe(0);
    expect(audienceWrites()[0]).toMatchObject({ fingerprint: "fp1" });
    expect(audienceWrites()[0]!.tiers["3"].cursor).toBe(500);
  });

  describe("a new directory", () => {
    const used = () =>
      state({
        exhausted: true,
        closedReason: "exhausted",
        closedAt: "2026-11-01T00:00:00.000Z",
        tiers: {
          "1": { total: 1, cursor: 900, added: 1, exhausted: true },
          "2": { total: 1, cursor: 900, added: 1, exhausted: true },
          "3": { total: 1, cursor: 900, added: 1, exhausted: true },
        },
      });

    it("starts a running campaign's audience over and reopens it", async () => {
      mocks.waiting.mockResolvedValue(1000);
      const { db, audienceWrites, campaignWrites } = fakeDb([campaign({ audienceOpen: false, audience: used() })]);
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => "fp2", maxCounts: 0 }));
      expect(r).toMatchObject({ rescanned: 1, reopened: 1 });
      expect(campaignWrites()).toContainEqual(expect.objectContaining({ audienceOpen: true }));
      const saved = audienceWrites()[0]!;
      expect(saved).toMatchObject({ fingerprint: "fp2", exhausted: false, countedAt: null });
      expect(saved.closedReason).toBeUndefined();
      expect(saved.tiers["1"]).toMatchObject({ cursor: 0, exhausted: false, added: 1 });
    });

    it("runs a completed campaign again only after finding someone new, added in the same pass", async () => {
      const order: string[] = [];
      mocks.pick.mockImplementation(async (s: AudienceState) => {
        order.push("pick");
        return { picked: [{ lead: {}, tier: 1 }], state: { ...s, added: 4 }, scanned: 1, eligible: 1 };
      });
      mocks.insert.mockImplementation(async () => {
        order.push("insert");
        return new Map([["a", 1]]);
      });
      const { db, updates, audienceWrites } = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: used() })]);
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => "fp2" }));
      expect(r).toMatchObject({ rescanned: 1, rechecked: 1, reopened: 1, added: 1 });
      // The new walk starts from row 0 against the campaign's own list (already-in-list gate).
      expect(mocks.pick.mock.calls[0]![0].tiers["1"]).toMatchObject({ cursor: 0, exhausted: false });
      expect(order).toEqual(["pick", "insert"]);
      expect(mocks.snapshot).toHaveBeenCalledWith(db, "c1", "l1", { onlyMissing: true });
      const camp = updates.find((u) => u.table === schema.campaigns)!.set;
      expect(camp).toMatchObject({ status: "running", audienceOpen: true, completedAt: null });
      expect(updates.some((u) => u.table === schema.chadGtmRuns && u.set.status === "active")).toBe(true);
      const saved = audienceWrites().at(-1)!;
      expect(saved).toMatchObject({ fingerprint: "fp2", added: 4 });
      expect(saved.closedReason).toBeUndefined();
    });

    it("leaves a completed campaign completed when the new directory has nobody new", async () => {
      mocks.pick.mockImplementation(async (s: AudienceState) => ({
        picked: [],
        state: { ...s, exhausted: true },
        scanned: 50,
        eligible: 50,
      }));
      const { db, campaignWrites, audienceWrites } = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: used() })]);
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => "fp2" }));
      expect(r).toMatchObject({ rechecked: 1, reopened: 0, added: 0 });
      expect(campaignWrites()).toHaveLength(0);
      expect(mocks.insert).not.toHaveBeenCalled();
      // Saved with the new directory, still closed for the same reason: not searched again next pass.
      expect(audienceWrites()[0]).toMatchObject({ fingerprint: "fp2", exhausted: true, closedReason: "exhausted" });
    });

    it("keeps searching a completed campaign over several passes without running it", async () => {
      const progress = (s: AudienceState) => ({ ...s, tiers: { ...s.tiers, "1": { ...s.tiers["1"], cursor: 5000 } } });
      mocks.pick.mockImplementation(async (s: AudienceState) => ({ picked: [], state: progress(s), scanned: 5000, eligible: 10 }));
      const first = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: used() })]);
      await topUpAutopilotAudiences(first.db, opts({ fingerprint: () => "fp2" }));
      const saved = first.audienceWrites()[0]!;
      expect(saved).toMatchObject({ exhausted: false, closedReason: "exhausted", fingerprint: "fp2" });
      expect(first.campaignWrites()).toHaveLength(0);
      // Next pass, same directory: the search continues from the saved cursor.
      mocks.pick.mockClear();
      const second = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: saved })]);
      const r = await topUpAutopilotAudiences(second.db, opts({ fingerprint: () => "fp2" }));
      expect(r.rechecked).toBe(1);
      expect(mocks.pick.mock.calls[0]![0].tiers["1"].cursor).toBe(5000);
    });

    it("leaves a paused campaign paused (its audience is ready for when it resumes)", async () => {
      const { db, campaignWrites } = fakeDb([campaign({ status: "paused", audienceOpen: false, audience: used() })]);
      await topUpAutopilotAudiences(db, opts({ fingerprint: () => "fp2", maxCounts: 0 }));
      expect(campaignWrites().every((s) => s.status === undefined)).toBe(true);
      expect(mocks.pick).not.toHaveBeenCalled();
    });

    it("keeps the cursors when rows were only added to the same file", async () => {
      mocks.waiting.mockResolvedValue(1000);
      const grown = { ...used(), countedAt: "2026-11-01T00:00:00.000Z", fingerprint: "1000|0|v1" };
      const { db, audienceWrites, campaignWrites } = fakeDb([campaign({ audienceOpen: false, audience: grown })]);
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => "1500|0|v1", maxCounts: 0 }));
      expect(r).toMatchObject({ grown: 1, rescanned: 0, reopened: 1 });
      expect(campaignWrites()).toContainEqual(expect.objectContaining({ audienceOpen: true }));
      const saved = audienceWrites()[0]!;
      expect(saved.tiers["2"]).toMatchObject({ cursor: 900, exhausted: false });
      // Totals stay on show; they are recounted when there is time.
      expect(saved).toMatchObject({ fingerprint: "1500|0|v1", countedAt: "2026-11-01T00:00:00.000Z", totalsStale: true });
      expect(saved.closedReason).toBeUndefined();
    });

    it("leaves the totals alone when none of the added rows can be in the audience", async () => {
      mocks.waiting.mockResolvedValue(1000);
      const grown = { ...used(), countedAt: "2026-11-01T00:00:00.000Z", fingerprint: "1000|0|v1" };
      const newRowsMatch = vi.fn(async () => false);
      const other = { ...grown, industries: ["Logistics"] };
      const { db, audienceWrites } = fakeDb([
        campaign({ audienceOpen: false, audience: grown }),
        campaign({ campaignId: "c2", runId: "r2", audienceOpen: false, audience: other }),
      ]);
      const count = vi.fn(() => 1);
      await topUpAutopilotAudiences(db, opts({ fingerprint: () => "1500|0|v1", newRowsMatch, count }));
      // One indexed check per targeting and old high id, from the old high id.
      expect(newRowsMatch).toHaveBeenCalledTimes(1);
      expect((newRowsMatch.mock.calls[0] as unknown[])[1]).toBe(1000);
      const saved = audienceWrites()[0]!;
      expect(saved.totalsStale).toBeUndefined();
      expect(saved.tiers["2"]).toMatchObject({ cursor: 900, exhausted: false });
      expect(count).not.toHaveBeenCalled();
    });

    it("starts over when a new build (new version) is swapped in", async () => {
      mocks.waiting.mockResolvedValue(1000);
      const old = { ...used(), fingerprint: "1000|0|v1" };
      const { db, audienceWrites } = fakeDb([campaign({ audienceOpen: false, audience: old })]);
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => "8000000|0|v2", maxCounts: 0 }));
      expect(r).toMatchObject({ grown: 0, rescanned: 1 });
      expect(audienceWrites()[0]!.tiers["2"].cursor).toBe(0);
    });

    it("does not rescan for a copied or restored file, or an older audience's file marker", async () => {
      // Stored before fingerprints left out the file's device:inode.
      const old = { ...used(), fingerprint: "1000|0||1:42" };
      const { db, audienceWrites, campaignWrites } = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: old })]);
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => "1000|0|", maxCounts: 0 }));
      expect(r).toMatchObject({ rescanned: 0, grown: 0, reopened: 0, rechecked: 0 });
      expect(campaignWrites()).toHaveLength(0);
      expect(audienceWrites()[0]).toMatchObject({ fingerprint: "1000|0|", exhausted: true });
      expect(audienceWrites()[0]!.tiers["2"].cursor).toBe(900);
    });

    it("does not reopen anything when rows are added but nobody new matches a completed campaign", async () => {
      mocks.pick.mockImplementation(async (s: AudienceState) => ({ picked: [], state: { ...s, exhausted: true }, scanned: 3, eligible: 0 }));
      const old = { ...used(), countedAt: "2026-11-01T00:00:00.000Z", fingerprint: "1000|0|v1" };
      const { db, campaignWrites, audienceWrites } = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: old })]);
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => "1500|0|v1" }));
      expect(r).toMatchObject({ grown: 1, reopened: 0, counted: 0 });
      // Only the new rows were read: the cursors were kept.
      expect(mocks.pick.mock.calls[0]![0].tiers["3"].cursor).toBe(900);
      expect(campaignWrites()).toHaveLength(0);
      expect(audienceWrites()[0]).toMatchObject({ closedReason: "exhausted", countedAt: "2026-11-01T00:00:00.000Z" });
    });

    it("does not reopen an audience whose campaign completed meanwhile, and keeps why it closed", async () => {
      mocks.waiting.mockResolvedValue(1000);
      const { db, audienceWrites, campaignWrites } = fakeDb(
        [campaign({ audienceOpen: false, audience: used() })],
        true,
        (table, set) => !(table === schema.campaigns && set.audienceOpen === true),
      );
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => "fp2", maxCounts: 0 }));
      expect(r.reopened).toBe(0);
      expect(campaignWrites()).toContainEqual(expect.objectContaining({ audienceOpen: true })); // tried, guarded on status
      expect(mocks.pick).not.toHaveBeenCalled();
      expect(audienceWrites()[0]).toMatchObject({ fingerprint: "fp2", closedReason: "exhausted" });
    });

    it("does not reopen a completed campaign when the directory is the same", async () => {
      const { db, campaignWrites } = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: used() })]);
      const r = await topUpAutopilotAudiences(db, opts());
      expect(r.reopened).toBe(0);
      expect(campaignWrites()).toHaveLength(0);
    });

    it("treats a requested rescan (scripts/reopen-autopilot-audiences.ts) like a new directory", async () => {
      mocks.waiting.mockResolvedValue(1000);
      const marked = { ...used(), fingerprint: "rescan-requested:2026-11-09T00:00:00.000Z" };
      const { db, audienceWrites } = fakeDb([campaign({ audienceOpen: false, audience: marked })]);
      const r = await topUpAutopilotAudiences(db, opts({ maxCounts: 0 }));
      expect(r).toMatchObject({ rescanned: 1, reopened: 1 });
      expect(audienceWrites()[0]).toMatchObject({ fingerprint: "fp1", exhausted: false });
    });

    it("does nothing to cursors when the directory can't be read", async () => {
      mocks.waiting.mockResolvedValue(1000);
      const { db, audienceWrites } = fakeDb([campaign({ audienceOpen: false, audience: used() })]);
      const r = await topUpAutopilotAudiences(db, opts({ fingerprint: () => null, maxCounts: 0 }));
      expect(r).toMatchObject({ rescanned: 0, reopened: 0 });
      expect(audienceWrites()).toHaveLength(0);
    });
  });

  it("v1: a completed size-filtered campaign keeps 'ran out' and runs again only when other sizes have someone new", async () => {
    const v1 = {
      version: 1,
      industries: ["Logistics"],
      targetTitles: ["coo"],
      countries: ["United States"],
      teamSizes: ["11-50"],
      tiers: {
        "1": { total: 1, cursor: 50, added: 1, exhausted: true },
        "2": { total: 1, cursor: 50, added: 1, exhausted: true },
        "3": { total: 1, cursor: 50, added: 1, exhausted: true },
      },
      added: 3,
      exhausted: true,
      countedAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    };
    // Pass 1: nobody new at the other sizes yet. It stays completed, and keeps why.
    mocks.pick.mockImplementation(async (s: AudienceState) => ({ picked: [], state: { ...s, exhausted: true }, scanned: 0, eligible: 0 }));
    const p1 = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: v1 })]);
    const r1 = await topUpAutopilotAudiences(p1.db, opts({ maxCounts: 0 }));
    expect(r1).toMatchObject({ rechecked: 1, reopened: 0 });
    expect(p1.campaignWrites()).toHaveLength(0);
    const saved = p1.audienceWrites()[0]!;
    expect(saved).toMatchObject({ version: 2, closedReason: "exhausted", closedAt: "2026-11-01T00:00:00.000Z" });

    // Pass 2, after a directory swap: someone new is found, so it runs again.
    mocks.pick.mockImplementation(async (s: AudienceState) => ({ picked: [{ lead: {}, tier: 3 }], state: s, scanned: 1, eligible: 1 }));
    mocks.insert.mockResolvedValue(new Map([["a", 3]]));
    const p2 = fakeDb([campaign({ status: "completed", audienceOpen: false, audience: saved })]);
    const r2 = await topUpAutopilotAudiences(p2.db, opts({ fingerprint: () => "fp9|0|v2", maxCounts: 0 }));
    expect(r2).toMatchObject({ rescanned: 1, rechecked: 1, reopened: 1, added: 1 });
    expect(p2.campaignWrites()).toContainEqual(expect.objectContaining({ status: "running" }));
  });

  it("reopens an older size-filtered audience: other company sizes are now contacted too", async () => {
    mocks.waiting.mockResolvedValue(1000);
    const v1 = {
      version: 1,
      industries: ["Logistics"],
      targetTitles: ["coo"],
      countries: ["United States"],
      teamSizes: ["11-50"],
      tiers: {
        "1": { total: 1, cursor: 50, added: 1, exhausted: true },
        "2": { total: 1, cursor: 50, added: 1, exhausted: true },
        "3": { total: 1, cursor: 50, added: 1, exhausted: true },
      },
      added: 3,
      exhausted: true,
      countedAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    };
    const { db, audienceWrites, campaignWrites } = fakeDb([campaign({ audienceOpen: false, audience: v1 })]);
    const r = await topUpAutopilotAudiences(db, opts({ maxCounts: 0 }));
    expect(r.reopened).toBe(1);
    expect(campaignWrites()).toContainEqual(expect.objectContaining({ audienceOpen: true }));
    expect(audienceWrites()[0]).toMatchObject({ version: 2, exhausted: false });
  });
});
