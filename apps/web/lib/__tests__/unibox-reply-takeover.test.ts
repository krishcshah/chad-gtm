import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* A person's Inbox send: claims the message so the agent cannot also answer,
 * takes the conversation over (when the agent was handling it and nothing is
 * waiting on you), closes every open Needs you card for the conversation,
 * and never sends over a newer message or a reply the agent is drafting. */

type Write = { op: "insert" | "update"; table: unknown; set?: any; values?: any; where?: any };
type Route = (fields: string[]) => any[];

const st = vi.hoisted(() => ({
  routes: new Map<unknown, (fields: string[]) => any[]>(),
  writes: [] as Write[],
  claimReturns: true,
  sendMail: vi.fn(async (_sender: unknown, _mail: unknown) => ({ messageId: "<m@x>" })),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: st.revalidatePath }));
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
          // The claim is the only update that returns rows the action checks.
          if (op === "update" && table === schema.replies && returning && !st.claimReturns) return [];
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
  agentStatus: "pending" as string | null,
};
const SENDER = { id: "s1", userId: "u1", isSystemPool: false, email: "me@client.example", fromName: "Me", senderName: "Me", workspaceId: "w1" };
const AGENT_CAMPAIGN = { id: "c1", userId: "u1", workspaceId: "w1", leadConversationMode: "agent", agentOffer: "" };
const RUN = {
  campaignId: "c1",
  bookingUrl: "https://cal.example/me",
  businessOverview: { summary: "We automate reporting." },
  offers: [{ title: "Audit", valueProp: "Find a week of work" }],
  companyName: "Client",
};

function setup(over: { reply?: Partial<typeof REPLY>; campaign?: Record<string, unknown>; requests?: any[]; newer?: any[] } = {}) {
  const reply = { ...REPLY, ...over.reply };
  st.routes = new Map<unknown, Route>([
    [schema.replies, (fields) => (fields.includes("receivedAt") && fields.includes("subject") ? (over.newer ?? []) : [reply])],
    [schema.senderAccounts, () => [SENDER]],
    [schema.campaigns, () => [{ ...AGENT_CAMPAIGN, ...over.campaign }]],
    [schema.chadGtmRuns, () => [RUN]],
    [schema.workspaces, () => []],
    [schema.leadConversations, () => []],
    [schema.agentRequests, () => over.requests ?? []],
  ]);
  return reply;
}

beforeEach(() => {
  st.writes = [];
  st.claimReturns = true;
  st.sendMail.mockClear();
  st.sendMail.mockImplementation(async () => ({ messageId: "<m@x>" }));
  st.revalidatePath.mockClear();
});

describe("sendUniboxReply on a conversation the agent handles", () => {
  it("takes the conversation over, clears the agent's open replies and closes open cards", async () => {
    setup();
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes, we sync both ways." });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.takenOver).toBe(true);
    expect(st.sendMail).toHaveBeenCalledTimes(1);

    const claim = st.writes[0]!;
    expect(claim.table).toBe(schema.replies);
    expect(claim.set).toMatchObject({ agentStatus: "human_replied" });
    expect(sqlOf(claim).params).toContain("pending");

    const handler = st.writes.find((w) => w.op === "insert" && w.table === schema.leadConversations);
    expect(handler?.values).toMatchObject({ leadId: "l1", campaignId: "c1", handler: "you", handlerReason: "send" });

    const cleared = st.writes.filter((w) => w.op === "update" && w.table === schema.replies)[1]!;
    expect(cleared.set).toMatchObject({ agentStatus: "human_replied", agentSummary: "You replied." });
    expect(sqlOf(cleared).params).toEqual(expect.arrayContaining(["l1", "c1", "pending", "escalated", "failed"]));

    const resolved = st.writes.find((w) => w.op === "update" && w.table === schema.agentRequests);
    expect(resolved?.set).toMatchObject({ status: "resolved", resolution: "Answered in the Inbox" });
    expect(sqlOf(resolved!).params).toEqual(expect.arrayContaining(["l1", "c1", "open", "sending"]));

    expect(st.revalidatePath).toHaveBeenCalledWith("/requests");
    expect(st.revalidatePath).toHaveBeenCalledWith("/unibox");
  });

  it("a Manual campaign is not 'taken over' (it already is yours)", async () => {
    setup({ campaign: { leadConversationMode: "manual" }, reply: { agentStatus: null } });
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes, we sync both ways." });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.takenOver).toBe(false);
    expect(st.writes.some((w) => w.table === schema.leadConversations)).toBe(false);
  });

  it("answering an open card whose request points at an OLDER reply still resolves it (and hands back to the agent)", async () => {
    setup({
      requests: [{ id: "req-old", leadId: "l1", campaignId: "c1", createdAt: "2026-11-06T09:00:00.000Z" }],
      reply: { agentStatus: "escalated" },
    });
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes, we sync both ways." });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.takenOver).toBe(false);
    const resolved = st.writes.find((w) => w.op === "update" && w.table === schema.agentRequests)!;
    // Matches by lead + campaign, not only the latest reply id.
    const q = sqlOf(resolved);
    expect(q.sql).toContain('"lead_id" = $');
    expect(q.params).toEqual(expect.arrayContaining(["l1", "c1"]));
  });
});

