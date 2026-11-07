/**
 * The reply agent and "Lead conversations": it answers only conversations it
 * handles, re-checks everything right before it acts, and keeps one Needs you
 * card per conversation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { PgDialect } from "drizzle-orm/pg-core";
import { AGENT_MAX_ATTEMPTS, replyAgentTick, sendAgentReply } from "../reply-agent";
import {
  ANSWERED_SUMMARY,
  CAMPAIGN_ARCHIVED_SUMMARY,
  CAMPAIGN_DELETED_SUMMARY,
  CAMPAIGN_PAUSED_SUMMARY,
  MANUAL_SUMMARY,
  OPTED_OUT_SUMMARY,
  OUT_OF_OFFICE_SUMMARY,
  TAKEN_OVER_SUMMARY,
  WAITING_ON_YOU_SUMMARY,
} from "../lead-conversations";
import { conversationDb, has } from "./fixtures/conversation-db";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), makeTransport: vi.fn(), makeImapClient: vi.fn() }));
vi.mock("../system-mailer", () => ({ isSystemMailerConfigured: () => true, sendSystemEmail: systemSend }));
const { systemSend } = vi.hoisted(() => ({ systemSend: vi.fn(async () => undefined) }));

const NOW = new Date("2026-11-06T12:00:00.000Z");
const CLAIM = NOW.toISOString();

const env = process.env as Record<string, string | undefined>;
const savedApproval = env.SIGNUP_APPROVAL_REQUIRED;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  delete env.SIGNUP_APPROVAL_REQUIRED;
  systemSend.mockClear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  if (savedApproval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = savedApproval;
  warn.mockRestore();
  error.mockRestore();
});

interface World {
  reply: Record<string, any>;
  claim: { agentStatus: string; agentClaimedAt: string; receivedAt: string };
  pending: Array<{ id: string; agentAttempts: number }>;
  campaign: Record<string, any> | null;
  run: Record<string, any> | null;
  workspace: Record<string, any> | null;
  handler: "campaign" | "you" | null;
  requests: Array<Record<string, any>>;
  lastOutboundAt: string | null;
  suppressed: boolean;
  /** Source of the owner's suppression row when `suppressed` (default 'manual'). */
  suppressionSource?: string;
  throwOnCampaigns: boolean;
  /** The agent's own earlier sends in this conversation (the reply budget). */
  priorAgentReplies: number;
}

// Reply ids are unique per test: the agent remembers replies it answered in this process.
let seq = 0;

