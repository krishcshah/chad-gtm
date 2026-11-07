/**
 * Run controls on Mission control:
 *  #51 updateRunPitchAction edits only the pitch the agent works from.
 *  #55 dismissRunAction deletes an unlaunched run, never a launched one.
 *  #58 clearBookingUrlAction removes a launched run's booking link.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

type Write = { op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any; where?: any };

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "client@example.com", role: "user", emailVerified: true } as Record<string, unknown>,
  selects: [] as any[][],
  selectWheres: [] as any[],
  writes: [] as Write[],
  /** What an UPDATE ... RETURNING gives back (default: one row). */
  onWrite: null as null | ((w: Write) => any[] | undefined),
  workspace: null as null | { id: string; name: string; bookingUrl: string | null },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined })),
  headers: vi.fn(),
}));
vi.mock("../session", () => ({
  requireUser: vi.fn(async () => state.user),
  requireWorkspace: vi.fn(async () => ({ user: state.user, workspace: { id: "w1", isDefault: true } })),
  getSession: vi.fn(async () => ({ user: state.user })),
}));
vi.mock("../workspaces", () => ({
  ACTIVE_WORKSPACE_COOKIE: "ws",
  ensureDefaultWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })),
  getActiveWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })),
  getFallbackWorkspace: vi.fn(() => ({ id: "w1", isDefault: true })),
}));
vi.mock("../workspace-booking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspace-booking")>()),
  loadOwnedWorkspace: vi.fn(async () => state.workspace),
}));
vi.mock("../db", () => {
  const chain = (result: any[]) => {
    const c: any = {};
    for (const m of ["from", "innerJoin", "leftJoin", "orderBy", "limit", "groupBy"]) c[m] = () => c;
    c.where = (w: any) => {
      state.selectWheres.push(w);
      return c;
    };
    c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
    return c;
  };
  const write = (op: Write["op"]) => (table: unknown) => {
    const entry: Write = { op, table };
    state.writes.push(entry);
    const c: any = {
      set: (v: any) => ((entry.set = v), c),
      values: (v: any) => ((entry.values = v), c),
      where: (w: any) => ((entry.where = w), c),
      returning: () => c,
      onConflictDoNothing: () => c,
      onConflictDoUpdate: () => c,
      then: (resolve: any, reject: any) =>
        Promise.resolve(state.onWrite?.(entry) ?? [{ id: "row" }]).then(resolve, reject),
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

import { dismissRunAction, updateRunPitchAction } from "../chad-gtm-actions";
import { clearBookingUrlAction } from "../autopilot-actions";

const dialect = new PgDialect();
const sqlOf = (w: unknown) => dialect.sqlToQuery(w as any).sql.replace(/\s+/g, " ");

beforeEach(() => {
  state.selects = [];
  state.selectWheres = [];
  state.writes = [];
  state.onWrite = null;
  state.workspace = null;
});

/* ─── #51 pitch ─────────────────────────────────────────────────────── */

describe("updateRunPitchAction", () => {
  const RUN = {
    offers: [
      { title: "Audit", valueProp: "A free audit of your books.", angle: "ROI", cta: "Want one?" },
      { title: "Close", valueProp: "Close the books in two days.", angle: "Speed", cta: "Worth a look?" },
    ],
    businessOverview: { summary: "Old summary.", industry: "Accounting", targetMarket: "SMBs" },
  };
  const PITCH = { title: " Faster close ", valueProp: "Close your books in two days, not ten.", summary: "We do bookkeeping." };

  it("changes only offers[0].title / valueProp and businessOverview.summary", async () => {
    state.selects = [[RUN]];
    const r = await updateRunPitchAction("run-1", PITCH);
    expect(r.ok).toBe(true);
    const upd = state.writes.find((w) => w.op === "update" && w.table === schema.chadGtmRuns);
    expect(upd?.set.offers).toEqual([
      { title: "Faster close", valueProp: "Close your books in two days, not ten.", angle: "ROI", cta: "Want one?" },
      RUN.offers[1],
    ]);
    expect(upd?.set.businessOverview).toEqual({ summary: "We do bookkeeping.", industry: "Accounting", targetMarket: "SMBs" });
    expect(upd?.set).not.toHaveProperty("selectedIndustries");
    expect(upd?.set).not.toHaveProperty("icpProfile");
  });

  it("says the campaign offer still wins when 'What this campaign offers' is set", async () => {
    state.selects = [[{ ...RUN, campaignOffer: "A two-day close" }]];
    const r = await updateRunPitchAction("run-1", PITCH);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("What this campaign offers");
    expect(r.message).not.toContain("uses it in replies from now on");

    state.selects = [[{ ...RUN, campaignOffer: "" }]];
    const plain = await updateRunPitchAction("run-1", PITCH);
    expect(plain.message).toBe("Pitch saved. The agent uses it in replies from now on.");
  });

  it("rejects an empty title and a short value prop without writing", async () => {
    state.selects = [[RUN]];
    expect(await updateRunPitchAction("run-1", { ...PITCH, title: "  " })).toEqual({
      ok: false,
      error: "Give the offer a short title.",
    });
    expect(await updateRunPitchAction("run-1", { ...PITCH, valueProp: "Too short" })).toEqual({
      ok: false,
      error: "Describe what the lead gets in a sentence or two.",
    });
    expect(state.writes).toEqual([]);
  });

  it("refuses a run owned by someone else (the owner-scoped lookup finds nothing)", async () => {
    state.selects = [[]];
    const r = await updateRunPitchAction("run-x", PITCH);
    expect(r).toEqual({ ok: false, error: "Run not found." });
    expect(state.writes).toEqual([]);
    const where = sqlOf(state.selectWheres[0]);
    expect(where).toContain('"chad_gtm_runs"."user_id" = $');
    expect(where).toContain('"chad_gtm_runs"."dismissed_at" is null');
  });
});

/* ─── #55 delete an unlaunched run ──────────────────────────────────── */

describe("dismissRunAction", () => {
  it("sets dismissedAt on an unlaunched run, with the launch guards in the same UPDATE", async () => {
    const r = await dismissRunAction("run-1");
    expect(r).toEqual({ ok: true });
    const upd = state.writes.find((w) => w.op === "update" && w.table === schema.chadGtmRuns);
    expect(upd?.set.dismissedAt).toEqual(expect.any(String));
    const where = sqlOf(upd?.where);
    expect(where).toContain('"chad_gtm_runs"."user_id" = $');
    expect(where).toContain('"chad_gtm_runs"."campaign_id" is null');
    expect(where).toContain('"chad_gtm_runs"."launch_started_at" is null');
    expect(where).toContain('"chad_gtm_runs"."launch_started_at" < $');
  });

  it("refuses when the run launched or is launching (the conditional update matches no row)", async () => {
    state.onWrite = () => [];
    const r = await dismissRunAction("run-1");
    expect(r).toEqual({
      ok: false,
      error: "This run has launched or is launching, so it can't be deleted. Pause it instead.",
    });
  });
});

/* ─── #58 remove the booking link ───────────────────────────────────── */

describe("clearBookingUrlAction", () => {
  const LAUNCHED = { id: "run-1", userId: "u1", autopilot: true, campaignId: "c1", bookingUrl: "https://cal.com/a", workspaceId: "w1" };

  it("sets bookingUrl to null for a launched run and says the agent asks in Needs you", async () => {
    state.selects = [[LAUNCHED]];
    const r = await clearBookingUrlAction("run-1");
    expect(r.ok).toBe(true);
    expect(r.ok && r.message).toContain("ask you in Needs you");
    const upd = state.writes.find((w) => w.op === "update" && w.table === schema.chadGtmRuns);
    expect(upd?.set).toMatchObject({ bookingUrl: null });
  });

  it("is honest when the workspace default link takes over", async () => {
    state.selects = [[LAUNCHED]];
    state.workspace = { id: "w1", name: "Acme", bookingUrl: "https://cal.com/acme" };
    const r = await clearBookingUrlAction("run-1");
    expect(r.ok && r.message).toContain("Acme booking link");
  });

  it("refuses an unlaunched autopilot run, with no write", async () => {
    state.selects = [[{ ...LAUNCHED, campaignId: null }]];
    const r = await clearBookingUrlAction("run-1");
    expect(r).toEqual({ ok: false, error: "Add a booking link to launch. You can remove it after launch." });
    expect(state.writes).toEqual([]);
  });

  it("refuses another user's run (the owner-scoped lookup finds nothing)", async () => {
    state.selects = [[]];
    const r = await clearBookingUrlAction("run-x");
    expect(r).toEqual({ ok: false, error: "Run not found." });
    expect(state.writes).toEqual([]);
    expect(sqlOf(state.selectWheres[0])).toContain('"chad_gtm_runs"."dismissed_at" is null');
  });
});
