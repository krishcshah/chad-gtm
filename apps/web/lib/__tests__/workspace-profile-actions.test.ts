import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* #77: the workspace booking link (Settings › Lead conversations). Saving it
 * only touches the owner's workspace, never changes runs that have their own
 * link, and releases waiting "booking link" cards with the same safe logic as
 * a run's link: a reply someone already answered is never re-queued. */

type Write = { op: "update"; table: unknown; set?: any; where?: any };

const dialect = new PgDialect();

const st = vi.hoisted(() => ({
  writes: [] as Write[],
  /** The owner's workspaces (another user's id is simply not found). */
  workspaces: [] as Array<Record<string, any>>,
  /** Campaigns of the workspace with their run's own link (null = uses the workspace link). */
  campaigns: [] as Array<{ id: string; runBookingUrl: string | null }>,
  requests: new Map<string, any>(),
  replies: new Map<string, any>(),
  /** Someone (you or the agent) wrote to the lead after the reply. */
  outbound: [] as Array<{ id: string }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "c@example.com", role: "user" })) }));
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
  const select = (fields?: Record<string, unknown>) => {
    let table: unknown;
    let where: any;
    const keys = fields ? Object.keys(fields) : [];
    return chain(
      () => {
        if (table === schema.workspaces) {
          const params = where ? dialect.sqlToQuery(where).params : [];
          // By id + owner, or the owner's default.
          return st.workspaces.filter((w) => params.length < 2 || params.includes(w.id)).slice(0, 1);
        }
        if (table === schema.campaigns) {
          if (keys.includes("runBookingUrl")) return st.campaigns;
          return [{ id: "c1", userId: "u1", workspaceId: "w1", leadConversationMode: "agent", agentOffer: "" }];
        }
        if (table === schema.agentRequests) return [...st.requests.values()].filter((r) => r.status === "open");
        if (table === schema.replies) return keys.includes("agentStatus") ? [...st.replies.values()] : [];
        if (table === schema.uniboxMessages) return st.outbound;
        return [];
      },
      (prop, args) => {
        if (prop === "from") table = args[0];
        if (prop === "where") where = args[0];
      },
    );
  };
  const update = (table: unknown) => {
    const entry: Write = { op: "update", table };
    st.writes.push(entry);
    return chain(
      () => {
        const q = dialect.sqlToQuery(entry.where);
        const id = String(q.params[0]);
        if (table === schema.workspaces) {
          const ws = st.workspaces.find((w) => w.id === id && q.params.includes("u1"));
          if (!ws) return [];
          Object.assign(ws, entry.set);
          return [{ id }];
        }
        if (table === schema.agentRequests) {
          const row = st.requests.get(id);
          const need = entry.set.status === "sending" ? "open" : "sending";
          if (!row || row.status !== need) return [];
          Object.assign(row, entry.set);
          return [{ id }];
        }
        if (table === schema.replies) {
          const row = st.replies.get(id);
          if (!row || row.agentStatus !== "escalated") return [];
          Object.assign(row, entry.set);
          return [{ id }];
        }
        return [{ id }];
      },
      (prop, args) => {
        if (prop === "set") entry.set = args[0];
        if (prop === "where") entry.where = args[0];
      },
    );
  };
  return { getDb: () => ({ select, update }) };
});

import { saveWorkspaceBookingUrlAction } from "../workspace-profile-actions";

beforeEach(() => {
  st.writes = [];
  st.workspaces = [
    {
      id: "w1",
      userId: "u1",
      name: "Acme",
      isDefault: true,
      bookingUrl: null,
      leadConversationMode: "agent",
      agentPaused: false,
      companySummary: "Acme automates reporting.",
      mainOffer: "A reporting audit",
      createdAt: "2026-01-01",
    },
  ];
  st.campaigns = [{ id: "c1", runBookingUrl: null }];
  st.requests = new Map([
    ["req-1", { id: "req-1", replyId: "r1", leadId: "l1", campaignId: "c1", status: "open", kind: "booking_url" }],
  ]);
  st.replies = new Map([
    ["r1", { id: "r1", leadId: "l1", campaignId: "c1", receivedAt: "2026-11-05T10:00:00.000Z", agentStatus: "escalated" }],
  ]);
  st.outbound = [];
});

describe("saveWorkspaceBookingUrlAction", () => {
  it("rejects a link that isn't a URL and writes nothing", async () => {
    const r = await saveWorkspaceBookingUrlAction({ workspaceId: "w1", bookingUrl: "call me maybe" });
    expect(r.ok).toBe(false);
    expect(st.writes).toEqual([]);
  });

  it("only touches the owner's workspace", async () => {
    const r = await saveWorkspaceBookingUrlAction({ workspaceId: "someone-elses", bookingUrl: "https://cal.com/acme/intro" });
    expect(r).toEqual({ ok: false, error: "Workspace not found." });
    expect(st.writes).toEqual([]);
  });

  it("saves the default and answers a waiting card nobody answered", async () => {
    const r = await saveWorkspaceBookingUrlAction({ workspaceId: "w1", bookingUrl: "https://cal.com/acme/intro" });
    expect(r.ok).toBe(true);
    expect(st.workspaces[0]!.bookingUrl).toBe("https://cal.com/acme/intro");
    expect(st.requests.get("req-1")!.status).toBe("resolved");
    expect(st.replies.get("r1")!.agentStatus).toBe("pending");
    if (r.ok) expect(r.data?.answered).toBe(1);
  });

  it("never changes a run's own link, and leaves its cards to that run", async () => {
    st.campaigns = [{ id: "c1", runBookingUrl: "https://cal.com/run-own" }];
    const r = await saveWorkspaceBookingUrlAction({ workspaceId: "w1", bookingUrl: "https://cal.com/acme/intro" });
    expect(r.ok).toBe(true);
    expect(st.writes.some((w) => w.table === schema.chadGtmRuns)).toBe(false);
    expect(st.requests.get("req-1")!.status).toBe("open");
    expect(st.replies.get("r1")!.agentStatus).toBe("escalated");
  });

  it("does not re-queue a reply someone already answered", async () => {
    st.outbound = [{ id: "m-you" }];
    const r = await saveWorkspaceBookingUrlAction({ workspaceId: "w1", bookingUrl: "https://cal.com/acme/intro" });
    expect(r.ok).toBe(true);
    expect(st.requests.get("req-1")!.status).toBe("resolved");
    expect(st.replies.get("r1")!.agentStatus).toBe("escalated");
    expect(st.writes.some((w) => w.table === schema.replies)).toBe(false);
  });

  it("an empty link clears the default without releasing anything", async () => {
    st.workspaces[0]!.bookingUrl = "https://cal.com/old";
    const r = await saveWorkspaceBookingUrlAction({ workspaceId: "w1", bookingUrl: "" });
    expect(r.ok).toBe(true);
    expect(st.workspaces[0]!.bookingUrl).toBeNull();
    expect(st.requests.get("req-1")!.status).toBe("open");
  });
});