function world(over: Partial<World> = {}) {
  const id = `r${++seq}`;
  const state: World = {
    reply: {
      id,
      userId: "u1",
      senderId: "s1",
      campaignId: "c1",
      leadId: "l1",
      fromEmail: "dana@acme-example.com",
      fromName: "Dana",
      subject: "Re: idea",
      bodyText: "Sounds good, can we set up a call?",
      receivedAt: "2026-11-06T11:00:00.000Z",
      messageId: "<in-1@acme-example.com>",
      tag: "interested",
      agentStatus: "processing",
      agentClaimedAt: CLAIM,
    },
    claim: { agentStatus: "processing", agentClaimedAt: CLAIM, receivedAt: "2026-11-06T11:00:00.000Z" },
    pending: [{ id, agentAttempts: 0 }],
    campaign: {
      id: "c1",
      userId: "u1",
      workspaceId: "w1",
      status: "running",
      deletedAt: null,
      leadConversationMode: "agent",
      agentOffer: "",
    },
    run: {
      id: "run1",
      userId: "u1",
      workspaceId: "w1",
      companyName: "Acme",
      bookingUrl: "https://cal.example/dana",
      businessOverview: { summary: "Acme automates reporting for finance teams." },
      offers: [{ title: "Reporting audit", valueProp: "Cut a week of reporting work" }],
    },
    workspace: {
      id: "w1",
      leadConversationMode: "manual",
      agentPaused: false,
      companySummary: "",
      mainOffer: "",
      bookingUrl: null,
      companyName: "Acme",
    },
    handler: null,
    requests: [],
    lastOutboundAt: null,
    suppressed: false,
    throwOnCampaigns: false,
    priorAgentReplies: 0,
    ...over,
  };
  const { db, writes } = conversationDb(
    new Map<unknown, any>([
      [
        schema.replies,
        ({ fields }: { fields: string[] }) => {
          if (has(fields, "agentAttempts", "agentClaimedAt")) return []; // stuck (reclaim)
          if (has(fields, "agentAttempts")) return state.pending; // due pending
          if (has(fields, "agentStatus", "agentClaimedAt", "receivedAt")) return [state.claim]; // pre-send re-check
          return [state.reply];
        },
      ],
      [schema.campaigns, () => (state.campaign ? [state.campaign] : [])],
      [schema.chadGtmRuns, () => (state.run ? [state.run] : [])],
      [schema.workspaces, () => (state.workspace ? [state.workspace] : [])],
      [schema.workspaceSettings, () => []],
      [schema.leadConversations, () => (state.handler ? [{ handler: state.handler }] : [])],
      [schema.agentRequests, () => state.requests.filter((r) => r.status === "open" || r.status === "sending")],
      [
        schema.uniboxMessages,
        ({ fields }: { fields: string[] }) => {
          if (has(fields, "lastOutboundAt")) return [{ lastOutboundAt: state.lastOutboundAt }];
          if (has(fields, "c")) return [{ c: state.priorAgentReplies }];
          return []; // the agent has not answered this reply yet
        },
      ],
      [
        schema.suppressions,
        () =>
          state.suppressed
            ? [{ value: "dana@acme-example.com", userId: "u1", source: state.suppressionSource ?? "manual" }]
            : [],
      ],
      [schema.senderAccounts, () => [SENDER]],
      [schema.users, () => [{ id: "u1", role: "user", approvedAt: "2026-01-01", email: "owner@client.example", name: "Owner" }]],
      [schema.leads, () => [{ id: "l1", firstName: "Dana", lastName: "Lee", company: "Acme Example" }]],
      [schema.agentKnowledge, () => []],
      [schema.engineHeartbeats, () => [{ lastTickAt: NOW.toISOString() }]],
      [schema.activityLogs, () => []],
    ]),
    {
      onInsert: (table, values) => {
        if (table === schema.agentRequests) state.requests.push({ ...values, createdAt: NOW.toISOString() });
      },
      throwOn: (t) => state.throwOnCampaigns && t === schema.campaigns,
    },
  );
  return { db, writes, state };
}

const SENDER = {
  id: "s1",
  userId: "admin",
  senderName: "Alex Kim",
  email: "alex@pool.example",
  fromName: "",
  status: "active",
  deletedAt: null,
  isSystemPool: true,
};

const interested = async () => ({ intent: "interested" as const, confidence: 0.9, summary: "wants a call", source: "llm" as const });
const question = async () => ({
  intent: "question" as const,
  confidence: 0.8,
  summary: "Asked about SOC 2",
  question: "Are you SOC 2 certified?",
  source: "llm" as const,
});

function finishWrite(writes: ReturnType<typeof world>["writes"]) {
  return writes.find((w) => w.table === schema.replies && w.set?.agentSummary !== undefined && w.set?.agentStatus !== "processing");
}

describe("the agent answers only conversations it handles", () => {
  it("does not reply when you took the conversation over, and says why", async () => {
    const { db, writes } = world({ handler: "you" });
    const sendMail = vi.fn();
    const triage = vi.fn(interested);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(sendMail).not.toHaveBeenCalled();
    expect(triage).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "skipped", agentSummary: TAKEN_OVER_SUMMARY });
  });

  it("does not reply when someone wrote to the lead after their message", async () => {
    const { db, writes } = world({ lastOutboundAt: "2026-11-06T11:30:00.000Z" });
    const sendMail = vi.fn();
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "skipped", agentIntent: "answered", agentSummary: ANSWERED_SUMMARY });
  });

  it("answers a campaign with no Autopilot run when it is set to Agent and the workspace is grounded", async () => {
    const { db, writes } = world({
      run: null,
      workspace: {
        id: "w1",
        leadConversationMode: "manual",
        agentPaused: false,
        companySummary: "Acme automates reporting for finance teams.",
        mainOffer: "Reporting audit",
        bookingUrl: "https://cal.example/acme",
        companyName: "Acme",
      },
    });
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out-1@pool.example>" });
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![1].text).toContain("https://cal.example/acme");
    expect(r.replied).toBe(1);
    expect(writes.some((w) => w.table === schema.replies && w.set?.agentStatus === "replied")).toBe(true);
  });

  it("skips a campaign set to Manual", async () => {
    const { db, writes } = world({ run: null, campaign: { id: "c1", userId: "u1", workspaceId: "w1", status: "running", deletedAt: null, leadConversationMode: "manual", agentOffer: "" } });
    const sendMail = vi.fn();
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "skipped", agentIntent: "manual", agentSummary: MANUAL_SUMMARY });
  });
});

