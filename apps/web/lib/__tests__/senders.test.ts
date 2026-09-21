import { beforeEach, describe, expect, it } from "vitest";
import { schema } from "@smartreach/database";
import { toggleSenderForUser } from "../senders";

const { senderAccounts } = schema;

type SenderRow = {
  id: string;
  userId: string;
  status: "active" | "paused" | "failed";
  updatedAt?: string;
};

let store: { senders: SenderRow[] };

function resolveTable(table: Record<string | symbol, unknown>): string {
  const sym = Symbol.for("drizzle:Name");
  const named = table?.[sym];
  if (typeof named === "string") return named;
  const keys = Object.keys(table ?? {});
  if (keys.includes("status") && keys.includes("userId")) return "sender_accounts";
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
      const camel = k === "user_id" ? "userId" : k;
      if ((row as Record<string, unknown>)[camel] !== v && (row as Record<string, unknown>)[k] !== v) {
        return false;
      }
    }
    return true;
  });
}

function createStoreDb() {
  return {
    update(table: Record<string | symbol, unknown>) {
      const ctx: {
        table: string;
        set: Record<string, unknown> | null;
        filters: Record<string, unknown>;
      } = { table: resolveTable(table), set: null, filters: {} };
      const chain = {
        set(v: Record<string, unknown>) {
          ctx.set = v;
          return chain;
        },
        where(cond: unknown) {
          Object.assign(ctx.filters, extractFilters(cond));
          return chain;
        },
        returning() {
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            const rows = applyFilters(
              store.senders as unknown as Record<string, unknown>[],
              ctx.filters,
            );
            for (const row of rows) Object.assign(row, ctx.set);
            resolve(rows.map((r) => ({ id: r.id })));
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
  store = {
    senders: [{ id: "snd-1", userId: "user-1", status: "active" }],
  };
});

describe("toggleSenderForUser (P04)", () => {
  it("pauses owned sender", async () => {
    const result = await toggleSenderForUser(createStoreDb(), "user-1", "snd-1", true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toMatch(/paused/i);
    expect(store.senders[0].status).toBe("paused");
  });

  it("resumes owned sender", async () => {
    store.senders[0].status = "paused";
    const result = await toggleSenderForUser(createStoreDb(), "user-1", "snd-1", false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toMatch(/resumed/i);
    expect(store.senders[0].status).toBe("active");
  });

  it("errors for other user's sender", async () => {
    const result = await toggleSenderForUser(createStoreDb(), "user-2", "snd-1", true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);
    expect(store.senders[0].status).toBe("active");
  });
});

void senderAccounts;
