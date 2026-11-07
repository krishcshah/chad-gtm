/**
 * setBookingUrlAction sets one run's booking link. It makes it the workspace
 * default ONLY when asked (opts.workspaceDefault === true): a new default
 * releases booking-link cards of other campaigns in the workspace, so it is
 * never implied, not even when the workspace has no default yet (the Needs
 * you request card saves with no opts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

type Write = { op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any; where?: any };

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "client@example.com", role: "user", emailVerified: true } as Record<string, unknown>,
  selects: [] as any[][],
  writes: [] as Write[],
  workspace: null as null | { id: string; name: string; isDefault: boolean; bookingUrl: string | null },
  saveDefault: vi.fn(async () => ({ saved: true, answered: 2 })),
  release: vi.fn(async () => ({ answered: 0 })),
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
  saveWorkspaceBookingUrl: state.saveDefault,
}));
vi.mock("../lead-conversations-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lead-conversations-server")>()),
  releaseBookingLinkRequests: state.release,
}));
vi.mock("../db", () => {
  const chain = (result: any[]) => {
    const c: any = {};
    for (const m of ["from", "innerJoin", "leftJoin", "orderBy", "limit", "groupBy", "where"]) c[m] = () => c;
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
      then: (resolve: any, reject: any) => Promise.resolve([{ id: "row" }]).then(resolve, reject),
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

import { setBookingUrlAction } from "../autopilot-actions";

// Launched, so saving the link does not advance the launch.
const LAUNCHED = { id: "run-1", userId: "u1", autopilot: true, campaignId: "c1", bookingUrl: null, workspaceId: "w1" };
const LINK = "https://cal.com/acme/intro";

beforeEach(() => {
  state.selects = [];
  state.writes = [];
  state.workspace = { id: "w1", name: "Acme", isDefault: true, bookingUrl: null };
  state.saveDefault.mockClear();
  state.release.mockClear();
});

describe("setBookingUrlAction: the workspace default is never implied", () => {
  it("saves only the run's link when the workspace has no default and nobody asked", async () => {
    state.selects = [[LAUNCHED]];
    const r = await setBookingUrlAction("run-1", LINK);
    expect(r.ok).toBe(true);
    expect(state.saveDefault).not.toHaveBeenCalled();
    expect(state.writes.some((w) => w.op === "update" && w.table === schema.workspaces)).toBe(false);
    const runUpdate = state.writes.find((w) => w.op === "update" && w.table === schema.chadGtmRuns);
    expect(runUpdate?.set).toMatchObject({ bookingUrl: LINK });
    // Only this run's campaign has its booking-link cards released.
    expect(state.release).toHaveBeenCalledTimes(1);
    expect((state.release.mock.calls[0] as any[])[1]).toMatchObject({ runId: "run-1", campaignIds: ["c1"] });
    expect(r.ok && r.message).toBe("Booking link saved.");
  });

  it("does not promote with workspaceDefault: false either", async () => {
    state.selects = [[LAUNCHED]];
    await setBookingUrlAction("run-1", LINK, { workspaceDefault: false });
    expect(state.saveDefault).not.toHaveBeenCalled();
  });

  it("sets the workspace default when explicitly asked, and says so", async () => {
    state.selects = [[LAUNCHED]];
    const r = await setBookingUrlAction("run-1", LINK, { workspaceDefault: true });
    expect(state.saveDefault).toHaveBeenCalledTimes(1);
    expect((state.saveDefault.mock.calls[0] as any[])[1]).toMatchObject({ userId: "u1", bookingUrl: LINK });
    expect(r.ok && r.message).toContain("Also set as the default for Acme.");
  });
});
