import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import {
  AGENT_GAVE_UP_TITLE,
  AGENT_MAX_ATTEMPTS,
  agentRetryDelayMs,
  isAgentRetryDue,
  needsRenotify,
  replyAgentTick,
} from "../reply-agent";

/**
 * Scripted fake Drizzle client: every select resolves to the next scripted
 * result (FIFO); updates and inserts are recorded. Chained builder methods
 * all return the same thenable proxy.
 */
function scriptedDb(selects: any[][]) {
  const updates: { table: any; set?: any }[] = [];
  const inserts: { table: any; values?: any }[] = [];
  const chain = (resolve: () => any, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            const p = Promise.resolve().then(resolve);
            return p.then.bind(p);
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
    select: () => chain(() => selects.shift() ?? []),
    update: (table: any) => {
      const entry: { table: any; set?: any } = { table };
      updates.push(entry);
      return chain(
        () => [{ id: "claimed" }],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
        },
      );
    },
    insert: (table: any) => {
      const entry: { table: any; values?: any } = { table };
      inserts.push(entry);
      return chain(
        () => [],
        (prop, args) => {
          if (prop === "values") entry.values = args[0];
        },
      );
    },
  };
  return { db, updates, inserts, selects };
}

const NOW = new Date("2026-11-06T12:00:00.000Z");

describe("agent retry policy (pure)", () => {
  it("backs off 2^attempts minutes", () => {
    expect(agentRetryDelayMs(1)).toBe(2 * 60_000);
    expect(agentRetryDelayMs(2)).toBe(4 * 60_000);
    expect(AGENT_MAX_ATTEMPTS).toBe(3);
  });
  it("is due only once the backoff has elapsed", () => {
    expect(isAgentRetryDue(0, null, NOW)).toBe(true);
    expect(isAgentRetryDue(1, "2026-11-06T11:59:00.000Z", NOW)).toBe(false);
    expect(isAgentRetryDue(1, "2026-11-06T11:58:00.000Z", NOW)).toBe(true);
    expect(isAgentRetryDue(2, "2026-11-06T11:57:00.000Z", NOW)).toBe(false);
    expect(isAgentRetryDue(2, "2026-11-06T11:56:00.000Z", NOW)).toBe(true);
  });
  it("re-notifies once, after 24h, and only if the only notice was the original", () => {
    const created = "2026-11-05T11:00:00.000Z"; // 25h ago
    expect(needsRenotify({ createdAt: created, notifiedAt: "2026-11-05T11:00:05.000Z" }, NOW)).toBe(true);
    expect(needsRenotify({ createdAt: created, notifiedAt: null }, NOW)).toBe(true);
    // already reminded (notified a day after creation)
    expect(needsRenotify({ createdAt: created, notifiedAt: "2026-11-06T11:30:00.000Z" }, NOW)).toBe(false);
    // too young
    expect(needsRenotify({ createdAt: "2026-11-06T00:00:00.000Z", notifiedAt: null }, NOW)).toBe(false);
  });
});

describe("replyAgentTick reliability", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it("on a handling error, puts the reply back to pending with attempts+1 and a backoff marker", async () => {
    const { db, updates } = scriptedDb([
      [], // stuck processing rows
      [{ id: "r1", agentAttempts: 0 }], // due pending
      [], // handleReply: reply vanished → throws
    ]);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false });
    expect(r).toMatchObject({ processed: 1, failed: 1, retried: 1, gaveUp: 0 });
    const claim = updates.find((u) => u.set?.agentStatus === "processing");
    expect(claim?.set.agentClaimedAt).toBe(NOW.toISOString());
    const retry = updates.find((u) => u.set?.agentStatus === "pending");
    expect(retry?.set).toMatchObject({ agentAttempts: 1, agentClaimedAt: NOW.toISOString() });
    expect(updates.some((u) => u.set?.agentStatus === "failed")).toBe(false);
  });

  it("gives up after the last attempt: marks failed and opens a request for the client", async () => {
    const reply = {
      id: "r1",
      userId: "u-reply",
      senderId: "s1",
      campaignId: "c1",
      leadId: null,
      fromEmail: "dana@acme-example.com",
      fromName: "Dana",
      subject: "Re: Quick idea",
      bodyText: "Can you send pricing for 50 seats?",
      snippet: "",
    };
    const { db, updates, inserts } = scriptedDb([
      [], // stuck
      [{ id: "r1", agentAttempts: AGENT_MAX_ATTEMPTS - 1 }], // due pending
      [], // handleReply throws
      [reply], // giveUp: reply
      [{ id: "run1", userId: "u1", workspaceId: "w1" }], // run
      [], // no open request yet
    ]);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false });
    expect(r).toMatchObject({ failed: 1, gaveUp: 1, retried: 0 });
    const failed = updates.find((u) => u.set?.agentStatus === "failed");
    expect(failed?.set).toMatchObject({ agentAttempts: AGENT_MAX_ATTEMPTS });
    const req = inserts.find((i) => i.table === schema.agentRequests);
    expect(req?.values).toMatchObject({
      userId: "u1",
      workspaceId: "w1",
      runId: "run1",
      replyId: "r1",
      kind: "other",
      status: "open",
      title: AGENT_GAVE_UP_TITLE,
      leadEmail: "dana@acme-example.com",
    });
    expect(req?.values.question).toContain("pricing for 50 seats");
    expect(updates.some((u) => u.table === schema.agentRequests && u.set?.notifiedAt === NOW.toISOString())).toBe(true);
  });

  it("reclaims replies stuck in processing as a retry", async () => {
    const { db, updates } = scriptedDb([
      [{ id: "r9", agentAttempts: 0, agentClaimedAt: "2026-11-06T11:00:00.000Z" }], // stuck
      [], // nothing pending
    ]);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false });
    expect(r.reclaimed).toBe(1);
    expect(updates[0]?.set).toMatchObject({ agentStatus: "pending", agentAttempts: 1, agentClaimedAt: NOW.toISOString() });
  });

  it("a stuck reply on its last attempt is handed to the client instead", async () => {
    const { db, updates, inserts } = scriptedDb([
      [{ id: "r9", agentAttempts: AGENT_MAX_ATTEMPTS - 1, agentClaimedAt: null }], // stuck
      [{ id: "r9", userId: "u1", senderId: "s1", campaignId: null, leadId: null, fromEmail: "x@y.com", bodyText: "hi" }],
      [], // no open request
      [], // nothing pending
    ]);
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false });
    expect(r).toMatchObject({ reclaimed: 1, gaveUp: 1 });
    expect(updates.some((u) => u.set?.agentStatus === "failed")).toBe(true);
    expect(inserts.some((i) => i.table === schema.agentRequests)).toBe(true);
  });
});
