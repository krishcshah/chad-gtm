import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* #59 + #63: the shared mailbox pool belongs to no workspace and can't be
 * deleted with its owner's account or a workspace; Inbox replies sent from a
 * pool mailbox are filed under the customer's workspace; a failed or retired
 * mailbox never sends a reply, and sent replies are counted apart. */

type Write = { op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any; where?: any };
type Route = (fields: string[]) => any[];

const st = vi.hoisted(() => ({
  routes: new Map<unknown, (fields: string[]) => any[]>(),
  writes: [] as Write[],
  selects: [] as { table: unknown; where?: any }[],
  sendMail: vi.fn(async (_sender: unknown, _mail: unknown) => ({ messageId: "<m@x>" })),
  recordContactHistory: vi.fn(async () => undefined),
  user: { id: "u1", email: "c@example.com", role: "user", emailVerified: true } as Record<string, unknown>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("../session", () => ({
  requireUser: vi.fn(async () => st.user),
  requireWorkspace: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../auth", () => ({ auth: { api: { signOut: vi.fn(async () => undefined) } } }));
vi.mock("../contact-guards", () => ({ recordContactHistory: st.recordContactHistory }));
vi.mock("../workspaces", () => ({
  getActiveWorkspace: vi.fn(async () => ({ id: "w-active", isDefault: true })),
  ACTIVE_WORKSPACE_COOKIE: "ws",
}));
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
      const entry: { table: unknown; where?: any } = { table: undefined };
      st.selects.push(entry);
      return chain(
        () => (st.routes.get(entry.table) ?? (() => []))(fields ? Object.keys(fields) : []),
        (prop, args) => {
          if (prop === "from") entry.table = args[0];
          if (prop === "where") entry.where = args[0];
        },
      );
    },
  };
  for (const op of ["insert", "update", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table };
      st.writes.push(entry);
      return chain(
        () => [{ id: "row" }],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
          if (prop === "where") entry.where = args[0];
        },
      );
    };
  }
  return { getDb: () => db, ensureChadGtmTables: async () => undefined, ensureAgentTables: async () => undefined };
});

import { deleteAccountAction } from "../account-actions";
import { deleteWorkspaceAction, sendUniboxReply } from "../actions";
import { POOL_OWNER_DELETE_BLOCKED, WORKSPACE_HOLDS_POOL_ERROR } from "../pool-ownership";
import { MAILBOX_OUT_OF_SERVICE_MESSAGE } from "@smartreach/email-engine";

const dialect = new PgDialect();
const sqlText = (where: any) => (where ? dialect.sqlToQuery(where).sql : "");

const env = process.env as Record<string, string | undefined>;
const savedApproval = env.SIGNUP_APPROVAL_REQUIRED;

