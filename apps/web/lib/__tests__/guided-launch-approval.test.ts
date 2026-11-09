/**
 * Guided setup, account not approved yet: Launch saves the choices so approval
 * launches the run on its own, and says so (never an error toast).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  run: null as any,
  updates: [] as any[],
  canSend: false,
  launch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("../approval", async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    assertCanSend: vi.fn(async () => {
      if (!state.canSend) throw new Error(real.APPROVAL_REQUIRED_ERROR);
    }),
  };
});
vi.mock("../gtm-launch", async (orig) => ({ ...((await orig()) as any), launchRunCampaign: state.launch }));
vi.mock("../db", () => {
  const chain = (result: () => any[]) => {
    const q: any = {
      from: () => q,
      where: () => q,
      limit: () => q,
      orderBy: () => q,
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    return q;
  };
  const db = {
    select: () => chain(() => (state.run ? [state.run] : [])),
    update: () => ({
      set: (v: any) => {
        state.updates.push(v);
        return { where: () => Promise.resolve([]) };
      },
    }),
  };
  return { getDb: () => db, ensureChadGtmTables: vi.fn(async () => {}), ensureAgentTables: vi.fn(async () => {}) };
});

import { launchChadGtmCampaignAction } from "../chad-gtm-actions";
import { awaitingApprovalText } from "../approval-copy";

beforeEach(() => {
  state.run = { id: "r1", userId: "u1", campaignId: null, dismissedAt: null, offers: [{ title: "A" }, { title: "B" }] };
  state.updates = [];
  state.canSend = false;
  state.launch.mockReset();
});

describe("guided setup launch before approval", () => {
  it("saves the choices for approval to launch, and says it launches on its own", async () => {
    const samples = [{ subject: "hi", body: "hello" }];
    const res = await launchChadGtmCampaignAction("r1", 120, samples, 1);
    expect(res).toEqual({ ok: false, awaitingApproval: true, error: awaitingApprovalText() });
    expect(state.launch).not.toHaveBeenCalled();
    expect(state.updates[0]).toMatchObject({
      autopilot: true,
      status: "ready",
      dailyEmailLimit: 120,
      approvedEmailSamples: samples,
      offers: [{ title: "B" }, { title: "A" }],
    });
  });

  it("launches as before once approved", async () => {
    state.canSend = true;
    state.launch.mockResolvedValue({ campaignId: "c1", leadCount: 10 });
    const res = await launchChadGtmCampaignAction("r1", 120, [], 0);
    expect(res).toEqual({ ok: true, campaignId: "c1" });
  });
});
