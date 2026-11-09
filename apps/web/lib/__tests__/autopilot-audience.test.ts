import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  SENIOR_TITLES,
  audienceCountQuery,
  audiencePageQuery,
  classifyTier,
  countAudience,
  newAudienceState,
  audiencePlan,
  compareDirectoryFingerprints,
  countBackoffMs,
  countDue,
  countOrder,
  parseAudienceState,
  pickNextLeads,
  refillTarget,
  reopenForNewRows,
  resetForNewDirectory,
  tierQueryParams,
  titleMatchExpression,
  withCountFailure,
  withTotals,
  withoutClosedReason,
  type AudienceState,
  type DirectoryPage,
} from "../autopilot-audience";
import type { DirectoryLead } from "../leads-directory";

const lead = (id: number, jobTitle: string, email = `p${id}@acme${id}.com`, teamSize = ""): DirectoryLead =>
  ({ id, jobTitle, email, workEmail: email, country: "United States", industry: "Logistics", teamSize }) as unknown as DirectoryLead;

/** A fake directory: rows filtered by the tier's title terms and company sizes, paged by id. */
function fakeDirectory(rows: DirectoryLead[], calls: any[] = []): DirectoryPage {
  return (params, afterId, limit) => {
    calls.push({ params, afterId });
    const titles = (params as any).jobTitles as string[] | undefined;
    const sizes = (params as any).teamSizes as string[] | undefined;
    const notSizes = (params as any).excludeTeamSizes as string[] | undefined;
    return rows
      .filter((r) => Number(r.id) > afterId)
      .filter((r) => !titles || titles.some((t) => r.jobTitle.toLowerCase().includes(t.toLowerCase())))
      .filter((r) => !sizes || sizes.includes(r.teamSize))
      .filter((r) => !notSizes || !notSizes.includes(r.teamSize))
      .slice(0, limit);
  };
}

const passThrough = {
  contactable: (rows: DirectoryLead[]) => rows,
  blocked: async () => new Set<string>(),
};

const state = (targetTitles = ["head of operations"], teamSizes: string[] = []) =>
  newAudienceState({ industries: ["Logistics"], targetTitles, countries: ["United States"], teamSizes, now: new Date(0) });

describe("classifyTier", () => {
  const targets = ["Head of Operations", "COO"];
  it("puts target titles in Priority 1", () => {
    expect(classifyTier("Head of Operations, North America", targets)).toBe(1);
    expect(classifyTier("COO", targets)).toBe(1);
  });
  it("puts other decision-makers in Priority 2", () => {
    expect(classifyTier("Founder & CEO", targets)).toBe(2);
    expect(classifyTier("VP Sales", targets)).toBe(2);
    expect(classifyTier("Director of Finance", targets)).toBe(2);
  });
  it("puts everyone else in Priority 3", () => {
    expect(classifyTier("Dispatcher", targets)).toBe(3);
    expect(classifyTier("", targets)).toBe(3);
    // "head" inside another word is not a title match
    expect(classifyTier("Forehead Analyst", targets)).toBe(3);
  });
});

describe("tiers", () => {
  it("has no Priority 1 query without target titles", () => {
    const s = state([]);
    expect(tierQueryParams(1, s)).toBeNull();
    expect(s.tiers["1"].exhausted).toBe(true);
  });

  it("derives tier counts without double counting, over every company size", async () => {
    const seen: any[] = [];
    const counts = await countAudience(
      { industries: ["Logistics"], targetTitles: ["coo"], countries: ["United States"], teamSizes: ["11-50"] },
      (p: any) => {
        seen.push(p);
        return p.jobTitles?.includes("coo") ? 10 : p.jobTitles ? 40 : 100;
      },
    );
    expect(counts).toEqual({ "1": 10, "2": 40, "3": 50 });
    expect(seen.some((p) => p.teamSizes || p.excludeTeamSizes)).toBe(false);
  });

  it("rejects when a count fails, so the totals stay pending", async () => {
    await expect(
      countAudience({ industries: ["Logistics"], targetTitles: ["coo"], countries: ["United States"] }, () => {
        throw new Error("timeout");
      }),
    ).rejects.toThrow("timeout");
  });

  it("starts with totals pending; the top-up fills them in", () => {
    const s = state();
    expect(s.version).toBe(2);
    expect(s.countedAt).toBeNull();
    const counted = withTotals(s, { "1": 3, "2": 4, "3": 5 }, new Date(5));
    expect(counted.tiers["2"].total).toBe(4);
    expect(counted.countedAt).toBe(new Date(5).toISOString());
  });

  it("keeps about a week of new leads waiting and adds about two weeks at a time", () => {
    // 60 emails a day = 20 new leads a day (3 emails each).
    expect(refillTarget(60)).toEqual({ low: 100, batch: 200 });
    // 300 a day = 100 new leads a day.
    expect(refillTarget(300)).toEqual({ low: 500, batch: 1000 });
  });

  it("strict roles only ever uses Priority 1", () => {
    const s = newAudienceState({ industries: ["Logistics"], targetTitles: ["coo"], countries: ["United States"], strictRoles: true });
    expect(s.tiers["2"].exhausted && s.tiers["3"].exhausted).toBe(true);
    expect(tierQueryParams(2, s)).toBeNull();
    expect(s.tiers["1"].exhausted).toBe(false);
  });
});

