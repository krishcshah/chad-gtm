import { beforeEach, describe, expect, it } from "vitest";
import { schema } from "@smartreach/database";
import { toggleSenderForUser, updateSenderDetailsForUser } from "../senders";
import { POOL_ACTIVATION_NEEDS_TEST_ERROR } from "../pool-mailbox-import";

const { senderAccounts } = schema;

type SenderRow = {
  id: string;
  userId: string;
  status: "active" | "paused" | "failed";
  updatedAt?: string;
  isSystemPool?: boolean;
  smtpStatus?: string;
  imapStatus?: string;
  signature?: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  fromName?: string;
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
    select() {
      const ctx: { filters: Record<string, unknown> } = { filters: {} };
      const chain = {
        from() {
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
            resolve(
              applyFilters(store.senders as unknown as Record<string, unknown>[], ctx.filters).map((r) => ({
                ...r,
              })),
            );
          } catch (e) {
            reject?.(e);
          }
        },
      };
      return chain;
    },
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

describe("toggleSenderForUser: shared pool mailboxes", () => {
  it("refuses to resume a pool mailbox whose logins aren't verified", async () => {
    store.senders[0] = {
      id: "snd-1",
      userId: "user-1",
      status: "paused",
      isSystemPool: true,
      smtpStatus: "ok",
      imapStatus: "untested",
    };
    const result = await toggleSenderForUser(createStoreDb(), "user-1", "snd-1", false);
    expect(result).toEqual({ ok: false, error: POOL_ACTIVATION_NEEDS_TEST_ERROR });
    expect(store.senders[0].status).toBe("paused");
  });

  it("resumes a pool mailbox that passed SMTP and IMAP", async () => {
    store.senders[0] = {
      id: "snd-1",
      userId: "user-1",
      status: "paused",
      isSystemPool: true,
      smtpStatus: "ok",
      imapStatus: "ok",
    };
    const result = await toggleSenderForUser(createStoreDb(), "user-1", "snd-1", false);
    expect(result.ok).toBe(true);
    expect(store.senders[0].status).toBe("active");
  });

  it("can always pause a pool mailbox", async () => {
    store.senders[0] = { id: "snd-1", userId: "user-1", status: "active", isSystemPool: true, smtpStatus: "failed", imapStatus: "failed" };
    const result = await toggleSenderForUser(createStoreDb(), "user-1", "snd-1", true);
    expect(result.ok).toBe(true);
    expect(store.senders[0].status).toBe("paused");
  });
});

describe("updateSenderDetailsForUser", () => {
  it("removes the legacy warm-up JSON from the stored signature", async () => {
    store.senders[0] = {
      id: "snd-1",
      userId: "user-1",
      status: "active",
      signature: 'Jane\n<!--SR_WARMUP:{"enabled":true}-->',
    };
    const result = await updateSenderDetailsForUser(createStoreDb(), "user-1", "snd-1", { fromName: "Jane" });
    expect(result.ok).toBe(true);
    expect(store.senders[0].signature).toBe("Jane");
  });

  it("strips a marker pasted into a new signature", async () => {
    store.senders[0] = { id: "snd-1", userId: "user-1", status: "active", signature: "" };
    await updateSenderDetailsForUser(createStoreDb(), "user-1", "snd-1", {
      cleanSignature: 'Best, Jane<!--SR_WARMUP:{"x":1}-->',
    });
    expect(store.senders[0].signature).toBe("Best, Jane");
  });

  it("pauses a pool mailbox whose login details changed until it is retested", async () => {
    store.senders[0] = {
      id: "snd-1",
      userId: "user-1",
      status: "active",
      isSystemPool: true,
      smtpStatus: "ok",
      imapStatus: "ok",
      signature: "",
    };
    const result = await updateSenderDetailsForUser(createStoreDb(), "user-1", "snd-1", {
      smtpHost: "smtp.new-host.com",
    });
    expect(result.ok).toBe(true);
    expect(store.senders[0]).toMatchObject({
      status: "paused",
      smtpStatus: "untested",
      imapStatus: "untested",
      smtpHost: "smtp.new-host.com",
    });
  });

  it("does not touch status for non-credential edits on a pool mailbox", async () => {
    store.senders[0] = {
      id: "snd-1",
      userId: "user-1",
      status: "active",
      isSystemPool: true,
      smtpStatus: "ok",
      imapStatus: "ok",
      signature: "",
    };
    await updateSenderDetailsForUser(createStoreDb(), "user-1", "snd-1", { fromName: "Jane" });
    expect(store.senders[0]).toMatchObject({ status: "active", smtpStatus: "ok", fromName: "Jane" });
  });
});

void senderAccounts;

describe("updateSenderDetailsForUser refuses internal mail endpoints", () => {
  it.each([
    [{ smtpHost: "127.0.0.1" }],
    [{ smtpHost: "169.254.169.254" }],
    [{ smtpHost: "localhost" }],
    [{ imapHost: "10.0.0.5" }],
    [{ smtpPort: 5432 }],
    [{ imapPort: 80 }],
  ])("%o", async (data) => {
    store.senders[0] = { id: "snd-1", userId: "user-1", status: "active", signature: "", smtpPort: 587, imapPort: 993 };
    const result = await updateSenderDetailsForUser(createStoreDb(), "user-1", "snd-1", data as never);
    expect(result.ok).toBe(false);
    expect(store.senders[0].smtpHost).toBeUndefined();
  });

  it("an unchanged (legacy) port does not block other edits", async () => {
    store.senders[0] = { id: "snd-1", userId: "user-1", status: "active", signature: "", smtpPort: 1025 };
    const result = await updateSenderDetailsForUser(createStoreDb(), "user-1", "snd-1", { smtpPort: 1025, fromName: "J" });
    expect(result.ok).toBe(true);
  });
});
