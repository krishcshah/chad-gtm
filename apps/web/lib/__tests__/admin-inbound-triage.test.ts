import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

/* #68 / #69: the admin triage queue for pool mailbox mail that matched no
 * customer (or several). Admin-only; assigning files the message in the
 * customer's Inbox exactly once. */

type Write = { op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any };

const st = vi.hoisted(() => ({
  user: { id: "admin-1", email: "ops@autogtm.example", role: "admin" } as Record<string, any>,
  writes: [] as Write[],
  row: null as Record<string, any> | null,
  users: [] as Array<{ id: string; email: string }>,
  jobs: [] as Array<{ campaignId: string; workspaceId: string | null }>,
  workspaces: [] as Array<{ id: string }>,
  sender: { id: "P", email: "alex@pool.example", isSystemPool: true } as Record<string, any> | null,
  listRows: [] as Array<Record<string, any>>,
  claimOk: true,
  recordRoutedReply: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => st.user) }));
vi.mock("@smartreach/email-engine/sync-replies", () => ({ recordRoutedReply: st.recordRoutedReply }));
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
  const route = (table: unknown, fields: string[]): any[] => {
    if (table === schema.unmatchedInbound) {
      if (fields.includes("mailboxEmail")) return st.listRows;
      return st.row ? [st.row] : [];
    }
    if (table === schema.users) return st.users;
    if (table === schema.senderAccounts) return st.sender ? [st.sender] : [];
    if (table === schema.emailJobs) return st.jobs;
    if (table === schema.workspaces) return st.workspaces;
    return [];
  };
  const db: any = {
    select: (fields?: Record<string, unknown>) => {
      let table: unknown;
      return chain(
        () => route(table, fields ? Object.keys(fields) : []),
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["insert", "update", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table };
      st.writes.push(entry);
      return chain(
        () => {
          if (op === "update" && table === schema.unmatchedInbound && entry.set?.status) {
            if (!st.claimOk || !st.row || st.row.status !== "open") return [];
            Object.assign(st.row, entry.set);
          }
          return [{ id: "row" }];
        },
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
        },
      );
    };
  }
  return { getDb: () => db };
});

import {
  assignUnmatchedInboundAction,
  dismissUnmatchedInboundAction,
  listUnmatchedInboundAction,
} from "../admin-inbound-triage-actions";

function openRow(over: Record<string, any> = {}) {
  return {
    id: "u-1",
    senderId: "P",
    messageId: "<m1@acme.example>",
    fromEmail: "dana@acme.example",
    fromName: "Dana",
    subject: "Saw your note",
    snippet: "Can we talk?",
    bodyText: "Can we talk?",
    bodyHtml: "",
    receivedAt: "2026-11-07T10:00:00.000Z",
    candidateUserIds: ["cust-a"],
    reason: "no_match",
    status: "open",
    ...over,
  };
}

beforeEach(() => {
  st.user = { id: "admin-1", email: "ops@autogtm.example", role: "admin" };
  st.writes = [];
  st.row = openRow();
  st.users = [{ id: "cust-a", email: "owner@customer-a.example" }];
  st.jobs = [{ campaignId: "camp-a", workspaceId: "ws-a" }];
  st.workspaces = [{ id: "ws-default" }];
  st.sender = { id: "P", email: "alex@pool.example", isSystemPool: true };
  st.listRows = [];
  st.claimOk = true;
  st.recordRoutedReply.mockReset();
  st.recordRoutedReply.mockResolvedValue({ replyId: "reply-1" });
});

describe("admin-only", () => {
  beforeEach(() => {
    st.user = { id: "cust-a", email: "owner@customer-a.example", role: "user" };
  });
  it("list is refused for a non-admin", async () => {
    await expect(listUnmatchedInboundAction()).rejects.toThrow(/Admin/);
  });
  it("assign is refused for a non-admin and writes nothing", async () => {
    await expect(assignUnmatchedInboundAction("u-1", "owner@customer-a.example")).rejects.toThrow(/Admin/);
    expect(st.writes).toHaveLength(0);
    expect(st.recordRoutedReply).not.toHaveBeenCalled();
  });
  it("dismiss is refused for a non-admin and writes nothing", async () => {
    await expect(dismissUnmatchedInboundAction("u-1")).rejects.toThrow(/Admin/);
    expect(st.writes).toHaveLength(0);
  });
});