describe("pickNextLeads", () => {
  const rows = [
    lead(1, "Dispatcher"),
    lead(2, "Head of Operations"),
    lead(3, "Founder"),
    lead(4, "Head of Operations"),
    lead(5, "Driver"),
    lead(6, "VP Operations"),
  ];

  it("sends Priority 1 first, then 2, then 3", async () => {
    const { picked, state: next } = await pickNextLeads(state(), 10, passThrough, fakeDirectory(rows), { pageSize: 2 });
    expect(picked.map((p) => [Number(p.lead.id), p.tier])).toEqual([
      [2, 1],
      [4, 1],
      [3, 2],
      [6, 2],
      [1, 3],
      [5, 3],
    ]);
    expect(next.exhausted).toBe(true);
    expect(next.added).toBe(6);
  });

  it("resumes from the cursor on the next batch, without repeats or skipped contacts", async () => {
    const dir = fakeDirectory(rows);
    // In production "blocked" includes everyone already in the campaign.
    const added = new Set<string>();
    const campaign = { ...passThrough, blocked: async (emails: string[]) => new Set(emails.filter((e) => added.has(e))) };
    const first = await pickNextLeads(state(), 3, campaign, dir, { pageSize: 2 });
    first.picked.forEach((p) => added.add(p.lead.email.toLowerCase()));
    const second = await pickNextLeads(first.state, 10, campaign, dir, { pageSize: 2 });
    expect([...first.picked, ...second.picked]).toHaveLength(6);
    const ids = [...first.picked, ...second.picked].map((p) => Number(p.lead.id));
    expect(new Set(ids).size).toBe(ids.length);
    // Leads 1 and 5 only appear in the Priority 3 pass, after every Priority 1 and 2 lead.
    expect(ids.slice(-2).sort()).toEqual([1, 5]);
  });

  it("skips blocked emails (cooldown, suppression, already added)", async () => {
    const blocked = { ...passThrough, blocked: async () => new Set(["p2@acme2.com"]) };
    const { picked } = await pickNextLeads(state(), 10, blocked, fakeDirectory(rows), { pageSize: 10 });
    expect(picked.map((p) => Number(p.lead.id))).not.toContain(2);
  });

  it("never returns the same address twice across tiers", async () => {
    const dup = [lead(1, "Head of Operations", "same@x.com"), lead(2, "Founder", "same@x.com")];
    const { picked } = await pickNextLeads(state(), 10, passThrough, fakeDirectory(dup), { pageSize: 10 });
    expect(picked).toHaveLength(1);
  });
});

