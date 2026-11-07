import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const requireUser = vi.fn();
const getDb = vi.fn();
const ensureCampaignLeadSnapshot = vi.fn();
const poolCampaignEditError = vi.fn();
vi.mock("../session", () => ({ requireUser: () => requireUser() }));
vi.mock("../db", () => ({ getDb: () => getDb() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../admin", () => ({ isAdmin: (u: { role?: string }) => u?.role === "admin" }));
vi.mock("../campaign-drafts", () => ({
  ensureCampaignLeadSnapshot: (...a: unknown[]) => ensureCampaignLeadSnapshot(...a),
}));
vi.mock("../pool-campaign-guard", () => ({
  poolCampaignEditError: (...a: unknown[]) => poolCampaignEditError(...a),
}));

import { addNewListLeadsToCampaignAction } from "../campaign-lead-actions";

const render = (w: unknown) => new PgDialect().sqlToQuery(w as never);

/** Answers selects in order (campaign, then list) and records each where. */
function fakeDb(results: unknown[][]) {
  const wheres: unknown[] = [];
  const inserts: unknown[] = [];
  let i = 0;
  const db = {
    select: () => {
      const chain = {
        from: () => chain,
        where: (cond: unknown) => {
          wheres.push(cond);
          return chain;
        },
        limit: async () => results[i++] ?? [],
      };
      return chain;
    },
    insert: () => ({
      values: (v: unknown) => {
        inserts.push(v);
        return { catch: async () => undefined };
      },
    }),
  };
  return { db, wheres, inserts };
}

const campaign = { id: "camp-1", name: "Q4", leadListId: "list-1" };

describe("addNewListLeadsToCampaignAction (#40)", () => {
  beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: "user-1", email: "a@x.com", role: "user" });
    getDb.mockReset();
    ensureCampaignLeadSnapshot.mockReset().mockResolvedValue(3);
    poolCampaignEditError.mockReset().mockResolvedValue(null);
  });

  it("only looks up the owner's running, scheduled or paused campaign, and refuses others", async () => {
    const { db, wheres } = fakeDb([[]]);
    getDb.mockReturnValue(db);
    const res = await addNewListLeadsToCampaignAction("camp-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Only a running, scheduled or paused campaign can take new leads.");
    const q = render(wheres[0]);
    expect(q.params).toEqual(expect.arrayContaining(["camp-1", "user-1", "running", "scheduled", "paused"]));
    expect(q.params).not.toContain("draft");
    expect(q.params).not.toContain("completed");
    expect(q.sql).toContain('"campaigns"."deleted_at" is null');
    expect(ensureCampaignLeadSnapshot).not.toHaveBeenCalled();
  });

  it("refuses a campaign whose list was deleted", async () => {
    const { db } = fakeDb([[campaign], [{ id: "list-1", deletedAt: "2026-10-01T00:00:00.000Z" }]]);
    getDb.mockReturnValue(db);
    const res = await addNewListLeadsToCampaignAction("camp-1");
    expect(res).toEqual({ ok: false, error: "Its lead list was deleted." });
    expect(ensureCampaignLeadSnapshot).not.toHaveBeenCalled();
  });

  it("refuses a list that isn't the user's", async () => {
    const { db, wheres } = fakeDb([[campaign], []]);
    getDb.mockReturnValue(db);
    const res = await addNewListLeadsToCampaignAction("camp-1");
    expect(res.ok).toBe(false);
    expect(render(wheres[1]).params).toEqual(expect.arrayContaining(["list-1", "user-1"]));
    expect(ensureCampaignLeadSnapshot).not.toHaveBeenCalled();
  });

  it("refuses a pool or Autopilot campaign for a non-admin (pool guard)", async () => {
    poolCampaignEditError.mockResolvedValue("Autopilot manages this campaign.");
    const { db } = fakeDb([[campaign], [{ id: "list-1", deletedAt: null }]]);
    getDb.mockReturnValue(db);
    const res = await addNewListLeadsToCampaignAction("camp-1");
    expect(res).toEqual({ ok: false, error: "Autopilot manages this campaign." });
    expect(poolCampaignEditError).toHaveBeenCalledWith(db, { id: "user-1", isAdmin: false }, "camp-1");
    expect(ensureCampaignLeadSnapshot).not.toHaveBeenCalled();
  });

  it("adds only the missing leads (insert-missing, no re-engage) and logs it", async () => {
    const { db, inserts } = fakeDb([[campaign], [{ id: "list-1", deletedAt: null }]]);
    getDb.mockReturnValue(db);
    const res = await addNewListLeadsToCampaignAction("camp-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ added: 3 });
    expect(ensureCampaignLeadSnapshot).toHaveBeenCalledWith(db, "camp-1", "list-1", { onlyMissing: true });
    expect(inserts).toHaveLength(1);
  });

  it("reports nothing added without logging", async () => {
    ensureCampaignLeadSnapshot.mockResolvedValue(0);
    const { db, inserts } = fakeDb([[campaign], [{ id: "list-1", deletedAt: null }]]);
    getDb.mockReturnValue(db);
    const res = await addNewListLeadsToCampaignAction("camp-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ added: 0 });
    expect(inserts).toHaveLength(0);
  });

  it("rejects an empty campaign id before touching the database", async () => {
    const res = await addNewListLeadsToCampaignAction("");
    expect(res.ok).toBe(false);
    expect(getDb).not.toHaveBeenCalled();
  });
});
