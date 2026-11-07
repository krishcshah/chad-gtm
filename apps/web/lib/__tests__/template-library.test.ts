import { beforeEach, describe, expect, it, vi } from "vitest";

/* #105: rename and delete your own saved templates from the wizard's
 * template picker. Templates Autopilot made, and templates a live Autopilot
 * or pool campaign uses, can't be changed by a non-admin. */

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "client@example.com", role: "user", emailVerified: true } as Record<string, unknown>,
  selects: [] as any[][],
  writes: [] as Array<{ kind: string; set?: any }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined })), headers: vi.fn() }));
vi.mock("../session", () => ({
  requireUser: vi.fn(async () => state.user),
  requireWorkspace: vi.fn(async () => ({ user: state.user, workspace: { id: "w1", isDefault: true } })),
  getSession: vi.fn(async () => ({ user: state.user })),
}));
vi.mock("../workspaces", () => ({
  ACTIVE_WORKSPACE_COOKIE: "ws",
  getActiveWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })),
  getFallbackWorkspace: vi.fn(() => ({ id: "w1", isDefault: true })),
}));
vi.mock("../db", () => {
  const chain = (result: any[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
  };
  const write = (kind: string) => () => {
    const entry: { kind: string; set?: any } = { kind };
    state.writes.push(entry);
    const c: any = {
      set: (s: any) => ((entry.set = s), c),
      values: () => c,
      where: () => c,
      returning: () => c,
      onConflictDoNothing: () => c,
      then: (resolve: any, reject: any) => Promise.resolve([{ id: "new-id" }]).then(resolve, reject),
      catch: (reject: any) => Promise.resolve([{ id: "new-id" }]).catch(reject),
    };
    return c;
  };
  const db = {
    select: () => chain(state.selects.shift() ?? []),
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
    execute: async () => ({ rows: [] }),
    transaction: async (fn: any) => fn(db),
  };
  return { getDb: () => db, ensureChadGtmTables: async () => undefined, ensureAgentTables: async () => undefined };
});

import { POOL_CAMPAIGN_LOCKED_ERROR } from "../pool-campaign-guard";
import { deleteTemplate, renameTemplate } from "../actions";

const OWN = [{ id: "t1", source: "user" }];
const AUTOPILOT = [{ id: "t1", source: "autopilot" }];
const POOL_HIT = [{ id: "pool-campaign" }];
const NO_HIT: any[] = [];

/** Writes to email_templates (activity log inserts are not template writes). */
const templateUpdates = () => state.writes.filter((w) => w.kind === "update");

beforeEach(() => {
  state.user = { id: "u1", email: "client@example.com", role: "user", emailVerified: true };
  state.selects = [];
  state.writes = [];
});

describe("renameTemplate", () => {
  it("renames the user's own template", async () => {
    state.selects = [OWN, NO_HIT];
    const r = await renameTemplate("t1", "  Q4 follow-up  ");
    expect(r).toEqual({ ok: true, data: { id: "t1", name: "Q4 follow-up" }, message: "Renamed to “Q4 follow-up”" });
    expect(templateUpdates()).toHaveLength(1);
    expect(templateUpdates()[0]!.set).toMatchObject({ name: "Q4 follow-up" });
  });

  it("refuses an empty or whitespace name and writes nothing", async () => {
    for (const name of ["", "   "]) {
      expect(await renameTemplate("t1", name)).toEqual({ ok: false, error: "Enter a name for the template." });
    }
    expect(state.writes).toEqual([]);
  });

  it("refuses a name over 120 characters", async () => {
    expect(await renameTemplate("t1", "x".repeat(121))).toEqual({ ok: false, error: "Keep the name under 120 characters." });
    expect(state.writes).toEqual([]);
  });

  it("refuses an Autopilot template for a non-admin", async () => {
    state.selects = [AUTOPILOT];
    const r = await renameTemplate("t1", "Mine now");
    expect(r).toEqual({ ok: false, error: "This template was made by Autopilot and can't be changed here." });
    expect(templateUpdates()).toEqual([]);
  });

  it("refuses a template used by a pool campaign", async () => {
    state.selects = [OWN, POOL_HIT];
    expect(await renameTemplate("t1", "New name")).toEqual({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    expect(templateUpdates()).toEqual([]);
  });
});

describe("deleteTemplate", () => {
  it("refuses an Autopilot template for a non-admin", async () => {
    state.selects = [AUTOPILOT];
    const r = await deleteTemplate("t1");
    expect(r).toEqual({ ok: false, error: "This template was made by Autopilot and can't be changed here." });
    expect(templateUpdates()).toEqual([]);
  });

  it("refuses a template used by a pool or Autopilot campaign", async () => {
    state.selects = [OWN, POOL_HIT];
    expect(await deleteTemplate("t1")).toEqual({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("returns 'Template not found.' for a missing or another user's template", async () => {
    state.selects = [[]];
    expect(await deleteTemplate("someone-elses")).toEqual({ ok: false, error: "Template not found." });
    expect(state.writes).toEqual([]);
  });

  it("soft-deletes the user's own unused template", async () => {
    state.selects = [OWN, NO_HIT];
    expect(await deleteTemplate("t1")).toEqual({ ok: true, message: "Template deleted" });
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]!.set.deletedAt).toEqual(expect.any(String));
  });

  it("an admin may delete an Autopilot template (no pool lookup for admins)", async () => {
    state.user = { ...state.user, role: "admin" };
    state.selects = [AUTOPILOT];
    expect((await deleteTemplate("t1")).ok).toBe(true);
  });
});
