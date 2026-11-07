import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";
import { AGENT_SENDING_SUMMARY, TAKEN_OVER_SUMMARY } from "@smartreach/email-engine/lead-conversations";

/* Inbox follow-ups on "Lead conversations":
 * - "Send mine" is refused once the agent has committed to sending, so the
 *   lead never gets both emails (the ConfirmDialog's promise holds).
 * - "Take over" closes the conversation's open Needs you card (like Dismiss),
 *   so the conversation is never both "Handled by: You" and waiting on a card. */

type Write = { op: "insert" | "update"; table: unknown; set?: any; values?: any; where?: any };

const st = vi.hoisted(() => ({
  routes: new Map<unknown, (fields: string[]) => any[]>(),
  writes: [] as Write[],
  /** Rows the conditional claim UPDATE on replies returns. */
  claimRows: [{ id: "row" }] as any[],
  /** Open Needs you cards a take-over closes. */
  closedCards: [{ id: "req-1" }] as any[],
  sendMail: vi.fn(async (_sender: unknown, _mail: unknown) => ({ messageId: "<m@x>" })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined })), headers: vi.fn() }));
vi.mock("../session", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "c@example.com", role: "user", emailVerified: true })),
  requireWorkspace: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../workspaces", () => ({ getActiveWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })), ACTIVE_WORKSPACE_COOKIE: "ws" }));
vi.mock("@smartreach/email-engine/mailer", () => ({ sendMail: st.sendMail }));
vi.mock("../db", () => {
  const chain = (resolve: () => any, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") {
            const p = Promise.resolve().then(resolve);
            return (p as any)[prop].bind(p);
          }
          return (...args: any[]) => {
            onCall?.(String(prop), args);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const db: any = {
    select: (fields?: Record<string, unknown>) => {
      let table: unknown;
      return chain(
        () => (st.routes.get(table) ?? (() => []))(fields ? Object.keys(fields) : []),
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["insert", "update"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table };
      st.writes.push(entry);
      let returning = false;
      return chain(
        () => {
          if (op === "update" && returning && table === schema.replies) return st.claimRows;
          if (op === "update" && returning && table === schema.agentRequests) return st.closedCards;
          return [{ id: "row" }];
        },
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
          if (prop === "where") entry.where = args[0];
          if (prop === "returning") returning = true;
        },
      );
    };
  }
  return { getDb: () => db, ensureChadGtmTables: async () => undefined, ensureAgentTables: async () => undefined };
});

import { sendUniboxReply } from "../actions";
import { claimReplyForHuman, TAKEN_OVER_RESOLUTION } from "../lead-conversations-server";
import { takeOverConversationAction } from "../lead-conversation-actions";
import { getDb } from "../db";

const dialect = new PgDialect();
const sqlOf = (w: Write) => dialect.sqlToQuery(w.where);

const REPLY = {
  id: "r1",
  userId: "u1",
  senderId: "s1",
  leadId: "l1",
  campaignId: "c1",
  fromName: "Dana Lee",
  fromEmail: "dana@acme.example",
  subject: "Re: idea",
  bodyText: "Do you integrate with HubSpot?",
  bodyHtml: "",
  messageId: "<in@acme.example>",
  receivedAt: "2026-11-06T10:00:00.000Z",
  agentStatus: "processing" as string | null,
};
const SENDER = { id: "s1", userId: "u1", isSystemPool: false, email: "me@client.example", fromName: "Me", senderName: "Me", workspaceId: "w1" };

function setup(replyOver: Partial<typeof REPLY> = {}) {
  const reply = { ...REPLY, ...replyOver };
  st.routes = new Map<unknown, (fields: string[]) => any[]>([
    [schema.replies, (fields) => (fields.includes("receivedAt") && fields.includes("subject") ? [] : [reply])],
    [schema.senderAccounts, () => [SENDER]],
    [schema.campaigns, () => [{ id: "c1", userId: "u1", workspaceId: "w1", leadConversationMode: "agent", agentOffer: "" }]],
    [schema.chadGtmRuns, () => []],
    [schema.workspaces, () => []],
    [schema.leadConversations, () => []],
    [schema.agentRequests, () => []],
  ]);
  return reply;
}

beforeEach(() => {
  st.writes = [];
  st.claimRows = [{ id: "row" }];
  st.closedCards = [{ id: "req-1" }];
  st.sendMail.mockClear();
});

describe("claimReplyForHuman and the agent's sending marker", () => {
  it("a forced claim on a 'processing' reply excludes one the agent is already sending", async () => {
    setup();
    const r = await claimReplyForHuman(getDb(), { userId: "u1", replyId: "r1", previous: "processing", force: true, nowIso: "t" });
    expect(r).toEqual({ ok: true });
    const q = sqlOf(st.writes[0]!);
    expect(q.sql).toContain('"agent_summary" is null');
    expect(q.sql).toContain('"agent_summary" <> $');
    expect(q.params).toContain(AGENT_SENDING_SUMMARY);
  });

  it("a normal claim on another status does not look at the marker", async () => {
    setup({ agentStatus: "escalated" });
    await claimReplyForHuman(getDb(), { userId: "u1", replyId: "r1", previous: "escalated", nowIso: "t" });
    expect(sqlOf(st.writes[0]!).params).not.toContain(AGENT_SENDING_SUMMARY);
  });

  it("a forced claim that loses to the agent's send reports agentSending", async () => {
    setup();
    st.claimRows = [];
    const r = await claimReplyForHuman(getDb(), { userId: "u1", replyId: "r1", previous: "processing", force: true, nowIso: "t" });
    expect(r).toEqual({ ok: false, current: "processing", agentSending: true });
  });
});

describe("sendUniboxReply with 'Send mine' after the agent started sending", () => {
  it("refuses, sends nothing and asks the person to check the conversation", async () => {
    setup();
    st.claimRows = [];
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes, we sync both ways.", force: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("The agent already started sending its reply, so yours wasn't sent. Check the conversation first.");
      expect(r.fieldErrors).toEqual({ conversation: ["changed"] });
    }
    expect(st.sendMail).not.toHaveBeenCalled();
  });

  it("without force it still asks first ('drafting'), as before", async () => {
    setup();
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes." });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toEqual({ agent: ["drafting"] });
    expect(st.sendMail).not.toHaveBeenCalled();
  });
});

