import { beforeEach, describe, expect, it, vi } from "vitest";

/* resolveAgentRequestAction sends free text from the thread's mailbox. When
 * that is a shared-pool mailbox, the owner must still be approved to send. */

const state = vi.hoisted(() => ({
  selects: [] as any[][],
  approved: true,
  sendAgentReply: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "c@example.com", role: "user" })) }));
vi.mock("../workspaces", () => ({ getActiveWorkspace: vi.fn(async () => ({ id: "w1" })) }));
vi.mock("../chad-gtm-actions", () => ({ analyzeWebsiteAction: vi.fn() }));
vi.mock("../gtm-launch", () => ({
  COMPLIANCE_REQUIRED_ERROR: "compliance",
  LaunchError: class extends Error {},
  launchRunCampaign: vi.fn(),
  loadComplianceIdentity: vi.fn(),
}));
vi.mock("../ai", () => ({ getWorkspaceAiOptions: vi.fn() }));
vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "approval required",
  assertCanSend: vi.fn(async () => {
    if (!state.approved) throw new Error("approval required");
  }),
}));
vi.mock("@smartreach/email-engine/reply-agent", () => ({ sendAgentReply: state.sendAgentReply }));
vi.mock("../db", () => {
  const chain = (result: any[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
  };
  const write = () => {
    const c: any = {
      set: () => c,
      values: () => c,
      where: () => c,
      returning: () => c,
      onConflictDoNothing: () => c,
      then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
    };
    return c;
  };
  const db = {
    select: () => chain(state.selects.shift() ?? []),
    insert: write,
    update: write,
    delete: write,
  };
  return { getDb: () => db, ensureChadGtmTables: async () => undefined };
});

import { resolveAgentRequestAction } from "../autopilot-actions";

const REQUEST = [{ id: "req-1", userId: "u1", status: "open", replyId: "r1", workspaceId: "w1", kind: "question", title: "Q", question: "q" }];
const REPLY = [{ id: "r1", senderId: "s1", fromEmail: "lead@acme.com" }];
const POOL_SENDER = [{ id: "s1", userId: "platform", isSystemPool: true }];
const OWN_SENDER = [{ id: "s1", userId: "u1", isSystemPool: false }];
const OTHER_SENDER = [{ id: "s1", userId: "someone-else", isSystemPool: false }];

beforeEach(() => {
  state.selects = [];
  state.approved = true;
  state.sendAgentReply.mockClear();
});

describe("resolveAgentRequestAction send gate", () => {
  it("refuses to send from a pool mailbox when the owner is not approved (revoked)", async () => {
    state.approved = false;
    state.selects = [REQUEST, REPLY, POOL_SENDER, []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Here is my pitch, buy now" });
    expect(r).toEqual({ ok: false, error: "approval required" });
    expect(state.sendAgentReply).not.toHaveBeenCalled();
  });

  it("sends from a pool mailbox when the owner is approved", async () => {
    state.selects = [REQUEST, REPLY, POOL_SENDER, []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r.ok).toBe(true);
    expect(state.sendAgentReply).toHaveBeenCalledTimes(1);
  });

  it("an unapproved owner may still answer from their own mailbox", async () => {
    state.approved = false;
    state.selects = [REQUEST, REPLY, OWN_SENDER, []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r.ok).toBe(true);
    expect(state.sendAgentReply).toHaveBeenCalledTimes(1);
  });

  it("never sends from another user's own mailbox", async () => {
    state.selects = [REQUEST, REPLY, OTHER_SENDER, []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r.ok).toBe(false);
    expect(state.sendAgentReply).not.toHaveBeenCalled();
  });
});
