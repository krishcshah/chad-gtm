/**
 * Replies held while an account was on hold become ONE Needs you card per
 * conversation once the account is approved. Nothing is ever sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  HELD_ANSWERED_SUMMARY,
  HELD_RELEASED_SUMMARY,
  HELD_RELEASED_TITLE,
  HELD_SUPERSEDED_SUMMARY,
  groupHeldReplies,
  releaseHeldForApprovedOwners,
  releaseHeldReplies,
} from "../held-replies";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("../mailer", () => ({ sendMail, makeTransport: vi.fn(), makeImapClient: vi.fn() }));

type Handler = any[] | ((call: number) => any[]);

/** Selects resolve by table (handler may vary by call); writes are recorded and conditional updates "match". */
function tableDb(routes: Map<unknown, Handler>, opts: { updateMatches?: (table: unknown, set: any) => boolean } = {}) {
  const writes: { op: "update" | "insert"; table: unknown; set?: any; values?: any }[] = [];
  const counts = new Map<unknown, number>();
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
  const db: any = {
    select: () => {
      let table: unknown;
      return chain(
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
  for (const op of ["update", "insert"] as const) {
    db[op] = (table: unknown) => {
      const entry: (typeof writes)[number] = { op, table };
      writes.push(entry);
      return chain(
        () => (op === "update" && opts.updateMatches && !opts.updateMatches(table, entry.set) ? [] : [{ id: "row" }]),
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
        },
      );
    };
  }
  return { db, writes };
}

const NOW = new Date("2026-11-07T10:00:00.000Z");

function held(over: Record<string, unknown>) {
  return {
    id: "r1",
    userId: "u1",
    leadId: "l1",
    campaignId: "c1",
    fromEmail: "dana@acme-example.com",
    fromName: "Dana",
    subject: "Re: idea",
    snippet: "",
    bodyText: "Can you send pricing?",
    receivedAt: "2026-11-05T10:00:00.000Z",
    agentStatus: "held",
    ...over,
  };
}

const replyUpdates = (writes: any[]) => writes.filter((w) => w.op === "update" && w.table === schema.replies);
const requestInserts = (writes: any[]) => writes.filter((w) => w.op === "insert" && w.table === schema.agentRequests);

afterEach(() => {
  sendMail.mockReset();
});

describe("groupHeldReplies", () => {
  it("groups by lead (else sender address) and campaign, newest first", () => {
    const groups = groupHeldReplies([
      held({ id: "a", receivedAt: "2026-11-01T00:00:00.000Z" }),
      held({ id: "b", receivedAt: "2026-11-03T00:00:00.000Z" }),
      held({ id: "c", leadId: null, fromEmail: "X@y.example", campaignId: null }),
      held({ id: "d", leadId: null, fromEmail: "x@y.example", campaignId: null }),
      held({ id: "e", campaignId: "c2" }),
    ]);
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([["b", "a"], ["c", "d"], ["e"]]);
  });
});

describe("releaseHeldReplies", () => {
  it("opens exactly one card per conversation for its newest held reply and never sends", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [
          schema.replies,
          [
            held({ id: "old", receivedAt: "2026-11-04T10:00:00.000Z", bodyText: "Hi" }),
            held({ id: "new", receivedAt: "2026-11-05T10:00:00.000Z", bodyText: "Can you send pricing?" }),
          ],
        ],
        [schema.uniboxMessages, []],
        [schema.agentRequests, []],
        [schema.chadGtmRuns, [{ id: "run1", workspaceId: "w1" }]],
        [schema.leads, [{ firstName: "Dana", lastName: "Lee", company: "Acme" }]],
      ]),
    );
    const opened = await releaseHeldReplies(db, "u1", NOW);
    expect(opened).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();

    const inserts = requestInserts(writes);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      userId: "u1",
      workspaceId: "w1",
      runId: "run1",
      campaignId: "c1",
      replyId: "new",
      leadId: "l1",
      kind: "other",
      status: "open",
      title: HELD_RELEASED_TITLE,
      question: "Can you send pricing?",
      leadName: "Dana Lee",
      leadCompany: "Acme",
    });

    const updates = replyUpdates(writes);
    expect(updates.find((w) => w.set.agentStatus === "escalated")?.set.agentSummary).toBe(HELD_RELEASED_SUMMARY);
    const superseded = updates.find((w) => w.set.agentStatus === "skipped");
    expect(superseded?.set.agentSummary).toBe(HELD_SUPERSEDED_SUMMARY);
  });

  it("settles a conversation someone answered after the held reply, with no card", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.replies, [held({ id: "r1", receivedAt: "2026-11-05T10:00:00.000Z" })]],
        [schema.uniboxMessages, [{ sentAt: "2026-11-05T12:00:00.000Z" }]],
      ]),
    );
    const opened = await releaseHeldReplies(db, "u1", NOW);
    expect(opened).toBe(0);
    expect(requestInserts(writes)).toHaveLength(0);
    const updates = replyUpdates(writes);
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({ agentStatus: "skipped", agentSummary: HELD_ANSWERED_SUMMARY });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("an outbound message older than the held reply does not count as an answer", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.replies, [held({ id: "r1", receivedAt: "2026-11-05T10:00:00.000Z" })]],
        [schema.uniboxMessages, [{ sentAt: "2026-11-01T09:00:00.000Z" }]],
        [schema.agentRequests, []],
        [schema.chadGtmRuns, []],
        [schema.campaigns, [{ workspaceId: "w2" }]],
        [schema.leads, []],
      ]),
    );
    expect(await releaseHeldReplies(db, "u1", NOW)).toBe(1);
    // No run: the campaign's workspace, and no run id.
    expect(requestInserts(writes)[0].values).toMatchObject({ workspaceId: "w2", runId: null, leadName: "Dana" });
  });

  it("does not duplicate a card already open for the conversation", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.replies, [held({ id: "r1" })]],
        [schema.uniboxMessages, []],
        [schema.agentRequests, [{ id: "req1", replyId: "r1", kind: "other", status: "open", createdAt: "x" }]],
      ]),
    );
    expect(await releaseHeldReplies(db, "u1", NOW)).toBe(0);
    expect(requestInserts(writes)).toHaveLength(0);
    // Already pointing at this reply: the card is left as it is.
    expect(writes.filter((w) => w.table === schema.agentRequests)).toHaveLength(0);
  });

  it("leaves a conversation alone when the newest reply is no longer held (claim lost)", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.replies, [held({ id: "r1" })]],
        [schema.uniboxMessages, []],
      ]),
      { updateMatches: () => false },
    );
    expect(await releaseHeldReplies(db, "u1", NOW)).toBe(0);
    expect(requestInserts(writes)).toHaveLength(0);
  });

  it("ignores rows that are not held or belong to someone else", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.replies, [held({ id: "r1", agentStatus: "escalated" }), held({ id: "r2", userId: "u2" })]],
      ]),
    );
    expect(await releaseHeldReplies(db, "u1", NOW)).toBe(0);
    expect(writes).toHaveLength(0);
  });
});

