/**
 * Replies and mailbox health (#63): pausing a mailbox stops new outreach only;
 * replies to warm conversations still go out and are counted apart from cold
 * sends. A failed or retired mailbox never sends: the conversation goes to
 * Needs you with the reason.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import {
  MAILBOX_OUT_OF_SERVICE_TITLE,
  MAILBOX_OUT_OF_SERVICE_SUMMARY,
  isAgentReplyDelivered,
  replyAgentTick,
  sendAgentReply,
} from "../reply-agent";
import {
  MAILBOX_OUT_OF_SERVICE_MESSAGE,
  MailboxUnavailableError,
  recordReplySend,
  replyMailboxBlockReason,
} from "../mailbox-health";
import { conversationDb, has } from "./fixtures/conversation-db";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), makeTransport: vi.fn(), makeImapClient: vi.fn() }));
vi.mock("../system-mailer", () => ({ isSystemMailerConfigured: () => true, sendSystemEmail: vi.fn(async () => undefined) }));

const NOW = new Date("2026-11-06T12:00:00.000Z");
const CLAIM = NOW.toISOString();

const env = process.env as Record<string, string | undefined>;
const savedApproval = env.SIGNUP_APPROVAL_REQUIRED;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  delete env.SIGNUP_APPROVAL_REQUIRED;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  if (savedApproval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = savedApproval;
  warn.mockRestore();
  error.mockRestore();
});

const BASE_SENDER = {
  id: "s1",
  userId: "admin",
  senderName: "Alex Kim",
  email: "alex@pool.example",
  fromName: "",
  status: "active",
  deletedAt: null as string | null,
  isSystemPool: true,
};

describe("replyMailboxBlockReason", () => {
  it("active and paused mailboxes can reply", () => {
    expect(replyMailboxBlockReason({ status: "active", deletedAt: null })).toBeNull();
    expect(replyMailboxBlockReason({ status: "paused", deletedAt: null })).toBeNull();
  });
  it("a failed mailbox is blocked", () => {
    expect(replyMailboxBlockReason({ status: "failed", deletedAt: null })).toBe("failed");
  });
  it("a soft-deleted mailbox is retired, whatever its status", () => {
    expect(replyMailboxBlockReason({ status: "active", deletedAt: "2026-11-01T00:00:00.000Z" })).toBe("retired");
  });
  it("a missing mailbox fails closed", () => {
    expect(replyMailboxBlockReason(null)).toBe("retired");
    expect(replyMailboxBlockReason(undefined)).toBe("retired");
  });
});

describe("recordReplySend", () => {
  it("counts a 'sender_reply' usage row for the mailbox, never a cold 'sender' one", async () => {
    const { db, writes } = conversationDb(new Map());
    await recordReplySend(db, { senderId: "s1", userId: "u1" });
    const ins = writes.find((w) => w.op === "insert" && w.table === schema.usageCounters);
    expect(ins?.values).toMatchObject({ entityType: "sender_reply", entityId: "s1", userId: "u1" });
  });
  it("never throws", async () => {
    const db: any = {
      insert: () => {
        throw new Error("db down");
      },
      select: () => {
        throw new Error("db down");
      },
    };
    await expect(recordReplySend(db, { senderId: "s1", userId: "u1" })).resolves.toBeUndefined();
  });
});

let seq = 0;

function world(sender: Record<string, any>) {
  const id = `mh${++seq}`;
  const requests: Array<Record<string, any>> = [];
  const reply = {
    id,
    userId: "u1",
    senderId: "s1",
    campaignId: "c1",
    leadId: "l1",
    fromEmail: "dana@acme-example.com",
    fromName: "Dana",
    subject: "Re: idea",
    snippet: "Sounds good, can we set up a call?",
    bodyText: "Sounds good, can we set up a call?",
    receivedAt: "2026-11-06T11:00:00.000Z",
    messageId: "<in-1@acme-example.com>",
    tag: "interested",
    agentStatus: "processing",
    agentClaimedAt: CLAIM,
  };
  const claim = { agentStatus: "processing", agentClaimedAt: CLAIM, receivedAt: reply.receivedAt };
  const { db, writes } = conversationDb(
    new Map<unknown, any>([
      [
        schema.replies,
        ({ fields }: { fields: string[] }) => {
          if (has(fields, "agentAttempts", "agentClaimedAt")) return [];
          if (has(fields, "agentAttempts")) return [{ id, agentAttempts: 0 }];
          if (has(fields, "agentStatus", "agentClaimedAt", "receivedAt")) return [claim];
          return [reply];
        },
      ],
      [
        schema.campaigns,
        () => [
          {
            id: "c1",
            userId: "u1",
            workspaceId: "w1",
            status: "running",
            deletedAt: null,
            leadConversationMode: "agent",
            agentOffer: "",
          },
        ],
      ],
      [
        schema.chadGtmRuns,
        () => [
          {
            id: "run1",
            userId: "u1",
            workspaceId: "w1",
            companyName: "Acme",
            bookingUrl: "https://cal.example/dana",
            businessOverview: { summary: "Acme automates reporting for finance teams." },
            offers: [{ title: "Reporting audit", valueProp: "Cut a week of reporting work" }],
          },
        ],
      ],
      [
        schema.workspaces,
        () => [
          {
            id: "w1",
            leadConversationMode: "manual",
            agentPaused: false,
            companySummary: "",
            mainOffer: "",
            bookingUrl: null,
            companyName: "Acme",
          },
        ],
      ],
      [schema.workspaceSettings, () => []],
      [schema.leadConversations, () => []],
      [schema.agentRequests, () => requests.filter((r) => r.status === "open" || r.status === "sending")],
      [
        schema.uniboxMessages,
        ({ fields }: { fields: string[] }) => {
          if (has(fields, "lastOutboundAt")) return [{ lastOutboundAt: null }];
          if (has(fields, "c")) return [{ c: 0 }];
          return [];
        },
      ],
      [schema.suppressions, () => []],
      [schema.senderAccounts, () => [sender]],
      [schema.users, () => [{ id: "u1", role: "user", approvedAt: "2026-01-01", email: "owner@client.example", name: "Owner" }]],
      [schema.leads, () => [{ id: "l1", firstName: "Dana", lastName: "Lee", company: "Acme Example" }]],
      [schema.agentKnowledge, () => []],
      [schema.engineHeartbeats, () => [{ lastTickAt: NOW.toISOString() }]],
      [schema.activityLogs, () => []],
    ]),
    {
      onInsert: (table, values) => {
        if (table === schema.agentRequests) requests.push({ ...values, createdAt: NOW.toISOString() });
      },
    },
  );
  return { db, writes, requests };
}

const interested = async () => ({ intent: "interested" as const, confidence: 0.9, summary: "wants a call", source: "llm" as const });

function finishWrite(writes: ReturnType<typeof world>["writes"]) {
  return writes.find((w) => w.table === schema.replies && w.set?.agentSummary !== undefined && w.set?.agentStatus !== "processing");
}

describe("handleReply and the mailbox's health", () => {
  it("a failed mailbox: no email, one open Needs you card, the reply is held with the reason", async () => {
    const { db, writes, requests } = world({ ...BASE_SENDER, status: "failed" });
    const sendMail = vi.fn();
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      kind: "other",
      status: "open",
      title: MAILBOX_OUT_OF_SERVICE_TITLE,
      question: "Sounds good, can we set up a call?",
      draftReply: "",
      leadEmail: "dana@acme-example.com",
      campaignId: "c1",
      workspaceId: "w1",
    });
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "escalated", agentSummary: MAILBOX_OUT_OF_SERVICE_SUMMARY });
  });

  it("a retired mailbox is held the same way", async () => {
    const { db, requests } = world({ ...BASE_SENDER, deletedAt: "2026-11-01T00:00:00.000Z" });
    const sendMail = vi.fn();
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
  });

  it("a paused mailbox still answers the warm conversation and counts the reply", async () => {
    const { db, writes, requests } = world({ ...BASE_SENDER, status: "paused" });
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out@pool.example>" });
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(0);
    expect(finishWrite(writes)?.set).toMatchObject({ agentStatus: "replied" });
    const counted = writes.find((w) => w.op === "insert" && w.table === schema.usageCounters);
    expect(counted?.values).toMatchObject({ entityType: "sender_reply", entityId: "s1", userId: "u1" });
  });
});

describe("sendAgentReply and the mailbox's health", () => {
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
  const run = (sender: Record<string, any>) => {
    const { db, writes } = conversationDb(new Map());
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out@pool.example>" });
    const p = sendAgentReply(db, {
      reply,
      sender: sender as any,
      ownerId: "u1",
      workspaceId: "w1",
      body: "Hi Dana, here is my calendar.",
      nowIso: NOW.toISOString(),
      deps: { sendMail },
    });
    return { p, writes, sendMail };
  };

  it("throws MailboxUnavailableError (not 'delivered') for a retired mailbox, sending nothing", async () => {
    const { p, writes, sendMail } = run({ ...BASE_SENDER, deletedAt: "2026-11-01T00:00:00.000Z" });
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(MailboxUnavailableError);
    expect(err.message).toBe(MAILBOX_OUT_OF_SERVICE_MESSAGE);
    expect(isAgentReplyDelivered(err)).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("throws for a failed mailbox too", async () => {
    const { p, sendMail } = run({ ...BASE_SENDER, status: "failed" });
    await expect(p).rejects.toBeInstanceOf(MailboxUnavailableError);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("records a 'sender_reply' usage counter after a successful send", async () => {
    const { p, writes, sendMail } = run({ ...BASE_SENDER, status: "paused" });
    await p;
    expect(sendMail).toHaveBeenCalledTimes(1);
    const counted = writes.find((w) => w.op === "insert" && w.table === schema.usageCounters);
    expect(counted?.values).toMatchObject({ entityType: "sender_reply", entityId: "s1", userId: "u1" });
  });
});
