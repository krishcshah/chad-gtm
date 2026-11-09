import { describe, expect, it } from "vitest";
import {
  DIRECTORY_ADMIN_EXPORT_LIMIT,
  DIRECTORY_ADMIN_SAVE_LIMIT,
  DIRECTORY_PAID_ROW_LIMIT,
  DIRECTORY_PREVIEW_PAGE_SIZE,
  applyDirectoryAccess,
  clampDirectorySearchParams,
  directoryExportLimit,
  directorySaveLimit,
  maskDirectoryLead,
  maskEmailAddress,
  type DirectoryLead,
  type DirectorySearchResult,
} from "../leads-directory";

function lead(i: number): DirectoryLead {
  return {
    id: i,
    leadId: `l${i}`,
    firstName: "Jane",
    lastName: "Doe",
    fullName: "Jane Doe",
    jobTitle: "VP Sales",
    companyName: "Acme",
    companyWebsite: "acme.com",
    linkedinUrl: "https://linkedin.com/in/janedoe",
    location: "Austin, TX",
    city: "Austin",
    state: "TX",
    country: "United States",
    industry: "Software",
    teamSize: "50",
    revenueRange: "$10M",
    email: "jane.doe@acme.com",
    emailStatus: "verified",
    phone: "+1 512 555 0100",
    emailCount: 1,
    phoneCount: 1,
    sourceFile: "apollo.csv",
    rawAttributes: { personal_email: "jane@gmail.com" },
    workEmail: "jane.doe@acme.com",
    personalEmail: "jane@gmail.com",
  };
}

