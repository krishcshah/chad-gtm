import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── Fakes ────────────────────────────────────────────────────────────── */

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "client@example.com", role: "user", emailVerified: true } as Record<string, unknown>,
  selects: [] as any[][],
  writes: [] as string[],
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
    state.writes.push(kind);
    const c: any = {
      set: () => c,
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

import {
  POOL_CAMPAIGN_LOCKED_ERROR,
  poolContentEditError,
  poolListEditError,
} from "../pool-campaign-guard";
import {
  createLead,
  importLeads,
  publishCampaign,
  saveCampaignDraft,
  saveCampaignSequence,
  updateLead,
  updateSequenceTemplate,
  upsertTemplate,
} from "../actions";

const POOL_HIT = [{ id: "pool-campaign" }];
const NO_HIT: any[] = [];

beforeEach(() => {
  state.user = { id: "u1", email: "client@example.com", role: "user", emailVerified: true };
  state.selects = [];
  state.writes = [];
});

describe("poolContentEditError (pure)", () => {
  it("refuses non-admins only when the target is used by a pool campaign", () => {
    expect(poolContentEditError({ isAdmin: false, usedByPoolCampaign: true })).toBe(POOL_CAMPAIGN_LOCKED_ERROR);
    expect(poolContentEditError({ isAdmin: false, usedByPoolCampaign: false })).toBeNull();
    expect(poolContentEditError({ isAdmin: true, usedByPoolCampaign: true })).toBeNull();
  });

  it("admins skip the lookup entirely", async () => {
    const select = vi.fn();
    expect(await poolListEditError({ select }, { id: "a", isAdmin: true }, "list-1")).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });
});

describe("server actions refuse pool-campaign edits for non-admins", () => {
  it("importLeads into a pool campaign's list", async () => {
    state.selects = [[{ id: "list-1" }], POOL_HIT];
    const r = await importLeads({ listId: "list-1", mapping: { Email: "email" }, rows: [{ Email: "x@evil.com" }] });
    expect(r).toMatchObject({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("importLeads into an ordinary list still works", async () => {
    state.selects = [[{ id: "list-1" }], NO_HIT, []];
    const r = await importLeads({ listId: "list-1", mapping: { Email: "email" }, rows: [{ Email: "x@acme.com" }] });
    expect(r.ok).toBe(true);
    expect(state.writes).toContain("insert");
  });

  it("createLead in a pool list", async () => {
    state.selects = [POOL_HIT];
    const r = await createLead({ listId: "list-1", email: "x@evil.com" });
    expect(r).toMatchObject({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("updateLead of a lead in a pool list", async () => {
    state.selects = [[{ listId: "list-1" }], POOL_HIT];
    const r = await updateLead("lead-1", { email: "victim@elsewhere.com" });
    expect(r).toMatchObject({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("upsertTemplate / updateSequenceTemplate of a pool campaign's template", async () => {
    state.selects = [POOL_HIT];
    const r1 = await upsertTemplate({ id: "tpl-1", name: "x", subject: "Buy now", bodyText: "spam", format: "text" });
    expect(r1).toMatchObject({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    state.selects = [POOL_HIT];
    const r2 = await updateSequenceTemplate("tpl-1", "x", "", []);
    expect(r2).toMatchObject({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("saveCampaignSequence on a pool campaign", async () => {
    state.selects = [POOL_HIT];
    const r = await saveCampaignSequence({ campaignId: "camp-pool", steps: [] });
    expect(r).toMatchObject({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("saveCampaignDraft / publishCampaign naming a pool campaign id", async () => {
    state.selects = [POOL_HIT];
    expect(await saveCampaignDraft({ id: "camp-pool", leadListId: "my-list" })).toMatchObject({
      ok: false,
      error: POOL_CAMPAIGN_LOCKED_ERROR,
    });
    state.selects = [POOL_HIT];
    expect(await publishCampaign({ id: "camp-pool" })).toMatchObject({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("admins are not blocked", async () => {
    state.user = { id: "admin", email: "a@example.com", role: "admin", emailVerified: true };
    state.selects = [[{ id: "list-1" }], []];
    const r = await importLeads({ listId: "list-1", mapping: { Email: "email" }, rows: [{ Email: "x@acme.com" }] });
    expect(r.ok).toBe(true);
  });
});

/* ── Finding: detaching pool senders unlocked an autopilot campaign ─────── */

import { PgDialect } from "drizzle-orm/pg-core";
import {
  POOL_CAMPAIGN_SENDERS_LOCKED_ERROR,
  campaignUsesPoolSenders,
  poolCampaignSenderChangeError,
} from "../pool-campaign-guard";
import { updateCampaignSettings } from "../actions";

describe("pool campaign = autopilot-linked campaign, not just attached pool mailboxes", () => {
  it("the pool-campaign lookup matches campaigns linked from chad_gtm_runs", async () => {
    let whereArg: any = null;
    const c: any = {
      from: () => c,
      innerJoin: () => c,
      where: (w: any) => {
        whereArg = w;
        return c;
      },
      limit: () => Promise.resolve([]),
    };
    await campaignUsesPoolSenders({ select: () => c }, "camp-1");
    const rendered = new PgDialect().sqlToQuery(whereArg).sql;
    expect(rendered).toContain('"chad_gtm_runs"');
    expect(rendered).toContain('"campaign_id"');
    // Pool mailboxes still count (a run can be deleted while pool senders stay).
    expect(rendered).toContain('"is_system_pool"');
  });

  it("poolCampaignSenderChangeError (pure)", () => {
    const pool = { id: "pool-1", isSystemPool: true };
    const own = { id: "own-1", isSystemPool: false };
    // Detaching every sender of an autopilot campaign is refused.
    expect(
      poolCampaignSenderChangeError({ isAdmin: false, isAutopilotCampaign: true, attached: [pool], requested: [] }),
    ).toBe(POOL_CAMPAIGN_SENDERS_LOCKED_ERROR);
    // Even when no pool mailbox is attached any more (engine falls back to the pool).
    expect(
      poolCampaignSenderChangeError({ isAdmin: false, isAutopilotCampaign: true, attached: [], requested: ["own-1"] }),
    ).toBe(POOL_CAMPAIGN_SENDERS_LOCKED_ERROR);
    // Swapping pool for own mailbox, or adding one, is refused.
    expect(
      poolCampaignSenderChangeError({ isAdmin: false, isAutopilotCampaign: true, attached: [pool], requested: ["own-1"] }),
    ).toBe(POOL_CAMPAIGN_SENDERS_LOCKED_ERROR);
    expect(
      poolCampaignSenderChangeError({
        isAdmin: false,
        isAutopilotCampaign: true,
        attached: [pool],
        requested: ["pool-1", "own-1"],
      }),
    ).toBe(POOL_CAMPAIGN_SENDERS_LOCKED_ERROR);
    // A non-autopilot campaign with a pool mailbox (admin-attached) is locked too.
    expect(
      poolCampaignSenderChangeError({ isAdmin: false, isAutopilotCampaign: false, attached: [pool], requested: [] }),
    ).toBe(POOL_CAMPAIGN_SENDERS_LOCKED_ERROR);
    // Resubmitting the same set (any order) is fine.
    expect(
      poolCampaignSenderChangeError({
        isAdmin: false,
        isAutopilotCampaign: true,
        attached: [pool, own],
        requested: ["own-1", "pool-1"],
      }),
    ).toBeNull();
    // Manual campaigns and admins are unaffected.
    expect(
      poolCampaignSenderChangeError({ isAdmin: false, isAutopilotCampaign: false, attached: [own], requested: [] }),
    ).toBeNull();
    expect(
      poolCampaignSenderChangeError({ isAdmin: true, isAutopilotCampaign: true, attached: [pool], requested: [] }),
    ).toBeNull();
  });

  const CAMPAIGN = [{ id: "camp-auto", name: "Autopilot", userId: "u1" }];
  const POOL_ATTACHED = [{ id: "pool-1", userId: "platform", isSystemPool: true, deletedAt: null }];
  const RUN_LINK = [{ id: "run-1" }];

  it("updateCampaignSettings refuses detaching pool senders from an autopilot campaign", async () => {
    state.selects = [CAMPAIGN, POOL_ATTACHED, RUN_LINK];
    const r = await updateCampaignSettings("camp-auto", { senderIds: [] });
    expect(r).toMatchObject({ ok: false, error: POOL_CAMPAIGN_SENDERS_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("updateCampaignSettings refuses adding own senders to an autopilot campaign that has none left", async () => {
    state.selects = [CAMPAIGN, [], RUN_LINK];
    const r = await updateCampaignSettings("camp-auto", { senderIds: ["own-1"] });
    expect(r).toMatchObject({ ok: false, error: POOL_CAMPAIGN_SENDERS_LOCKED_ERROR });
    expect(state.writes).toEqual([]);
  });

  it("updateCampaignSettings on an autopilot campaign with the same senders saves other settings, leaves senders alone", async () => {
    state.selects = [CAMPAIGN, POOL_ATTACHED, RUN_LINK];
    const r = await updateCampaignSettings("camp-auto", { name: "Renamed", senderIds: ["pool-1"] });
    expect(r.ok).toBe(true);
    expect(state.writes).not.toContain("delete");
  });

  it("updateCampaignSettings still lets a client swap mailboxes on a manual campaign", async () => {
    state.selects = [
      CAMPAIGN,
      [{ id: "own-1", userId: "u1", isSystemPool: false, deletedAt: null }],
      [],
      [{ id: "own-2", userId: "u1", isSystemPool: false, deletedAt: null }],
    ];
    const r = await updateCampaignSettings("camp-auto", { senderIds: ["own-2"] });
    expect(r.ok).toBe(true);
    expect(state.writes).toContain("delete");
  });

  it("the list/sequence of an autopilot campaign with no pool mailbox left is still locked", async () => {
    // The guard query now matches on the run link, so the db reports a hit.
    state.selects = [POOL_HIT];
    const r = await saveCampaignSequence({ campaignId: "camp-auto", steps: [] });
    expect(r).toMatchObject({ ok: false, error: POOL_CAMPAIGN_LOCKED_ERROR });
  });
});
