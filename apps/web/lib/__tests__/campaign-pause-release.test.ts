/**
 * #16: Pause / Archive take the campaign's queued emails out of the shared
 * send queue (releaseCampaignJobs), on Campaigns and on Autopilot.
 * #18: Autopilot Resume uses the same start check as Campaigns.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "client@example.com", role: "user", emailVerified: true } as Record<string, unknown>,
  selects: [] as any[][],
  updates: [] as any[],
  startError: null as string | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined })),
  headers: vi.fn(),
}));
vi.mock("../session", () => ({
  requireUser: vi.fn(async () => state.user),
  requireWorkspace: vi.fn(async () => ({ user: state.user, workspace: { id: "w1", isDefault: true } })),
  getSession: vi.fn(async () => ({ user: state.user })),
}));
vi.mock("../workspaces", () => ({
  ACTIVE_WORKSPACE_COOKIE: "ws",
  getActiveWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })),
  getFallbackWorkspace: vi.fn(() => ({ id: "w1", isDefault: true })),
}));
vi.mock("../db", () => {
  const chain = (result: any[]) => {
    const c: any = {};
    for (const m of ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "groupBy"]) c[m] = () => c;
    c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
    return c;
  };
  const write = () => () => {
    const entry: any = {};
    state.updates.push(entry);
    const c: any = {
      set: (v: any) => {
        entry.set = v;
        return c;
      },
      values: () => c,
      where: () => c,
      returning: () => c,
      onConflictDoNothing: () => c,
      then: (resolve: any, reject: any) => Promise.resolve([{ id: "row" }]).then(resolve, reject),
      catch: (reject: any) => Promise.resolve([{ id: "row" }]).catch(reject),
    };
    return c;
  };
  const db = {
    select: () => chain(state.selects.shift() ?? []),
    insert: write(),
    update: write(),
    delete: write(),
    execute: async () => ({ rows: [] }),
    transaction: async (fn: any) => fn(db),
  };
  return { getDb: () => db, ensureChadGtmTables: async () => undefined, ensureAgentTables: async () => undefined };
});
vi.mock("@smartreach/email-engine/processor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@smartreach/email-engine/processor")>()),
  releaseCampaignJobs: vi.fn(async () => 3),
}));
vi.mock("../campaign-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../campaign-start")>()),
  campaignStartError: vi.fn(async () => state.startError),
}));
vi.mock("../campaign-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../campaign-drafts")>()),
  ensureCampaignLeadSnapshot: vi.fn(async () => undefined),
}));

import { releaseCampaignJobs } from "@smartreach/email-engine/processor";
import { campaignStartError } from "../campaign-start";
import { campaignAction } from "../actions";
import { toggleChadGtmStatusAction } from "../chad-gtm-actions";

const CAMPAIGN = { id: "c1", userId: "u1", status: "running", leadListId: "list-1", startedAt: null };

beforeEach(() => {
  state.selects = [];
  state.updates = [];
  state.startError = null;
  vi.mocked(releaseCampaignJobs).mockClear();
  vi.mocked(campaignStartError).mockClear();
});

describe("campaignAction releases queued jobs", () => {
  it("pause releases the campaign's jobs", async () => {
    state.selects = [[CAMPAIGN]];
    const r = await campaignAction("c1", "pause");
    expect(r.ok).toBe(true);
    expect(releaseCampaignJobs).toHaveBeenCalledWith(expect.anything(), "c1", "campaign-paused");
    expect(state.updates.some((u) => u.set?.status === "paused")).toBe(true);
  });

  it("archive releases the campaign's jobs", async () => {
    state.selects = [[CAMPAIGN]];
    const r = await campaignAction("c1", "archive");
    expect(r.ok).toBe(true);
    expect(releaseCampaignJobs).toHaveBeenCalledWith(expect.anything(), "c1", "campaign-archived");
    expect(state.updates.some((u) => u.set?.status === "archived")).toBe(true);
  });

  it("start does not release, clears the stale block reason, and uses the start check", async () => {
    state.selects = [[{ ...CAMPAIGN, status: "paused" }]];
    const r = await campaignAction("c1", "start");
    expect(r.ok).toBe(true);
    expect(releaseCampaignJobs).not.toHaveBeenCalled();
    expect(campaignStartError).toHaveBeenCalledWith(expect.anything(), {
      campaignId: "c1",
      actor: { id: "u1", isAdmin: false },
    });
    const running = state.updates.find((u) => u.set?.status === "running");
    expect(running?.set).toMatchObject({ sendBlockReason: null, sendBlockSince: null });
  });

  it("resume is refused with the start check's error", async () => {
    state.selects = [[{ ...CAMPAIGN, status: "paused" }]];
    state.startError = "Add your company name and a full postal address";
    const r = await campaignAction("c1", "resume");
    expect(r).toEqual({ ok: false, error: "Add your company name and a full postal address" });
    expect(state.updates).toEqual([]);
  });
});

// The toggle goes through campaignAction (#46): the run lookup, then the campaign row.
describe("toggleChadGtmStatusAction", () => {
  it("pause releases the run's campaign jobs", async () => {
    state.selects = [[{ campaignId: "c9" }], [{ ...CAMPAIGN, id: "c9" }]];
    const r = await toggleChadGtmStatusAction("run-1", "paused");
    expect(r.ok).toBe(true);
    expect(releaseCampaignJobs).toHaveBeenCalledWith(expect.anything(), "c9", "campaign-paused");
  });

  it("resume is refused when the identity is incomplete, and nothing changes", async () => {
    state.selects = [[{ campaignId: "c9" }], [{ ...CAMPAIGN, id: "c9", status: "paused" }]];
    state.startError = "Add your company name and a full postal address";
    const r = await toggleChadGtmStatusAction("run-1", "active");
    expect(r).toEqual({ ok: false, error: "Add your company name and a full postal address" });
    expect(campaignStartError).toHaveBeenCalledWith(expect.anything(), {
      campaignId: "c9",
      actor: { id: "u1", isAdmin: false },
    });
    expect(state.updates).toEqual([]);
    expect(releaseCampaignJobs).not.toHaveBeenCalled();
  });

  it("resume clears the stale block reason and does not release", async () => {
    state.selects = [[{ campaignId: "c9" }], [{ ...CAMPAIGN, id: "c9", status: "paused" }]];
    const r = await toggleChadGtmStatusAction("run-1", "active");
    expect(r.ok).toBe(true);
    const running = state.updates.find((u) => u.set?.status === "running");
    expect(running?.set).toMatchObject({ sendBlockReason: null, sendBlockSince: null });
    expect(releaseCampaignJobs).not.toHaveBeenCalled();
  });
});
