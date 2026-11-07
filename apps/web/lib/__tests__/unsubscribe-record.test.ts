import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { schema } from "@smartreach/database";

const addSuppression = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@smartreach/email-engine/suppression", () => ({ addSuppression }));

import { recordUnsubscribe } from "../unsubscribe-record";

type Write = { table: unknown; set?: any; where?: SQL };

/** Fake db: selects return `leadRows`; every update records its table, set and where. */
function fakeDb(leadRows: Array<{ id: string; workspaceId: string | null }>) {
  const writes: Write[] = [];
  const selectWheres: SQL[] = [];
  const db: any = {
    select: () => ({
      from: () => ({
        where: async (w: SQL) => {
          selectWheres.push(w);
          return leadRows;
        },
      }),
    }),
    update: (table: unknown) => {
      const entry: Write = { table };
      writes.push(entry);
      const chain: any = {
        set: (s: any) => {
          entry.set = s;
          return chain;
        },
        where: async (w: SQL) => {
          entry.where = w;
        },
      };
      return chain;
    },
  };
  return { db, writes, selectWheres };
}

const render = (w: SQL) => new PgDialect().sqlToQuery(w);

beforeEach(() => addSuppression.mockClear());

describe("recordUnsubscribe", () => {
  it("records a global unsubscribe through the engine upsert, even for an address on the manual blocklist", async () => {
    // The manual row already exists; addSuppression's upsert upgrades it.
    const { db } = fakeDb([{ id: "l1", workspaceId: "w1" }]);
    await recordUnsubscribe(db, { userId: "u1", email: "dana@acme.com" }, "2026-11-07T00:00:00.000Z");
    expect(addSuppression).toHaveBeenCalledTimes(1);
    expect(addSuppression).toHaveBeenCalledWith(db, {
      userId: "u1",
      workspaceId: "w1",
      email: "dana@acme.com",
      source: "unsubscribe",
      reason: "One-click unsubscribe",
    });
  });

  it("normalizes a mixed-case address and matches leads with lower(email)", async () => {
    const { db, writes, selectWheres } = fakeDb([{ id: "l1", workspaceId: null }]);
    const out = await recordUnsubscribe(db, { userId: "u1", email: "John@Acme.com" }, "2026-11-07T00:00:00.000Z");
    expect(out.email).toBe("john@acme.com");
    expect(addSuppression).toHaveBeenCalledWith(db, expect.objectContaining({ email: "john@acme.com" }));

    const select = render(selectWheres[0]);
    expect(select.sql).toMatch(/lower\("leads"\."email"\) = \$\d/);
    expect(select.params).toContain("john@acme.com");

    const leadUpdate = writes.find((w) => w.table === schema.leads)!;
    expect(leadUpdate.set).toMatchObject({ status: "unsubscribed" });
    const q = render(leadUpdate.where!);
    expect(q.sql).toMatch(/lower\("leads"\."email"\) = \$\d/);
    expect(q.params).toContain("john@acme.com");
    expect(q.params).not.toContain("John@Acme.com");

    const jobUpdate = writes.find((w) => w.table === schema.emailJobs)!;
    expect(render(jobUpdate.where!).sql).toMatch(/lower\("email_jobs"\."to_email"\)/);
    const clUpdate = writes.find((w) => w.table === schema.campaignLeads)!;
    expect(clUpdate.set).toMatchObject({ status: "cancelled", lastError: "unsubscribed" });
  });
});