function result(n: number, pageSize: number, total = 5000): DirectorySearchResult {
  return {
    leads: Array.from({ length: n }, (_, i) => lead(i + 1)),
    total,
    page: 3,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

describe("directory paywall (server side)", () => {
  it("clamps non-entitled users to page 1 of at most 10 rows", () => {
    expect(clampDirectorySearchParams({ page: 40, pageSize: 100, industries: ["x"] }, "none")).toEqual({
      page: 1,
      pageSize: DIRECTORY_PREVIEW_PAGE_SIZE,
      industries: ["x"],
      searchContactFields: false,
    });
    expect(clampDirectorySearchParams({ pageSize: 5 }, "none").pageSize).toBe(5);
    expect(clampDirectorySearchParams({ page: 40, pageSize: 100 }, "paid")).toEqual({ page: 40, pageSize: 100 });
    expect(clampDirectorySearchParams({ page: 40, pageSize: 100 }, "admin")).toEqual({ page: 40, pageSize: 100 });
  });

  it("masks contact details for non-entitled users", () => {
    const r = applyDirectoryAccess(result(25, 100), "none");
    expect(r.leads).toHaveLength(DIRECTORY_PREVIEW_PAGE_SIZE);
    expect(r.page).toBe(1);
    expect(r.totalPages).toBe(1);
    expect(r.total).toBe(5000);
    const m = r.leads[0];
    expect(m.email).toBe("j•••@acme.com");
    expect(m.workEmail).toBe("j•••@acme.com");
    expect(m.personalEmail).toBe("j•••@gmail.com");
    expect(m.phone).not.toContain("555");
    expect(m.linkedinUrl).toBe("");
    expect(m.rawAttributes).toEqual({});
    expect(JSON.stringify(r)).not.toContain("jane.doe@acme.com");
    expect(JSON.stringify(r)).not.toContain("jane@gmail.com");
    // What the lead matcher shows stays visible.
    expect(m).toMatchObject({ fullName: "Jane Doe", jobTitle: "VP Sales", companyName: "Acme", country: "United States" });
  });

  it("returns full records to entitled users and admins", () => {
    const full = result(25, 100);
    expect(applyDirectoryAccess(full, "paid")).toBe(full);
    expect(applyDirectoryAccess(full, "admin").leads[0].email).toBe("jane.doe@acme.com");
  });

  it("blocks exports and list saves without access; caps paid; admins keep the old caps", () => {
    expect(directoryExportLimit("none", 15000)).toBe(0);
    expect(directorySaveLimit("none")).toBe(0);
    expect(directoryExportLimit("paid", 15000)).toBe(DIRECTORY_PAID_ROW_LIMIT);
    expect(directoryExportLimit("paid", 50)).toBe(50);
    expect(directorySaveLimit("paid")).toBe(DIRECTORY_PAID_ROW_LIMIT);
    expect(directoryExportLimit("admin", 1_000_000)).toBe(DIRECTORY_ADMIN_EXPORT_LIMIT);
    expect(directoryExportLimit("admin")).toBe(DIRECTORY_ADMIN_EXPORT_LIMIT);
    expect(directoryExportLimit("admin", -5)).toBe(DIRECTORY_ADMIN_EXPORT_LIMIT);
    expect(directorySaveLimit("admin")).toBe(DIRECTORY_ADMIN_SAVE_LIMIT);
  });

  it("masks odd emails safely", () => {
    expect(maskEmailAddress("")).toBe("");
    expect(maskEmailAddress(null)).toBe("");
    expect(maskEmailAddress("@acme.com")).toBe("•••");
    expect(maskEmailAddress("noatsign")).toBe("•••");
    expect(maskDirectoryLead({ ...lead(1), phone: "" }).phone).toBe("");
  });
});

describe("lead matcher preview params", () => {
  it("caps the page size and keeps the launch audience filters", async () => {
    const { leadMatcherSearchParams, LEAD_MATCHER_MAX_PAGE_SIZE } = await import("../leads-directory");
    const p = leadMatcherSearchParams(["Software"], ["United States"], 3, 500);
    expect(p.pageSize).toBe(LEAD_MATCHER_MAX_PAGE_SIZE);
    expect(p.hasEmail).toBe(true);
    expect(p.hasWorkEmail).toBe(true);
    expect(p.countries).toEqual(["United States"]);
    expect(p.industries).toEqual(["Software"]);
    expect(leadMatcherSearchParams([], ["US"], 0, 0).industries).toBeUndefined();
    expect(leadMatcherSearchParams([], ["US"], 0, 0).page).toBe(1);
  });

  it("adds job titles only when given; company size is never a filter", async () => {
    const { leadMatcherSearchParams } = await import("../leads-directory");
    const base = leadMatcherSearchParams(["Software"], ["United States"], 1, 1);
    expect(base).not.toHaveProperty("jobTitles");
    expect(base).not.toHaveProperty("teamSizes");
    expect(leadMatcherSearchParams(["Software"], ["United States"], 1, 1, {})).toEqual(base);
    expect(leadMatcherSearchParams(["Software"], ["United States"], 1, 1, { jobTitles: [], teamSizes: [] })).toEqual(base);
    expect(
      leadMatcherSearchParams(["Software"], ["United States"], 1, 1, { jobTitles: ["Owner"], teamSizes: ["11-50"] })
    ).toEqual({ ...base, jobTitles: ["Owner"], jobTitleMatch: "phrase" });
  });

  it("shows people at the run's company sizes first, counting everyone", async () => {
    const { searchLeadMatcherPreview } = await import("../leads-directory");
    const calls: any[] = [];
    const row = (id: number) => ({ ...lead(id), id });
    const search = (p: any) => {
      calls.push(p);
      return p.teamSizes
        ? { leads: [row(7)], total: 1, page: 1, pageSize: 3, totalPages: 1 }
        : { leads: [row(1), row(7), row(2), row(3)].slice(0, 3), total: 50, page: 1, pageSize: 3, totalPages: 17 };
    };
    const opts: any[] = [];
    const out = searchLeadMatcherPreview(["Software"], ["United States"], 1, 3, { teamSizes: ["11-50"] }, ((p: any, o: any) => {
      opts.push(o);
      return search(p);
    }) as any);
    expect(out.total).toBe(50);
    expect(out.leads.map((l) => l.id)).toEqual([7, 1, 2]);
    expect(calls).toHaveLength(2);
    // The sized search only fetches rows: no second COUNT.
    expect(opts).toEqual([{}, { count: false }]);
    // No sizes: one plain search.
    calls.length = 0;
    searchLeadMatcherPreview(["Software"], ["United States"], 1, 3, {}, search as any);
    expect(calls).toHaveLength(1);
  });
});
