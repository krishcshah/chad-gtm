import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

/* ─── Fake Drizzle client: selects resolve by table, writes are recorded ── */

type Handler = unknown[] | ((call: number) => unknown[]);

function tableDb(routes: Map<unknown, Handler>) {
  const writes: { op: "update" | "insert" | "delete"; table: unknown; set?: any; values?: any }[] = [];
  const counts = new Map<unknown, number>();
  const thenable = (resolve: () => unknown, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") {
            const p = Promise.resolve().then(resolve);
            return (prop === "then" ? p.then : p.catch).bind(p);
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
    select: () => {
      let table: unknown;
      return thenable(
        () => {
          const n = counts.get(table) ?? 0;
          counts.set(table, n + 1);
          const h = routes.get(table);
          return typeof h === "function" ? h(n) : (h ?? []);
        },
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["update", "insert", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: (typeof writes)[number] = { op, table };
      writes.push(entry);
      return thenable(
        () => [{ id: "row" }],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
        },
      );
    };
  }
  return { db, writes };
}

const { requireUser, state, testConnection } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  state: { db: null as any },
  testConnection: vi.fn(),
}));

vi.mock("../session", () => ({ requireUser: () => requireUser() }));
vi.mock("../db", () => ({ getDb: () => state.db, ensureChadGtmTables: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../leads-directory", () => ({ importDirectoryLeadsFromCsv: vi.fn(), getDirectoryStats: vi.fn() }));
vi.mock("@smartreach/email-engine/mailer", () => ({ testConnection }));
vi.mock("@smartreach/database", async (orig) => ({
  ...(await orig<typeof import("@smartreach/database")>()),
  encryptSecret: (s: string) => (s ? `enc:${s}` : ""),
}));

import {
  changeSystemMailboxPassword,
  importSystemMailboxesCsv,
  retireSystemMailbox,
  toggleSystemMailboxStatus,
} from "../admin-gtm-actions";

const ADMIN = { id: "admin-1", email: "admin@autogtm.tech", role: "admin", emailVerified: true };
const USER = { id: "u-1", email: "user@example.com", role: "user", emailVerified: true };

const csvRow = (email: string) => ({
  senderName: "Jane Doe",
  email,
  smtpHost: "smtp.example.com",
  smtpPort: "587",
  smtpUsername: email,
  smtpPassword: "secret",
  imapHost: "imap.example.com",
  imapPort: "993",
  imapUsername: email,
  imapPassword: "secret",
  dailyLimit: "50",
});

const passing = { smtp: { ok: true, message: "ok" }, imap: { ok: true, message: "ok" } };

beforeEach(() => {
  requireUser.mockReset();
  testConnection.mockReset();
  testConnection.mockResolvedValue(passing);
});

describe("importSystemMailboxesCsv: dedicated mailbox for one customer", () => {
  it("saves a non-pool mailbox owned by the customer, in their default workspace, after a login test", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.users, [{ id: "cust-1" }]],
        [schema.workspaces, [{ id: "ws-default" }]],
        [schema.senderAccounts, []],
      ]),
    );
    state.db = db;
    const res = await importSystemMailboxesCsv([csvRow("Jane@Customer.com")], { ownerEmail: " Cust@Example.com " });
    expect(res).toMatchObject({ ok: true, imported: 1, activated: 1, failed: [] });
    expect(testConnection).toHaveBeenCalledTimes(1);
    const insert = writes.find((w) => w.op === "insert" && w.table === schema.senderAccounts);
    expect(insert?.values).toMatchObject({
      userId: "cust-1",
      workspaceId: "ws-default",
      isSystemPool: false,
      email: "jane@customer.com",
      dailyLimit: 30,
      status: "active",
    });
  });

  it("skips the pool's per-domain cap for dedicated mailboxes", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.users, [{ id: "cust-1" }]],
        [schema.workspaces, []],
        [
          schema.senderAccounts,
          [
            { email: "a@x.com", isSystemPool: true },
            { email: "b@x.com", isSystemPool: true },
            { email: "c@x.com", isSystemPool: true },
          ],
        ],
      ]),
    );
    state.db = db;
    const res = await importSystemMailboxesCsv([csvRow("d@x.com")], { ownerEmail: "cust@example.com" });
    expect(res.imported).toBe(1);
    const insert = writes.find((w) => w.op === "insert");
    // No default workspace yet: null, which ensureDefaultWorkspace backfills.
    expect(insert?.values).toMatchObject({ userId: "cust-1", workspaceId: null, isSystemPool: false });
  });

  it("keeps a dedicated mailbox inactive when the login test fails", async () => {
    requireUser.mockResolvedValue(ADMIN);
    testConnection.mockResolvedValue({ smtp: { ok: true, message: "ok" }, imap: { ok: false, message: "IMAP failed" } });
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.users, [{ id: "cust-1" }]],
        [schema.workspaces, [{ id: "ws-default" }]],
      ]),
    );
    state.db = db;
    const res = await importSystemMailboxesCsv([csvRow("jane@customer.com")], { ownerEmail: "cust@example.com" });
    expect(res).toMatchObject({ imported: 1, activated: 0 });
    expect(writes.find((w) => w.op === "insert")?.values).toMatchObject({ status: "failed", isSystemPool: false });
  });

  it("saves nothing when no account uses the email", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.users, []]]));
    state.db = db;
    const res = await importSystemMailboxesCsv([csvRow("jane@customer.com")], { ownerEmail: "nobody@example.com" });
    expect(res).toEqual({
      ok: false,
      imported: 0,
      activated: 0,
      inactive: [],
      failed: [{ row: 0, error: "No account uses that email" }],
    });
    expect(writes).toEqual([]);
    expect(testConnection).not.toHaveBeenCalled();
  });

  it("without ownerEmail still imports into the shared pool as the admin", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, []]]));
    state.db = db;
    await importSystemMailboxesCsv([csvRow("pool@x.com")]);
    const values = writes.find((w) => w.op === "insert")?.values;
    expect(values).toMatchObject({ userId: "admin-1", isSystemPool: true });
    expect(values).not.toHaveProperty("workspaceId");
  });

  it("refuses a non-admin caller", async () => {
    requireUser.mockResolvedValue(USER);
    state.db = tableDb(new Map()).db;
    await expect(importSystemMailboxesCsv([csvRow("a@x.com")], { ownerEmail: "user@example.com" })).rejects.toThrow(
      /Admin privileges required/,
    );
  });
});