describe("a paused, archived or deleted campaign holds the reply", () => {
  const campaign = (over: Record<string, unknown>) => ({
    id: "c1",
    userId: "u1",
    workspaceId: "w1",
    status: "running",
    deletedAt: null,
    leadConversationMode: "agent",
    agentOffer: "",
    ...over,
  });

  it("a pending reply on a paused campaign is held and nothing is sent", async () => {
    const { db, writes } = world({ campaign: campaign({ status: "paused" }) });
    const sendMail = vi.fn();
    const triage = vi.fn(interested);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(sendMail).not.toHaveBeenCalled();
    expect(triage).not.toHaveBeenCalled();
    expect(r.escalated).toBe(1);
    expect(finishWrite(writes)?.set).toMatchObject({
      agentStatus: "escalated",
      agentIntent: "held",
      agentSummary: "Held: the campaign is paused, so the agent didn't reply. Reply from the Inbox, or resume the campaign.",
    });
    expect(CAMPAIGN_PAUSED_SUMMARY).toBe(finishWrite(writes)?.set.agentSummary);
    // Held, not escalated to a card.
    expect(writes.some((w) => w.op === "insert" && w.table === schema.agentRequests)).toBe(false);
  });

  it("archived and soft-deleted campaigns hold the reply, never send", async () => {
    for (const [over, summary] of [
      [{ status: "archived" }, CAMPAIGN_ARCHIVED_SUMMARY],
      [{ deletedAt: "2026-11-05T00:00:00.000Z" }, CAMPAIGN_DELETED_SUMMARY],
    ] as const) {
      const { db, writes } = world({ campaign: campaign(over) });
      const sendMail = vi.fn();
      await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
      expect(sendMail).not.toHaveBeenCalled();
      expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "escalated", agentIntent: "held", agentSummary: summary });
    }
  });

  it("the workspace pause wins over everything: skipped as yours, nothing sent", async () => {
    const { db, writes, state } = world();
    state.workspace = { ...state.workspace, agentPaused: true };
    const sendMail = vi.fn();
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "skipped", agentIntent: "manual" });
  });
});

describe("referrals", () => {
  it("stores the address the lead pointed to on the card", async () => {
    const { db, writes, state } = world();
    state.reply = { ...state.reply, bodyText: "Not my area. Please reach out to jane@acme-example.com, she handles this." };
    const triage = async () => ({ intent: "referral" as const, confidence: 0.8, summary: "Pointed to Jane", source: "llm" as const });
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail: vi.fn(), triage });
    const card = writes.find((w) => w.op === "insert" && w.table === schema.agentRequests);
    expect(card?.values).toMatchObject({
      kind: "referral",
      referralEmail: "jane@acme-example.com",
      question: "The lead pointed you to jane@acme-example.com. Add them as a lead to this campaign, or reply to the lead yourself.",
    });
  });
});

describe("right before sending, the agent confirms nothing changed", () => {
  it("a person claimed the reply during triage: no email and no reply update at all", async () => {
    const { db, writes, state } = world();
    const sendMail = vi.fn();
    const triage = async () => {
      state.claim = { ...state.claim, agentStatus: "human_replied" };
      return interested();
    };
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    // Only the tick's own claim was written.
    expect(writes.filter((w) => w.table === schema.replies).map((w) => w.set?.agentStatus)).toEqual(["processing"]);
  });

  it("an operator message appeared after the claim: no email, 'Already answered'", async () => {
    const { db, writes, state } = world();
    const sendMail = vi.fn();
    const triage = async () => {
      state.lastOutboundAt = "2026-11-06T12:00:05.000Z";
      return interested();
    };
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(sendMail).not.toHaveBeenCalled();
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "skipped", agentSummary: ANSWERED_SUMMARY });
  });

  it("the campaign was paused between claim and send: nothing is sent and the reply is held", async () => {
    const { db, writes, state } = world();
    const sendMail = vi.fn();
    const triage = async () => {
      state.campaign = { ...state.campaign, status: "paused" };
      return interested();
    };
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(sendMail).not.toHaveBeenCalled();
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "escalated", agentIntent: "held", agentSummary: CAMPAIGN_PAUSED_SUMMARY });
  });

  it("the lead opted out between claim and send: nothing is sent", async () => {
    const { db, writes, state } = world();
    const sendMail = vi.fn();
    const triage = async () => {
      state.suppressed = true;
      return interested();
    };
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(sendMail).not.toHaveBeenCalled();
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "skipped", agentSummary: OPTED_OUT_SUMMARY });
  });

  it("the lead is on the owner's own 'not interested' list: skipped, nothing is sent", async () => {
    const { db, writes } = world({ suppressed: true, suppressionSource: "not_interested" });
    const sendMail = vi.fn();
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "skipped", agentSummary: OPTED_OUT_SUMMARY });
  });

  it("the conversation was taken over between claim and send: nothing is sent", async () => {
    const { db, writes, state } = world();
    const sendMail = vi.fn();
    const triage = async () => {
      state.handler = "you";
      return interested();
    };
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(sendMail).not.toHaveBeenCalled();
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "skipped", agentSummary: TAKEN_OVER_SUMMARY });
  });
});

