import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* If the final switch to running fails after the run was linked to its draft
 * campaign, the run must not be recorded as a failed launch (needs_input +
 * launchFailure): it is a set-up campaign that hasn't started, shown as Paused. */

const st = vi.hoisted(() => ({
  writes: [] as { op: string; table: unknown; set?: any; where?: any }[],
  selects: new Map<unknown, any[][]>(),
  launch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: async () => ({ id: "u-1", email: "u@example.com", role: "user" }) }));
vi.mock("../workspaces", () => ({
  ensureDefaultWorkspace: async () => ({ id: "ws-1" }),
  getActiveWorkspace: async () => ({ id: "ws-1" }),
}));
vi.mock("../queries", () => ({ wsCondition: vi.fn() }));
vi.mock("../chad-gtm-actions", () => ({ analyzeWebsiteAction: vi.fn() }));
vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "approval required",
  assertCanSend: async () => {},
  isSendAccessError: () => false,
}));
vi.mock("../gtm-launch", () => {
  class LaunchError extends Error {
    constructor(readonly code: string, message = "Launch failed.") {
      super(message);
    }
  }
  class LaunchInProgressError extends Error {}
  return {
    COMPLIANCE_REQUIRED_ERROR: "compliance required",
    LaunchError,
    LaunchInProgressError,
    launchRunCampaign: (...args: any[]) => st.launch(...args),
    loadComplianceIdentity: vi.fn(),
  };
});
vi.mock("../autopilot-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../autopilot-state")>();
  return {
    ...actual,
    loadLaunchContext: async () => ({
      approved: true,
      identity: { companyName: "Acme", postalAddress: "1 Main St, Springfield" },
      defaultBookingUrl: "https://cal.com/acme/intro",
    }),
    runBlockers: () => [],
  };
});
vi.mock("../workspace-booking", () => ({ loadOwnedWorkspace: vi.fn(), saveWorkspaceBookingUrl: vi.fn() }));
vi.mock("../ai", () => ({ getWorkspaceAiOptions: vi.fn() }));
vi.mock("../lead-conversations-server", () => ({}));
vi.mock("@smartreach/email-engine/lead-conversations", () => ({}));
vi.mock("../lead-conversation-actions", () => ({}));
vi.mock("../leads", () => ({ createLeadForUser: vi.fn() }));
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
    select: () => {
      let table: unknown;
      return chain(
        () => st.selects.get(table)?.shift() ?? [],
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["insert", "update", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: { op: string; table: unknown; set?: any; where?: any } = { op, table };
      st.writes.push(entry);
      return chain(
        () => [],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "where") entry.where = args[0];
        },
      );
    };
  }
  return { getDb: () => db, ensureChadGtmTables: vi.fn(async () => {}) };
});

import { retryAutopilotLaunchAction } from "../autopilot-actions";
import { LaunchError } from "../gtm-launch";

const dialect = new PgDialect();

const run = {
  id: "run-1",
  userId: "u-1",
  workspaceId: "ws-1",
  url: "https://acme.test",
  companyName: "Acme",
  status: "ready",
  autopilot: true,
  campaignId: null as string | null,
  launchStartedAt: null,
  dismissedAt: null,
  bookingUrl: "https://cal.com/acme/intro",
  calibrationProfile: {},
  icpProfile: {},
  dailyEmailLimit: 30,
};

function queueRuns(...rows: any[]) {
  st.selects.set(schema.chadGtmRuns, rows.map((r) => [r]));
}

beforeEach(() => {
  st.writes = [];
  st.selects = new Map();
  st.launch.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("advanceAutopilotRun after a launch error", () => {
  it("shows a run linked to its draft campaign as Paused, never as a failed launch", async () => {
    // Owned-run check, advance's load, then the reload after the error: now linked.
    queueRuns(run, run, { ...run, status: "active", campaignId: "c-1" });
    st.selects.set(schema.campaigns, [[{ status: "draft", deletedAt: null }]]);
    st.launch.mockRejectedValue(new Error("flip failed"));

    const res = await retryAutopilotLaunchAction(run.id);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data?.phase).toBe("paused");
    expect(res.data?.campaignId).toBe("c-1");
    expect(res.message).toMatch(/Resume outreach/);
    const runWrites = st.writes.filter((w) => w.table === schema.chadGtmRuns);
    expect(runWrites.some((w) => w.set?.status === "needs_input" || w.set?.calibrationProfile?.launchFailure)).toBe(false);
  });

  it("records the failure on a run with no campaign, and only while it has none", async () => {
    queueRuns(run, run, run);
    st.launch.mockRejectedValue(new LaunchError("no_leads", "No prospects match yet."));

    const res = await retryAutopilotLaunchAction(run.id);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message).toMatch(/Nothing was sent/);
    const failed = st.writes.find((w) => w.table === schema.chadGtmRuns && w.set?.status === "needs_input");
    expect(failed?.set.calibrationProfile.launchFailure).toMatchObject({ code: "no_leads" });
    // Guarded: the write can't mark a run that a launch linked in the meantime.
    expect(dialect.sqlToQuery(failed!.where).sql).toContain('"campaign_id" is null');
  });

  it("still records the failure (guarded) when the reload itself fails", async () => {
    st.selects.set(schema.chadGtmRuns, [[run], [run]]);
    // Third load (the reload after the error) finds nothing: treat as unlinked.
    st.launch.mockRejectedValue(new Error("boom"));

    const res = await retryAutopilotLaunchAction(run.id);

    expect(res.ok).toBe(true);
    const failed = st.writes.find((w) => w.table === schema.chadGtmRuns && w.set?.status === "needs_input");
    expect(failed).toBeDefined();
    expect(dialect.sqlToQuery(failed!.where).sql).toContain('"campaign_id" is null');
  });
});