describe("company size orders, never excludes", () => {
  const rows = [
    lead(1, "Head of Operations", "a@x1.com", "1001-5000"),
    lead(2, "Founder", "b@x2.com", "11-50"),
    lead(3, "Head of Operations", "c@x3.com", "11-50"),
    lead(4, "Driver", "d@x4.com", ""),
    lead(5, "Director", "e@x5.com", "1001-5000"),
    lead(6, "Driver", "f@x6.com", "11-50"),
  ];

  it("loads people at the run's sizes first in each tier, then everyone else", async () => {
    const { picked, state: next } = await pickNextLeads(state(["head of operations"], ["11-50"]), 10, passThrough, fakeDirectory(rows), {
      pageSize: 10,
    });
    expect(picked.map((p) => [Number(p.lead.id), p.tier])).toEqual([
      [3, 1],
      [1, 1],
      [2, 2],
      [5, 2],
      [6, 3],
      [4, 3],
    ]);
    expect(next.exhausted).toBe(true);
    expect(next.tiers["1"].sized).toEqual({ cursor: 3, exhausted: true });
  });

  it("keeps a separate cursor for each pass across batches", async () => {
    const added = new Set<string>();
    const campaign = { ...passThrough, blocked: async (emails: string[]) => new Set(emails.filter((e) => added.has(e))) };
    const dir = fakeDirectory(rows);
    let s = state(["head of operations"], ["11-50"]);
    const all: number[] = [];
    for (let i = 0; i < 6 && !s.exhausted; i++) {
      const r = await pickNextLeads(s, 1, campaign, dir, { pageSize: 1 });
      r.picked.forEach((p) => {
        added.add(p.lead.email);
        all.push(Number(p.lead.id));
      });
      s = r.state;
    }
    expect(all).toEqual([3, 1, 2, 5, 6, 4]);
  });

  it("reports matching rows even when every one is skipped", async () => {
    const none = await pickNextLeads(state(), 10, passThrough, fakeDirectory([]));
    expect(none.scanned).toBe(0);
    const blockedAll = { ...passThrough, blocked: async (emails: string[]) => new Set(emails) };
    const skipped = await pickNextLeads(state(), 10, blockedAll, fakeDirectory(rows));
    expect(skipped.picked).toHaveLength(0);
    expect(skipped.scanned).toBeGreaterThan(0);
    expect(skipped.eligible).toBeGreaterThan(0);
  });

  it("counts only contactable rows as eligible (personal or ISP addresses are not)", async () => {
    const nobody = { contactable: () => [], blocked: async () => new Set<string>() };
    const r = await pickNextLeads(state(), 10, nobody, fakeDirectory(rows));
    expect(r.scanned).toBeGreaterThan(0);
    expect(r.eligible).toBe(0);
    expect(r.state.exhausted).toBe(true);
  });
});

describe("strict tier order and the launch budget", () => {
  // 30 Priority 1 rows that are all blocked (cooldown), then one free one; Priority 3 rows are free.
  const rows = [
    ...Array.from({ length: 30 }, (_, i) => lead(i + 1, "Head of Operations", `blocked${i}@x.com`)),
    lead(31, "Head of Operations", "free@x.com"),
    ...Array.from({ length: 5 }, (_, i) => lead(40 + i, "Driver", `d${i}@y.com`)),
  ];
  const cooldown = { ...passThrough, blocked: async (emails: string[]) => new Set(emails.filter((e) => e.startsWith("blocked"))) };

  it("does not load a lower tier while a higher tier still has unread rows", async () => {
    const r = await pickNextLeads(state(), 10, cooldown, fakeDirectory(rows), { pageSize: 5, maxPagesPerTier: 2 });
    expect(r.picked).toHaveLength(0);
    expect(r.state.tiers["1"]).toMatchObject({ cursor: 10, exhausted: false });
    // Priority 2 and 3 untouched: their cursors did not move.
    expect(r.state.tiers["2"].cursor).toBe(0);
    expect(r.state.tiers["3"].cursor).toBe(0);
    // The next pass continues Priority 1 where it stopped.
    const r2 = await pickNextLeads(r.state, 10, cooldown, fakeDirectory(rows), { pageSize: 5, maxPagesPerTier: 10 });
    expect(r2.picked[0]).toMatchObject({ tier: 1 });
    expect(Number(r2.picked[0]!.lead.id)).toBe(31);
  });

  it("at launch keeps reading past the page limit until someone is picked", async () => {
    const r = await pickNextLeads(state(), 10, cooldown, fakeDirectory(rows), { pageSize: 5, maxPagesPerTier: 1, untilPicked: true });
    expect(r.picked.map((p) => Number(p.lead.id))).toContain(31);
  });

  it("stops at the deadline and keeps the cursor (launch starts with the audience open)", async () => {
    let t = 0;
    const r = await pickNextLeads(state(), 10, cooldown, fakeDirectory(rows), {
      pageSize: 5,
      untilPicked: true,
      deadline: 2,
      now: () => t++,
    });
    expect(r.picked).toHaveLength(0);
    expect(r.state.exhausted).toBe(false);
    expect(r.state.tiers["1"].cursor).toBeGreaterThan(0);
  });
});