describe("sendUniboxReply never sends twice", () => {
  it("refuses while the agent is drafting (no SMTP) and returns the drafting signal", async () => {
    setup({ reply: { agentStatus: "processing" } });
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes." });
    expect(r).toEqual({ ok: false, error: "The agent is drafting a reply to this message.", fieldErrors: { agent: ["drafting"] } });
    expect(st.sendMail).not.toHaveBeenCalled();
    expect(st.writes).toEqual([]);
  });

  it("with force it claims the agent's message, sends, and the row ends 'human_replied'", async () => {
    setup({ reply: { agentStatus: "processing" } });
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes.", force: true });
    expect(r.ok).toBe(true);
    expect(st.sendMail).toHaveBeenCalledTimes(1);
    const claim = st.writes[0]!;
    expect(claim.set.agentStatus).toBe("human_replied");
    expect(sqlOf(claim).params).toContain("processing");
  });

  it("when the claim loses a race to the agent, it refuses without sending", async () => {
    setup({ reply: { agentStatus: "pending" } });
    st.claimReturns = false;
    st.routes.set(schema.replies, (fields) =>
      fields.includes("agentStatus") && fields.length === 1 ? [{ agentStatus: "processing" }] : fields.includes("subject") ? [] : [REPLY],
    );
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes." });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toEqual({ agent: ["drafting"] });
    expect(st.sendMail).not.toHaveBeenCalled();
  });

  it("an SMTP failure restores the previous agent status", async () => {
    setup({ reply: { agentStatus: "escalated" } });
    st.sendMail.mockRejectedValueOnce(new Error("SMTP down"));
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes." });
    expect(r).toEqual({ ok: false, error: "SMTP down" });
    const updates = st.writes.filter((w) => w.op === "update" && w.table === schema.replies);
    expect(updates.map((w) => w.set.agentStatus)).toEqual(["human_replied", "escalated"]);
    expect(sqlOf(updates[1]!).params).toContain("human_replied");
  });

  it("an SMTP failure after a forced claim gives the message back to the agent", async () => {
    setup({ reply: { agentStatus: "processing" } });
    st.sendMail.mockRejectedValueOnce(new Error("SMTP down"));
    await sendUniboxReply({ replyId: "r1", body: "Yes.", force: true });
    const updates = st.writes.filter((w) => w.op === "update" && w.table === schema.replies);
    expect(updates.map((w) => w.set.agentStatus)).toEqual(["human_replied", "pending"]);
  });

  it("a newer message in the conversation blocks the send with a plain message", async () => {
    setup({
      newer: [
        {
          id: "r2",
          leadId: "l1",
          campaignId: "c1",
          fromName: "Dana Lee",
          fromEmail: "dana@acme.example",
          subject: "Re: Re: idea",
          receivedAt: "2026-11-06T11:00:00.000Z",
        },
      ],
    });
    const r = await sendUniboxReply({ replyId: "r1", body: "Yes." });
    expect(r).toEqual({
      ok: false,
      error: "Dana wrote again. Read the new message, then send.",
      fieldErrors: { conversation: ["newer"] },
    });
    expect(st.sendMail).not.toHaveBeenCalled();
    expect(st.writes).toEqual([]);
  });
});