describe("releaseHeldForApprovedOwners", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.SIGNUP_APPROVAL_REQUIRED;
  afterEach(() => {
    if (saved === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
    else env.SIGNUP_APPROVAL_REQUIRED = saved;
  });

  it("skips owners who are still not approved", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [
          schema.replies,
          (n) =>
            n === 0
              ? [
                  { userId: "approved", agentStatus: "held" },
                  { userId: "pending", agentStatus: "held" },
                ]
              : [held({ id: "r1", userId: "approved" })],
        ],
        [
          schema.users,
          [
            { id: "approved", role: "user", approvedAt: new Date("2026-11-06T00:00:00.000Z") },
            { id: "pending", role: "user", approvedAt: null },
          ],
        ],
        [schema.uniboxMessages, []],
        [schema.agentRequests, []],
        [schema.chadGtmRuns, []],
        [schema.campaigns, []],
        [schema.leads, []],
      ]),
    );
    const opened = await releaseHeldForApprovedOwners(db, NOW);
    expect(opened).toBe(1);
    const inserts = requestInserts(writes);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values.userId).toBe("approved");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does nothing when no reply is held (rows of other statuses are ignored)", async () => {
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.replies, [{ userId: "u1", agentStatus: "pending" }]]]));
    expect(await releaseHeldForApprovedOwners(db, NOW)).toBe(0);
    expect(writes).toHaveLength(0);
  });

  /** Records the chain calls of the owner query, which returns no rows. */
  function ownerQueryRecorder() {
    const calls: { prop: string; args: any[] }[] = [];
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            const p = Promise.resolve([]);
            return p.then.bind(p);
          }
          return (...args: any[]) => {
            calls.push({ prop: String(prop), args });
            return proxy;
          };
        },
      },
    );
    const db: any = { select: () => proxy };
    const call = (prop: string) => calls.find((c) => c.prop === prop);
    const whereSql = () => new PgDialect().sqlToQuery(call("where")!.args[0]);
    return { db, call, whereSql };
  }

  it("picks only approved owners in the query, so owners on hold cannot fill the batch", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    const { db, call, whereSql } = ownerQueryRecorder();
    expect(await releaseHeldForApprovedOwners(db, NOW)).toBe(0);
    // Joined to users: deleted owners drop out too.
    expect(call("innerJoin")?.args[0]).toBe(schema.users);
    const q = whereSql();
    expect(q.sql).toContain('"agent_status"');
    expect(q.sql).toContain('"approved_at" is not null');
    expect(q.sql).toContain('"role"');
    expect(q.params).toEqual(expect.arrayContaining(["held", "admin"]));
    // Stable order and a bounded batch.
    expect(call("orderBy")).toBeTruthy();
    expect(call("limit")?.args[0]).toBe(50);
  });

  it("does not filter by approval when approval is turned off", async () => {
    env.SIGNUP_APPROVAL_REQUIRED = "false";
    const { db, whereSql } = ownerQueryRecorder();
    expect(await releaseHeldForApprovedOwners(db, NOW)).toBe(0);
    const q = whereSql();
    expect(q.sql).not.toContain('"approved_at"');
    expect(q.params).toEqual(["held"]);
  });
});
