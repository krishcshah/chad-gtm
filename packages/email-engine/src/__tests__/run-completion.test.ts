/**
 * #53: when the engine completes a campaign (nothing left to claim, no pending
 * work) it also marks the linked Autopilot run completed. That mirror is
 * display only: if it fails, the campaign still completes and nothing else
 * changes.
 */
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";
import { scheduleCampaign } from "../scheduler";
import type { SenderRow } from "../db-port";

vi.mock("../mailer", () => ({ makeTransport: vi.fn(), sendMail: vi.fn(), makeImapClient: vi.fn() }));

const NOW = new Date("2026-11-06T12:00:00.000Z");

type Write = { op: string; table: unknown; set?: any; where?: any };

function fakeDb(opts: { failRunUpdate?: boolean } = {}) {
  const writes: Write[] = [];
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
  const db: any = {
    select: (fields?: Record<string, unknown>) => {
      let table: unknown;
      const keys = fields ? Object.keys(fields) : [];
      return chain(
        () => {
          if (table === schema.workspaceSettings) return [{ postalAddress: "1 Main St, Springfield" }];
          if (table === schema.campaignLeads) return keys.includes("n") ? [{ n: 0 }] : [];
          return [];
        },
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["update", "insert", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table };
      writes.push(entry);
      return chain(
        () => {
          if (opts.failRunUpdate && op === "update" && table === schema.chadGtmRuns) throw new Error("db down");
          return [{ id: "row" }];
        },
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "where") entry.where = args[0];
        },
      );
    };
  }
  return { db, writes };
}

const campaign: any = {
  id: "c1",
  userId: "u1",
  name: "Spring push",
  status: "running",
  leadListId: "list1",
  templateId: "t1",
  businessDaysOnly: false,
  sendingTimezone: "UTC",
  sendingWindowStart: "00:00",
  sendingWindowEnd: "23:59",
  dailyLimit: 50,
  minDelaySec: 60,
  maxDelaySec: 90,
  maxEmailsPerSenderPerDay: 30,
  stopOnReply: true,
};

const sender = { id: "s1", userId: "admin", email: "a@pool.example", status: "active", isSystemPool: true } as unknown as SenderRow;

describe("scheduleCampaign completion mirrors the Autopilot run", () => {
  it("completes the campaign, then marks its active or paused run completed", async () => {
    const { db, writes } = fakeDb();
    const r = await scheduleCampaign(db, campaign, NOW, { senders: [sender] });
    expect(r).toEqual({ enqueued: 0, note: "completed" });
    const ci = writes.findIndex((w) => w.op === "update" && w.table === schema.campaigns && w.set?.status === "completed");
    const ri = writes.findIndex((w) => w.op === "update" && w.table === schema.chadGtmRuns);
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(ri).toBeGreaterThan(ci);
    expect(writes[ri]!.set).toMatchObject({ status: "completed" });
    const q = new PgDialect().sqlToQuery(writes[ri]!.where);
    expect(q.sql).toContain('"campaign_id" = $1');
    expect(q.sql).toContain('"status" in ($2, $3)');
    expect(q.params).toEqual(["c1", "active", "paused"]);
  });

  it("a failing run update still returns completed (display only, never affects sending)", async () => {
    const { db, writes } = fakeDb({ failRunUpdate: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await scheduleCampaign(db, campaign, NOW, { senders: [sender] });
    error.mockRestore();
    expect(r).toEqual({ enqueued: 0, note: "completed" });
    expect(writes.some((w) => w.table === schema.campaigns && w.set?.status === "completed")).toBe(true);
  });
});
