import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

/* #72: a default workspace created late starts with the account's legacy
 * sender identity, so its campaigns are not held; an existing default is
 * never overwritten. */

const st = vi.hoisted(() => ({
  existing: [] as any[],
  legacy: [] as any[],
  inserts: [] as Array<{ table: unknown; values: any }>,
  executed: [] as unknown[],
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
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
  const db = {
    execute: async (s: unknown) => void st.executed.push(s),
    select: () => {
      let table: unknown;
      return chain(
        () => (table === schema.workspaces ? st.existing : table === schema.workspaceSettings ? st.legacy : []),
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
    insert: (table: unknown) => {
      const entry = { table, values: undefined as any };
      st.inserts.push(entry);
      return chain(
        () => [{ id: "w-new", ...entry.values }],
        (prop, args) => {
          if (prop === "values") entry.values = args[0];
        },
      );
    },
    update: () => chain(() => []),
  };
  return { getDb: () => db };
});

import { ensureDefaultWorkspace } from "../workspaces";

beforeEach(() => {
  st.existing = [];
  st.legacy = [];
  st.inserts = [];
});

describe("ensureDefaultWorkspace", () => {
  it("copies the legacy company name and postal address into a new default workspace", async () => {
    st.legacy = [{ companyName: "Acme", postalAddress: "1 Main St, Springfield, IL 62701" }];
    const ws = await ensureDefaultWorkspace("u1");
    expect(ws.id).toBe("w-new");
    const insert = st.inserts.find((i) => i.table === schema.workspaces);
    expect(insert?.values).toMatchObject({
      userId: "u1",
      isDefault: true,
      companyName: "Acme",
      postalAddress: "1 Main St, Springfield, IL 62701",
    });
    expect(st.inserts.some((i) => i.table === schema.workspaceSettings)).toBe(false);
  });

  it("starts blank when there is no legacy row", async () => {
    await ensureDefaultWorkspace("u1");
    expect(st.inserts.find((i) => i.table === schema.workspaces)?.values).toMatchObject({ companyName: "", postalAddress: "" });
  });

  it("never inserts or changes an existing default", async () => {
    st.existing = [{ id: "w1", userId: "u1", name: "Primary Workspace", isDefault: true }];
    st.legacy = [{ companyName: "Acme", postalAddress: "1 Main St" }];
    expect((await ensureDefaultWorkspace("u1")).id).toBe("w1");
    expect(st.inserts).toEqual([]);
  });
});