beforeEach(() => {
  st.writes = [];
  st.selects = [];
  st.routes = new Map();
  st.sendMail.mockClear();
  st.recordContactHistory.mockClear();
  st.user = { id: "u1", email: "c@example.com", role: "user", emailVerified: true };
  env.SIGNUP_APPROVAL_REQUIRED = "false";
});
afterEach(() => {
  if (savedApproval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = savedApproval;
});

describe("deleteAccountAction and the shared pool", () => {
  it("refuses, and deletes nothing, when the account owns pool mailboxes", async () => {
    st.user = { id: "admin-1", email: "admin@autogtm.tech", role: "admin", emailVerified: true };
    st.routes.set(schema.senderAccounts, () => [{ n: 3 }]);
    const r = await deleteAccountAction("DELETE");
    expect(r).toEqual({ ok: false, error: POOL_OWNER_DELETE_BLOCKED(3) });
    expect(st.writes).toHaveLength(0);
    expect(st.recordContactHistory).not.toHaveBeenCalled();
  });

  it("counts soft-deleted pool mailboxes too (no deleted_at filter)", async () => {
    st.routes.set(schema.senderAccounts, () => [{ n: 1 }]);
    await deleteAccountAction("DELETE");
    const q = st.selects.find((s) => s.table === schema.senderAccounts);
    const text = sqlText(q?.where);
    expect(text).toContain('"is_system_pool"');
    expect(text).toContain('"user_id"');
    expect(text).not.toContain("deleted_at");
  });

  it("fails closed when the ownership check errors", async () => {
    st.routes.set(schema.senderAccounts, () => {
      throw new Error("db down");
    });
    const r = await deleteAccountAction("DELETE");
    expect(r.ok).toBe(false);
    expect(st.writes).toHaveLength(0);
  });

  it("proceeds when the account owns no pool mailboxes", async () => {
    st.routes.set(schema.senderAccounts, () => [{ n: 0 }]);
    const r = await deleteAccountAction("DELETE");
    expect(r.ok).toBe(true);
    expect(st.writes.some((w) => w.op === "delete" && w.table === schema.users)).toBe(true);
  });
});

describe("deleteWorkspaceAction and the shared pool", () => {
  it("refuses a workspace that holds pool mailboxes, deleting nothing", async () => {
    st.routes.set(schema.workspaces, () => [
      { id: "w1", userId: "u1", isDefault: false },
      { id: "w2", userId: "u1", isDefault: true },
    ]);
    st.routes.set(schema.senderAccounts, () => [{ id: "pool-1" }]);
    const r = await deleteWorkspaceAction("w1");
    expect(r).toEqual({ ok: false, error: WORKSPACE_HOLDS_POOL_ERROR });
    expect(st.writes).toHaveLength(0);
    expect(st.recordContactHistory).not.toHaveBeenCalled();
  });
});

const REPLY = {
  id: "r1",
  userId: "u1",
  senderId: "s1",
  leadId: "l1",
  campaignId: "c1",
  fromName: "Dana Lee",
  fromEmail: "dana@acme.example",
  subject: "Re: idea",
  bodyText: "Sounds good",
  bodyHtml: "",
  messageId: "<in@acme.example>",
  receivedAt: "2026-11-06T10:00:00.000Z",
  agentStatus: null as string | null,
};
const POOL_SENDER = {
  id: "s1",
  userId: "admin-1",
  isSystemPool: true,
  email: "alex@pool.example",
  fromName: "Alex",
  senderName: "Alex",
  workspaceId: "w-admin",
  status: "active",
  deletedAt: null as string | null,
};

function inbox(over: { sender?: Partial<typeof POOL_SENDER>; leadWs?: string | null; campaignWs?: string | null } = {}) {
  st.routes.set(schema.replies, (fields) => (fields.includes("receivedAt") && fields.includes("subject") ? [] : [REPLY]));
  st.routes.set(schema.senderAccounts, () => [{ ...POOL_SENDER, ...over.sender }]);
  st.routes.set(schema.leads, () => [{ workspaceId: over.leadWs ?? null }]);
  st.routes.set(schema.campaigns, () => [{ workspaceId: over.campaignWs ?? null }]);
}

describe("sendUniboxReply from a shared pool mailbox", () => {
  it("files the message under the lead's workspace, never the pool mailbox's", async () => {
    inbox({ leadWs: "w-client" });
    const r = await sendUniboxReply({ replyId: "r1", body: "Happy to." });
    expect(r.ok).toBe(true);
    const ins = st.writes.find((w) => w.op === "insert" && w.table === schema.uniboxMessages);
    expect(ins?.values.workspaceId).toBe("w-client");
  });

  it("falls back to the campaign's workspace, then the active one, never the pool's", async () => {
    inbox({ leadWs: null, campaignWs: "w-campaign" });
    await sendUniboxReply({ replyId: "r1", body: "Happy to." });
    expect(st.writes.find((w) => w.op === "insert" && w.table === schema.uniboxMessages)?.values.workspaceId).toBe(
      "w-campaign",
    );

    st.writes = [];
    inbox({ leadWs: null, campaignWs: null });
    await sendUniboxReply({ replyId: "r1", body: "Happy to." });
    expect(st.writes.find((w) => w.op === "insert" && w.table === schema.uniboxMessages)?.values.workspaceId).toBe(
      "w-active",
    );
  });

  it("a paused mailbox still sends the reply and counts it as a 'sender_reply'", async () => {
    inbox({ sender: { status: "paused" }, leadWs: "w-client" });
    const r = await sendUniboxReply({ replyId: "r1", body: "Happy to." });
    expect(r.ok).toBe(true);
    expect(st.sendMail).toHaveBeenCalledTimes(1);
    const counted = st.writes.find((w) => w.op === "insert" && w.table === schema.usageCounters);
    expect(counted?.values).toMatchObject({ entityType: "sender_reply", entityId: "s1", userId: "u1" });
  });

  it("a failed or retired mailbox never sends, and nothing is written", async () => {
    for (const sender of [{ status: "failed" }, { deletedAt: "2026-11-01T00:00:00.000Z" }]) {
      st.writes = [];
      inbox({ sender, leadWs: "w-client" });
      const r = await sendUniboxReply({ replyId: "r1", body: "Happy to." });
      expect(r).toEqual({ ok: false, error: MAILBOX_OUT_OF_SERVICE_MESSAGE });
      expect(st.sendMail).not.toHaveBeenCalled();
      expect(st.writes).toHaveLength(0);
    }
  });
});
