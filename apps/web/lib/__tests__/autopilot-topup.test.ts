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

import { topUpAutopilotAudiences } from "../autopilot-topup";
import { newAudienceState } from "../autopilot-audience";

function fakeDb(campaigns: any[], lockOk = true) {
  const updates: Array<{ set: any }> = [];
  const db: any = {
    execute: vi.fn(async () => ({ rows: [{ ok: lockOk }] })),
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => campaigns }) }) }),
    update: () => ({
      set: (set: any) => ({
        where: async () => {
          updates.push({ set });
        },
      }),
    }),
  };
  return { db, updates };
}

const state = () =>
  newAudienceState({ industries: ["Logistics"], targetTitles: ["coo"], countries: ["United States"], count: () => 100 });

const campaign = (over: Partial<any> = {}) => ({
  campaignId: "c1",
  listId: "l1",
  userId: "u1",
  workspaceId: "w1",
  dailyLimit: 60,
  runId: "r1",
  audience: state(),
  ...over,
});

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("topUpAutopilotAudiences", () => {
  it("does nothing when another process holds the lock", async () => {
    const { db } = fakeDb([campaign()], false);
    expect((await topUpAutopilotAudiences(db)).skipped).toBe("locked");
    expect(mocks.waiting).not.toHaveBeenCalled();
  });

  it("leaves a campaign alone while about a week of new leads is waiting", async () => {
    mocks.waiting.mockResolvedValue(100); // 60/day → 20 new leads/day → low = 100
    const { db } = fakeDb([campaign()]);
    const r = await topUpAutopilotAudiences(db);
    expect(r).toMatchObject({ checked: 1, refilled: 0 });
    expect(mocks.pick).not.toHaveBeenCalled();
  });

  it("refills a low campaign in priority order and keeps the cursor", async () => {
    mocks.waiting.mockResolvedValue(10);
    const next = { ...state(), added: 2 };
    mocks.pick.mockResolvedValue({ picked: [{ lead: {}, tier: 1 }, { lead: {}, tier: 2 }], state: next });
    mocks.insert.mockResolvedValue(new Map([["a", 1], ["b", 2]]));
    const { db, updates } = fakeDb([campaign()]);
    const r = await topUpAutopilotAudiences(db);
    expect(mocks.pick.mock.calls[0]![1]).toBe(200); // two weeks of new leads
    expect(mocks.snapshot).toHaveBeenCalledWith(db, "c1", "l1", { onlyMissing: true });
    expect(mocks.priorities).toHaveBeenCalled();
    expect(updates.some((u) => u.set.audience === next)).toBe(true);
    expect(r).toMatchObject({ refilled: 1, added: 2, closed: 0 });
  });

  it("closes the audience once every tier is used up", async () => {
    mocks.waiting.mockResolvedValue(0);
    mocks.pick.mockResolvedValue({ picked: [], state: { ...state(), exhausted: true } });
    const { db, updates } = fakeDb([campaign()]);
    const r = await topUpAutopilotAudiences(db);
    expect(updates.some((u) => u.set.audienceOpen === false)).toBe(true);
    expect(r.closed).toBe(1);
  });

  it("closes an audience it can't read instead of retrying forever", async () => {
    const { db, updates } = fakeDb([campaign({ audience: {} })]);
    await topUpAutopilotAudiences(db);
    expect(updates.some((u) => u.set.audienceOpen === false)).toBe(true);
  });
});
