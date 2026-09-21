import { beforeEach, describe, expect, it } from "vitest";
import { schema } from "@smartreach/database";
import { createLeadForUser, updateLeadForUser } from "../leads";

const { leadLists, leads } = schema;

type LeadRow = {
  id: string;
  userId: string;
  listId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  website: string | null;
  linkedin: string | null;
  jobTitle: string | null;
  location: string | null;
  phone: string | null;
  industry: string | null;
  tags: string[];
  customFields: Record<string, string>;
  deletedAt: string | null;
  updatedAt?: string;
};

type ListRow = { id: string; userId: string; name: string; deletedAt: string | null };

let store: { lists: ListRow[]; leads: LeadRow[] };
let idSeq = 0;
const nextId = (p: string) => {
  idSeq += 1;
  return `${p}-${idSeq}`;
};

function resolveTable(table: Record<string | symbol, unknown>): string {
  const sym = Symbol.for("drizzle:Name");
  const named = table?.[sym];
  if (typeof named === "string") return named;
  const keys = Object.keys(table ?? {});
  if (keys.includes("listId") && keys.includes("email")) return "leads";
  if (keys.includes("name") && keys.includes("userId")) return "lead_lists";
  return "unknown";
}

function extractFilters(cond: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { queryChunks?: unknown[] };
    if (Array.isArray(n.queryChunks)) {
      const chunks = n.queryChunks as {
        name?: string;
        value?: unknown;
        constructor?: { name?: string };
      }[];
      for (let i = 0; i < chunks.length; i++) {
        const col = chunks[i];
        if (!col?.name) continue;
        const param = chunks.slice(i + 1, i + 4).find((c) => c?.constructor?.name === "Param");
        if (param && "value" in param) out[col.name] = param.value;
      }
      for (const c of chunks) walk(c);
    }
  };
  walk(cond);
  return out;
}

function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: Record<string, unknown>) {
  return rows.filter((row) => {
    for (const [k, v] of Object.entries(filters)) {
      const camel =
        k === "user_id"
          ? "userId"
          : k === "list_id"
            ? "listId"
            : k === "deleted_at"
              ? "deletedAt"
              : k === "custom_fields"
                ? "customFields"
                : k;
      if ((row as Record<string, unknown>)[camel] !== v && (row as Record<string, unknown>)[k] !== v) {
        // isNull(deletedAt) → filter may not include deleted_at; tolerate missing
        if (k === "deleted_at" || camel === "deletedAt") {
          if (v === null || v === undefined) {
            if (row.deletedAt != null) return false;
            continue;
          }
        }
        return false;
      }
    }
    return true;
  });
}

