import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* resolveAgentRequestAction sends free text from the thread's mailbox. When
 * that is a shared-pool mailbox, the owner must still be approved to send.
 * It is now called from the Inbox: it refuses when someone wrote after what
 * the person saw, closes every open card for the conversation, and labels an
 * unchanged agent draft "Agent, approved by you". */

type Write = { op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any; where?: any };

const state = vi.hoisted(() => ({
  selects: [] as any[][],
  writes: [] as Write[],
  approved: true,
  /** "Lead conversations": is the agent off for the request's conversation? */
  agentOff: false,
  sendAgentReply: vi.fn(async (_db: unknown, _input: any) => undefined as unknown),
  /** What an UPDATE/INSERT ... RETURNING gives back (default: one row). */
  onWrite: null as null | ((w: Write) => any[] | undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "c@example.com", role: "user" })) }));
vi.mock("../workspaces", () => ({
  getActiveWorkspace: vi.fn(async () => ({ id: "w1" })),
  ensureDefaultWorkspace: vi.fn(async () => ({ id: "w1" })),
}));
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
vi.mock("../lead-conversations-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lead-conversations-server")>()),
  conversationAgentOff: vi.fn(async () => state.agentOff),
  agentOffConversations: vi.fn(async () => new Set<string>()),
}));
vi.mock("@smartreach/email-engine", () => ({
  extractSenderFirstName: () => "Alex",
  callLlmJson: async () => null,
}));
vi.mock("../db", () => {
  const chain = (result: any[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
  };
  const write = (op: Write["op"]) => (table: unknown) => {
    const entry: Write = { op, table };
    state.writes.push(entry);
    const c: any = {
      set: (v: any) => ((entry.set = v), c),
      values: (v: any) => ((entry.values = v), c),
      where: (w: any) => ((entry.where = w), c),
      returning: () => c,
      onConflictDoNothing: () => c,
      onConflictDoUpdate: () => c,
      then: (resolve: any, reject: any) =>
        Promise.resolve(state.onWrite?.(entry) ?? [{ id: "row" }]).then(resolve, reject),
    };
    return c;
  };
  const db = {
    select: () => chain(state.selects.shift() ?? []),
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
  };
  return { getDb: () => db, ensureChadGtmTables: async () => undefined };
});

import {
  addReferralLeadAction,
  discardRequestDraftAction,
  dismissAgentRequestAction,
  draftRequestReplyAction,
  resolveAgentRequestAction,
} from "../autopilot-actions";
import { REQUEST_ALREADY_HANDLED } from "../lead-conversations";

const dialect = new PgDialect();
function whereOf(w: Write) {
  return dialect.sqlToQuery(w.where);
}

const REQUEST = [{ id: "req-1", userId: "u1", status: "open", replyId: "r1", workspaceId: "w1", kind: "question", title: "Q", question: "q", draftReply: "", draftSource: "agent" }];
const REPLY = [{ id: "r1", senderId: "s1", fromEmail: "lead@acme.com", receivedAt: "2026-11-06T10:00:00.000Z" }];
const CONV_REPLY = [{ ...REPLY[0], leadId: "l1", campaignId: "c1", fromName: "Dana Lee" }];
const POOL_SENDER = [{ id: "s1", userId: "platform", isSystemPool: true }];
const OWN_SENDER = [{ id: "s1", userId: "u1", isSystemPool: false }];
const OTHER_SENDER = [{ id: "s1", userId: "someone-else", isSystemPool: false }];

beforeEach(() => {
  state.selects = [];
  state.writes = [];
  state.approved = true;
  state.agentOff = false;
  state.onWrite = null;
  state.sendAgentReply.mockReset();
  state.sendAgentReply.mockImplementation(async () => undefined);
});

describe("resolveAgentRequestAction send gate", () => {
  it("refuses to send from a pool mailbox when the owner is not approved (revoked)", async () => {
    state.approved = false;
    state.selects = [REQUEST, REPLY, POOL_SENDER, []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Here is my pitch, buy now" });
    expect(r).toEqual({ ok: false, error: "approval required" });
    expect(state.sendAgentReply).not.toHaveBeenCalled();
  });

  it("refuses to answer someone who unsubscribed from another customer's campaign (global opt-out)", async () => {
    state.selects = [REQUEST, REPLY, POOL_SENDER, [{ value: "lead@acme.com", userId: "someone-else", source: "unsubscribe" }]];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r).toEqual({
      ok: false,
      error: "lead@acme.com unsubscribed or asked not to be contacted, so AutoGTM won't email them again. The reply was not sent.",
    });
    expect(state.sendAgentReply).not.toHaveBeenCalled();
  });

  it("refuses to answer someone on your own blocklist", async () => {
    state.selects = [REQUEST, REPLY, POOL_SENDER, [{ value: "@acme.com", userId: "u1", source: "manual" }]];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r).toEqual({ ok: false, error: "lead@acme.com is on your blocklist. The reply was not sent." });
    expect(state.sendAgentReply).not.toHaveBeenCalled();
  });

  it("sends from a pool mailbox when the owner is approved", async () => {
    state.selects = [REQUEST, REPLY, POOL_SENDER, [], []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r.ok).toBe(true);
    expect(state.sendAgentReply).toHaveBeenCalledTimes(1);
  });

  it("an unapproved owner may still answer from their own mailbox", async () => {
    state.approved = false;
    state.selects = [REQUEST, REPLY, OWN_SENDER, [], []];
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

describe("resolveAgentRequestAction from the Inbox", () => {
  it("refuses (no send) when a teammate or the agent wrote after what the person saw", async () => {
    // request, reply, sender, suppression, newer inbound (none), newer operator/agent message
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [], [{ id: "m-new" }]];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck.", seenLatestAt: "2026-11-06T10:00:00.000Z" });
    expect(r).toEqual({ ok: false, error: "Dana or someone on your team wrote after this was drafted. Check the conversation, then send." });
    expect(state.sendAgentReply).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });

  it("refuses when the lead wrote again", async () => {
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [{ id: "r2" }]];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r.ok).toBe(false);
    expect(state.sendAgentReply).not.toHaveBeenCalled();
  });

  it("closes every open card for the lead + campaign and leaves no reply waiting", async () => {
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [], []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r.ok).toBe(true);
    const requestUpdates = state.writes.filter((w) => w.op === "update" && w.table === schema.agentRequests);
    // claim ('sending'), this card resolved, then every open card in the conversation.
    expect(requestUpdates.map((w) => w.set.status)).toEqual(["sending", "resolved", "resolved"]);
    const all = whereOf(requestUpdates[2]!);
    expect(all.sql).toContain('"lead_id" = $');
    expect(all.sql).toContain('"campaign_id" = $');
    expect(all.params).toEqual(expect.arrayContaining(["l1", "c1", "open", "sending"]));
    const replies = state.writes.find((w) => w.op === "update" && w.table === schema.replies);
    expect(replies?.set.agentStatus).toBe("human_replied");
    expect(whereOf(replies!).params).toEqual(expect.arrayContaining(["escalated", "pending"]));
  });

  it("an unchanged agent draft is sent as the agent, approved by you; an edited one as you", async () => {
    const approval = [{ ...REQUEST[0], kind: "approval", draftReply: "Hi Dana, here is my calendar.", draftSource: "agent" }];
    state.selects = [approval, CONV_REPLY, OWN_SENDER, [], [], []];
    await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, here is my calendar." });
    expect(state.sendAgentReply.mock.calls[0]![1]).toMatchObject({ fromRole: "agent", approvedByUser: true });

    state.selects = [approval, CONV_REPLY, OWN_SENDER, [], [], []];
    await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, here is my calendar. Talk soon." });
    expect(state.sendAgentReply.mock.calls[1]![1]).toMatchObject({ fromRole: "operator", approvedByUser: false });
  });

  it("a draft written from your answer is sent as you, even unchanged", async () => {
    const yours = [{ ...REQUEST[0], draftReply: "Hi Dana, yes we are SOC 2.", draftSource: "you" }];
    state.selects = [yours, CONV_REPLY, OWN_SENDER, [], [], []];
    await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, yes we are SOC 2." });
    expect(state.sendAgentReply.mock.calls[0]![1]).toMatchObject({ fromRole: "operator", approvedByUser: false });
  });

  it("saves the knowledge entry from pendingKnowledge only when save is true", async () => {
    const withSave = [{ ...REQUEST[0], pendingKnowledge: { answer: "Yes, SOC 2 Type II.", resourceUrl: null, save: true } }];
    state.selects = [withSave, CONV_REPLY, OWN_SENDER, [], [], []];
    await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, yes we are SOC 2." });
    const saved = state.writes.filter((w) => w.op === "insert" && w.table === schema.agentKnowledge);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.values).toMatchObject({ content: "Yes, SOC 2 Type II.", kind: "faq" });

    state.writes = [];
    const noSave = [{ ...REQUEST[0], pendingKnowledge: { answer: "Yes, SOC 2 Type II.", resourceUrl: null, save: false } }];
    state.selects = [noSave, CONV_REPLY, OWN_SENDER, [], [], []];
    await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, yes we are SOC 2." });
    expect(state.writes.some((w) => w.op === "insert" && w.table === schema.agentKnowledge)).toBe(false);
  });

  it("a failed send puts the card back to open", async () => {
    state.sendAgentReply.mockRejectedValueOnce(new Error("SMTP down"));
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [], []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r).toEqual({ ok: false, error: "Send failed: SMTP down" });
    const statuses = state.writes.filter((w) => w.table === schema.agentRequests).map((w) => w.set.status);
    expect(statuses).toEqual(["sending", "open"]);
  });
});

