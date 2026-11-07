import { beforeEach, describe, expect, it, vi } from "vitest";

const results: unknown[] = [];
function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "innerJoin", "orderBy"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return b;
}
const select = vi.fn((_fields?: Record<string, unknown>) => builder(results.shift()));
vi.mock("../db", () => ({ getDb: () => ({ select }) }));
// The active workspace (#72: the address is per workspace).
vi.mock("../workspaces", () => ({ getActiveWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })) }));

import { getPostalHold } from "../postal-hold";
import { getActiveWorkspace } from "../workspaces";

describe("getPostalHold", () => {
  beforeEach(() => {
    results.length = 0;
    select.mockClear();
  });

  it("reports running campaigns and held jobs when the address is blank", async () => {
    results.push([{ postalAddress: "" }], [{ n: 2 }], [{ n: 14 }]);
    expect(await getPostalHold("u1")).toEqual({ held: true, campaigns: 2, heldJobs: 14 });
    expect(select).toHaveBeenCalledTimes(3);
  });

  it("treats a user with no workspace and no legacy row as missing the address", async () => {
    // campaign (no workspace) → default workspace (none) → legacy row (none) → counts
    results.push([{ workspaceId: null }], [], [], [{ n: 1 }], [{ n: 0 }]);
    expect((await getPostalHold("u1", { campaignId: "c1" })).held).toBe(true);
  });

  it("reads the address of the campaign's own workspace (#72)", async () => {
    vi.mocked(getActiveWorkspace).mockClear();
    // Campaign in workspace B, whose address is blank: held, whatever the active workspace has.
    results.push([{ workspaceId: "wB" }], [{ id: "wB", postalAddress: "" }], [{ n: 1 }], [{ n: 3 }]);
    expect(await getPostalHold("u1", { campaignId: "c1" })).toEqual({ held: true, campaigns: 1, heldJobs: 3 });
    expect(getActiveWorkspace).not.toHaveBeenCalled();
    // The second read is the workspace row, not the legacy account row.
    const fields = select.mock.calls[1]?.[0] ?? {};
    expect(Object.keys(fields)).toContain("postalAddress");
    expect(Object.keys(fields)).toContain("workspaceName");

    // Same campaign, B has an address: no hold, one read for the profile.
    select.mockClear();
    results.push([{ workspaceId: "wB" }], [{ id: "wB", postalAddress: "9 Side Rd, Shelbyville, IL 62565, USA" }]);
    expect((await getPostalHold("u1", { campaignId: "c1" })).held).toBe(false);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("uses the given workspace instead of the active one", async () => {
    vi.mocked(getActiveWorkspace).mockClear();
    results.push([{ id: "wB", postalAddress: "" }], [{ n: 0 }], [{ n: 0 }]);
    expect((await getPostalHold("u1", { workspaceId: "wB" })).held).toBe(false);
    expect(getActiveWorkspace).not.toHaveBeenCalled();
  });

  it("stops after the settings read when an address is set", async () => {
    results.push([{ postalAddress: "1 Main St, Springfield 12345" }]);
    expect((await getPostalHold("u1")).held).toBe(false);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("flags a saved but incomplete address while campaigns are sending (#18)", async () => {
    results.push([{ postalAddress: "TBD" }], [{ n: 2 }]);
    expect(await getPostalHold("u1")).toEqual({ held: false, campaigns: 2, heldJobs: 0, incomplete: true });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("does not flag an incomplete address when nothing is sending", async () => {
    results.push([{ postalAddress: "1 Main St" }], [{ n: 0 }]);
    expect(await getPostalHold("u1")).toEqual({ held: false, campaigns: 0, heldJobs: 0 });
  });

  it("hides the notice instead of breaking the page when the lookup fails", async () => {
    select.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getPostalHold("u1")).toEqual({ held: false, campaigns: 0, heldJobs: 0 });
  });
});
