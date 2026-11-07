import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* #72: the company name and postal address are saved on one workspace of the
 * owner. Another user's workspace is "not found"; the legacy account row
 * (workspace_settings) is never written. */

const dialect = new PgDialect();

const st = vi.hoisted(() => ({
  writes: [] as Array<{ op: string; table: unknown; set?: any; values?: any; where?: any }>,
  workspaces: [] as Array<Record<string, any>>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "c@example.com", role: "user" })) }));
vi.mock("../workspaces", () => ({ ensureDefaultWorkspace: vi.fn(async () => ({ id: "wA" })) }));
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
  const select = () => {
    let table: unknown;
    let where: any;
    return chain(
      () => {
        if (table !== schema.workspaces) return [];
        const params = where ? dialect.sqlToQuery(where).params.map(String) : [];
        return st.workspaces.filter((w) => params.every((p) => p === w.id || p === w.userId)).slice(0, 1);
      },
      (prop, args) => {
        if (prop === "from") table = args[0];
        if (prop === "where") where = args[0];
      },
    );
  };
  const write = (op: string) => (table: unknown) => {
    const entry: (typeof st.writes)[number] = { op, table };
    st.writes.push(entry);
    return chain(
      () => {
        if (op !== "update" || table !== schema.workspaces) return [{ id: "row" }];
        const params = dialect.sqlToQuery(entry.where).params.map(String);
        const ws = st.workspaces.find((w) => params.includes(w.id) && params.includes(w.userId));
        if (!ws) return [];
        Object.assign(ws, entry.set);
        return [{ id: ws.id }];
      },
      (prop, args) => {
        if (prop === "set") entry.set = args[0];
        if (prop === "values") entry.values = args[0];
        if (prop === "where") entry.where = args[0];
      },
    );
  };
  return { getDb: () => ({ select, update: write("update"), insert: write("insert"), delete: write("delete") }) };
});

import { saveSenderIdentityAction } from "../workspace-profile-actions";

const ADDRESS = "9 Side Rd, Shelbyville, IL 62565, USA";

beforeEach(() => {
  st.writes = [];
  st.workspaces = [
    { id: "wA", userId: "u1", name: "Client A", isDefault: true, companyName: "Acme", postalAddress: "1 Main St, Springfield, IL 62701, USA" },
    { id: "wB", userId: "u1", name: "Client B", isDefault: false, companyName: "", postalAddress: "" },
    { id: "wX", userId: "u2", name: "Someone else", isDefault: true, companyName: "Other", postalAddress: "7 Elsewhere" },
  ];
});

describe("saveSenderIdentityAction", () => {
  it("rejects a workspace owned by another user and writes nothing", async () => {
    const r = await saveSenderIdentityAction({ workspaceId: "wX", companyName: "Bolt Labs", postalAddress: ADDRESS });
    expect(r).toEqual({ ok: false, error: "Workspace not found." });
    expect(st.writes).toEqual([]);
    expect(st.workspaces.find((w) => w.id === "wX")!.companyName).toBe("Other");
  });

  it("writes only the given workspace row and never the legacy account row", async () => {
    const r = await saveSenderIdentityAction({ workspaceId: "wB", companyName: " Bolt Labs ", postalAddress: ADDRESS });
    expect(r).toMatchObject({ ok: true, message: "Sender details saved for Client B" });
    expect(st.writes).toHaveLength(1);
    expect(st.writes[0]!.op).toBe("update");
    expect(st.writes[0]!.table).toBe(schema.workspaces);
    expect(st.writes.some((w) => w.table === schema.workspaceSettings)).toBe(false);
    const [a, b] = st.workspaces;
    expect(b).toMatchObject({ companyName: "Bolt Labs", postalAddress: ADDRESS });
    // Client A keeps its own footer.
    expect(a).toMatchObject({ companyName: "Acme", postalAddress: "1 Main St, Springfield, IL 62701, USA" });
  });

  it("returns field errors for an address that is not a real postal address", async () => {
    const r = await saveSenderIdentityAction({ workspaceId: "wB", companyName: "Bolt Labs", postalAddress: "TBD" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.postalAddress?.length).toBeGreaterThan(0);
    expect(st.writes).toEqual([]);
  });
});
