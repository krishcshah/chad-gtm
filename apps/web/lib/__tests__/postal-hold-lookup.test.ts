import { beforeEach, describe, expect, it, vi } from "vitest";

const results: unknown[] = [];
function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "innerJoin"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return b;
}
const select = vi.fn(() => builder(results.shift()));
vi.mock("../db", () => ({ getDb: () => ({ select }) }));

import { getPostalHold } from "../postal-hold";

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

  it("treats a user with no settings row as missing the address", async () => {
    results.push([], [{ n: 1 }], [{ n: 0 }]);
    expect((await getPostalHold("u1", { campaignId: "c1" })).held).toBe(true);
  });

  it("stops after the settings read when an address is set", async () => {
    results.push([{ postalAddress: "1 Main St, Springfield 12345" }]);
    expect((await getPostalHold("u1")).held).toBe(false);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("hides the notice instead of breaking the page when the lookup fails", async () => {
    select.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getPostalHold("u1")).toEqual({ held: false, campaigns: 0, heldJobs: 0 });
  });
});
