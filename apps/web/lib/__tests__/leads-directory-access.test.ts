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