describe("one Needs you card per conversation", () => {
  it("a lead message in a conversation with an open card joins it: no LLM call, no email, no second card", async () => {
    const { db, writes, state } = world({
      requests: [{ id: "req-1", replyId: "r0", kind: "question", status: "open", createdAt: "2026-11-06T10:00:00.000Z" }],
    });
    const sendMail = vi.fn();
    const triage = vi.fn(interested);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(triage).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.escalated).toBe(1);
    expect(writes.some((w) => w.op === "insert" && w.table === schema.agentRequests)).toBe(false);
    expect(writes.find((w) => w.table === schema.agentRequests && w.op === "update")?.set).toMatchObject({ replyId: state.reply.id });
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "escalated", agentSummary: WAITING_ON_YOU_SUMMARY });
  });

  it("two escalations in one conversation make one open card and one notification", async () => {
    const w = world();
    const sendMail = vi.fn();
    await replyAgentTick(w.db, { now: () => NOW, sendMail, triage: question });
    // The lead writes again before anyone answers.
    const second = `${w.state.reply.id}-2`;
    w.state.reply = { ...w.state.reply, id: second, receivedAt: "2026-11-06T11:10:00.000Z" };
    w.state.claim = { ...w.state.claim, receivedAt: "2026-11-06T11:10:00.000Z" };
    w.state.pending = [{ id: second, agentAttempts: 0 }];
    await replyAgentTick(w.db, { now: () => NOW, sendMail, triage: question });
    expect(w.writes.filter((x) => x.op === "insert" && x.table === schema.agentRequests)).toHaveLength(1);
    expect(w.state.requests).toHaveLength(1);
    expect(systemSend).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("a card that is being sent ('sending') blocks the agent like an open one", async () => {
    const { db, writes } = world({
      requests: [{ id: "req-1", replyId: "r0", kind: "question", status: "sending", createdAt: "2026-11-06T10:00:00.000Z" }],
    });
    const sendMail = vi.fn();
    const triage = vi.fn(interested);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(triage).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.escalated).toBe(1);
    expect(writes.some((w) => w.op === "insert" && w.table === schema.agentRequests)).toBe(false);
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "escalated", agentSummary: WAITING_ON_YOU_SUMMARY });
  });

  it("a card opened by someone else during triage is joined, not duplicated", async () => {
    const { db, writes, state } = world();
    const triage = async () => {
      state.requests.push({ id: "req-9", replyId: "r0", kind: "question", status: "open", createdAt: NOW.toISOString() });
      return question();
    };
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail: vi.fn(), triage });
    expect(writes.some((w) => w.op === "insert" && w.table === schema.agentRequests)).toBe(false);
    expect(writes.find((w) => w.table === schema.agentRequests && w.op === "update")?.set).toMatchObject({ replyId: state.reply.id });
  });

  it("giving up on a reply joins the open card for the same lead and campaign", async () => {
    const { db, writes, state } = world({
      requests: [{ id: "req-1", replyId: "r0", kind: "question", status: "open", createdAt: "2026-11-06T10:00:00.000Z" }],
      throwOnCampaigns: true,
    });
    state.pending = [{ id: state.reply.id, agentAttempts: AGENT_MAX_ATTEMPTS - 1 }];
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail: vi.fn() });
    expect(r.gaveUp).toBe(1);
    expect(writes.some((w) => w.op === "insert" && w.table === schema.agentRequests)).toBe(false);
    expect(writes.find((w) => w.table === schema.agentRequests && w.op === "update")?.set).toMatchObject({ replyId: state.reply.id });
    expect(systemSend).not.toHaveBeenCalled();
  });
});

