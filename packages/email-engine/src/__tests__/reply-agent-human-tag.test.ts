/**
 * #86: a tag you set in the Inbox (tag_source 'human') is never overwritten by
 * the reply agent on the row it is processing. Automatic tags still are.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { replyAgentTick } from "../reply-agent";
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

// Reply ids are unique per test: the agent remembers replies it answered in this process.
let seq = 0;

function world(reply: Record<string, unknown>) {
  const id = `human-tag-${++seq}`;
  const row = {
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
    agentStatus: "processing",
    agentClaimedAt: CLAIM,
    ...reply,
  };
  const claim = { agentStatus: "processing", agentClaimedAt: CLAIM, receivedAt: row.receivedAt };
  const { db, writes } = conversationDb(
    new Map<unknown, any>([
      [
        schema.replies,
        ({ fields }: { fields: string[] }) => {
          if (has(fields, "agentAttempts", "agentClaimedAt")) return [];
          if (has(fields, "agentAttempts")) return [{ id, agentAttempts: 0 }];
          if (has(fields, "agentStatus", "agentClaimedAt", "receivedAt")) return [claim];
          return [row];
        },
      ],
      [
        schema.campaigns,
        () => [{ id: "c1", userId: "u1", workspaceId: "w1", status: "running", deletedAt: null, leadConversationMode: "agent", agentOffer: "" }],
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
        () => [{ id: "w1", leadConversationMode: "manual", agentPaused: false, companySummary: "", mainOffer: "", bookingUrl: null, companyName: "Acme" }],
      ],
      [schema.workspaceSettings, () => []],
      [schema.leadConversations, () => []],
      [schema.agentRequests, () => []],
      [
        schema.uniboxMessages,
        ({ fields }: { fields: string[] }) => {
          if (has(fields, "lastOutboundAt")) return [{ lastOutboundAt: null }];
          if (has(fields, "c")) return [{ c: 0 }];
          return [];
        },
      ],
      [schema.suppressions, () => []],
      [
        schema.senderAccounts,
        () => [
          {
            id: "s1",
            userId: "admin",
            senderName: "Alex Kim",
            email: "alex@pool.example",
            fromName: "",
            status: "active",
            deletedAt: null,
            isSystemPool: true,
          },
        ],
      ],
      [schema.users, () => [{ id: "u1", role: "user", approvedAt: "2026-01-01", email: "owner@client.example", name: "Owner" }]],
      [schema.leads, () => [{ id: "l1", firstName: "Dana", lastName: "Lee", company: "Acme Example" }]],
      [schema.agentKnowledge, () => []],
      [schema.engineHeartbeats, () => [{ lastTickAt: NOW.toISOString() }]],
      [schema.activityLogs, () => []],
    ]),
  );
  return { db, writes };
}

const interested = async () => ({ intent: "interested" as const, confidence: 0.9, summary: "wants a call", source: "llm" as const });

function finishWrite(writes: ReturnType<typeof world>["writes"]) {
  return writes.find((w) => w.table === schema.replies && w.set?.agentSummary !== undefined && w.set?.agentStatus !== "processing");
}

describe("the reply agent keeps a tag you set (#86)", () => {
  it("finishes without writing a tag when you tagged the reply", async () => {
    const { db, writes } = world({ tag: "meeting_booked", tagSource: "human" });
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out-1@pool.example>" });
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(r.replied).toBe(1);
    const finish = finishWrite(writes);
    expect(finish?.set).toMatchObject({ agentStatus: "replied" });
    expect(finish?.set).not.toHaveProperty("tag");
    expect(finish?.set).not.toHaveProperty("tagSource");
    // No other write to the reply touches the tag either.
    expect(writes.some((w) => w.table === schema.replies && w.set && "tag" in w.set)).toBe(false);
  });

  it("writes the agent's tag when the existing tag is automatic", async () => {
    const { db, writes } = world({ tag: null, tagSource: null });
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out-1@pool.example>" });
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    const finish = finishWrite(writes);
    expect(finish?.set).toMatchObject({ agentStatus: "replied", tag: "interested", tagSource: "auto" });
  });
});
