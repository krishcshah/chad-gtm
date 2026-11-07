import { beforeEach, describe, expect, it, vi } from "vitest";

/* Autopilot copies directory records into the owner's lead list. Accounts
 * without directory access must not get the paywalled contact details. */

const st = vi.hoisted(() => ({ leads: [] as any[], level: "none" as "none" | "paid" | "admin", levelCalls: 0 }));

vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "Your account is waiting for approval.",
  assertCanSend: vi.fn(async () => undefined),
  isApprovedToSend: vi.fn(async () => true),
}));
vi.mock("../leads-directory", () => ({ getMatchingDirectoryLeadsForExport: vi.fn(() => st.leads) }));
vi.mock("../campaign-drafts", () => ({ ensureCampaignLeadSnapshot: vi.fn(async () => 1) }));
vi.mock("../b2b-access", () => ({
  getDirectoryAccessLevel: vi.fn(async () => {
    st.levelCalls++;
    return st.level;
  }),
}));

import { schema } from "@smartreach/database";
import { directoryLeadContactFields, launchDirectoryAccess, launchRunCampaign } from "../gtm-launch";

function dirLead(email: string) {
  return {
    id: 1, leadId: email, firstName: "Jane", lastName: "Doe", fullName: "Jane Doe", jobTitle: "Owner",
    companyName: "Acme", companyWebsite: "acme.com", linkedinUrl: "https://linkedin.com/in/jane", location: "Austin",
    city: "", state: "", country: "United States", industry: "Restaurants", teamSize: "", revenueRange: "",
    email, emailStatus: "verified", phone: "+1 512 555 0100", emailCount: 1, phoneCount: 1, sourceFile: "apollo.csv",
    rawAttributes: { seniority: "owner", personal_email: "jane@gmail.com", twitter: "@jane" },
    workEmail: email, personalEmail: "jane@gmail.com",
  } as any;
}

function fakeDb(selectResults: any[][]) {
  const leadRows: any[] = [];
  const chain = (result: any[] | Error) => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      // The identity read resolves the default workspace (ORDER BY is_default).
      orderBy: () => c,
      limit: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
      then: (resolve: any, reject: any) =>
        (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject),
    };
    return c;
  };
  const db: any = {
    select: () => chain(selectResults.shift() ?? []),
    insert: (table: unknown) => {
      const c: any = {
        values: (v: any) => {
          if (table === schema.leads) leadRows.push(...(Array.isArray(v) ? v : [v]));
          return c;
        },
        returning: () => Promise.resolve([{ id: "x" }]),
        onConflictDoNothing: () => Promise.resolve(),
        then: (resolve: any) => Promise.resolve().then(resolve),
      };
      return c;
    },
    update: () => {
      const done: any = {
        returning: () => Promise.resolve([{ id: "r1" }]),
        then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
      };
      const c: any = { set: () => c, where: () => done };
      return c;
    },
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async (fn: any) => fn(db),
  };
  return { db, leadRows };
}

const run = { id: "r1", companyName: "Acme", selectedIndustries: ["Restaurants"], icpProfile: {}, offers: [], calibrationProfile: {} } as any;
const identity = [{ companyName: "Acme Inc.", postalAddress: "123 Market St, San Francisco, CA 94105" }];
const USER = [{ id: "u1", email: "c@example.com", role: "user", emailVerified: true }];

beforeEach(() => {
  st.leads = [dirLead("jane@acme.com")];
  st.level = "none";
  st.levelCalls = 0;
});

describe("directoryLeadContactFields (pure)", () => {
  it("drops phone, LinkedIn and raw attributes without directory access", () => {
    expect(directoryLeadContactFields(dirLead("a@acme.com"), "none")).toEqual({ linkedin: null, phone: null, customFields: {} });
  });
  it("keeps them for paid and admin", () => {
    for (const level of ["paid", "admin"] as const) {
      const f = directoryLeadContactFields(dirLead("a@acme.com"), level);
      expect(f.phone).toBe("+1 512 555 0100");
      expect(f.linkedin).toBe("https://linkedin.com/in/jane");
      expect(f.customFields).toMatchObject({ seniority: "owner" });
    }
  });
});

describe("launchDirectoryAccess fails closed", () => {
  it("is none when the user can't be loaded", async () => {
    expect(await launchDirectoryAccess(fakeDb([[]]).db, "u1")).toBe("none");
    expect(await launchDirectoryAccess(fakeDb([new Error("db down") as any]).db, "u1")).toBe("none");
  });
  it("asks b2b-access for a loaded user", async () => {
    st.level = "paid";
    expect(await launchDirectoryAccess(fakeDb([USER]).db, "u1")).toBe("paid");
  });
});

describe("launchRunCampaign lead copy honours the directory paywall", () => {
  async function launch(selects: any[][], extra: Record<string, unknown> = {}) {
    const { db, leadRows } = fakeDb(selects);
    await launchRunCampaign(db, { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [], ...extra }).catch(
      () => undefined,
    );
    return leadRows;
  }

  it("an account with no directory access gets the address but no paywalled contact data", async () => {
    const rows = await launch([identity, [{ id: "s1" }], [], [], USER]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "jane@acme.com", firstName: "Jane", company: "Acme" });
    expect(rows[0].phone).toBeNull();
    expect(rows[0].linkedin).toBeNull();
    expect(rows[0].customFields).toEqual({});
    expect(st.levelCalls).toBe(1);
  });

  it("a paid account keeps the full record", async () => {
    st.level = "paid";
    const rows = await launch([identity, [{ id: "s1" }], [], [], USER]);
    expect(rows[0].phone).toBe("+1 512 555 0100");
    expect(rows[0].linkedin).toBe("https://linkedin.com/in/jane");
  });

  it("an explicit level skips the lookup", async () => {
    const rows = await launch([identity, [{ id: "s1" }], [], []], { directoryAccess: "admin" });
    expect(rows[0].phone).toBe("+1 512 555 0100");
    expect(st.levelCalls).toBe(0);
  });
});