describe("takeOverConversationAction closes the open Needs you card", () => {
  it("sets the handler to you, closes open cards for the conversation and frees waiting replies", async () => {
    setup({ agentStatus: "escalated" });
    const r = await takeOverConversationAction({ replyId: "r1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.closedRequests).toBe(1);
      expect(r.message).toBe("You've taken over; the agent won't reply here. Its Needs you card is closed.");
    }

    const handler = st.writes.find((w) => w.op === "insert" && w.table === schema.leadConversations);
    expect(handler?.values).toMatchObject({ leadId: "l1", campaignId: "c1", handler: "you", handlerReason: "take_over" });

    const closed = st.writes.find((w) => w.op === "update" && w.table === schema.agentRequests)!;
    expect(closed.set).toMatchObject({ status: "dismissed", resolution: TAKEN_OVER_RESOLUTION });
    const cq = sqlOf(closed);
    expect(cq.params).toEqual(expect.arrayContaining(["u1", "l1", "c1", "open"]));
    // A card whose send is in flight is left to that send.
    expect(cq.params).not.toContain("sending");

    const freed = st.writes.find((w) => w.op === "update" && w.table === schema.replies)!;
    expect(freed.set).toMatchObject({ agentStatus: "skipped", agentIntent: "manual", agentSummary: TAKEN_OVER_SUMMARY });
    const fq = sqlOf(freed);
    expect(fq.params).toEqual(expect.arrayContaining(["u1", "l1", "c1", "pending", "escalated"]));
    // Held replies keep their reason (account on hold): nothing can be sent yet.
    expect(fq.params).not.toContain("held");
    // Nothing is sent by taking over.
    expect(st.sendMail).not.toHaveBeenCalled();
  });

  it("with no open card the message stays the plain take-over confirmation", async () => {
    setup({ agentStatus: "pending" });
    st.closedCards = [];
    const r = await takeOverConversationAction({ replyId: "r1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.closedRequests).toBe(0);
      expect(r.message).toBe("You've taken over; the agent won't reply here.");
    }
  });
});
