import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { activeCampaignsForList, listDeleteError } from "../lead-list-guard";

describe("listDeleteError", () => {
  it("is null when no campaign uses the list", () => {
    expect(listDeleteError([])).toBeNull();
  });

  it("names one campaign", () => {
    expect(listDeleteError([{ name: "Q3 outreach" }])).toBe(
      '"Q3 outreach" still uses this list. Archive it first, then delete the list.',
    );
  });

  it("uses the plural for several campaigns", () => {
    expect(listDeleteError([{ name: "Q3 outreach" }, { name: "AutoGTM: Acme" }])).toBe(
      '"Q3 outreach" and "AutoGTM: Acme" still use this list. Archive them first, then delete the list.',
    );
  });
});

describe("activeCampaignsForList", () => {
  it("filters on running, scheduled and paused campaigns of the owner", async () => {
    let where: SQL | undefined;
    const db: any = {
      select: () => ({
        from: () => ({
          where: async (w: SQL) => {
            where = w;
            return [{ id: "c1", name: "Q3 outreach", status: "running", isAutopilot: false }];
          },
        }),
      }),
    };
    const out = await activeCampaignsForList(db, "u1", "list-1");
    expect(out).toEqual([{ id: "c1", name: "Q3 outreach", status: "running", isAutopilot: false }]);
    const q = new PgDialect().sqlToQuery(where!);
    expect(q.sql).toMatch(/"campaigns"\."status" in/);
    for (const s of ["running", "scheduled", "paused"]) expect(q.params).toContain(s);
    expect(q.params).toContain("u1");
    expect(q.params).toContain("list-1");
    expect(q.sql).toMatch(/"campaigns"\."deleted_at" is null/);
  });

  it("an Autopilot campaign on the list produces the delete error naming it (#41)", async () => {
    const db: any = {
      select: () => ({
        from: () => ({
          where: async () => [{ id: "c2", name: "AutoGTM: Acme", status: "running", isAutopilot: true }],
        }),
      }),
    };
    const active = await activeCampaignsForList(db, "u1", "list-1");
    expect(active[0]?.isAutopilot).toBe(true);
    expect(listDeleteError(active)).toBe(
      '"AutoGTM: Acme" still uses this list. Archive it first, then delete the list.',
    );
  });

  it("propagates a database error (the delete then fails closed)", async () => {
    const db: any = {
      select: () => ({ from: () => ({ where: async () => Promise.reject(new Error("db down")) }) }),
    };
    await expect(activeCampaignsForList(db, "u1", "list-1")).rejects.toThrow("db down");
  });
});
