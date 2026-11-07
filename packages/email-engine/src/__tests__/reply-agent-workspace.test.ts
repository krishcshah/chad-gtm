/**
 * The reply agent and the workspace (#75, #77, #78):
 *  - a run without its own booking link uses the workspace's, and does not
 *    ask for one ("Add your booking link");
 *  - it speaks for the workspace's sender (the name in the email footer);
 *  - a new Needs you card always carries a workspace, the default one for
 *    campaigns that have none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { replyAgentTick } from "../reply-agent";
import { conversationDb, has } from "./fixtures/conversation-db";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), makeTransport: vi.fn(), makeImapClient: vi.fn() }));
vi.mock("../system-mailer", () => ({ isSystemMailerConfigured: () => false, sendSystemEmail: vi.fn() }));

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

let seq = 0;

function world(over: { run?: Record<string, any> | null; workspace?: Record<string, any>; campaign?: Record<string, any> } = {}) {
  const id = `ws-r${++seq}`;
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
    bodyText: "Sounds good, can we set up a call?",
    receivedAt: "2026-11-06T11:00:00.000Z",
    messageId: "<in-1@acme-example.com>",
    tag: "interested",
    agentStatus: "processing",
    agentClaimedAt: CLAIM,
  };
  const claim = { agentStatus: "processing", agentClaimedAt: CLAIM, receivedAt: reply.receivedAt };
  const campaign = {
    id: "c1",
    userId: "u1",
    workspaceId: "w1",
    status: "running",
    deletedAt: null,
    leadConversationMode: "agent",
    agentOffer: "",
    ...over.campaign,
  };
  const run =
    over.run === null
      ? null
      : {
          id: "run1",
          userId: "u1",
          workspaceId: "w1",
          companyName: "Researched Co",
          bookingUrl: null,
          businessOverview: { summary: "Acme automates reporting for finance teams." },
          offers: [{ title: "Reporting audit", valueProp: "Cut a week of reporting work" }],
          ...over.run,
        };
  const workspace = {
    id: "w1",
    isDefault: true,
    leadConversationMode: "manual",
    agentPaused: false,
    companySummary: "",
    mainOffer: "",
    bookingUrl: "https://cal.example/workspace",
    companyName: "Legal Co Ltd",
    ...over.workspace,
  };
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
      [schema.campaigns, () => [campaign]],
      [schema.chadGtmRuns, () => (run ? [run] : [])],
      [schema.workspaces, () => [workspace]],
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
      [
        schema.senderAccounts,
        () => [
          { id: "s1", userId: "admin", senderName: "Alex Kim", email: "alex@pool.example", fromName: "", status: "active", deletedAt: null, isSystemPool: true },
        ],
      ],
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

const interested = async (_input?: any) => ({
  intent: "interested" as const,
  confidence: 0.9,
  summary: "wants a call",
  source: "llm" as const,
});
const question = async () => ({
  intent: "question" as const,
  confidence: 0.8,
  summary: "Asked about SOC 2",
  question: "Are you SOC 2 certified?",
  source: "llm" as const,
});

describe("workspace booking link (#77)", () => {
  it("a run without its own link sends the workspace link and does not ask for one", async () => {
    const { db, requests } = world();
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out-1@pool.example>" });
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(r.replied).toBe(1);
    expect(sendMail.mock.calls[0]![1].text).toContain("https://cal.example/workspace");
    expect(requests.some((q) => q.kind === "booking_url")).toBe(false);
  });

  it("a run's own link wins over the workspace default", async () => {
    const { db } = world({ run: { bookingUrl: "https://cal.example/run-own" } });
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out-2@pool.example>" });
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    const text = sendMail.mock.calls[0]![1].text as string;
    expect(text).toContain("https://cal.example/run-own");
    expect(text).not.toContain("https://cal.example/workspace");
  });
});

describe("one sender per workspace (#78)", () => {
  it("triage gets the workspace company name when it differs from the run's", async () => {
    const { db } = world();
    const triage = vi.fn(interested);
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out-3@pool.example>" });
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage });
    expect(triage).toHaveBeenCalledTimes(1);
    expect(triage.mock.calls[0]![0]).toMatchObject({ companyName: "Legal Co Ltd" });
  });

  it("falls back to the run's name when the workspace has none", async () => {
    const { db } = world({ workspace: { companyName: "" } });
    const triage = vi.fn(interested);
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail: vi.fn().mockResolvedValue({}), triage });
    expect(triage.mock.calls[0]![0]).toMatchObject({ companyName: "Researched Co" });
  });
});

describe("new Needs you cards carry a workspace (#75)", () => {
  it("a campaign and run without a workspace file the card under the owner's default workspace", async () => {
    const { db, requests } = world({
      campaign: { workspaceId: null },
      run: { workspaceId: null },
      workspace: { id: "w-default" },
    });
    const sendMail = vi.fn();
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: question });
    expect(sendMail).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ workspaceId: "w-default", kind: "question" });
  });
});
