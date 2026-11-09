/**
 * Lead matcher preview and plan counts run through the directory worker:
 * same results as the synchronous search, never on the page's thread.
 */
import { describe, expect, it, vi } from "vitest";
import { searchLeadMatcherPreviewAsync } from "../directory-search-async";
import { launchAudienceCountsAsync } from "../gtm-launch";
import type { DirectorySearchParams, DirectorySearchResult } from "../leads-directory";

const worker = vi.hoisted(() => ({
  directoryQuery: vi.fn(async (..._args: unknown[]): Promise<unknown> => []),
}));
vi.mock("../directory-worker", async (orig) => ({
  ...(await orig<typeof import("../directory-worker")>()),
  directoryQuery: worker.directoryQuery,
}));

const lead = (id: number) => ({ id, firstName: `P${id}` }) as any;
const result = (ids: number[], total: number): DirectorySearchResult => ({
  leads: ids.map(lead),
  total,
  page: 1,
  pageSize: 3,
  totalPages: 1,
});

describe("searchLeadMatcherPreviewAsync", () => {
  it("shows people at the run's company sizes first, total over every size", async () => {
    const search = vi.fn(async (p: DirectorySearchParams, _o: unknown) => (p.teamSizes?.length ? result([7], 0) : result([1, 7, 2], 40)));
    const out = await searchLeadMatcherPreviewAsync(["Software"], ["United States"], 1, 3, { teamSizes: ["11-50"] }, search);
    expect(out.leads.map((l) => l.id)).toEqual([7, 1, 2]);
    expect(out.total).toBe(40);
    // Rows only for the sized search: no second COUNT.
    expect(search.mock.calls.map((c) => c[1])).toEqual([{}, { count: false }]);
  });

  it("matches job titles as whole phrases, like the Priority 1 tier", async () => {
    const search = vi.fn(async (_p: DirectorySearchParams, _o: unknown) => result([], 0));
    await searchLeadMatcherPreviewAsync(["Software"], ["United States"], 1, 3, { jobTitles: ["Head of Ops"] }, search);
    expect(search.mock.calls[0]![0]).toMatchObject({ jobTitles: ["Head of Ops"], jobTitleMatch: "phrase" });
  });

  it("runs one search without sizes", async () => {
    const search = vi.fn(async () => result([1], 5));
    await searchLeadMatcherPreviewAsync(["Software"], ["United States"], 1, 3, {}, search);
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("launchAudienceCountsAsync", () => {
  it("splits title matches from others in the industries", async () => {
    const search = vi.fn(async (_i: string[], _c: string[], _p?: number, _s?: number, f: any = {}) =>
      result([], f.jobTitles ? 120 : 1000),
    );
    expect(await launchAudienceCountsAsync({ industries: ["Software"], titles: ["CTO"], countries: ["United States"] }, search as any)).toEqual({
      roleMatches: 120,
      otherRoles: 880,
    });
    expect(await launchAudienceCountsAsync({ industries: ["Software"], titles: [], countries: ["United States"] }, search as any)).toEqual({
      roleMatches: 1000,
      otherRoles: 0,
    });
  });

  it("gives zeros on a directory error", async () => {
    const search = vi.fn(async () => {
      throw new Error("directory down");
    });
    expect(await launchAudienceCountsAsync({ industries: ["x"], titles: ["y"], countries: ["US"] }, search as any)).toEqual({
      roleMatches: 0,
      otherRoles: 0,
      unavailable: true,
    });
  });

  it("marks the counts unavailable when a COUNT failed, never a real zero", async () => {
    const search = vi.fn(async (_i: string[], _c: string[], _p?: number, _s?: number, f: any = {}) =>
      f.jobTitles ? { ...result([], 0), countUnavailable: true } : result([], 1000),
    );
    expect(await launchAudienceCountsAsync({ industries: ["Software"], titles: ["CTO"], countries: ["US"] }, search as any)).toMatchObject({
      unavailable: true,
    });
  });
});

describe("preview counts in the worker", () => {
  const isCount = (sql: unknown) => /COUNT\(\*\) as total/i.test(String(sql));

  it("one lead-matcher render runs each COUNT once, on the counts lane", async () => {
    // Regression: the counts and the first page both missed the cache and ran the role COUNT twice.
    worker.directoryQuery.mockReset();
    worker.directoryQuery.mockImplementation(async (sql: unknown) => {
      await new Promise((r) => setTimeout(r, 20));
      return isCount(sql) ? { total: 42 } : [];
    });
    const input = { industries: ["Dedupe Industry"], titles: ["Head of Dedupe"], countries: ["United States"] };
    await Promise.all([
      launchAudienceCountsAsync(input),
      searchLeadMatcherPreviewAsync(input.industries, input.countries, 1, 10, { jobTitles: input.titles }),
    ]);
    const counts = worker.directoryQuery.mock.calls.filter((c) => isCount(c[0]));
    expect(counts).toHaveLength(2); // everyone + job titles, once each
    expect(new Set(counts.map((c) => JSON.stringify(c[1]))).size).toBe(2);
    expect(counts.every((c) => c[3] === "counts")).toBe(true);
    // Rows stay on the interactive lane.
    expect(worker.directoryQuery.mock.calls.filter((c) => !isCount(c[0])).every((c) => c[3] === "interactive")).toBe(true);
  });

  it("a failed COUNT gives countUnavailable with the rows still shown", async () => {
    worker.directoryQuery.mockReset();
    worker.directoryQuery.mockImplementation(async (sql: unknown) => {
      if (isCount(sql)) throw new Error("Directory query timed out after 30s.");
      return [{ id: 5, full_name: "Ann Lee", job_title: "CTO" }];
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await searchLeadMatcherPreviewAsync(["Unavailable Industry"], ["United States"], 1, 10);
    expect(out.countUnavailable).toBe(true);
    expect(out.total).toBe(0);
    expect(out.leads).toHaveLength(1);
    const counts = await launchAudienceCountsAsync({ industries: ["Unavailable Industry 2"], titles: [], countries: ["United States"] });
    expect(counts.unavailable).toBe(true);
  });
});