describe("out-of-office replies (classified once)", () => {
  it("a pending reply tagged out of office gets no LLM call and no email", async () => {
    const { db, writes, state } = world();
    state.reply = { ...state.reply, tag: "out_of_office", bodyText: "Just back from vacation, yes keen to chat" };
    const sendMail = vi.fn();
    const triage = vi.fn(interested);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(triage).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    expect(finishWrite(writes)?.set).toMatchObject({
      agentStatus: "skipped",
      agentIntent: "out_of_office",
      agentSummary: OUT_OF_OFFICE_SUMMARY,
    });
  });
});

/** Records the WHERE of every select on unibox_messages (the reply-budget count). */
function captureUniboxWheres(db: any): any[] {
  const wheres: any[] = [];
  const select = db.select;
  db.select = (fields?: Record<string, unknown>) => {
    const inner = select(fields);
    let table: unknown;
    const wrap: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") return inner[prop];
          return (...args: any[]) => {
            if (prop === "from") table = args[0];
            if (prop === "where" && table === schema.uniboxMessages && fields && "c" in fields) wheres.push(args[0]);
            inner[prop](...args);
            return wrap;
          };
        },
      },
    );
    return wrap;
  };
  return wheres;
}

describe("the reply budget counts the agent's own sends in this conversation", () => {
  it("counts only autonomous agent messages for this lead and this campaign", async () => {
    const { db } = world();
    const wheres = captureUniboxWheres(db);
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail: vi.fn().mockResolvedValue({ messageId: "<o@x>" }), triage: interested });
    expect(wheres).toHaveLength(1);
    const q = new PgDialect().sqlToQuery(wheres[0]);
    expect(q.sql).toContain('"unibox_messages"."lead_id" = $');
    expect(q.sql).toContain('"unibox_messages"."campaign_id" = $');
    expect(q.sql).toContain('"unibox_messages"."from_role" = $');
    expect(q.sql).toContain('"unibox_messages"."approved_by_user" = $');
    expect(q.params).toEqual(["l1", "c1", "agent", false]);
  });

  it("after 4 autonomous replies in this conversation the agent hands it to you", async () => {
    const { db, writes } = world({ priorAgentReplies: 4 });
    const sendMail = vi.fn();
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.escalated).toBe(1);
    const card = writes.find((w) => w.op === "insert" && w.table === schema.agentRequests);
    expect(card?.values).toMatchObject({ kind: "handoff", title: "Conversation handed to you", leadId: "l1", campaignId: "c1" });
    // The agent's would-be reply (the booking link) is the draft you check in the Inbox.
    expect(card?.values.draftReply).toContain("https://cal.example/dana");
  });

  it("3 earlier agent replies still let it answer", async () => {
    const { db } = world({ priorAgentReplies: 3 });
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<o@x>" });
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(r.replied).toBe(1);
  });
});

describe("sendAgentReply records who approved it", () => {
  const reply = {
    id: "r-x",
    leadId: "l1",
    campaignId: "c1",
    fromEmail: "dana@acme-example.com",
    fromName: "Dana",
    subject: "Re: idea",
    bodyText: "Can you share pricing?",
    receivedAt: "2026-11-06T11:00:00.000Z",
    messageId: "<in@acme-example.com>",
  };
  const send = async (approvedByUser?: boolean) => {
    const { db, writes } = conversationDb(new Map());
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out@pool.example>" });
    await sendAgentReply(db, {
      reply,
      sender: SENDER as any,
      ownerId: "u1",
      workspaceId: "w1",
      body: "Hi Dana, here is my calendar.",
      nowIso: NOW.toISOString(),
      deps: { sendMail },
      fromRole: "agent",
      ...(approvedByUser === undefined ? {} : { approvedByUser }),
    });
    return writes.find((w) => w.op === "insert" && w.table === schema.uniboxMessages)?.values;
  };

  it("writes approved_by_user when a person approved the draft", async () => {
    expect(await send(true)).toMatchObject({ fromRole: "agent", approvedByUser: true });
  });
  it("defaults to false (the agent's own send)", async () => {
    expect(await send()).toMatchObject({ fromRole: "agent", approvedByUser: false });
  });
});