function createStoreDb() {
  return {
    select(shape?: Record<string, unknown>) {
      const ctx: { shape?: Record<string, unknown>; table: string; filters: Record<string, unknown> } = {
        shape,
        table: "",
        filters: {},
      };
      const chain = {
        from(table: Record<string | symbol, unknown>) {
          ctx.table = resolveTable(table);
          return chain;
        },
        where(cond: unknown) {
          Object.assign(ctx.filters, extractFilters(cond));
          return chain;
        },
        limit() {
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            const rows =
              ctx.table === "lead_lists"
                ? applyFilters(store.lists as unknown as Record<string, unknown>[], ctx.filters)
                : applyFilters(store.leads as unknown as Record<string, unknown>[], ctx.filters);
            if (ctx.shape) {
              resolve(
                rows.map((row) => {
                  const out: Record<string, unknown> = {};
                  for (const key of Object.keys(ctx.shape!)) {
                    out[key] = (row as Record<string, unknown>)[key];
                  }
                  return out;
                }),
              );
            } else resolve(rows);
          } catch (e) {
            reject?.(e);
          }
        },
      };
      return chain;
    },
    insert(table: Record<string | symbol, unknown>) {
      const ctx: { table: string; values: Record<string, unknown> | null } = {
        table: resolveTable(table),
        values: null,
      };
      const chain = {
        values(v: Record<string, unknown>) {
          ctx.values = v;
          return chain;
        },
        returning() {
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            if (ctx.table !== "leads" || !ctx.values) throw new Error("bad insert");
            const email = String(ctx.values.email);
            const listId = String(ctx.values.listId);
            if (
              store.leads.some(
                (l) => l.listId === listId && l.email === email && l.deletedAt == null,
              )
            ) {
              const err = new Error("duplicate key value violates unique constraint");
              (err as { code?: string }).code = "23505";
              throw err;
            }
            const row: LeadRow = {
              id: nextId("lead"),
              userId: String(ctx.values.userId),
              listId,
              email,
              firstName: (ctx.values.firstName as string | null) ?? null,
              lastName: (ctx.values.lastName as string | null) ?? null,
              company: (ctx.values.company as string | null) ?? null,
              website: (ctx.values.website as string | null) ?? null,
              linkedin: (ctx.values.linkedin as string | null) ?? null,
              jobTitle: (ctx.values.jobTitle as string | null) ?? null,
              location: (ctx.values.location as string | null) ?? null,
              phone: (ctx.values.phone as string | null) ?? null,
              industry: (ctx.values.industry as string | null) ?? null,
              tags: (ctx.values.tags as string[]) ?? [],
              customFields: (ctx.values.customFields as Record<string, string>) ?? {},
              deletedAt: null,
            };
            store.leads.push(row);
            resolve([{ id: row.id }]);
          } catch (e) {
            reject?.(e);
          }
        },
      };
      return chain;
    },
    update(table: Record<string | symbol, unknown>) {
      const ctx: { table: string; set: Record<string, unknown> | null; filters: Record<string, unknown> } =
        {
          table: resolveTable(table),
          set: null,
          filters: {},
        };
      const chain = {
        set(v: Record<string, unknown>) {
          ctx.set = v;
          return chain;
        },
        where(cond: unknown) {
          Object.assign(ctx.filters, extractFilters(cond));
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            const rows = applyFilters(store.leads as unknown as Record<string, unknown>[], ctx.filters);
            for (const row of rows) Object.assign(row, ctx.set);
            resolve([]);
          } catch (e) {
            reject?.(e);
          }
        },
      };
      return chain;
    },
  };
}

beforeEach(() => {
  idSeq = 0;
  store = {
    lists: [{ id: "list-1", userId: "user-1", name: "Prospects", deletedAt: null }],
    leads: [],
  };
});

describe("createLeadForUser", () => {
  it("creates with only listId + email", async () => {
    const result = await createLeadForUser(createStoreDb(), "user-1", {
      listId: "list-1",
      email: "Ada@Example.com",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.id).toBeTruthy();
    }
    expect(store.leads).toHaveLength(1);
    expect(store.leads[0].email).toBe("ada@example.com");
    expect(store.leads[0].customFields).toEqual({});
  });

  it("fails when email is missing", async () => {
    const result = await createLeadForUser(createStoreDb(), "user-1", { listId: "list-1" });
    expect(result.ok).toBe(false);
  });
});

describe("updateLeadForUser customFields merge", () => {
  it("merges customFields and clears via null", async () => {
    store.leads.push({
      id: "lead-1",
      userId: "user-1",
      listId: "list-1",
      email: "ada@example.com",
      firstName: null,
      lastName: null,
      company: null,
      website: null,
      linkedin: null,
      jobTitle: null,
      location: null,
      phone: null,
      industry: null,
      tags: [],
      customFields: { a: "1", b: "2" },
      deletedAt: null,
    });

    const result = await updateLeadForUser(createStoreDb(), "user-1", "lead-1", {
      customFields: { b: "updated", c: "3", a: null },
    });
    expect(result.ok).toBe(true);
    expect(store.leads[0].customFields).toEqual({ b: "updated", c: "3" });
  });
});

// silence unused import lint in case schema symbols unused beyond resolve
void leadLists;
void leads;
