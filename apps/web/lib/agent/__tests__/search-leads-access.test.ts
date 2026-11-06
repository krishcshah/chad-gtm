import { describe, expect, it, vi } from "vitest";
import type { DirectoryAccessLevel, DirectoryLead } from "../../leads-directory";

const level: { current: DirectoryAccessLevel } = { current: "none" };

vi.mock("../../b2b-access", () => ({
  getDirectoryAccessLevel: vi.fn(async () => level.current),
}));

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
    rawAttributes: {},
    workEmail: "jane.doe@acme.com",
    personalEmail: "",
  };
}

vi.mock("../../leads-directory", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../leads-directory")>();
  return {
    ...real,
    searchLeadsDirectoryForAccess: vi.fn((params: any, lvl: DirectoryAccessLevel) => {
      const clamped = real.clampDirectorySearchParams(params, lvl);
      const n = clamped.pageSize ?? 25;
      return real.applyDirectoryAccess(
        {
          leads: Array.from({ length: n }, (_, i) => lead(i + 1)),
          total: 5000,
          page: clamped.page ?? 1,
          pageSize: n,
          totalPages: Math.ceil(5000 / n),
        },
        lvl
      );
    }),
  };
});

import { searchLeadsTool } from "../tools";

function ctx(user: Record<string, unknown> | undefined) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => (user ? [user] : []),
  };
  return { userId: "u1", db: { select: () => chain } } as any;
}

describe("search_leads agent tool honours the directory paywall", () => {
  it("masks emails and caps rows for users without directory access", async () => {
    level.current = "none";
    const out = await searchLeadsTool.run({ limit: 100 }, ctx({ id: "u1", email: "a@b.com", role: "user" }));
    expect(out.leads.length).toBeLessThanOrEqual(10);
    expect(out.leads.every((l) => l.email.includes("•"))).toBe(true);
    expect(out.leads.some((l) => l.email === "jane.doe@acme.com")).toBe(false);
  });

  it("returns unmasked emails for admins", async () => {
    level.current = "admin";
    const out = await searchLeadsTool.run({ limit: 100 }, ctx({ id: "u1", email: "a@b.com", role: "admin" }));
    expect(out.leads).toHaveLength(100);
    expect(out.leads[0].email).toBe("jane.doe@acme.com");
  });

  it("falls back to the masked preview when the user can't be found", async () => {
    level.current = "admin";
    const out = await searchLeadsTool.run({ limit: 50 }, ctx(undefined));
    expect(out.leads.length).toBeLessThanOrEqual(10);
    expect(out.leads[0].email).not.toBe("jane.doe@acme.com");
  });
});