describe("drafts from your answer", () => {
  it("draftRequestReplyAction stores the draft, its source and the pending knowledge on the card", async () => {
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER];
    const r = await draftRequestReplyAction({ requestId: "req-1", answer: "Yes, SOC 2 Type II.", save: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ replyId: "r1" });
    const upd = state.writes.find((w) => w.op === "update" && w.table === schema.agentRequests);
    expect(upd?.set).toMatchObject({
      draftSource: "you",
      pendingKnowledge: { answer: "Yes, SOC 2 Type II.", resourceUrl: null, save: true },
    });
    expect(upd?.set.draftReply).toContain("Yes, SOC 2 Type II.");
  });

  it("refuses on a closed card", async () => {
    state.selects = [[{ ...REQUEST[0], status: "resolved" }]];
    const r = await draftRequestReplyAction({ requestId: "req-1", answer: "Yes" });
    expect(r).toEqual({ ok: false, error: REQUEST_ALREADY_HANDLED });
    expect(state.writes).toEqual([]);
  });

  it("discardRequestDraftAction clears the draft and leaves the card open", async () => {
    state.selects = [REQUEST];
    const r = await discardRequestDraftAction("req-1");
    expect(r.ok).toBe(true);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]!.set).toEqual({ draftReply: "", updatedAt: expect.any(String) });
    expect(state.writes[0]!.set.status).toBeUndefined();
  });
});

