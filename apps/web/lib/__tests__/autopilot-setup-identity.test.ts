import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* #73: Autopilot's launch-setup form saves the sender identity (company name,
 * postal address) for the run's own workspace only. Never the active
 * workspace cookie, never the account-wide workspace_settings row. The
 * outcome shows exactly the identity the footer will carry; the researched
 * company name is only a labelled suggestion. */

const st = vi.hoisted(() => ({
  writes: [] as { op: string; table: unknown; set?: any; values?: any; where?: any }[],
  selects: new Map<unknown, any[][]>(),
  /** What UPDATE ... RETURNING gives back, per table. */
  returning: new Map<unknown, any[]>(),
  launch: vi.fn(),
  loadIdentity: vi.fn(),
  ctx: null as any,
  blockers: [] as any[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: async () => ({ id: "u-1", email: "u@example.com", role: "user" }) }));
vi.mock("../workspaces", () => ({
  ensureDefaultWorkspace: async () => ({ id: "ws-default" }),
  getActiveWorkspace: async () => ({ id: "ws-active" }),
}));
vi.mock("../queries", () => ({ wsCondition: vi.fn() }));
vi.mock("../chad-gtm-actions", () => ({ analyzeWebsiteAction: vi.fn() }));
vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "approval required",
  assertCanSend: async () => {},
  isSendAccessError: () => false,
}));
vi.mock("../gtm-launch", () => {
  class LaunchError extends Error {}
  class LaunchInProgressError extends Error {}
  return {
    COMPLIANCE_REQUIRED_ERROR: "compliance required",
    LaunchError,
    LaunchInProgressError,
    launchRunCampaign: (...args: any[]) => st.launch(...args),
    loadComplianceIdentity: (...args: any[]) => st.loadIdentity(...args),
  };
});
vi.mock("../autopilot-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../autopilot-state")>();
  return {
    ...actual,
    loadLaunchContext: async () => st.ctx,
    runBlockers: () => st.blockers,
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
      const entry: { op: string; table: unknown; set?: any; values?: any; where?: any } = { op, table };
      st.writes.push(entry);
      return chain(
        () => st.returning.get(table) ?? [],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
          if (prop === "where") entry.where = args[0];
        },
      );
    };
  }
  return { getDb: () => db, ensureChadGtmTables: vi.fn(async () => {}) };
});

import { completeAutopilotSetupAction, retryAutopilotLaunchAction } from "../autopilot-actions";

const dialect = new PgDialect();

const ADDRESS = "500 Client B Ave, Austin, TX 78701";

