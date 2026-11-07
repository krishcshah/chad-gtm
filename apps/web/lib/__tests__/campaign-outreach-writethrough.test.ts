import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

/* One outreach, two controls (#46, #47): Start/Resume/Pause/Archive/Delete
 * write the campaign first, then mirror it on the Autopilot run. Mission
 * control's Pause/Resume goes through the same campaignAction, so both
 * buttons run the same start checks and the same writes. Archived, completed
 * and deleted campaigns are never resumed. */

type Write = { op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any };

const st = vi.hoisted(() => ({
  routes: new Map<unknown, (fields: string[]) => any[]>(),
  writes: [] as Write[],
  user: { id: "u1", email: "c@example.com", role: "user", emailVerified: true } as Record<string, unknown>,
  campaignStartError: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined })),
  headers: vi.fn(),
}));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => st.user), requireWorkspace: vi.fn(), getSession: vi.fn() }));
vi.mock("../workspaces", () => ({
  getActiveWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })),
  ensureDefaultWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })),
  ACTIVE_WORKSPACE_COOKIE: "ws",
}));
vi.mock("../campaign-start", () => ({
  campaignStartError: st.campaignStartError,
  loadAttachedSenderRefs: vi.fn(async () => []),
}));
vi.mock("../campaign-drafts", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureCampaignLeadSnapshot: st.snapshot,
}));
vi.mock("@smartreach/email-engine/processor", () => ({ releaseCampaignJobs: vi.fn(async () => undefined) }));
vi.mock("../db", () => {
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
      return chain(
        () => (st.routes.get(table) ?? (() => []))(fields ? Object.keys(fields) : []),
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["insert", "update", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table };
      st.writes.push(entry);
      return chain(
        () => (table === schema.chadGtmRuns ? [{ id: "run1" }] : [{ id: "row" }]),
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
        },
      );
    };
  }
  return { getDb: () => db, ensureChadGtmTables: async () => undefined, ensureAgentTables: async () => undefined };
});

import { campaignAction } from "../actions";
import { toggleChadGtmStatusAction } from "../chad-gtm-actions";
import { CAMPAIGN_ARCHIVED_START_ERROR, CAMPAIGN_COMPLETED_START_ERROR } from "../outreach-control";

const CAMPAIGN = {
  id: "c1",
  userId: "u1",
  name: "AutoGTM: Acme",
  status: "running",
  deletedAt: null,
  leadListId: "list1",
  startedAt: "2026-10-01T00:00:00.000Z",
};

function world(over: { campaign?: Record<string, unknown>; run?: Record<string, unknown> | null } = {}) {
  const run = over.run === null ? null : { id: "run1", campaignId: "c1", ...over.run };
  st.routes = new Map<unknown, (fields: string[]) => any[]>([
    [schema.campaigns, () => [{ ...CAMPAIGN, ...over.campaign }]],
    [schema.chadGtmRuns, () => (run ? [run] : [])],
  ]);
}

/** Every write except the activity log line (timestamps left out). */
const outreachWrites = () =>
  st.writes
    .filter((w) => w.table !== schema.activityLogs)
    .map((w) => {
      const { updatedAt: _u, deletedAt: _d, startedAt: _s, ...set } = w.set ?? {};
      return { op: w.op, table: w.table, set };
    });

beforeEach(() => {
  st.writes = [];
  st.user = { id: "u1", email: "c@example.com", role: "user", emailVerified: true };
  st.campaignStartError.mockReset();
  st.campaignStartError.mockResolvedValue(null);
  st.snapshot.mockReset();
  st.snapshot.mockResolvedValue(0);
});

