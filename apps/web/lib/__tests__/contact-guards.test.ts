import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { CONTACT_COOLDOWN_DAYS, recentlyContactedEmails, recordContactHistory } from "../contact-guards";
import * as launch from "../gtm-launch";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const dialect = new PgDialect();

/** Selects resolve in order; records what each select read from and every insert. */
function fakeDb(selectResults: any[][]) {
  const froms: unknown[] = [];
  const inserts: Array<{ table: unknown; values: any[] }> = [];
  const chain = (result: any[]) => {
    const c: any = {
      from: (t: unknown) => {
        froms.push(t);
        return c;
      },
      where: () => c,
      innerJoin: () => c,
      groupBy: () => c,
      limit: () => Promise.resolve(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
  };
  const db: any = {
    select: () => chain(selectResults.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: any[]) => {
        inserts.push({ table, values });
        return Promise.resolve();
      },
    }),
  };
  return { db, froms, inserts };
}

describe("recentlyContactedEmails", () => {
  it("returns addresses found only in the permanent contact ledger", async () => {
    // Live campaigns contribute nothing; the ledger row comes back from the union.
    const { db, froms } = fakeDb([[{ email: "a@x.com" }]]);
    const out = await recentlyContactedEmails(db, ["A@x.com".toLowerCase(), "b@x.com"], NOW);
    expect([...out]).toEqual(["a@x.com"]);
    // One query that reads both live campaigns (case-insensitively) and the ledger.
    const query = dialect.sqlToQuery(froms[0] as SQL);
    expect(query.sql).toContain('"contact_history"');
    expect(query.sql).toContain('"campaign_leads"');
    expect(query.sql).toMatch(/lower\("leads"\."email"\) in/);
    expect(query.sql).toMatch(/union/i);
    const since = new Date(NOW.getTime() - CONTACT_COOLDOWN_DAYS * 86_400_000).toISOString();
    expect(query.params).toContain(since);
  });

  it("matches mixed-case input and returns lowercased addresses", async () => {
    const { db } = fakeDb([[{ email: "Pat@Acme.com" }]]);
    const out = await recentlyContactedEmails(db, ["PAT@acme.com"], NOW);
    expect(out.has("pat@acme.com")).toBe(true);
  });

  it("does not query for an empty list", async () => {
    const { db, froms } = fakeDb([]);
    expect((await recentlyContactedEmails(db, [], NOW)).size).toBe(0);
    expect(froms).toEqual([]);
  });
});

describe("recordContactHistory", () => {
  it("records each recently contacted address once, lowercased, with its latest contact time", async () => {
    const { db, inserts } = fakeDb([
      [
        { email: "pat@acme.com", contactedAt: "2026-11-01T10:00:00.000Z" },
        { email: " Lee@Beta.com ", contactedAt: "2026-10-20T09:00:00.000Z" },
        { email: null, contactedAt: "2026-10-20T09:00:00.000Z" },
      ],
    ]);
    const n = await recordContactHistory(db, { userId: "u1" }, NOW);
    expect(n).toBe(2);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.table).toBe(schema.contactHistory);
    expect(inserts[0]!.values.map((v) => ({ email: v.email, contactedAt: v.contactedAt }))).toEqual([
      { email: "pat@acme.com", contactedAt: "2026-11-01T10:00:00.000Z" },
      { email: "lee@beta.com", contactedAt: "2026-10-20T09:00:00.000Z" },
    ]);
    expect(inserts[0]!.values.every((v) => typeof v.id === "string" && v.id.length > 0)).toBe(true);
  });

  it("inserts nothing when there are no recent contacts", async () => {
    const { db, inserts } = fakeDb([[]]);
    expect(await recordContactHistory(db, { userId: "u1", workspaceId: "w1" }, NOW)).toBe(0);
    expect(inserts).toEqual([]);
  });

  it("propagates a database error so the caller deletes nothing", async () => {
    const db: any = {
      select: () => {
        const c: any = {
          from: () => c,
          innerJoin: () => c,
          where: () => c,
          groupBy: () => Promise.reject(new Error("db down")),
        };
        return c;
      },
    };
    await expect(recordContactHistory(db, { userId: "u1" }, NOW)).rejects.toThrow("db down");
  });
});

describe("gtm-launch re-exports", () => {
  it("keeps the old import path working", () => {
    expect(launch.CONTACT_COOLDOWN_DAYS).toBe(90);
    expect(launch.recentlyContactedEmails).toBe(recentlyContactedEmails);
  });
});