describe("retireSystemMailbox", () => {
  it("is admin-only", async () => {
    requireUser.mockResolvedValue(USER);
    state.db = tableDb(new Map()).db;
    await expect(retireSystemMailbox("s1")).rejects.toThrow(/Admin privileges required/);
  });

  it("soft-deletes a pool mailbox: sets deletedAt and pauses it", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, [{ id: "s1" }]]]));
    state.db = db;
    expect(await retireSystemMailbox("s1")).toEqual({ ok: true });
    const update = writes.find((w) => w.op === "update" && w.table === schema.senderAccounts);
    expect(update?.set).toMatchObject({ status: "paused" });
    expect(typeof update?.set.deletedAt).toBe("string");
    expect(writes.some((w) => w.op === "delete")).toBe(false);
  });

  it("refuses a mailbox that is not in the shared pool (or already retired)", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, []]]));
    state.db = db;
    expect(await retireSystemMailbox("own-mailbox")).toMatchObject({ ok: false });
    expect(writes).toEqual([]);
  });
});

describe("toggleSystemMailboxStatus activation", () => {
  const failedSender = {
    id: "s1",
    email: "box@pool.example",
    isSystemPool: true,
    status: "failed",
    failureCount: 3,
    failedReason: "Connection timed out",
    imapFailCount: 2,
  };

  it("a passing login test clears failure_count, failed_reason and imap_fail_count", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, (n) => (n === 0 ? [failedSender] : [])]]));
    state.db = db;
    expect(await toggleSystemMailboxStatus("s1", "active")).toEqual({ ok: true });
    expect(writes.find((w) => w.op === "update")?.set).toMatchObject({
      status: "active",
      failureCount: 0,
      failedReason: null,
      imapFailCount: 0,
    });
  });

  it("a failing login test leaves the failure details in place", async () => {
    requireUser.mockResolvedValue(ADMIN);
    testConnection.mockResolvedValue({ smtp: { ok: false, message: "SMTP failed" }, imap: { ok: true, message: "ok" } });
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, (n) => (n === 0 ? [failedSender] : [])]]));
    state.db = db;
    expect((await toggleSystemMailboxStatus("s1", "active")).ok).toBe(false);
    const set = writes.find((w) => w.op === "update")?.set;
    expect(set).toMatchObject({ status: "failed" });
    expect(set).not.toHaveProperty("failureCount");
    expect(set).not.toHaveProperty("failedReason");
  });
});

