import { beforeEach, describe, expect, it, vi } from "vitest";

const dir = vi.hoisted(() => ({ leads: [] as any[] }));

vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "Your account is waiting for approval.",
  assertCanSend: vi.fn(async () => undefined),
  isApprovedToSend: vi.fn(async () => true),
}));
vi.mock("../leads-directory", () => ({ getMatchingDirectoryLeadsForExport: vi.fn(() => dir.leads) }));
vi.mock("../campaign-drafts", () => ({ ensureCampaignLeadSnapshot: vi.fn(async () => 1) }));

import { GLOBAL_SUPPRESSION_SOURCES, schema } from "@smartreach/database";
import { LaunchError, launchRunCampaign, suppressedEmailsFor } from "../gtm-launch";

function lead(email: string) {
  return {
    id: 1, leadId: email, firstName: "A", lastName: "B", fullName: "A B", jobTitle: "Owner",
    companyName: "Acme", companyWebsite: "", linkedinUrl: "", location: "", city: "", state: "",
    country: "United States", industry: "Restaurants", teamSize: "", revenueRange: "",
    email, emailStatus: "verified", phone: "", emailCount: 1, phoneCount: 0, sourceFile: "",
    rawAttributes: {}, workEmail: email, personalEmail: "",
  } as any;
}

/** Drizzle-shaped fake: selects resolve in order; records which tables were read/written. */
function fakeDb(selectResults: any[][]) {
  const inserts: any[] = [];
  const fromTables: any[] = [];
  const chain = (result: any[]) => {
    const c: any = {
      from: (t: unknown) => {
        fromTables.push(t);
        return c;
      },
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
  return { db, inserts, fromTables };
}

describe("suppressedEmailsFor", () => {
  it("applies the owner's own rows (any source) and everyone's global opt-outs", async () => {
    expect([...GLOBAL_SUPPRESSION_SOURCES].sort()).toEqual(["bounce", "complaint", "unsubscribe"]);
    const rows = [
      { value: "own-manual@acme.com", userId: "owner", source: "manual" },
      { value: "other-unsub@acme.com", userId: "someone-else", source: "unsubscribe" },
      { value: "other-bounce@acme.com", userId: "someone-else", source: "bounce" },
      { value: "other-complaint@acme.com", userId: "someone-else", source: "complaint" },
      { value: "other-manual@acme.com", userId: "someone-else", source: "manual" },
      { value: "@blocked.com", userId: "owner", source: "import" },
    ];
    const { db, fromTables } = fakeDb([rows]);
    const out = await suppressedEmailsFor(db, "owner", [
      "Own-Manual@acme.com",
      "other-unsub@acme.com",
      "other-bounce@acme.com",
      "other-complaint@acme.com",
      "other-manual@acme.com",
      "x@blocked.com",
      "fine@acme.com",
    ]);
    expect(fromTables).toEqual([schema.suppressions]);
    expect([...out].sort()).toEqual([
      "other-bounce@acme.com",
      "other-complaint@acme.com",
      "other-unsub@acme.com",
      "own-manual@acme.com",
      "x@blocked.com",
    ]);
  });

  it("does not query for an empty list", async () => {
    const { db, fromTables } = fakeDb([]);
    expect((await suppressedEmailsFor(db, "owner", [])).size).toBe(0);
    expect(fromTables).toEqual([]);
  });
});

describe("launchRunCampaign excludes suppressed leads", () => {
  const run = { id: "r1", companyName: "Acme", selectedIndustries: ["Restaurants"], icpProfile: {}, offers: [], calibrationProfile: {} } as any;
  const identity = [{ companyName: "Acme Inc.", postalAddress: "123 Market St, San Francisco, CA 94105" }];

  beforeEach(() => {
    dir.leads = [lead("gone@acme.com"), lead("bounced@beta.com")];
  });

  it("fails with all_contacted (and creates no campaign) when every candidate opted out somewhere", async () => {
    const { db, inserts } = fakeDb([
      identity,
      [{ id: "s1" }],
      [], // recently contacted: none
      [
        { value: "gone@acme.com", userId: "another-client", source: "unsubscribe" },
        { value: "@beta.com", userId: "u1", source: "manual" },
      ],
    ]);
    const err = await launchRunCampaign(db, { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [] }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(LaunchError);
    expect(err.code).toBe("all_contacted");
    expect(inserts).not.toContain(schema.leads);
    expect(inserts).not.toContain(schema.campaigns);
  });
});