describe("who the reply is recorded as", () => {
  const approval = [{ ...REQUEST[0], leadId: "l1", campaignId: "c1", kind: "approval", draftReply: "Hi Dana, here is my calendar.", draftSource: "agent" }];

  it("an approved draft leaves the reply 'replied' with 'Agent, approved by you'", async () => {
    state.selects = [approval, CONV_REPLY, OWN_SENDER, [], [], []];
    await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, here is my calendar." });
    const replies = state.writes.find((w) => w.op === "update" && w.table === schema.replies);
    expect(replies?.set).toMatchObject({ agentStatus: "replied", agentSummary: "Agent, approved by you" });
  });

  it("an edited draft is sent as you and leaves 'human_replied' with 'You replied.'", async () => {
    state.selects = [approval, CONV_REPLY, OWN_SENDER, [], [], []];
    await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, here is my calendar. Talk soon!" });
    expect(state.sendAgentReply.mock.calls[0]![1]).toMatchObject({ fromRole: "operator", approvedByUser: false });
    const replies = state.writes.find((w) => w.op === "update" && w.table === schema.replies);
    expect(replies?.set).toMatchObject({ agentStatus: "human_replied", agentSummary: "You replied." });
  });

  it("with the agent off (Manual), even an unchanged agent draft goes out as you", async () => {
    state.agentOff = true;
    state.selects = [approval, CONV_REPLY, OWN_SENDER, [], [], []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, here is my calendar." });
    expect(r.ok).toBe(true);
    expect(state.sendAgentReply.mock.calls[0]![1]).toMatchObject({ fromRole: "operator", approvedByUser: false });
    const replies = state.writes.find((w) => w.op === "update" && w.table === schema.replies);
    expect(replies?.set.agentStatus).toBe("human_replied");
  });
});

describe("dismissAgentRequestAction: dismiss means take over", () => {
  const OPEN = [{ ...REQUEST[0], leadId: "l1", campaignId: "c1" }];

  it("claims the card, closes every open card in the conversation and hands the conversation to you", async () => {
    state.selects = [OPEN];
    const r = await dismissAgentRequestAction("req-1");
    expect(r).toEqual({ ok: true, message: "Dismissed. You've taken over this conversation." });
    expect(state.sendAgentReply).not.toHaveBeenCalled();

    const requestUpdates = state.writes.filter((w) => w.op === "update" && w.table === schema.agentRequests);
    expect(requestUpdates.map((w) => w.set.status)).toEqual(["dismissed", "dismissed"]);
    // The claim only takes a card that is still open.
    const claim = whereOf(requestUpdates[0]!);
    expect(claim.params).toEqual(["req-1", "open"]);
    // Then every open card for the same lead + campaign, plus a stale 'sending'
    // one left by a send that died. An in-flight send is never dismissed.
    const all = whereOf(requestUpdates[1]!);
    expect(all.sql).toContain('"lead_id" = $');
    expect(all.sql).toContain('"campaign_id" = $');
    expect(all.sql).toMatch(/"status" = \$\d+ and "agent_requests"\."updated_at" < \$\d+/);
    expect(all.params).toEqual(expect.arrayContaining(["u1", "l1", "c1", "open", "sending"]));
    const staleBefore = all.params.find((p: unknown) => typeof p === "string" && /^\d{4}-\d\d-\d\dT/.test(p));
    expect(Date.now() - Date.parse(String(staleBefore))).toBeGreaterThanOrEqual(9 * 60_000);

    const replies = state.writes.find((w) => w.op === "update" && w.table === schema.replies);
    expect(replies?.set).toMatchObject({
      agentStatus: "skipped",
      agentIntent: "manual",
      agentSummary: "You dismissed the agent's request and took over.",
    });
    // Never overwrites an answered reply.
    expect(whereOf(replies!).params).not.toContain("replied");

    const handler = state.writes.find((w) => w.op === "insert" && w.table === schema.leadConversations);
    expect(handler?.values).toMatchObject({ leadId: "l1", campaignId: "c1", handler: "you", handlerReason: "dismiss" });
  });

  it("refuses a card that is already closed or being sent, and writes nothing", async () => {
    state.selects = [[{ ...OPEN[0], status: "resolved" }]];
    expect(await dismissAgentRequestAction("req-1")).toEqual({ ok: false, error: REQUEST_ALREADY_HANDLED });
    state.selects = [[{ ...OPEN[0], status: "sending" }]];
    expect(await dismissAgentRequestAction("req-1")).toEqual({ ok: false, error: REQUEST_ALREADY_HANDLED });
    // A sent reply is never turned into 'skipped'.
    expect(state.writes).toEqual([]);
  });

  it("a card answered in another tab between load and click is not dismissed, and its reply is left alone", async () => {
    state.selects = [OPEN];
    state.onWrite = (w) => (w.table === schema.agentRequests && w.set?.status === "dismissed" ? [] : undefined);
    expect(await dismissAgentRequestAction("req-1")).toEqual({ ok: false, error: REQUEST_ALREADY_HANDLED });
    expect(state.writes.filter((w) => w.table !== schema.agentRequests)).toEqual([]);
  });
});

/* ─── #15: one send per card ─────────────────────────────────────────── */

describe("claiming a card before acting on it", () => {
  it("two concurrent sends of one card send exactly once (the second claim gets no row)", async () => {
    let taken = false;
    state.onWrite = (w) => {
      if (w.table === schema.agentRequests && w.set?.status === "sending") {
        if (taken) return [];
        taken = true;
      }
      return undefined;
    };
    // Both tabs read the card while it was still open; only the claim decides.
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [], []];
    const a = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [], []];
    const b = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(state.sendAgentReply).toHaveBeenCalledTimes(1);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok)).toEqual({ ok: false, error: REQUEST_ALREADY_HANDLED });
  });

  it("the claim takes an open card, or a 'sending' one left by a send that died", async () => {
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [], []];
    await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    const claim = state.writes.find((w) => w.table === schema.agentRequests && w.set?.status === "sending")!;
    const q = whereOf(claim);
    expect(q.params.slice(0, 4)).toEqual(["req-1", "u1", "open", "sending"]);
    expect(q.sql).toContain('"updated_at" < $');
    // The card is closed only from 'sending' (never re-opened or overwritten).
    const resolved = state.writes.find((w) => w.table === schema.agentRequests && w.set?.status === "resolved")!;
    expect(whereOf(resolved).params).toEqual(["req-1", "sending"]);
  });

  it("a card already resolved is refused before anything is sent", async () => {
    state.selects = [[{ ...REQUEST[0], status: "resolved" }]];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r).toEqual({ ok: false, error: REQUEST_ALREADY_HANDLED });
    expect(state.sendAgentReply).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });
});

