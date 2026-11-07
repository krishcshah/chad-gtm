import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: null as any,
  directoryCount: 0,
  directoryDeleted: 0,
}));

vi.mock("../db", () => ({ getDb: () => h.db }));
vi.mock("../admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("../leads-directory", () => ({
  directoryCountByEmail: vi.fn(() => h.directoryCount),
  deleteDirectoryLeadsByEmail: vi.fn(() => h.directoryDeleted),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { schema } from "@smartreach/database";
import {
  ERASE_FIRST_ERROR,
  eraseDataForRemovalRequestForAdmin,
  submitDataRemovalRequest,
  updateDataRemovalStatusForAdmin,
} from "../data-removal";
import { deleteDirectoryLeadsByEmail } from "../leads-directory";

const dialect = new PgDialect();
const ADMIN = { email: "admin@example.com" };

type Op = { op: "select" | "insert" | "update"; table: unknown; values?: any; where?: SQL };

/**
 * Drizzle-shaped fake. Selects resolve in order from `selectResults`; every
 * insert/update is recorded in `ops` (in call order). `failInsertOn` makes the
 * insert into that table reject.
 */
function fakeDb(selectResults: any[][], opts: { failInsertOn?: unknown; returning?: any[] } = {}) {
  const ops: Op[] = [];
  const db: any = {
    select: () => {
      const result = selectResults.shift() ?? [];
      const op: Op = { op: "select", table: null };
      ops.push(op);
      const c: any = {
        from: (t: unknown) => {
          op.table = t;
          return c;
        },
        where: (w: SQL) => {
          op.where = w;
          return c;
        },
        limit: () => Promise.resolve(result),
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      };
      return c;
    },
    insert: (table: unknown) => ({
      values: (values: any) => {
        ops.push({ op: "insert", table, values });
        if (table === opts.failInsertOn) return Promise.reject(new Error("db down"));
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => {
      const op: Op = { op: "update", table };
      ops.push(op);
      const c: any = {
        set: (values: any) => {
          op.values = values;
          return c;
        },
        where: (w: SQL) => {
          op.where = w;
          return c;
        },
        returning: () => Promise.resolve(opts.returning ?? []),
        then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
      };
      return c;
    },
  };
  return { db, ops };
}

const writes = (ops: Op[]) => ops.filter((o) => o.op !== "select");
const sqlOf = (w: SQL | undefined) => (w ? dialect.sqlToQuery(w) : { sql: "", params: [] as unknown[] });

beforeEach(() => {
  h.directoryCount = 0;
  h.directoryDeleted = 0;
  vi.mocked(deleteDirectoryLeadsByEmail).mockClear();
});

describe("submitDataRemovalRequest", () => {
  it("adds an ownerless erasure suppression (lowercased) before the request row", async () => {
    const { db, ops } = fakeDb([[]]);
    h.db = db;
    const res = await submitDataRemovalRequest({ contactEmail: "  Pat@Acme.COM ", description: "Delete me" });
    expect(res.ok).toBe(true);
    const w = writes(ops);
    expect(w.map((o) => o.table)).toEqual([schema.suppressions, schema.dataRemovalRequests]);
    expect(w[0]!.values).toMatchObject({
      userId: null,
      workspaceId: null,
      value: "pat@acme.com",
      kind: "email",
      source: "erasure",
    });
    expect(w[1]!.values).toMatchObject({ contactEmail: "pat@acme.com", status: "pending" });
  });

  it("does not add a second suppression for an address already erased", async () => {
    const { db, ops } = fakeDb([[{ id: "s1" }]]);
    h.db = db;
    const res = await submitDataRemovalRequest({ contactEmail: "pat@acme.com", description: "Again" });
    expect(res.ok).toBe(true);
    expect(writes(ops).map((o) => o.table)).toEqual([schema.dataRemovalRequests]);
    const lookup = sqlOf(ops[0]!.where);
    expect(lookup.params).toEqual(expect.arrayContaining(["pat@acme.com", "erasure"]));
  });

  it("fails closed: no request row when the suppression cannot be written", async () => {
    const { db, ops } = fakeDb([[]], { failInsertOn: schema.suppressions });
    h.db = db;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await submitDataRemovalRequest({ contactEmail: "pat@acme.com", description: "Delete me" });
    spy.mockRestore();
    expect(res).toEqual({ ok: false, error: "We could not record your request. Try again." });
    expect(writes(ops).some((o) => o.table === schema.dataRemovalRequests)).toBe(false);
  });

  it("still validates input first", async () => {
    const { db, ops } = fakeDb([]);
    h.db = db;
    expect((await submitDataRemovalRequest({ contactEmail: "nope", description: "x y z" })).ok).toBe(false);
    expect(ops).toEqual([]);
  });
});

describe("updateDataRemovalStatusForAdmin", () => {
  it("refuses 'completed' while an active lead still has the address", async () => {
    const { db, ops } = fakeDb([[{ contactEmail: "pat@acme.com", status: "in_progress" }], [{ n: 1 }]]);
    h.db = db;
    const res = await updateDataRemovalStatusForAdmin(ADMIN, "r1", "completed");
    expect(res).toEqual({ ok: false, error: ERASE_FIRST_ERROR });
    expect(writes(ops)).toEqual([]);
    const leadCheck = sqlOf(ops[1]!.where);
    expect(leadCheck.sql).toMatch(/lower\("leads"\."email"\) = \$1/);
    expect(leadCheck.sql).toContain('"leads"."deleted_at" is null');
  });

  it("refuses 'completed' while the directory still has the address", async () => {
    const { db, ops } = fakeDb([[{ contactEmail: "pat@acme.com", status: "in_progress" }], [{ n: 0 }]]);
    h.db = db;
    h.directoryCount = 2;
    const res = await updateDataRemovalStatusForAdmin(ADMIN, "r1", "completed");
    expect(res).toEqual({ ok: false, error: ERASE_FIRST_ERROR });
    expect(writes(ops)).toEqual([]);
  });

  it("allows 'completed' once the data is gone", async () => {
    const { db, ops } = fakeDb([[{ contactEmail: "pat@acme.com", status: "in_progress" }], [{ n: 0 }]]);
    h.db = db;
    const res = await updateDataRemovalStatusForAdmin(ADMIN, "r1", "completed");
    expect(res).toEqual({ ok: true });
    expect(writes(ops)).toHaveLength(1);
    expect(writes(ops)[0]!.values).toMatchObject({ status: "completed" });
  });

  it("does not check data for other statuses", async () => {
    const { db, ops } = fakeDb([]);
    h.db = db;
    expect(await updateDataRemovalStatusForAdmin(ADMIN, "r1", "rejected")).toEqual({ ok: true });
    expect(ops.filter((o) => o.op === "select")).toEqual([]);
  });
});

describe("eraseDataForRemovalRequestForAdmin", () => {
  it("blocks, deletes directory rows and leads, cancels queued sends and moves the request on", async () => {
    const { db, ops } = fakeDb(
      [
        [{ contactEmail: "Pat@Acme.com", status: "pending" }], // request
        [], // no erasure suppression yet
        [{ id: "l1" }, { id: "l2" }], // leads with that address (any owner)
      ],
      { returning: [{ id: "l1" }] },
    );
    h.db = db;
    h.directoryDeleted = 3;
    const res = await eraseDataForRemovalRequestForAdmin(ADMIN, "r1");
    expect(res).toEqual({ ok: true, directoryDeleted: 3, leadsDeleted: 1 });
    expect(deleteDirectoryLeadsByEmail).toHaveBeenCalledWith("pat@acme.com");

    const w = writes(ops);
    expect(w.map((o) => o.table)).toEqual([
      schema.suppressions,
      schema.leads,
      schema.campaignLeads,
      schema.emailJobs,
      schema.dataRemovalRequests,
    ]);
    expect(w[0]!.values).toMatchObject({ userId: null, source: "erasure", value: "pat@acme.com" });
    expect(w[1]!.values).toHaveProperty("deletedAt");
    expect(sqlOf(w[1]!.where).sql).toContain('"leads"."deleted_at" is null');
    expect(w[2]!.values).toMatchObject({ status: "cancelled" });
    expect(sqlOf(w[2]!.where).params).toEqual(expect.arrayContaining(["l1", "l2", "queued", "scheduled"]));
    expect(w[3]!.values).toMatchObject({ status: "cancelled", lastError: "erased" });
    const jobs = sqlOf(w[3]!.where);
    expect(jobs.sql).toMatch(/lower\("email_jobs"\."to_email"\) = \$1/);
    expect(jobs.params).toEqual(expect.arrayContaining(["pat@acme.com", "pending", "retry", "processing"]));
    expect(w[4]!.values).toMatchObject({ status: "in_progress" });

    // Every-owner lead lookup is case-insensitive and not scoped to a user.
    const leadLookup = sqlOf(ops.find((o) => o.op === "select" && o.table === schema.leads)!.where);
    expect(leadLookup.sql).toMatch(/lower\("leads"\."email"\) = \$1/);
    expect(leadLookup.sql).not.toContain("user_id");
  });

  it("stops before deleting anything when the suppression cannot be written", async () => {
    const { db, ops } = fakeDb([[{ contactEmail: "pat@acme.com", status: "pending" }], []], {
      failInsertOn: schema.suppressions,
    });
    h.db = db;
    await expect(eraseDataForRemovalRequestForAdmin(ADMIN, "r1")).rejects.toThrow("db down");
    expect(deleteDirectoryLeadsByEmail).not.toHaveBeenCalled();
    expect(ops.filter((o) => o.op === "update")).toEqual([]);
  });
});
