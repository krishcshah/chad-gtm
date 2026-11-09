import { describe, expect, it, vi } from "vitest";

/* #77: a run without its own booking link uses the workspace default, so the
 * default unblocks it; a run's own link always wins. */

vi.mock("../approval", () => ({ isApprovedToSend: vi.fn(async () => true) }));
vi.mock("../gtm-launch", () => ({
  buildRunSequence: vi.fn(),
  fetchTargetedLeads: vi.fn(() => []),
  fetchTargetedLeadsAsync: vi.fn(async () => []),
  getTargetTitles: vi.fn(() => []),
  loadComplianceIdentity: vi.fn(async () => ({ companyName: "Legal Co Ltd", postalAddress: "1 Main St, Springfield, IL 62701" })),
  stableHash: vi.fn(() => 0),
}));
vi.mock("../lead-conversations-server", () => ({
  loadWorkspaceLeadSettings: vi.fn(async (_db: unknown, _userId: string, workspaceId: string | null) => ({
    workspaceId,
    bookingUrl: workspaceId === "w-empty" ? null : "https://cal.com/acme/intro",
  })),
}));

import { loadLaunchContext, runBlockers, runBookingUrl, type LaunchContext } from "../autopilot-state";

const GROUNDED_ICP = {
  industries: ["Accounting"],
  targetJobTitles: ["CFO"],
  grounding: { industries: "site", titles: "site" },
};

function run(over: Record<string, unknown> = {}) {
  return { id: "r1", autopilot: true, bookingUrl: null, icpProfile: GROUNDED_ICP, ...over } as any;
}

const ctx = (defaultBookingUrl: string | null): LaunchContext => ({
  approved: true,
  identity: { companyName: "Legal Co Ltd", postalAddress: "1 Main St, Springfield, IL 62701" },
  defaultBookingUrl,
});

function missing(blockers: ReturnType<typeof runBlockers>) {
  const d = blockers.find((b) => b.kind === "details");
  return d && d.kind === "details" ? d.missing : [];
}

describe("runBlockers and the workspace booking link", () => {
  it("does not report the booking link missing when the workspace default is set", () => {
    expect(missing(runBlockers(run(), ctx("https://cal.com/acme/intro")))).not.toContain("bookingUrl");
  });

  it("still reports it when neither the run nor the workspace has one", () => {
    expect(missing(runBlockers(run(), ctx(null)))).toContain("bookingUrl");
  });

  it("the run's own link wins over the default", () => {
    expect(runBookingUrl(run({ bookingUrl: "https://cal.com/own" }), ctx("https://cal.com/acme/intro"))).toBe(
      "https://cal.com/own",
    );
    expect(runBookingUrl(run(), ctx("https://cal.com/acme/intro"))).toBe("https://cal.com/acme/intro");
    expect(runBookingUrl(run(), ctx(null))).toBeNull();
  });

  it("loadLaunchContext reads the run's workspace default", async () => {
    expect((await loadLaunchContext({} as any, "u1", { workspaceId: "w1" })).defaultBookingUrl).toBe(
      "https://cal.com/acme/intro",
    );
    expect((await loadLaunchContext({} as any, "u1", { workspaceId: "w-empty" })).defaultBookingUrl).toBeNull();
  });
});