/* ─── #14: hand-offs never become knowledge ──────────────────────────── */

describe("knowledge is saved only for questions and resources", () => {
  for (const kind of ["handoff", "approval", "referral", "other", "booking_url"]) {
    it(`resolving a ${kind} card never inserts a knowledge entry, even with save on`, async () => {
      const req = [{ ...REQUEST[0], kind, question: "The agent has replied 4 times in this conversation, so it's handing it to you.", pendingKnowledge: { answer: "Sure, Tuesday works.", resourceUrl: null, save: true } }];
      state.selects = [req, CONV_REPLY, OWN_SENDER, [], [], []];
      const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Hi Dana, Tuesday works." });
      expect(r.ok).toBe(true);
      expect(state.writes.some((w) => w.op === "insert" && w.table === schema.agentKnowledge)).toBe(false);
    });
  }
});

/* ─── #13: add the referred person as a lead ─────────────────────────── */

describe("addReferralLeadAction", () => {
  const REFERRAL = [
    { ...REQUEST[0], kind: "referral", leadId: "l1", campaignId: "c1", runId: "run1", leadEmail: "dana@acme.com", leadCompany: "Acme", referralEmail: "jane@acme.com" },
  ];
  const CAMPAIGN = [{ id: "c1", workspaceId: "w1", leadListId: "list-1" }];
  const LIST = [{ id: "list-1", workspaceId: "w1" }];

  it("creates the lead in the campaign's list, queues it in the campaign and resolves the card", async () => {
    // request, campaign, suppressions, already in campaign, already in list, lead list (createLeadForUser)
    state.selects = [REFERRAL, CAMPAIGN, [], [], [], LIST];
    const r = await addReferralLeadAction({ requestId: "req-1", email: " Jane@Acme.com " });
    expect(r.ok).toBe(true);
    const lead = state.writes.find((w) => w.op === "insert" && w.table === schema.leads);
    expect(lead?.values).toMatchObject({ email: "jane@acme.com", listId: "list-1", company: "Acme", workspaceId: "w1", userId: "u1" });
    const queued = state.writes.find((w) => w.op === "insert" && w.table === schema.campaignLeads);
    expect(queued?.values).toEqual({ campaignId: "c1", leadId: "row", status: "queued" });
    const statuses = state.writes.filter((w) => w.table === schema.agentRequests).map((w) => w.set.status);
    expect(statuses).toEqual(["sending", "resolved"]);
    const resolved = state.writes.filter((w) => w.table === schema.agentRequests)[1]!;
    expect(resolved.set.resolution).toBe("Added jane@acme.com as a lead");
    expect(state.sendAgentReply).not.toHaveBeenCalled();
  });

  it("refuses a suppressed address and writes nothing", async () => {
    state.selects = [REFERRAL, CAMPAIGN, [{ value: "@acme.com", userId: "u1", source: "manual" }]];
    const r = await addReferralLeadAction({ requestId: "req-1", email: "jane@acme.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("can't be added");
    expect(state.writes).toEqual([]);
  });

  it("refuses an address someone else unsubscribed (global opt-out)", async () => {
    state.selects = [REFERRAL, CAMPAIGN, [{ value: "jane@acme.com", userId: "other-user", source: "unsubscribe" }]];
    const r = await addReferralLeadAction({ requestId: "req-1", email: "jane@acme.com" });
    expect(r.ok).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it("refuses an address already in the campaign", async () => {
    state.selects = [REFERRAL, CAMPAIGN, [], [{ id: "cl-1" }]];
    const r = await addReferralLeadAction({ requestId: "req-1", email: "jane@acme.com" });
    expect(r).toEqual({ ok: false, error: "jane@acme.com is already in this campaign." });
    expect(state.writes).toEqual([]);
  });

  it("refuses on a closed card", async () => {
    state.selects = [[{ ...REFERRAL[0], status: "resolved" }]];
    const r = await addReferralLeadAction({ requestId: "req-1", email: "jane@acme.com" });
    expect(r).toEqual({ ok: false, error: REQUEST_ALREADY_HANDLED });
    expect(state.writes).toEqual([]);
  });

  it("refuses when another tab took the card first (claim returns no row)", async () => {
    state.selects = [REFERRAL, CAMPAIGN, [], [], []];
    state.onWrite = (w) => (w.table === schema.agentRequests && w.set?.status === "sending" ? [] : undefined);
    const r = await addReferralLeadAction({ requestId: "req-1", email: "jane@acme.com" });
    expect(r).toEqual({ ok: false, error: REQUEST_ALREADY_HANDLED });
    expect(state.writes.some((w) => w.table === schema.leads || w.table === schema.campaignLeads)).toBe(false);
  });

  it("explains a campaign without a lead list", async () => {
    state.selects = [REFERRAL, [{ ...CAMPAIGN[0], leadListId: null }]];
    const r = await addReferralLeadAction({ requestId: "req-1", email: "jane@acme.com" });
    expect(r).toEqual({ ok: false, error: "This campaign has no lead list, so the contact can't be added." });
  });

  it("refuses the lead's own address", async () => {
    state.selects = [REFERRAL];
    const r = await addReferralLeadAction({ requestId: "req-1", email: "dana@acme.com" });
    expect(r.ok).toBe(false);
    expect(state.writes).toEqual([]);
  });
});

describe("resolveAgentRequestAction says whether the agent picks the conversation back up", () => {
  it("agent handling the conversation: agentOff false (the Inbox says the agent resumes)", async () => {
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [], []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ agentOff: false });
  });

  it("Manual, paused or taken over: agentOff true (no 'the agent picks this back up' toast)", async () => {
    state.agentOff = true;
    state.selects = [REQUEST, CONV_REPLY, OWN_SENDER, [], [], []];
    const r = await resolveAgentRequestAction({ requestId: "req-1", body: "Thanks, here is the deck." });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ agentOff: true });
  });
});
