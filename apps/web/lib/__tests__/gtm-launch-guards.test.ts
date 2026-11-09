import { beforeEach, describe, expect, it, vi } from "vitest";

const approval = vi.hoisted(() => ({ approved: true }));

vi.mock("../approval", () => ({
  APPROVAL_REQUIRED_ERROR: "Your account is waiting for approval.",
  assertCanSend: vi.fn(async () => {
    if (!approval.approved) throw new Error("Your account is waiting for approval.");
  }),
  isApprovedToSend: vi.fn(async () => approval.approved),
}));
const dir = vi.hoisted(() => ({
  leads: [] as any[],
  snapshot: 1,
  previewTotals: { withTitles: 0, withoutTitles: 0 },
  previewThrows: false,
  previewCalls: [] as any[],
  sqls: [] as string[],
}));

vi.mock("../leads-directory", () => ({
  getMatchingDirectoryLeadsForExport: vi.fn(() => dir.leads),
  getDirectoryDb: () => ({
    // Keyset pages over the fixture rows (the audience reads the directory this way).
    prepare: (sql: string) => {
      dir.sqls.push(sql);
      return {
        all: (...args: any[]) => (dir.leads).filter((l: any) => Number(l.id) > Number(args[args.length - 2])).slice(0, Number(args[args.length - 1])),
        get: () => ({ c: (dir.leads).length }),
      };
    },
  }),
  buildDirectoryWhereClause: () => ({ whereSql: "", bindings: [] }),
  isDirectoryFtsReady: () => false,
  directoryFingerprint: () => "dir-1",
  DIRECTORY_ALIVE_SQL: "directory_alive()",
  mapDirectoryRow: (r: any) => r,
    searchLeadMatcherPreview: vi.fn((industries: string[], countries: string[], page: number, pageSize: number, filters: any = {}) => {
    dir.previewCalls.push({ industries, countries, page, pageSize, filters });
    if (dir.previewThrows) throw new Error("directory unavailable");
    const total = filters?.jobTitles?.length ? dir.previewTotals.withTitles : dir.previewTotals.withoutTitles;
    return { leads: [], total, page, pageSize, totalPages: 1 };
  }),
}));
vi.mock("../campaign-drafts", () => ({ ensureCampaignLeadSnapshot: vi.fn(async () => dir.snapshot) }));

import { schema } from "@smartreach/database";
import {
  COMPLIANCE_REQUIRED_ERROR,
  LaunchError,
  LaunchInProgressError,
  buildRunSequence,
  fetchTargetedLeads,
  fetchTargetedLeadsWithSplit,
  launchAudienceCounts,
  launchRunCampaign,
  runTeamSizes,
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

describe("fetchTargetedLeadsWithSplit (#57)", () => {
  const query = () =>
    vi.fn<DirectoryQuery>((params) =>
      params.jobTitles
        ? [lead({ email: "a@acme.com", workEmail: "a@acme.com" })]
        : [lead({ email: "a@acme.com", workEmail: "a@acme.com" }), lead({ email: "c@beta.com", workEmail: "c@beta.com" })],
    );

  it("puts people at the team sizes first without leaving anyone else out", () => {
    const q = vi.fn<DirectoryQuery>((params) => {
      const sized = Boolean(params.teamSizes);
      if (params.jobTitles) return [lead({ email: sized ? "a@acme.com" : "b@acme.com", workEmail: sized ? "a@acme.com" : "b@acme.com" })];
      return [lead({ email: sized ? "c@beta.com" : "d@beta.com", workEmail: sized ? "c@beta.com" : "d@beta.com" })];
    });
    const out = fetchTargetedLeadsWithSplit(["Restaurants"], ["Owner"], 5, 0, {
      countries: ["United States"],
      query: q,
      teamSizes: ["11-50", "51"],
    });
    expect(out.leads.map((l) => l.email)).toEqual(["a@acme.com", "b@acme.com", "c@beta.com", "d@beta.com"]);
    expect(out.roleMatches).toBe(2);
    expect(q.mock.calls.map((c) => [Boolean(c[0].jobTitles), c[0].teamSizes ?? null])).toEqual([
      [true, ["11-50", "51"]],
      [true, null],
      [false, ["11-50", "51"]],
      [false, null],
    ]);
  });

  it("stops at the sized query when it already fills the request", () => {
    const q = query();
    fetchTargetedLeadsWithSplit(["Restaurants"], ["Owner"], 1, 0, { countries: ["United States"], query: q, teamSizes: ["11-50"] });
    expect(q).toHaveBeenCalledTimes(1);
  });

  it("with strictRoles makes exactly one query (no industry-only top-up)", () => {
    const q = query();
    const out = fetchTargetedLeadsWithSplit(["Restaurants"], ["Owner"], 5, 0, {
      countries: ["United States"],
      query: q,
      strictRoles: true,
    });
    expect(q).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ leads: [expect.objectContaining({ email: "a@acme.com" })], roleMatches: 1 });
  });

  it("counts only title-query leads as role matches", () => {
    const out = fetchTargetedLeadsWithSplit(["Restaurants"], ["Owner"], 5, 0, { countries: ["United States"], query: query() });
    expect(out.leads.map((l) => l.email)).toEqual(["a@acme.com", "c@beta.com"]);
    expect(out.roleMatches).toBe(1);
  });

  it("omits the size filter when no team sizes are given", () => {
    const q = query();
    fetchTargetedLeadsWithSplit(["Restaurants"], ["Owner"], 5, 0, { countries: ["United States"], query: q, teamSizes: [] });
    expect("teamSizes" in q.mock.calls[0]![0]).toBe(false);
  });
});