const run = {
  id: "run-1",
  userId: "u-1",
  workspaceId: "ws-run" as string | null,
  url: "https://acme.test",
  companyName: "Acme Researched",
  status: "needs_input",
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

function params(where: unknown): unknown[] {
  return dialect.sqlToQuery(where as any).params;
}

beforeEach(() => {
  st.writes = [];
  st.selects = new Map();
  st.returning = new Map([[schema.workspaces, [{ id: "ws" }]]]);
  st.launch.mockReset();
  st.launch.mockResolvedValue({ campaignId: "c-1", leadCount: 5 });
  st.loadIdentity.mockReset();
  st.loadIdentity.mockResolvedValue({ companyName: "", postalAddress: "", workspaceName: "Client B" });
  st.ctx = {
    approved: true,
    identity: { companyName: "Client B LLC", postalAddress: ADDRESS },
    defaultBookingUrl: null,
    workspaceName: "Client B",
  };
  st.blockers = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("completeAutopilotSetupAction writes the identity to the run's workspace only (#73)", () => {
  it("updates the run's workspace row, never workspace_settings or the active workspace", async () => {
    queueRuns(run, run, run);

    const res = await completeAutopilotSetupAction(run.id, { companyName: " Client B LLC ", postalAddress: ADDRESS });

    expect(res.ok).toBe(true);
    // The current identity is read from the run's workspace, not account-wide.
    expect(st.loadIdentity).toHaveBeenCalledWith(expect.anything(), "u-1", "ws-run");
    const wsWrites = st.writes.filter((w) => w.table === schema.workspaces);
    expect(wsWrites).toHaveLength(1);
    expect(wsWrites[0]!.op).toBe("update");
    expect(wsWrites[0]!.set).toMatchObject({ companyName: "Client B LLC", postalAddress: ADDRESS });
    // Scoped to that workspace AND its owner.
    expect(params(wsWrites[0]!.where)).toEqual(expect.arrayContaining(["ws-run", "u-1"]));
    expect(params(wsWrites[0]!.where)).not.toContain("ws-active");
    expect(st.writes.some((w) => w.table === schema.workspaceSettings)).toBe(false);
    // The campaign is created in the run's workspace too.
    expect(st.launch.mock.calls[0]![1]).toMatchObject({ workspaceId: "ws-run" });
  });

  it("a legacy run without a workspace saves to (and launches in) the default workspace, not the active one", async () => {
    const legacy = { ...run, workspaceId: null };
    queueRuns(legacy, legacy, legacy);

    const res = await completeAutopilotSetupAction(run.id, { companyName: "Acme Inc.", postalAddress: ADDRESS });

    expect(res.ok).toBe(true);
    expect(st.loadIdentity).toHaveBeenCalledWith(expect.anything(), "u-1", null);
    const wsWrite = st.writes.find((w) => w.table === schema.workspaces);
    expect(params(wsWrite!.where)).toEqual(expect.arrayContaining(["ws-default", "u-1"]));
    expect(st.launch.mock.calls[0]![1]).toMatchObject({ workspaceId: "ws-default" });
    expect(st.writes.some((w) => w.table === schema.workspaceSettings)).toBe(false);
  });

  it("rejects an incomplete identity without writing anything", async () => {
    queueRuns(run);

    const res = await completeAutopilotSetupAction(run.id, { companyName: "Client B LLC", postalAddress: "" });

    expect(res.ok).toBe(false);
    expect(st.writes.some((w) => w.table === schema.workspaces || w.table === schema.workspaceSettings)).toBe(false);
    expect(st.launch).not.toHaveBeenCalled();
  });

  it("fails (and does not launch) when the workspace row could not be updated", async () => {
    queueRuns(run);
    st.returning.set(schema.workspaces, []);

    const res = await completeAutopilotSetupAction(run.id, { companyName: "Client B LLC", postalAddress: ADDRESS });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/couldn't save your sender details/);
    expect(st.launch).not.toHaveBeenCalled();
  });

  it("keeps the saved company name when only the address is sent", async () => {
    queueRuns(run, run, run);
    st.loadIdentity.mockResolvedValue({ companyName: "Client B LLC", postalAddress: "", workspaceName: "Client B" });

    const res = await completeAutopilotSetupAction(run.id, { postalAddress: ADDRESS });

    expect(res.ok).toBe(true);
    const wsWrite = st.writes.find((w) => w.table === schema.workspaces);
    expect(wsWrite!.set).toMatchObject({ companyName: "Client B LLC", postalAddress: ADDRESS });
  });

  it("does not touch any identity when only the booking link is sent", async () => {
    queueRuns(run, run, run);

    const res = await completeAutopilotSetupAction(run.id, { bookingUrl: "https://cal.com/b/intro" });

    expect(res.ok).toBe(true);
    expect(st.loadIdentity).not.toHaveBeenCalled();
    expect(st.writes.some((w) => w.table === schema.workspaces || w.table === schema.workspaceSettings)).toBe(false);
  });
});

describe("the outcome shows the footer identity, not the researched name (#73)", () => {
  it("leaves the company blank and offers the researched name as a suggestion", async () => {
    queueRuns(run, run);
    st.ctx = { ...st.ctx, identity: { companyName: "", postalAddress: "" } };
    st.blockers = [{ kind: "details", missing: ["companyName", "postalAddress"], message: "Add your sender details." }];

    const res = await retryAutopilotLaunchAction(run.id);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data?.identity).toEqual({ companyName: "", postalAddress: "", workspaceName: "Client B" });
    expect(res.data?.suggestedCompanyName).toBe("Acme Researched");
    expect(st.launch).not.toHaveBeenCalled();
  });

  it("offers no suggestion once the workspace has a company name", async () => {
    queueRuns(run, run);
    st.ctx = { ...st.ctx, identity: { companyName: "Client B LLC", postalAddress: "" } };
    st.blockers = [{ kind: "details", missing: ["postalAddress"], message: "Add your postal address." }];

    const res = await retryAutopilotLaunchAction(run.id);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data?.identity?.companyName).toBe("Client B LLC");
    expect(res.data?.suggestedCompanyName).toBeUndefined();
  });
});
