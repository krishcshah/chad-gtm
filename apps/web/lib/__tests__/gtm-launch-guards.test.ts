import { beforeEach, describe, expect, it, vi } from "vitest";

const approval = vi.hoisted(() => ({ approved: true }));

vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "Your account is waiting for approval.",
  assertCanSend: vi.fn(async () => {
    if (!approval.approved) throw new Error("Your account is waiting for approval.");
  }),
  isApprovedToSend: vi.fn(async () => approval.approved),
}));
vi.mock("../leads-directory", () => ({ getMatchingDirectoryLeadsForExport: vi.fn(() => []) }));
vi.mock("../campaign-drafts", () => ({ ensureCampaignLeadSnapshot: vi.fn(async () => 1) }));

import { schema } from "@smartreach/database";
import {
  COMPLIANCE_REQUIRED_ERROR,
  LaunchError,
  buildRunSequence,
  fetchTargetedLeads,
  launchRunCampaign,
  toContactableLeads,
  type DirectoryQuery,
} from "../gtm-launch";

function lead(overrides: Record<string, any>) {
  return {
    id: 1,
    leadId: "l1",
    firstName: "Ana",
    lastName: "Ruiz",
    fullName: "Ana Ruiz",
    jobTitle: "Owner",
    companyName: "Acme",
    companyWebsite: "",
    linkedinUrl: "",
    location: "",
    city: "",
    state: "",
    country: "United States",
    industry: "Restaurants",
    teamSize: "",
    revenueRange: "",
    email: "ana@acme.com",
    emailStatus: "verified",
    phone: "",
    emailCount: 1,
    phoneCount: 0,
    sourceFile: "",
    rawAttributes: {},
    workEmail: "ana@acme.com",
    personalEmail: "",
    ...overrides,
  } as any;
}

describe("toContactableLeads", () => {
  it("keeps only work addresses in allowed countries and swaps in the work address", () => {
    const out = toContactableLeads(
      [
        lead({ email: "ana@acme.com", workEmail: "ana@acme.com" }),
        lead({ email: "bob@gmail.com", workEmail: "" }),
        lead({ email: "cy@msn.com", workEmail: "cy@school.k12.il.us" }),
        lead({ email: "di@beta.de", workEmail: "di@beta.de", country: "Germany" }),
        lead({ email: "ed@sbcglobal.net", workEmail: "ed@sbcglobal.net" }),
        lead({ email: "ANA@acme.com", workEmail: "ANA@acme.com" }),
      ],
      ["United States"],
    );
    expect(out.map((l) => l.email)).toEqual(["ana@acme.com", "cy@school.k12.il.us"]);
  });
});

describe("fetchTargetedLeads", () => {
  it("queries work emails in the allowed countries", () => {
    const query = vi.fn<DirectoryQuery>(() => [lead({})]);
    fetchTargetedLeads(["Restaurants"], [], 1, 0, { countries: ["United States"], query });
    expect(query.mock.calls[0]![0]).toMatchObject({
      industries: ["Restaurants"],
      countries: ["United States"],
      hasEmail: true,
      hasWorkEmail: true,
    });
  });

  it("defaults countries from AUTOPILOT_COUNTRIES", () => {
    const prev = process.env.AUTOPILOT_COUNTRIES;
    process.env.AUTOPILOT_COUNTRIES = "Canada";
    try {
      const query = vi.fn<DirectoryQuery>(() => []);
      fetchTargetedLeads([], [], 5, 0, { query });
      expect(query.mock.calls[0]![0].countries).toEqual(["Canada"]);
    } finally {
      if (prev === undefined) delete process.env.AUTOPILOT_COUNTRIES;
      else process.env.AUTOPILOT_COUNTRIES = prev;
    }
  });

  it("tops up title matches with industry matches, never with personal addresses", () => {
    const query: DirectoryQuery = (params) =>
      params.jobTitles
        ? [lead({ email: "a@acme.com", workEmail: "a@acme.com" })]
        : [
            lead({ email: "a@acme.com", workEmail: "a@acme.com" }),
            lead({ email: "b@yahoo.com", workEmail: "" }),
            lead({ email: "c@beta.com", workEmail: "c@beta.com" }),
          ];
    const out = fetchTargetedLeads(["Restaurants"], ["Owner"], 5, 0, { countries: ["United States"], query });
    expect(out.map((l) => l.email)).toEqual(["a@acme.com", "c@beta.com"]);
  });
});

describe("buildRunSequence", () => {
  it("builds three steps grounded in the first offer", () => {
    const seq = buildRunSequence({
      id: "r1",
      companyName: "Acme",
      offers: [{ title: "Faster close", angle: "ROI", valueProp: "Close the books in two days.", cta: "Worth a look?" }],
      calibrationProfile: {},
    } as any);
    expect(seq.steps).toHaveLength(3);
    expect(seq.steps.map((s) => s.delayDays)).toEqual([0, 3, 4]);
    expect(seq.bodyText).toContain("Close the books in two days.");
    expect(seq.steps[1]!.subject.startsWith("re: ")).toBe(true);
  });
});

/** Minimal drizzle-shaped fake: every select resolves to the next queued result. */
function fakeDb(selectResults: any[][]) {
  const inserts: any[] = [];
  const chain = (result: any[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      limit: () => Promise.resolve(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
  };
  const db: any = {
    select: () => chain(selectResults.shift() ?? []),
    insert: (table: unknown) => {
      inserts.push(table);
      const c: any = {
        values: () => c,
        onConflictDoNothing: () => Promise.resolve(),
        then: (resolve: any) => Promise.resolve().then(resolve),
      };
      return c;
    },
    update: () => {
      const c: any = { set: () => c, where: () => Promise.resolve() };
      return c;
    },
  };
  return { db, inserts };
}

const run = { id: "r1", companyName: "Acme", selectedIndustries: ["Restaurants"], icpProfile: {}, offers: [], calibrationProfile: {} } as any;
const goodIdentity = [{ companyName: "Acme Inc.", postalAddress: "123 Market St, San Francisco, CA 94105" }];

describe("launchRunCampaign guards", () => {
  beforeEach(() => {
    approval.approved = true;
  });

  it("refuses unapproved accounts before writing anything", async () => {
    approval.approved = false;
    const { db, inserts } = fakeDb([goodIdentity, [{ id: "s1" }]]);
    await expect(
      launchRunCampaign(db, { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [] }),
    ).rejects.toThrow(/waiting for approval/);
    expect(inserts).toEqual([]);
  });

  it("requires the CAN-SPAM identity", async () => {
    const { db, inserts } = fakeDb([[{ companyName: "Acme", postalAddress: "" }]]);
    await expect(
      launchRunCampaign(db, { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [] }),
    ).rejects.toThrow(COMPLIANCE_REQUIRED_ERROR);
    expect(inserts).toEqual([]);
  });

  it("fails with a retryable no_senders error when the pool is empty", async () => {
    const { db, inserts } = fakeDb([goodIdentity, []]);
    const err = await launchRunCampaign(db, { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [] }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(LaunchError);
    expect(err.code).toBe("no_senders");
    expect(inserts).toEqual([]);
  });

  it("fails with no_leads when nobody matches", async () => {
    const { db, inserts } = fakeDb([goodIdentity, [{ id: "s1" }]]);
    const err = await launchRunCampaign(db, { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [] }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(LaunchError);
    expect(err.code).toBe("no_leads");
    expect(inserts).not.toContain(schema.campaigns);
  });
});