describe("campaignAction writes the campaign, then its Autopilot run", () => {
  it("pause: campaigns paused, then the run paused", async () => {
    world();
    const r = await campaignAction("c1", "pause");
    expect(r.ok).toBe(true);
    const w = outreachWrites();
    expect(w[0]).toMatchObject({ op: "update", table: schema.campaigns, set: { status: "paused" } });
    expect(w[1]).toMatchObject({ op: "update", table: schema.chadGtmRuns, set: { status: "paused" } });
  });

  it("resume: runs the start gates and the lead snapshot, then campaigns running, then the run active", async () => {
    world({ campaign: { status: "paused" } });
    const r = await campaignAction("c1", "resume");
    expect(r.ok).toBe(true);
    expect(st.campaignStartError).toHaveBeenCalledTimes(1);
    expect(st.snapshot).toHaveBeenCalledWith(expect.anything(), "c1", "list1");
    const w = outreachWrites();
    expect(w[0]).toMatchObject({ op: "update", table: schema.campaigns, set: { status: "running" } });
    expect(w[1]).toMatchObject({ op: "update", table: schema.chadGtmRuns, set: { status: "active" } });
  });

  it("resume with a failing start gate (unapproved, no postal address, no mailboxes) writes nothing", async () => {
    world({ campaign: { status: "paused" } });
    st.campaignStartError.mockResolvedValue("Your account is waiting for approval.");
    const r = await campaignAction("c1", "resume");
    expect(r).toEqual({ ok: false, error: "Your account is waiting for approval." });
    expect(st.writes).toHaveLength(0);
    expect(st.snapshot).not.toHaveBeenCalled();
  });

  it("archive: campaigns archived, then the run completed (still linked)", async () => {
    world();
    const r = await campaignAction("c1", "archive");
    expect(r.ok).toBe(true);
    const w = outreachWrites();
    expect(w[0]).toMatchObject({ op: "update", table: schema.campaigns, set: { status: "archived" } });
    expect(w[1]).toMatchObject({ op: "update", table: schema.chadGtmRuns, set: { status: "completed" } });
    expect(w[1].set.campaignId).toBeUndefined();
  });

  it("delete: campaigns soft-deleted, then the run completed (still linked)", async () => {
    world();
    const r = await campaignAction("c1", "delete");
    expect(r.ok).toBe(true);
    const w = outreachWrites();
    expect(w[0]).toMatchObject({ op: "update", table: schema.campaigns, set: { status: "archived" } });
    expect(st.writes[0].set.deletedAt).toBeTruthy();
    expect(w[1]).toMatchObject({ op: "update", table: schema.chadGtmRuns, set: { status: "completed" } });
    expect(w[1].set.campaignId).toBeUndefined();
  });

  it.each([
    [{ status: "archived" }, CAMPAIGN_ARCHIVED_START_ERROR],
    [{ status: "completed" }, CAMPAIGN_COMPLETED_START_ERROR],
    [{ status: "paused", deletedAt: "2026-11-01T00:00:00.000Z" }, "Campaign not found"],
  ])("resume on %o is refused with no writes", async (campaign, error) => {
    world({ campaign });
    for (const cmd of ["resume", "start"] as const) {
      const r = await campaignAction("c1", cmd);
      expect(r).toEqual({ ok: false, error });
    }
    expect(st.writes).toHaveLength(0);
    expect(st.campaignStartError).not.toHaveBeenCalled();
  });

  it("pause on a deleted campaign is refused ('Campaign not found')", async () => {
    world({ campaign: { deletedAt: "2026-11-01T00:00:00.000Z" } });
    expect(await campaignAction("c1", "pause")).toEqual({ ok: false, error: "Campaign not found" });
    expect(st.writes).toHaveLength(0);
  });
});

describe("toggleChadGtmStatusAction goes through campaignAction", () => {
  it("'paused' produces the same writes as campaignAction pause", async () => {
    world();
    await campaignAction("c1", "pause");
    const viaCampaigns = outreachWrites();
    st.writes = [];
    const r = await toggleChadGtmStatusAction("run1", "paused");
    expect(r).toEqual({ ok: true });
    expect(outreachWrites()).toEqual(viaCampaigns);
  });

  it("'active' runs the same start gates; a failing gate writes nothing", async () => {
    world({ campaign: { status: "paused" } });
    st.campaignStartError.mockResolvedValue("Add your company's postal address first.");
    const r = await toggleChadGtmStatusAction("run1", "active");
    expect(r).toEqual({ ok: false, error: "Add your company's postal address first." });
    expect(st.writes).toHaveLength(0);
  });

  it("'active' resumes: campaign running, run active, lead snapshot taken", async () => {
    world({ campaign: { status: "paused" } });
    const r = await toggleChadGtmStatusAction("run1", "active");
    expect(r).toEqual({ ok: true });
    expect(st.snapshot).toHaveBeenCalledTimes(1);
    const w = outreachWrites();
    expect(w[0]).toMatchObject({ table: schema.campaigns, set: { status: "running" } });
    expect(w[1]).toMatchObject({ table: schema.chadGtmRuns, set: { status: "active" } });
  });

  it("'active' on an archived campaign returns the archived error and writes nothing", async () => {
    world({ campaign: { status: "archived" } });
    const r = await toggleChadGtmStatusAction("run1", "active");
    expect(r).toEqual({ ok: false, error: CAMPAIGN_ARCHIVED_START_ERROR });
    expect(st.writes).toHaveLength(0);
  });

  it("a run that hasn't launched is refused either way", async () => {
    world({ run: { campaignId: null } });
    for (const s of ["active", "paused"] as const) {
      expect(await toggleChadGtmStatusAction("run1", s)).toEqual({
        ok: false,
        error: "This campaign hasn't launched yet.",
      });
    }
    expect(st.writes).toHaveLength(0);
  });
});
