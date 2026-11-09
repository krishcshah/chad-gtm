import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

/* Race: an approval launch can pick a run up the moment it is inserted, so the
 * client's chosen emails per day must be in the insert itself, never written
 * by a later update (the approval launch would use the default). */

const st = vi.hoisted(() => ({
  writes: [] as { op: string; table: unknown; set?: any }[],
  selects: new Map<unknown, any[][]>(),
  analyze: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: async () => ({ id: "u-1", email: "u@example.com", role: "user" }) }));
vi.mock("../workspaces", () => ({
  ensureDefaultWorkspace: async () => ({ id: "ws-1" }),
  getActiveWorkspace: async () => ({ id: "ws-1" }),
}));
vi.mock("../queries", () => ({ wsCondition: vi.fn() }));
vi.mock("../chad-gtm-actions", () => ({ analyzeWebsiteAction: (...args: any[]) => st.analyze(...args) }));
vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "approval required",
  assertCanSend: async () => {
    throw new Error("approval required");
  },
  getSendAccess: async () => "pending",
  isSendAccessError: (m: string) => m === "approval required",
}));
vi.mock("../gtm-launch", () => ({
  COMPLIANCE_REQUIRED_ERROR: "compliance required",
  LaunchError: class extends Error {},
  LaunchInProgressError: class extends Error {},
  launchRunCampaign: vi.fn(),
  loadComplianceIdentity: vi.fn(),
}));
vi.mock("../autopilot-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../autopilot-state")>();
  return {
    ...actual,
    loadLaunchContext: async () => ({
      approved: false,
      identity: { companyName: "Acme", postalAddress: "1 Main St, Springfield" },
      defaultBookingUrl: "https://cal.com/acme/intro",
    }),
  };
});
vi.mock("../workspace-booking", () => ({ loadOwnedWorkspace: vi.fn(), saveWorkspaceBookingUrl: vi.fn() }));
vi.mock("../ai", () => ({ getWorkspaceAiOptions: vi.fn() }));
vi.mock("../lead-conversations-server", () => ({ initialRunReplyMode: async () => "approve" }));
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
      const entry: { op: string; table: unknown; set?: any } = { op, table };
      st.writes.push(entry);
      return chain(
        () => [],
        (prop, args) => {
          if (prop === "set" || prop === "values") entry.set = args[0];
        },
      );
    };
  }
  return { getDb: () => db, ensureChadGtmTables: vi.fn(async () => {}) };
});

import { startAutopilotAction } from "../autopilot-actions";

const run = {
  id: "run-1",
  userId: "u-1",
  workspaceId: "ws-1",
  url: "https://acme.test",
  companyName: "Acme",
  status: "reviewing",
  autopilot: true,
  campaignId: null,
  launchStartedAt: null,
  dismissedAt: null,
  bookingUrl: "https://cal.com/acme/intro",
  calibrationProfile: {},
  icpProfile: { industries: ["Software"], targetTitles: ["CEO"], source: "ai" },
  dailyEmailLimit: 120,
};

beforeEach(() => {
  st.writes = [];
  st.selects = new Map([[schema.chadGtmRuns, [[run], [run]]]]);
  st.analyze.mockReset();
  st.analyze.mockResolvedValue({ ok: true, runId: "run-1" });
});

describe("startAutopilotAction saves the chosen volume with the run", () => {
  it("passes emails per day into the insert, clamped, and never updates it afterwards", async () => {
    await startAutopilotAction({ url: "acme.test", dailyLimit: 120 });
    expect(st.analyze).toHaveBeenCalledWith("acme.test", undefined, expect.objectContaining({ autopilot: true, dailyEmailLimit: 120 }));
    expect(st.writes.some((w) => w.table === schema.chadGtmRuns && w.set && "dailyEmailLimit" in w.set)).toBe(false);

    await startAutopilotAction({ url: "acme.test", dailyLimit: 5 });
    expect(st.analyze.mock.calls[1]![2]).toMatchObject({ dailyEmailLimit: 30 });
  });

  it("leaves the default to the insert when no volume was chosen", async () => {
    await startAutopilotAction({ url: "acme.test" });
    expect(st.analyze.mock.calls[0]![2].dailyEmailLimit).toBeUndefined();
  });
});

describe("persist_gtm_run (agent path) writes the chosen volume in the insert", () => {
  it("reads it from the agent run's input, else the default", async () => {
    vi.doMock("@smartreach/email-engine/ai", () => ({ auditDomainDns: vi.fn() }));
    vi.doMock("../chad-gtm-research", () => ({ scrapeCompanyWebsite: vi.fn(), synthesizeGtmStrategy: vi.fn() }));
    vi.doMock("../leads-directory", () => ({ getDirectoryFacets: vi.fn(), searchLeadsDirectoryForAccess: vi.fn() }));
    vi.doMock("../b2b-access", () => ({ getDirectoryAccessLevel: vi.fn() }));
    const { persistGtmRunTool } = await import("../agent/tools");
    const inserted: any[] = [];
    const ctx = (input: Record<string, unknown>): any => ({
      run: { id: "agent-1", input },
      userId: "u-1",
      workspaceId: "ws-1",
      state: {
        strategy: {
          companyName: "Acme",
          businessOverview: {},
          icpProfile: { industries: ["Software"] },
          offers: [],
          scrapedData: { url: "https://acme.test", bookingUrl: null },
        },
      },
      db: { insert: () => ({ values: async (v: unknown) => inserted.push(v) }) },
    });
    await persistGtmRunTool.run({ url: "acme.test", autopilot: true }, ctx({ dailyEmailLimit: 200 }));
    await persistGtmRunTool.run({ url: "acme.test", autopilot: true }, ctx({}));
    await persistGtmRunTool.run({ url: "acme.test", autopilot: true, dailyEmailLimit: 900 }, ctx({}));
    expect(inserted.map((v) => v.dailyEmailLimit)).toEqual([200, 60, 500]);
  });
});