describe("runTeamSizes (#57)", () => {
  it("maps the run's company sizes to directory facet values", () => {
    const sizes = runTeamSizes({ icpProfile: { companySizes: ["11-50"] } } as any, () => ["0", "11", "11-50", "201"]);
    expect(sizes).toEqual(["11", "11-50"]);
  });
  it("is [] when the facet list is unavailable or no sizes are set", () => {
    expect(
      runTeamSizes({ icpProfile: { companySizes: ["11-50"] } } as any, () => {
        throw new Error("no directory");
      }),
    ).toEqual([]);
    expect(runTeamSizes({ icpProfile: {} } as any, () => ["11"])).toEqual([]);
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
    expect(seq.steps.map((s) => s.delayDays)).toEqual([0, 2, 2]);
    expect(seq.bodyText).toContain("Close the books in two days.");
    expect(seq.steps[1]!.subject.startsWith("re: ")).toBe(true);
  });
});

/**
 * Minimal drizzle-shaped fake: every select resolves to the next queued
 * result; every update ...returning() to the next queued update result
 * (default one row). `ops` records writes in order.
 */
function fakeDb(selectResults: any[][], updateResults: any[][] = [], fail: { campaignFlip?: boolean } = {}) {
  const inserts: any[] = [];
  const ops: Array<{ op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any }> = [];
  const chain = (result: any[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      // The identity read resolves the default workspace (ORDER BY is_default).
      orderBy: () => c,
      limit: () => Promise.resolve(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
  };
  const db: any = {
    select: () => chain(selectResults.shift() ?? []),
    insert: (table: unknown) => {
      inserts.push(table);
      const entry: { op: "insert"; table: unknown; values?: any } = { op: "insert", table };
      ops.push(entry);
      const c: any = {
        values: (v: any) => {
          entry.values = v;
          return c;
        },
        onConflictDoNothing: () => Promise.resolve(),
        then: (resolve: any) => Promise.resolve().then(resolve),
      };
      return c;
    },
    update: (table: unknown) => {
      const entry: { op: "update"; table: unknown; set?: any } = { op: "update", table };
      ops.push(entry);
      const failing = fail.campaignFlip && table === schema.campaigns;
      const done: any = {
        returning: () => Promise.resolve(updateResults.length > 0 ? updateResults.shift() : [{ id: "r1" }]),
        then: (resolve: any, reject: any) =>
          (failing ? Promise.reject(new Error("flip failed")) : Promise.resolve()).then(resolve, reject),
      };
      const c: any = {
        set: (v: any) => {
          entry.set = v;
          return c;
        },
        where: () => done,
      };
      return c;
    },
    delete: (table: unknown) => {
      ops.push({ op: "delete", table });
      return { where: () => Promise.resolve() };
    },
  };
  return { db, inserts, ops };
}

const run = { id: "r1", companyName: "Acme", selectedIndustries: ["Restaurants"], icpProfile: {}, offers: [], calibrationProfile: {} } as any;
const goodIdentity = [{ companyName: "Acme Inc.", postalAddress: "123 Market St, San Francisco, CA 94105" }];

describe("launchRunCampaign guards", () => {
  beforeEach(() => {
    approval.approved = true;
    dir.leads = [];
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

  it("fails with no_leads when the only matches have personal or ISP addresses", async () => {
    // Matched rows, but none is contactable: nobody to email, not "already contacted".
    dir.leads = [lead({ email: "ana@yahoo.com", workEmail: "" }), lead({ id: 2, email: "bo@gmail.com", workEmail: "bo@gmail.com" })];
    const { db, inserts } = fakeDb([goodIdentity, [{ id: "s1" }], [], []]);
    const err = await launchRunCampaign(db, { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [] }).catch(
      (e) => e,
    );
    expect(err.code).toBe("no_leads");
    expect(inserts).not.toContain(schema.campaigns);
  });

  it("fails with all_contacted when contactable people match but every one is blocked", async () => {
    dir.leads = [lead({ email: "ana@acme.com", workEmail: "ana@acme.com" })];
    // identity, pool, recently contacted (by anyone, within 90 days), suppressions.
    const { db, inserts } = fakeDb([goodIdentity, [{ id: "s1" }], [{ email: "ana@acme.com" }], []]);
    const err = await launchRunCampaign(db, { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [] }).catch(
      (e) => e,
    );
    expect(err.code).toBe("all_contacted");
    expect(inserts).not.toContain(schema.campaigns);
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

describe("launchRunCampaign launch claim and cleanup", () => {
  // identity, pool senders, recently contacted, suppressions (directory access passed explicitly).
  const selects = () => [goodIdentity, [{ id: "s1" }], [], []];
  const input = { run, userId: "u1", workspaceId: null, dailyLimit: 60, approvedSamples: [], directoryAccess: "none" as const };

  beforeEach(() => {
    approval.approved = true;
    dir.leads = [lead({ email: "ana@acme.com", workEmail: "ana@acme.com" })];
    dir.snapshot = 1;
  });

  it("throws LaunchInProgressError and inserts nothing when another launch holds the claim", async () => {
    const { db, inserts, ops } = fakeDb(selects(), [[]]);
    const err = await launchRunCampaign(db, input).catch((e) => e);
    expect(err).toBeInstanceOf(LaunchInProgressError);
    expect(inserts).toEqual([]);
    expect(ops.filter((o) => o.op === "delete")).toEqual([]);
    // The only write is the claim attempt itself.
    expect(ops).toEqual([expect.objectContaining({ op: "update", table: schema.chadGtmRuns })]);
    expect(ops[0]!.set.launchStartedAt).toEqual(expect.any(String));
  });

  it("undoes everything it created and releases the claim when a later step fails", async () => {
    // The snapshot's #31 rules left everyone out (all queued in another live
    // campaign of the owner): matches existed, so all_contacted, not no_leads.
    dir.snapshot = 0;
    const { db, ops } = fakeDb(selects());
    const err = await launchRunCampaign(db, input).catch((e) => e);
    expect(err).toBeInstanceOf(LaunchError);
    expect(err.code).toBe("all_contacted");
    const deletes = ops.filter((o) => o.op === "delete").map((o) => o.table);
    expect(deletes).toEqual([schema.campaigns, schema.emailTemplates, schema.leadLists]);
    const last = ops[ops.length - 1]!;
    expect(last).toMatchObject({ op: "update", table: schema.chadGtmRuns, set: { launchStartedAt: null } });
    // Nothing was ever switched to running.
    expect(ops.some((o) => o.table === schema.campaigns && o.op === "update")).toBe(false);
  });

  it("links the run while the campaign is a draft, then flips the campaign to running", async () => {
    const { db, ops } = fakeDb(selects());
    const out = await launchRunCampaign(db, input);
    expect(out.leadCount).toBe(1);
    const updates = ops.filter((o) => o.op === "update");
    const linkAt = updates.findIndex((o) => o.table === schema.chadGtmRuns && o.set?.campaignId);
    const flipAt = updates.findIndex((o) => o.table === schema.campaigns && o.set?.status === "running");
    expect(linkAt).toBeGreaterThan(-1);
    expect(flipAt).toBeGreaterThan(linkAt);
    expect(updates[linkAt]!.set).toMatchObject({ status: "active", campaignId: out.campaignId, launchStartedAt: null });
    expect(ops.some((o) => o.op === "delete")).toBe(false);
  });

  it("cleans up and never starts the campaign when another launch linked the run first", async () => {
    // claim succeeds, link matches no row
    const { db, ops } = fakeDb(selects(), [[{ id: "r1" }], []]);
    const err = await launchRunCampaign(db, input).catch((e) => e);
    expect(err).toBeInstanceOf(LaunchInProgressError);
    expect(ops.filter((o) => o.op === "delete").map((o) => o.table)).toEqual([
      schema.campaigns,
      schema.emailTemplates,
      schema.leadLists,
    ]);
    expect(ops.some((o) => o.table === schema.campaigns && o.op === "update")).toBe(false);
  });

  it("saves the chosen offer first and grounds the first step in it (#51)", async () => {
    const offers = [
      { title: "Audit", valueProp: "A free audit of your books.", angle: "A", cta: "Want one?" },
      { title: "Close", valueProp: "Close the books in two days.", angle: "B", cta: "Worth a look?" },
    ];
    const { db, ops } = fakeDb(selects());
    await launchRunCampaign(db, { ...input, run: { ...run, offers }, selectedOfferIndex: 1 });
    const link = ops.find((o) => o.op === "update" && o.table === schema.chadGtmRuns && o.set?.campaignId);
    expect(link!.set.offers.map((o: any) => o.title)).toEqual(["Close", "Audit"]);
    const firstVariant = ops.find((o) => o.op === "insert" && o.table === schema.sequenceStepVariants);
    const prompt = JSON.parse(firstVariant!.values.aiPrompt);
    expect(prompt.context.valueProposition).toBe("Close the books in two days.");
    // The offer travels in the context; the instruction only carries the step (copywriter.ts).
    expect(prompt.instruction).toContain("Email 1 of 3");
  });

  it("reads only the first batch: totals are counted later, off the request", async () => {
    dir.sqls = [];
    const { db, ops } = fakeDb(selects());
    await launchRunCampaign(db, input);
    expect(dir.sqls.some((q) => /count\(/i.test(q))).toBe(false);
    const link = ops.find((o) => o.op === "update" && o.table === schema.chadGtmRuns && o.set?.campaignId);
    expect(link!.set.audience).toMatchObject({ version: 2, countedAt: null, fingerprint: "dir-1", added: 1 });
    // One contact in the directory: everything was used, so the audience is closed, and says why.
    expect(link!.set.audience).toMatchObject({ exhausted: true, closedReason: "exhausted" });
    const campaign = ops.find((o) => o.op === "insert" && o.table === schema.campaigns);
    expect(campaign!.values.audienceOpen).toBe(false);
  });

  it("starts with the audience open (not all_contacted) when the search budget runs out with rows unread", async () => {
    // 600 people (one full page), every one recently contacted; more pages would follow.
    dir.leads = Array.from({ length: 600 }, (_, i) => lead({ id: i + 1, email: `p${i}@co${i}.com`, workEmail: `p${i}@co${i}.com` }));
    const contacted = dir.leads.map((l: any) => ({ email: l.email }));
    // Each Date.now() call moves 25 s on: the 20 s launch budget is spent after the first page.
    let t = Date.UTC(2026, 10, 9);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => (t += 25_000));
    try {
      const { db, ops } = fakeDb([goodIdentity, [{ id: "s1" }], contacted, []]);
      const out = await launchRunCampaign(db, input);
      expect(out.leadCount).toBe(0);
      const campaign = ops.find((o) => o.op === "insert" && o.table === schema.campaigns);
      expect(campaign!.values.audienceOpen).toBe(true);
      const link = ops.find((o) => o.op === "update" && o.table === schema.chadGtmRuns && o.set?.campaignId);
      // No target titles: owners are Priority 2. The top-up continues from where launch stopped,
      // and Priority 3 waits until Priority 2 is used up.
      expect(link!.set.audience.tiers["2"]).toMatchObject({ cursor: 600, exhausted: false });
      expect(link!.set.audience.tiers["3"]).toMatchObject({ cursor: 0, exhausted: false });
      expect(link!.set.audience.closedReason).toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  });

  it("stores how many launched leads match the target roles (#57)", async () => {
    const { db, ops } = fakeDb(selects());
    await launchRunCampaign(db, input);
    const link = ops.find((o) => o.op === "update" && o.table === schema.chadGtmRuns && o.set?.campaignId);
    // Merged into the stored profile (a key written meanwhile, like approvalLaunch, stays).
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const q = new PgDialect().sqlToQuery(link!.set.calibrationProfile);
    expect(q.sql).toMatch(/coalesce\(.*'\{\}'::jsonb\) \|\| \$1::jsonb\) - 'launchFailure'/);
    const merged = JSON.parse(q.params[0] as string);
    expect(merged.launchAudience).toMatchObject({ roleMatches: 1, otherRoles: 0 });
    expect(merged).not.toHaveProperty("approvalLaunch");
    expect(merged).not.toHaveProperty("launchFailure");
  });

  it("leaves the linked draft in place (shown as Paused) when the final flip fails", async () => {
    const { db, ops } = fakeDb(selects(), [], { campaignFlip: true });
    await expect(launchRunCampaign(db, input)).rejects.toThrow("flip failed");
    expect(ops.some((o) => o.op === "delete")).toBe(false);
    expect(ops.some((o) => o.table === schema.chadGtmRuns && o.set?.campaignId)).toBe(true);
  });
});

describe("one sender per workspace (#78)", () => {
  const offers = [{ title: "Audit", valueProp: "A free audit of your books.", angle: "A", cta: "Want one?" }];
  const researched = { ...run, companyName: "Researched Co", offers };
  const legal = [{ companyName: "Legal Co Ltd", postalAddress: "123 Market St, San Francisco, CA 94105" }];

  beforeEach(() => {
    approval.approved = true;
    dir.leads = [lead({ email: "ana@acme.com", workEmail: "ana@acme.com" })];
    dir.snapshot = 1;
  });

  it("names the workspace's legal sender in the step prompts and body, never the researched company", async () => {
    const { db, ops } = fakeDb([legal, [{ id: "s1" }], [], []]);
    await launchRunCampaign(db, {
      run: researched,
      userId: "u1",
      workspaceId: null,
      dailyLimit: 60,
      approvedSamples: [],
      directoryAccess: "none",
    });
    const variants = ops.filter((o) => o.op === "insert" && o.table === schema.sequenceStepVariants);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      const text = JSON.stringify(v.values);
      expect(text).toContain("Legal Co Ltd");
      expect(text).not.toContain("Researched Co");
      expect(text).not.toContain("Autonomous GTM");
      expect(JSON.parse(v.values.aiPrompt).context.companyName).toBe("Legal Co Ltd");
    }
    const template = ops.find((o) => o.op === "insert" && o.table === schema.emailTemplates);
    expect(JSON.stringify(template!.values.bodyText)).not.toContain("Researched Co");
    // Names shown in the app keep the researched company.
    const campaign = ops.find((o) => o.op === "insert" && o.table === schema.campaigns);
    expect(campaign!.values.name).toBe("AutoGTM: Researched Co");
  });

  it("buildRunSequence with no run name and no sender never says 'Autonomous GTM'", () => {
    const seq = buildRunSequence({ ...run, companyName: "", offers: [{ title: "Audit", angle: "A", cta: "Want one?" }] } as any);
    const text = JSON.stringify(seq);
    expect(text).not.toContain("Autonomous GTM");
    expect(text).toContain("your company");
  });
});

describe("launchAudienceCounts", () => {
  beforeEach(() => {
    dir.previewThrows = false;
    dir.previewCalls = [];
    dir.previewTotals = { withTitles: 300, withoutTitles: 1000 };
  });

  it("splits role matches from others in the industries, over every company size", () => {
    const counts = launchAudienceCounts({
      industries: ["Restaurants"],
      titles: ["Owner"],
      teamSizes: ["11-50"],
      countries: ["United States"],
    });
    expect(counts).toEqual({ roleMatches: 300, otherRoles: 700 });
    expect(dir.previewCalls.map((c) => c.filters)).toEqual(expect.arrayContaining([{ jobTitles: ["Owner"] }, {}]));
    expect(dir.previewCalls.some((c) => c.filters?.teamSizes)).toBe(false);
    expect(dir.previewCalls.every((c) => c.pageSize === 1)).toBe(true);
  });

  it("counts everyone as a role match when there are no titles", () => {
    expect(launchAudienceCounts({ industries: ["Restaurants"], titles: [], countries: ["United States"] })).toEqual({
      roleMatches: 1000,
      otherRoles: 0,
    });
  });

  it("is zero when the directory errors", () => {
    dir.previewThrows = true;
    expect(launchAudienceCounts({ industries: ["Restaurants"], titles: ["Owner"], countries: ["United States"] })).toEqual({
      roleMatches: 0,
      otherRoles: 0,
    });
  });
});
