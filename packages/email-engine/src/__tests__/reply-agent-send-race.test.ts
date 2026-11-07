/**
 * "Send mine" vs the agent: the agent commits to sending on its own claim
 * right before SMTP, so a person's forced send and the agent's send can never
 * both go out. A worker that dies after committing never retries the send.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { PgDialect } from "drizzle-orm/pg-core";
import { AGENT_SEND_INTERRUPTED, replyAgentTick } from "../reply-agent";
import { AGENT_SENDING_SUMMARY, markAgentSending } from "../lead-conversations";
import { conversationDb, has } from "./fixtures/conversation-db";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), makeTransport: vi.fn(), makeImapClient: vi.fn() }));
vi.mock("../system-mailer", () => ({ isSystemMailerConfigured: () => true, sendSystemEmail: vi.fn(async () => undefined) }));

const NOW = new Date("2026-11-06T12:00:00.000Z");
const CLAIM = NOW.toISOString();
const dialect = new PgDialect();

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

let seq = 0;

function world(opts: { sendingClaimLost?: boolean; stuck?: Array<Record<string, any>> } = {}) {
  const id = `race${++seq}`;
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
  const { db, writes } = conversationDb(
    new Map<unknown, any>([
      [
        schema.replies,
        ({ fields }: { fields: string[] }) => {
          if (has(fields, "agentAttempts", "agentClaimedAt")) return opts.stuck ?? []; // stuck (reclaim)
          if (has(fields, "agentAttempts")) return opts.stuck ? [] : [{ id, agentAttempts: 0 }]; // due pending
          if (has(fields, "agentStatus", "agentClaimedAt", "receivedAt")) {
            return [{ agentStatus: "processing", agentClaimedAt: CLAIM, receivedAt: reply.receivedAt }];
          }
          return [reply];
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
      [schema.workspaces, () => [{ id: "w1", leadConversationMode: "manual", agentPaused: false, companySummary: "", mainOffer: "", bookingUrl: null, companyName: "Acme" }]],
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
      [schema.senderAccounts, () => [SENDER]],
      [schema.users, () => [{ id: "u1", role: "user", approvedAt: "2026-01-01", email: "owner@client.example", name: "Owner" }]],
      [schema.leads, () => [{ id: "l1", firstName: "Dana", lastName: "Lee", company: "Acme Example" }]],
      [schema.agentKnowledge, () => []],
      [schema.engineHeartbeats, () => [{ lastTickAt: NOW.toISOString() }]],
      [schema.activityLogs, () => []],
    ]),
    {
      // The person's forced "Send mine" took the reply first: the agent's commit matches nothing.
      updateResult: (table, set) =>
        opts.sendingClaimLost && table === schema.replies && set?.agentSummary === AGENT_SENDING_SUMMARY ? [] : [{ id: "row" }],
    },
  );
  return { db, writes, id };
}

const interested = async () => ({ intent: "interested" as const, confidence: 0.9, summary: "wants a call", source: "llm" as const });

describe("the agent commits to sending before SMTP", () => {
  it("writes the sending marker on its own claim, then sends and records 'replied'", async () => {
    const { db, writes } = world();
    const order: string[] = [];
    const sendMail = vi.fn(async () => {
      order.push("smtp");
      return { messageId: "<out-1@pool.example>" };
    });
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(r.replied).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);

    const replyWrites = writes.filter((w) => w.table === schema.replies);
    const commitIdx = replyWrites.findIndex((w) => w.set?.agentSummary === AGENT_SENDING_SUMMARY);
    const repliedIdx = replyWrites.findIndex((w) => w.set?.agentStatus === "replied");
    expect(commitIdx).toBeGreaterThan(0); // after the tick's own claim
    expect(repliedIdx).toBeGreaterThan(commitIdx);
    expect(replyWrites[commitIdx]!.set).toEqual({ agentStatus: "processing", agentSummary: AGENT_SENDING_SUMMARY });
  });

  it("a person's 'Send mine' that won the race: the agent sends nothing and writes nothing more", async () => {
    const { db, writes } = world({ sendingClaimLost: true });
    const sendMail = vi.fn(async () => ({ messageId: "<out-1@pool.example>" }));
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    expect(r.replied).toBe(0);
    // Only the tick's claim and the (lost) commit: never 'replied', never back to 'pending'.
    expect(writes.filter((w) => w.table === schema.replies).map((w) => w.set?.agentSummary ?? w.set?.agentStatus)).toEqual([
      "processing",
      AGENT_SENDING_SUMMARY,
    ]);
    expect(writes.some((w) => w.table === schema.uniboxMessages)).toBe(false);
  });

  it("markAgentSending is conditional on the agent's own claim", async () => {
    let where: any = null;
    let rows: any[] = [{ id: "r-x" }];
    const builder: any = {
      set: () => builder,
      where: (w: unknown) => {
        where = w;
        return builder;
      },
      returning: async () => rows,
    };
    const db: any = { update: () => builder };
    expect(await markAgentSending(db, { replyId: "r-x", claimedAt: CLAIM })).toBe(true);
    const q = dialect.sqlToQuery(where);
    expect(q.sql).toContain('"agent_status" = $');
    expect(q.sql).toContain('"agent_claimed_at" = $');
    expect(q.params).toEqual(expect.arrayContaining(["r-x", "processing", CLAIM]));
    rows = [];
    expect(await markAgentSending(db, { replyId: "r-x", claimedAt: CLAIM })).toBe(false);
  });
});

describe("a worker that died mid-send never retries", () => {
  it("a stuck reply with the sending marker is handed to a person, not put back to pending", async () => {
    const stuck = [{ id: "stuck1", agentAttempts: 0, agentClaimedAt: "2026-11-06T11:00:00.000Z", agentSummary: AGENT_SENDING_SUMMARY }];
    const { db, writes } = world({ stuck });
    const sendMail = vi.fn();
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: interested });
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.gaveUp).toBe(1);
    const replyWrites = writes.filter((w) => w.table === schema.replies);
    expect(replyWrites.some((w) => w.set?.agentStatus === "pending")).toBe(false);
    const failed = replyWrites.find((w) => w.set?.agentStatus === "failed");
    expect(failed?.set.agentSummary).toContain(AGENT_SEND_INTERRUPTED.slice(0, 60));
    expect(writes.some((w) => w.op === "insert" && w.table === schema.agentRequests)).toBe(true);
  });

  it("a stuck reply without the marker is still retried as before", async () => {
    const stuck = [{ id: "stuck2", agentAttempts: 0, agentClaimedAt: "2026-11-06T11:00:00.000Z", agentSummary: null }];
    const { db, writes } = world({ stuck });
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail: vi.fn(), triage: interested });
    expect(r.gaveUp).toBe(0);
    expect(writes.some((w) => w.table === schema.replies && w.set?.agentStatus === "pending")).toBe(true);
  });
});