describe("count backoff", () => {
  const at = (ms: number) => new Date(Date.UTC(2026, 10, 9) + ms);
  it("waits longer after each failed count, at most a day", () => {
    expect(countBackoffMs(0)).toBe(0);
    expect(countBackoffMs(1)).toBe(10 * 60_000);
    expect(countBackoffMs(2)).toBe(20 * 60_000);
    expect(countBackoffMs(20)).toBe(24 * 60 * 60_000);
  });

  it("is due when never counted or stale, and not during a backoff", () => {
    const pending = state();
    expect(countDue(pending, at(0))).toBe(true);
    const failed = withCountFailure(pending, at(0));
    expect(failed).toMatchObject({ countFailures: 1, countAttemptAt: at(0).toISOString() });
    expect(countDue(failed, at(5 * 60_000))).toBe(false);
    expect(countDue(failed, at(10 * 60_000))).toBe(true);
    const counted = withTotals(failed, { "1": 1, "2": 1, "3": 1 }, at(0));
    expect(counted.countFailures).toBeUndefined();
    expect(countDue(counted, at(0))).toBe(false);
    expect(countDue({ ...counted, totalsStale: true }, at(0))).toBe(true);
  });

  it("counts never-counted audiences first, then the oldest attempt", () => {
    const a = { ...state(), countAttemptAt: at(5000).toISOString() } as AudienceState;
    const b = { ...state(), countAttemptAt: at(1000).toISOString() } as AudienceState;
    const c = state();
    const stale = { ...withTotals(state(), { "1": 0, "2": 0, "3": 0 }, at(0)), totalsStale: true } as AudienceState;
    expect([a, stale, b, c].sort(countOrder)).toEqual([c, b, a, stale]);
  });
});