describe("listUnmatchedInboundAction", () => {
  it("resolves candidates to their login emails", async () => {
    st.listRows = [
      {
        id: "u-1",
        mailboxEmail: "alex@pool.example",
        fromEmail: "dana@acme.example",
        fromName: "Dana",
        subject: "Saw your note",
        snippet: "Can we talk?",
        receivedAt: "2026-11-07T10:00:00.000Z",
        reason: "ambiguous_owner",
        candidateUserIds: ["cust-a", "gone"],
      },
    ];
    const items = await listUnmatchedInboundAction();
    expect(items).toEqual([
      expect.objectContaining({
        id: "u-1",
        mailboxEmail: "alex@pool.example",
        reason: "ambiguous_owner",
        candidates: [{ userId: "cust-a", email: "owner@customer-a.example" }],
      }),
    ]);
  });
});

describe("assignUnmatchedInboundAction", () => {
  it("creates the customer's reply and marks the row assigned", async () => {
    const res = await assignUnmatchedInboundAction("u-1", " Owner@Customer-A.example ");
    expect(res).toEqual({ ok: true });
    expect(st.recordRoutedReply).toHaveBeenCalledTimes(1);
    const input = st.recordRoutedReply.mock.calls[0]![1];
    expect(input).toMatchObject({
      ownerId: "cust-a",
      workspaceId: "ws-a",
      campaignId: "camp-a",
      lead: null,
      routed: "admin",
      messageId: "<m1@acme.example>",
      from: { name: "Dana", email: "dana@acme.example" },
    });
    expect(input.sender).toMatchObject({ id: "P" });
    const claim = st.writes.find((w) => w.table === schema.unmatchedInbound && w.set?.status === "assigned");
    expect(claim?.set).toMatchObject({ assignedUserId: "cust-a" });
    expect(claim?.set.resolvedAt).toBeTruthy();
    const link = st.writes.find((w) => w.table === schema.unmatchedInbound && w.set?.replyId);
    expect(link?.set).toEqual({ replyId: "reply-1" });
    expect(st.row?.status).toBe("assigned");
  });

  it("files it in the customer's default workspace when none of their campaigns emailed that company", async () => {
    st.jobs = [];
    await assignUnmatchedInboundAction("u-1", "owner@customer-a.example");
    expect(st.recordRoutedReply.mock.calls[0]![1]).toMatchObject({ campaignId: null, workspaceId: "ws-default" });
  });

  it("refuses a row that is already assigned", async () => {
    st.row = openRow({ status: "assigned", assignedUserId: "cust-b" });
    const res = await assignUnmatchedInboundAction("u-1", "owner@customer-a.example");
    expect(res.ok).toBe(false);
    expect(st.recordRoutedReply).not.toHaveBeenCalled();
    expect(st.writes).toHaveLength(0);
  });

  it("refuses when another admin claimed it first", async () => {
    st.claimOk = false;
    const res = await assignUnmatchedInboundAction("u-1", "owner@customer-a.example");
    expect(res.ok).toBe(false);
    expect(st.recordRoutedReply).not.toHaveBeenCalled();
  });

  it("refuses an unknown customer email", async () => {
    st.users = [];
    const res = await assignUnmatchedInboundAction("u-1", "nobody@example.com");
    expect(res).toEqual({ ok: false, error: "No account uses nobody@example.com." });
    expect(st.writes).toHaveLength(0);
  });

  it("puts the row back when the reply could not be recorded", async () => {
    st.recordRoutedReply.mockResolvedValue(null);
    const res = await assignUnmatchedInboundAction("u-1", "owner@customer-a.example");
    expect(res.ok).toBe(false);
    const reopen = st.writes.find((w) => w.table === schema.unmatchedInbound && w.set?.status === "open");
    expect(reopen?.set).toEqual({ status: "open", assignedUserId: null, resolvedAt: null });
  });
});

describe("dismissUnmatchedInboundAction", () => {
  it("marks an open row dismissed", async () => {
    expect(await dismissUnmatchedInboundAction("u-1")).toEqual({ ok: true });
    const w = st.writes.find((x) => x.table === schema.unmatchedInbound);
    expect(w?.set).toMatchObject({ status: "dismissed" });
    expect(w?.set.resolvedAt).toBeTruthy();
  });

  it("refuses a row that is no longer open", async () => {
    st.row = openRow({ status: "assigned" });
    expect((await dismissUnmatchedInboundAction("u-1")).ok).toBe(false);
  });
});
