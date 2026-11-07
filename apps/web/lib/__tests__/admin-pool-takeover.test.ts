import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* #59: "Take over the pool" moves every shared pool mailbox (retired ones
 * included) to the signed-in admin, filed under no workspace. Admins only. */

const st = vi.hoisted(() => ({
  writes: [] as { op: string; table: unknown; set?: any; where?: any }[],
  requireUser: vi.fn(),
  moved: [{ id: "s1" }, { id: "s2" }] as { id: string }[],
}));

vi.mock("../session", () => ({ requireUser: () => st.requireUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../leads-directory", () => ({ importDirectoryLeadsFromCsv: vi.fn(), getDirectoryStats: vi.fn() }));
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
  const db: any = { select: () => chain(() => []) };
  for (const op of ["insert", "update", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: { op: string; table: unknown; set?: any; where?: any } = { op, table };
      st.writes.push(entry);
      return chain(
        () => st.moved,
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "where") entry.where = args[0];
        },
      );
    };
  }
  return { getDb: () => db, ensureChadGtmTables: vi.fn(async () => {}) };
});

import { takeOverMailboxPoolAction } from "../admin-gtm-actions";

const dialect = new PgDialect();

beforeEach(() => {
  st.writes = [];
  st.requireUser.mockReset();
});

describe("takeOverMailboxPoolAction", () => {
  it("is admin-only: a non-admin is refused and nothing is written", async () => {
    st.requireUser.mockResolvedValue({ id: "u-1", email: "user@example.com", role: "user", emailVerified: true });
    await expect(takeOverMailboxPoolAction()).rejects.toThrow(/Admin/);
    expect(st.writes).toHaveLength(0);
  });

  it("reassigns every pool row (soft-deleted too) to the caller with no workspace", async () => {
    st.requireUser.mockResolvedValue({ id: "admin-2", email: "ops@autogtm.tech", role: "admin", emailVerified: true });
    const r = await takeOverMailboxPoolAction();
    expect(r).toEqual({ ok: true, moved: 2 });
    expect(st.writes).toHaveLength(1);
    const w = st.writes[0]!;
    expect(w.op).toBe("update");
    expect(w.table).toBe(schema.senderAccounts);
    expect(w.set).toMatchObject({ userId: "admin-2", workspaceId: null });
    const q = dialect.sqlToQuery(w.where);
    expect(q.sql).toContain('"is_system_pool" = $1');
    expect(q.sql).toContain('"user_id" <> $2');
    expect(q.sql).not.toContain("deleted_at");
    expect(q.params).toEqual([true, "admin-2"]);
  });
});