describe("stored audiences", () => {
  const v1 = (teamSizes: string[], exhausted = true) => ({
    version: 1,
    industries: ["Logistics"],
    targetTitles: ["coo"],
    countries: ["United States"],
    teamSizes,
    strictRoles: false,
    tiers: {
      "1": { total: 5, cursor: 90, added: 5, exhausted },
      "2": { total: 7, cursor: 120, added: 7, exhausted },
      "3": { total: 9, cursor: 150, added: 9, exhausted },
    },
    added: 21,
    exhausted,
    countedAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  });

  it("turns an old size-filtered audience into sized cursors plus a fresh walk of everyone else", () => {
    const s = parseAudienceState(v1(["11-50"]))!;
    expect(s.version).toBe(2);
    expect(s.tiers["2"]).toEqual({ total: 7, added: 7, sized: { cursor: 120, exhausted: true }, cursor: 0, exhausted: false });
    expect(s.exhausted).toBe(false);
    // Old totals left other sizes out.
    expect(s.countedAt).toBeNull();
  });

  it("keeps the proof that an old audience ran out (so its completed campaign can run again)", () => {
    const s = parseAudienceState(v1(["11-50"]))!;
    expect(s).toMatchObject({ closedReason: "exhausted", closedAt: "2026-11-01T00:00:00.000Z" });
    expect(parseAudienceState({ ...v1([]), closedAt: "2026-10-01T00:00:00.000Z" })).toMatchObject({
      exhausted: true,
      closedReason: "exhausted",
      closedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(parseAudienceState(v1(["11-50"], false))!.closedReason).toBeUndefined();
  });

  it("keeps an old audience without sizes as it was", () => {
    const s = parseAudienceState(v1([], false))!;
    expect(s.tiers["3"]).toEqual({ total: 9, added: 9, cursor: 150, exhausted: false });
    expect(s.countedAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("rejects what it can't read", () => {
    expect(parseAudienceState(null)).toBeNull();
    expect(parseAudienceState({})).toBeNull();
    expect(parseAudienceState({ version: 9, tiers: {} })).toBeNull();
  });

  it("starts every pass again on a new directory, keeping what was added", () => {
    const old = parseAudienceState(v1(["11-50"]))!;
    const closed = { ...old, exhausted: true, closedReason: "exhausted" as const, closedAt: "x", fingerprint: "a" };
    const s = resetForNewDirectory(closed, "b", new Date(1));
    expect(s.fingerprint).toBe("b");
    expect(s.exhausted).toBe(false);
    // Still closed until the top-up really reopens it.
    expect(s.closedReason).toBe("exhausted");
    expect(withoutClosedReason(s).closedReason).toBeUndefined();
    expect(withoutClosedReason(s).closedAt).toBeUndefined();
    expect(s.countedAt).toBeNull();
    expect(s.added).toBe(21);
    expect(s.tiers["1"]).toMatchObject({ cursor: 0, exhausted: false, added: 5, sized: { cursor: 0, exhausted: false } });
  });

  it("compares directory content, not the file", () => {
    expect(compareDirectoryFingerprints("100|0|v1", "150|0|v1")).toBe("grown");
    expect(compareDirectoryFingerprints("100|0|v1", "100|0|v1")).toBe("same");
    // Older audiences stored the file's device:inode as a 4th part: a copy of the same file is the same directory.
    expect(compareDirectoryFingerprints("100|0||1:5", "100|0|")).toBe("same");
    expect(compareDirectoryFingerprints("100|0||1:5", "150|0|")).toBe("grown");
    expect(compareDirectoryFingerprints("100|0||1:5", "100|0||2:9")).toBe("same");
    // A new build carries a new version.
    expect(compareDirectoryFingerprints("100|0|v1", "150|0|v2")).toBe("new");
    expect(compareDirectoryFingerprints("100|0|v1", "150|1|v1")).toBe("new");
    // The high id never drops by deleting rows; a lower one is an unversioned rebuild.
    expect(compareDirectoryFingerprints("100|0|v1", "90|0|v1")).toBe("new");
    expect(compareDirectoryFingerprints("rescan-requested:x", "150|0|")).toBe("new");
    expect(compareDirectoryFingerprints("x|0|", "150|0|")).toBe("new");
  });

  it("reopens used-up passes for appended rows without moving the cursors", () => {
    const old = { ...parseAudienceState(v1(["11-50"]))!, closedReason: "exhausted" as const };
    old.tiers["2"].exhausted = true;
    const s = reopenForNewRows(old, "200|0|", new Date(2));
    expect(s.tiers["2"]).toMatchObject({ cursor: 0, exhausted: false, sized: { cursor: 120, exhausted: false } });
    expect(s).toMatchObject({ exhausted: false, countedAt: null, fingerprint: "200|0|" });
    // Closed until the top-up reopens it.
    expect(s.closedReason).toBe("exhausted");
  });

  it("keeps counted totals on show when rows are added, and recounts them later", () => {
    const counted = withTotals(state(), { "1": 1, "2": 2, "3": 3 }, new Date(5));
    const s = reopenForNewRows(counted, "200|0|", new Date(6));
    expect(s.countedAt).toBe(new Date(5).toISOString());
    expect(s.totalsStale).toBe(true);
    expect(withTotals(s, { "1": 1, "2": 2, "3": 4 }).totalsStale).toBeUndefined();
  });

  it("keeps a tier without a query closed after a reset", () => {
    const strict = newAudienceState({ industries: ["Logistics"], targetTitles: ["coo"], countries: ["US"], strictRoles: true });
    const s = resetForNewDirectory(strict, "b");
    expect(s.tiers["2"].exhausted && s.tiers["3"].exhausted).toBe(true);
    expect(s.tiers["1"].exhausted).toBe(false);
  });
});

describe("directory queries", () => {
  it("matches whole title phrases, like classifyTier", () => {
    expect(titleMatchExpression(["Head of Operations", "COO", "coo", "--"])).toBe('job_title : ("head of operations" OR "coo")');
    expect(titleMatchExpression(["!!"])).toBeNull();
    expect(tierQueryParams(1, { industries: [], targetTitles: ["!!"], countries: ["US"] })).toBeNull();
  });

  /** A small directory with the production schema's FTS index. */
  function directory() {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE leads (id INTEGER PRIMARY KEY, lead_id TEXT, first_name TEXT, last_name TEXT, full_name TEXT, job_title TEXT,
        company_name TEXT, company_website TEXT, linkedin_url TEXT, location TEXT, city TEXT, state TEXT, country TEXT,
        industry TEXT, team_size TEXT, revenue_range TEXT, email TEXT, email_status TEXT, phone TEXT, raw_data TEXT,
        work_email TEXT, personal_email TEXT);
      CREATE INDEX idx_leads_country ON leads(country);
      CREATE VIRTUAL TABLE leads_fts USING fts5(full_name, job_title, company_name, email, industry,
        content='leads', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
    `);
    const titles = ["Director of Sales", "Driver", "VP Operations", "Head of Operations", "Founder & CEO", "Analyst", "Directory Clerk"];
    const ins = db.prepare(
      "INSERT INTO leads (id, job_title, country, industry, team_size, email, work_email, full_name, company_name) VALUES (?,?,?,?,?,?,?,?,?)",
    );
    for (let i = 1; i <= 400; i++) {
      const country = i % 5 === 0 ? "Canada" : "United States";
      const industry = i % 3 === 0 ? "Retail" : "Logistics";
      const size = i % 4 === 0 ? "11-50" : i % 4 === 1 ? "" : "1001-5000";
      const email = i % 7 === 0 ? "" : `p${i}@co${i}.com`;
      ins.run(i, titles[i % titles.length], country, industry, size, email, email, `P ${i}`, `Co ${i}`);
    }
    db.exec("INSERT INTO leads_fts(leads_fts) VALUES('rebuild')");
    return db;
  }

  const targeting = { industries: ["Logistics"], targetTitles: ["head of operations"], countries: ["United States"], teamSizes: ["11-50"] };

  /** The rows every pass should return, filtered in code. */
  function expected(db: DatabaseSync, tier: 1 | 2 | 3, pass: "all" | "sized" | "rest") {
    const rows = db.prepare("SELECT * FROM leads ORDER BY id").all() as any[];
    return rows
      .filter((r) => r.industry === "Logistics" && r.country === "United States" && r.email && r.work_email)
      .filter((r) => pass === "all" || (pass === "sized" ? r.team_size === "11-50" : r.team_size !== "11-50"))
      .filter((r) => tier === 3 || classifyTier(r.job_title, tier === 1 ? targeting.targetTitles : SENIOR_TITLES) <= (tier === 1 ? 1 : 2))
      .map((r) => r.id);
  }

  it("walks every pass in id order from the FTS index, page by page", () => {
    const db = directory();
    for (const tier of [1, 2, 3] as const) {
      for (const pass of ["all", "sized", "rest"] as const) {
        const params = tierQueryParams(tier, targeting, pass)!;
        const got: number[] = [];
        let after = 0;
        for (let i = 0; i < 100; i++) {
          const q = audiencePageQuery(params, after, 7, true);
          const page = db.prepare(q.sql).all(...(q.bindings as any[])) as any[];
          if (!page.length) break;
          got.push(...page.map((r) => r.id));
          after = page[page.length - 1].id;
        }
        const want = expected(db, tier, pass);
        expect(got, `tier ${tier} ${pass}`).toEqual(want);
        expect(want.length, `tier ${tier} ${pass}`).toBeGreaterThan(0);
        const c = audienceCountQuery(params, true);
        expect((db.prepare(c.sql).get(...(c.bindings as any[])) as any).c).toBe(want.length);
      }
    }
  });

  it("walks the same rows with either plan (industry-driven or not), so saved cursors keep working", () => {
    const db = directory();
    for (const tier of [1, 2, 3] as const) {
      for (const pass of ["all", "sized", "rest"] as const) {
        const params = tierQueryParams(tier, targeting, pass)!;
        for (const plan of [{ fts: true, byIndustry: false }, { fts: true, byIndustry: true }]) {
          const got: number[] = [];
          let after = 0;
          for (let i = 0; i < 200; i++) {
            const q = audiencePageQuery(params, after, 7, plan);
            const page = db.prepare(q.sql).all(...(q.bindings as any[])) as any[];
            if (!page.length) break;
            got.push(...page.map((r) => r.id));
            after = page[page.length - 1].id;
          }
          expect(got, `tier ${tier} ${pass} ${JSON.stringify(plan)}`).toEqual(expected(db, tier, pass));
        }
      }
    }
  });

  it("drives a niche industry from its own FTS entries, a broad one from the country index", () => {
    const db = directory();
    const plan = (sql: string, b: unknown[]) =>
      (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(b as any[])) as any[]).map((r) => r.detail).join(" | ");
    const t3 = tierQueryParams(3, targeting, "all")!;
    const sizes = (ind: number, country: number, total = 10_000_000) => ({
      industryRows: () => ind,
      countryRows: () => country,
      totalRows: () => total,
    });
    const niche = audiencePlan(t3, { fts: true, sizes: sizes(1_800, 5_000_000) });
    expect(niche.byIndustry).toBe(true);
    const nq = audiencePageQuery(t3, 0, 50, niche);
    expect(nq.bindings[0]).toBe('industry : ("logistics")');
    expect(plan(nq.sql, nq.bindings)).toMatch(/SCAN leads_fts VIRTUAL TABLE/);
    // More than a quarter of the country's rows: the country index drives.
    const broad = audiencePlan(t3, { fts: true, sizes: sizes(1_500_000, 5_000_000) });
    expect(broad.byIndustry).toBe(false);
    const bq = audiencePageQuery(t3, 0, 50, broad);
    expect(plan(bq.sql, bq.bindings)).toMatch(/idx_leads_country/);
    // Title tiers: a niche industry narrows the title walk (FTS AND); a broad one keeps the titles alone.
    const t2 = audiencePlan(tierQueryParams(2, targeting)!, { fts: true, sizes: sizes(1_800, 1) });
    expect(t2.byIndustry).toBe(true);
    expect(audiencePageQuery(tierQueryParams(2, targeting)!, 0, 5, t2).bindings[0]).toMatch(/^\(job_title : .*\) AND \(industry : \("logistics"\)\)$/);
    expect(audiencePlan(tierQueryParams(2, targeting)!, { fts: true, sizes: sizes(3_000_000, 1) }).byIndustry).toBe(false);
    // Unknown sizes (no facet cache): the industries drive.
    expect(audiencePlan(t3, { fts: true, sizes: sizes(0, 0, 0) }).byIndustry).toBe(true);
    // Names the FTS tokenizer folds differently are not used as an FTS term.
    expect(audiencePlan({ ...t3, industries: ["Café"] }, { fts: true, sizes: sizes(0, 1) }).byIndustry).toBe(false);
    // No FTS index: plain SQL.
    expect(audiencePlan(t3, { fts: false }).byIndustry).toBe(false);
  });

  it("lets the worker stop a query: directory_alive() on every row", () => {
    const db = directory();
    let calls = 0;
    db.function("directory_alive", { deterministic: false }, () => {
      calls++;
      return 1;
    });
    for (const byIndustry of [true, false]) {
      const q = audiencePageQuery(tierQueryParams(3, targeting)!, 0, 1000, { fts: true, byIndustry, alive: true });
      expect(q.sql).toContain("directory_alive()");
      calls = 0;
      expect((db.prepare(q.sql).all(...(q.bindings as any[])) as any[]).length).toBe(expected(db, 3, "all").length);
      expect(calls).toBeGreaterThan(0);
      const c = audienceCountQuery(tierQueryParams(3, targeting)!, { fts: true, byIndustry, alive: true });
      expect(c.sql).toContain("directory_alive()");
    }
    expect(audiencePageQuery(tierQueryParams(3, targeting)!, 0, 10, true).sql).not.toContain("directory_alive");
  });

  it("seeks from the cursor instead of collecting every match on every page", () => {
    const db = directory();
    const q = audiencePageQuery(tierQueryParams(2, targeting, "rest")!, 100, 50, true);
    const plan = (db.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...(q.bindings as any[])) as any[]).map((r) => r.detail).join(" | ");
    expect(plan).toMatch(/SCAN leads_fts VIRTUAL TABLE/);
    expect(plan).toMatch(/SEARCH leads USING INTEGER PRIMARY KEY/);
    expect(plan).not.toMatch(/LIST SUBQUERY|TEMP B-TREE/);
    // Keyset binding order the launch test fakes rely on: ..., afterId, limit.
    expect(q.bindings.slice(-2)).toEqual([100, 50]);
  });
});