describe("changeSystemMailboxPassword", () => {
  const sender = (status: string) => ({
    id: "s1",
    email: "box@pool.example",
    isSystemPool: true,
    status,
    smtpPasswordEnc: "enc:old",
    imapPasswordEnc: "enc:old",
    failureCount: 4,
    failedReason: "535 Authentication failed",
    imapFailCount: 3,
  });
  // First select: the mailbox; second: pool mailboxes for the domain cap.
  const route = (row: unknown, pool: unknown[] = [{ id: "s1", email: "box@pool.example" }]) =>
    new Map<unknown, Handler>([[schema.senderAccounts, (n) => (n === 0 ? (row ? [row] : []) : pool)]]);

  it("refuses non-admins", async () => {
    requireUser.mockResolvedValue(USER);
    state.db = tableDb(route(sender("active"))).db;
    await expect(changeSystemMailboxPassword("s1", { password: "new-pass" })).rejects.toThrow(/Admin/);
  });

  it("tests the new password before saving and saves it encrypted for SMTP and IMAP", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(route(sender("failed")));
    state.db = db;
    expect(await changeSystemMailboxPassword("s1", { password: "new-pass" })).toEqual({ ok: true, outcome: "active" });
    // The login test used the new password, not the stored one.
    expect(testConnection.mock.calls[0]![0]).toMatchObject({ smtpPasswordEnc: "enc:new-pass", imapPasswordEnc: "enc:new-pass" });
    expect(writes.find((w) => w.op === "update")?.set).toMatchObject({
      smtpPasswordEnc: "enc:new-pass",
      imapPasswordEnc: "enc:new-pass",
      status: "active",
      smtpStatus: "ok",
      imapStatus: "ok",
      failureCount: 0,
      failedReason: null,
      imapFailCount: 0,
    });
  });

  it("uses a separate IMAP password when one is given", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(route(sender("active")));
    state.db = db;
    await changeSystemMailboxPassword("s1", { password: "smtp-pass", imapPassword: "imap-pass" });
    expect(writes.find((w) => w.op === "update")?.set).toMatchObject({
      smtpPasswordEnc: "enc:smtp-pass",
      imapPasswordEnc: "enc:imap-pass",
    });
  });

  it("never saves a password whose login fails", async () => {
    requireUser.mockResolvedValue(ADMIN);
    testConnection.mockResolvedValue({ smtp: { ok: false, message: "535 Authentication failed" }, imap: { ok: true, message: "ok" } });
    const { db, writes } = tableDb(route(sender("active")));
    state.db = db;
    const res = await changeSystemMailboxPassword("s1", { password: "typo" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Not saved/);
    expect(res.error).not.toContain("typo");
    expect(writes.filter((w) => w.op === "update")).toHaveLength(0);
  });

  it("keeps a paused mailbox paused", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const { db, writes } = tableDb(route(sender("paused")));
    state.db = db;
    expect(await changeSystemMailboxPassword("s1", { password: "new-pass" })).toEqual({ ok: true, outcome: "paused" });
    expect(writes.find((w) => w.op === "update")?.set).toMatchObject({ status: "paused" });
  });

  it("does not re-activate a failing mailbox whose domain is over the cap", async () => {
    requireUser.mockResolvedValue(ADMIN);
    const pool = [
      { id: "s1", email: "box@pool.example" },
      { id: "s2", email: "a@pool.example" },
      { id: "s3", email: "b@pool.example" },
      { id: "s4", email: "c@pool.example" },
    ];
    const { db, writes } = tableDb(route(sender("failed"), pool));
    state.db = db;
    expect(await changeSystemMailboxPassword("s1", { password: "new-pass" })).toEqual({ ok: true, outcome: "domain_cap" });
    expect(writes.find((w) => w.op === "update")?.set).toMatchObject({ status: "paused" });
  });

  it("rejects an empty password and unknown or retired mailboxes without testing", async () => {
    requireUser.mockResolvedValue(ADMIN);
    state.db = tableDb(route(sender("active"))).db;
    expect((await changeSystemMailboxPassword("s1", { password: "   " })).error).toBe("Enter the new password.");
    state.db = tableDb(route(null)).db;
    expect((await changeSystemMailboxPassword("gone", { password: "new-pass" })).ok).toBe(false);
    expect(testConnection).not.toHaveBeenCalled();
  });
});
