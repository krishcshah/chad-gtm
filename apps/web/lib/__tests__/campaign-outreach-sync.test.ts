import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

/* One outreach, two controls (#48, #53, #54): the campaign is the owner of
 * on/off; the Autopilot run mirrors it. Autopilot's schedule and pace can't be
 * changed from the Campaigns page by a non-admin; completed and archived
 * campaigns are never "started again"; unarchive comes back paused; retrying
 * failed leads runs the same gates as Resume and never retries a bounce. */

type Write = { op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any };

const st = vi.hoisted(() => ({
  routes: new Map<unknown, (fields: string[]) => any[]>(),
  writes: [] as Write[],
  user: { id: "u1", email: "c@example.com", role: "user", emailVerified: true } as Record<string, unknown>,
  startError: null as string | null,
  campaignStartError: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined })),
  headers: vi.fn(),
}));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => st.user), requireWorkspace: vi.fn(), getSession: vi.fn() }));
vi.mock("../workspaces", () => ({ getActiveWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })), ACTIVE_WORKSPACE_COOKIE: "ws" }));
vi.mock("../campaign-start", () => ({
  campaignStartError: st.campaignStartError,
  loadAttachedSenderRefs: vi.fn(async () => []),
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

import { campaignAction, updateCampaignSettings } from "../actions";
import {
  AUTOPILOT_SETTINGS_LOCKED_ERROR,
  CAMPAIGN_COMPLETED_START_ERROR,
  NO_RETRYABLE_FAILED_LEADS_ERROR,
} from "../outreach-control";

const CAMPAIGN = {
  id: "c1",
  userId: "u1",
  name: "Spring push",
  status: "running",
  deletedAt: null,
  leadListId: "list1",
  startedAt: "2026-10-01T00:00:00.000Z",
  dailyLimit: 60,
  sendingWindowStart: "09:00",
  sendingWindowEnd: "17:00",
  sendingTimezone: "America/New_York",
  businessDaysOnly: true,
  stopOnReply: true,
  minDelaySec: 45,
  maxDelaySec: 120,
  retryFailed: true,
  retryCount: 2,
};

function world(over: { campaign?: Record<string, unknown>; autopilot?: boolean; failed?: Array<{ id: string }>; pending?: number } = {}) {
  st.routes = new Map<unknown, (fields: string[]) => any[]>([
    [schema.campaigns, () => [{ ...CAMPAIGN, ...over.campaign }]],
    [schema.chadGtmRuns, () => (over.autopilot ? [{ id: "run1" }] : [])],
    [schema.campaignLeads, (fields) => (fields.includes("n") ? [{ n: over.pending ?? 0 }] : (over.failed ?? []))],
  ]);
}

const campaignWrites = () => st.writes.filter((w) => w.op !== "insert" || w.table !== schema.activityLogs);

beforeEach(() => {
  st.writes = [];
  st.user = { id: "u1", email: "c@example.com", role: "user", emailVerified: true };
  st.campaignStartError.mockReset();
  st.campaignStartError.mockResolvedValue(null);
});

describe("updateCampaignSettings on an Autopilot campaign", () => {
  it("a non-admin's daily limit change is refused and nothing is written", async () => {
    world({ autopilot: true });
    const r = await updateCampaignSettings("c1", { name: "Spring push", dailyLimit: 2000 });
    expect(r).toEqual({ ok: false, error: AUTOPILOT_SETTINGS_LOCKED_ERROR });
    expect(st.writes).toHaveLength(0);
  });

  it("a non-admin can still rename it and switch open tracking", async () => {
    world({ autopilot: true });
    const r = await updateCampaignSettings("c1", { name: "Renamed", trackOpens: false });
    expect(r.ok).toBe(true);
    const upd = st.writes.find((w) => w.op === "update" && w.table === schema.campaigns);
    expect(upd?.set).toMatchObject({ name: "Renamed", trackOpens: false });
    expect(upd?.set.dailyLimit).toBeUndefined();
  });

  it("an admin is clamped to 500 and the run's daily volume follows", async () => {
    st.user = { id: "u1", email: "admin@autogtm.tech", role: "admin", emailVerified: true };
    world({ autopilot: true });
    const r = await updateCampaignSettings("c1", { dailyLimit: 2000 });
    expect(r.ok).toBe(true);
    expect(st.writes.find((w) => w.op === "update" && w.table === schema.campaigns)?.set.dailyLimit).toBe(500);
    expect(st.writes.find((w) => w.op === "update" && w.table === schema.chadGtmRuns)?.set).toMatchObject({
      dailyEmailLimit: 500,
    });
  });

  it("a manual campaign keeps any limit of at least 1, and no run is touched", async () => {
    world({ autopilot: false });
    await updateCampaignSettings("c1", { dailyLimit: 2000 });
    expect(st.writes.find((w) => w.op === "update" && w.table === schema.campaigns)?.set.dailyLimit).toBe(2000);
    expect(st.writes.some((w) => w.table === schema.chadGtmRuns)).toBe(false);
  });
});

describe("campaignAction: completed and archived campaigns", () => {
  it("resume on a completed campaign is refused and writes nothing", async () => {
    world({ campaign: { status: "completed" } });
    const r = await campaignAction("c1", "resume");
    expect(r).toEqual({ ok: false, error: CAMPAIGN_COMPLETED_START_ERROR });
    expect(st.writes).toHaveLength(0);
    expect(st.campaignStartError).not.toHaveBeenCalled();
  });

  it("unarchive sets paused (not running) and syncs the run to paused", async () => {
    world({ campaign: { status: "archived" }, autopilot: true, pending: 12 });
    const r = await campaignAction("c1", "unarchive");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toBe("Unarchived. It's paused; 12 leads still have emails to send when you resume it.");
    const writes = campaignWrites();
    expect(writes[0]).toMatchObject({ op: "update", table: schema.campaigns, set: { status: "paused" } });
    expect(writes[1]).toMatchObject({ op: "update", table: schema.chadGtmRuns, set: { status: "paused" } });
    expect(st.writes.some((w) => w.set?.status === "running")).toBe(false);
  });

  it("unarchive is refused on a campaign that isn't archived", async () => {
    world({ campaign: { status: "running" } });
    const r = await campaignAction("c1", "unarchive");
    expect(r.ok).toBe(false);
    expect(st.writes).toHaveLength(0);
  });
});

describe("campaignAction retry_failed", () => {
  it("with no eligible leads (none failed, or all bounced) returns the 'never retried' error and writes nothing", async () => {
    world({ campaign: { status: "completed" }, failed: [] });
    const r = await campaignAction("c1", "retry_failed");
    expect(r).toEqual({ ok: false, error: NO_RETRYABLE_FAILED_LEADS_ERROR });
    expect(st.writes).toHaveLength(0);
  });

  it("on a completed campaign with an unapproved owner writes nothing", async () => {
    world({ campaign: { status: "completed" }, failed: [{ id: "cl1" }] });
    st.campaignStartError.mockResolvedValue("Your account is waiting for approval.");
    const r = await campaignAction("c1", "retry_failed");
    expect(r).toEqual({ ok: false, error: "Your account is waiting for approval." });
    expect(st.writes).toHaveLength(0);
  });

  it("on success deletes the failed email_jobs, then re-queues the leads, then sets the campaign running", async () => {
    world({ campaign: { status: "completed" }, failed: [{ id: "cl1" }, { id: "cl2" }], autopilot: true });
    const r = await campaignAction("c1", "retry_failed");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toBe("Re-queued 2 failed leads. They go out in the next sending window.");
    const writes = campaignWrites();
    expect(writes[0]).toMatchObject({ op: "delete", table: schema.emailJobs });
    expect(writes[1]).toMatchObject({
      op: "update",
      table: schema.campaignLeads,
      set: { status: "queued", attempts: 0, lastError: null, scheduledFor: null },
    });
    expect(writes[2]).toMatchObject({ op: "update", table: schema.campaigns, set: { status: "running", startedAt: CAMPAIGN.startedAt } });
    expect(writes[3]).toMatchObject({ op: "update", table: schema.chadGtmRuns, set: { status: "active" } });
    expect(st.campaignStartError).toHaveBeenCalledTimes(1);
  });

  it("on a paused campaign re-queues without starting it or running the start gates", async () => {
    world({ campaign: { status: "paused" }, failed: [{ id: "cl1" }] });
    const r = await campaignAction("c1", "retry_failed");
    expect(r.ok).toBe(true);
    expect(st.campaignStartError).not.toHaveBeenCalled();
    expect(st.writes.some((w) => w.table === schema.campaigns)).toBe(false);
  });

  it("is refused on an archived campaign", async () => {
    world({ campaign: { status: "archived" }, failed: [{ id: "cl1" }] });
    const r = await campaignAction("c1", "retry_failed");
    expect(r).toEqual({ ok: false, error: "Unarchive this campaign first." });
    expect(st.writes).toHaveLength(0);
  });
});
