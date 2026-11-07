import { describe, expect, it } from "vitest";
import {
  classifyTier,
  countAudience,
  newAudienceState,
  pickNextLeads,
  refillTarget,
  tierQueryParams,
  type DirectoryPage,
} from "../autopilot-audience";
import type { DirectoryLead } from "../leads-directory";

const lead = (id: number, jobTitle: string, email = `p${id}@acme${id}.com`): DirectoryLead =>
  ({ id, jobTitle, email, workEmail: email, country: "United States", industry: "Logistics" }) as unknown as DirectoryLead;

/** A fake directory: rows filtered by the tier's title terms, paged by id. */
function fakeDirectory(rows: DirectoryLead[]): DirectoryPage {
  return (params, afterId, limit) => {
    const titles = (params as any).jobTitles as string[] | undefined;
    return rows
      .filter((r) => Number(r.id) > afterId)
      .filter((r) => !titles || titles.some((t) => r.jobTitle.toLowerCase().includes(t.toLowerCase())))
      .slice(0, limit);
  };
}

const passThrough = {
  contactable: (rows: DirectoryLead[]) => rows,
  blocked: async () => new Set<string>(),
};

const state = (targetTitles = ["head of operations"]) =>
  newAudienceState({ industries: ["Logistics"], targetTitles, countries: ["United States"], count: () => 0, now: new Date(0) });

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

  it("derives tier counts without double counting", () => {
    const counts = countAudience(
      { industries: ["Logistics"], targetTitles: ["coo"], countries: ["United States"] },
      (p: any) => (p.jobTitles?.includes("coo") ? 10 : p.jobTitles ? 40 : 100),
    );
    expect(counts).toEqual({ "1": 10, "2": 40, "3": 50 });
  });

  it("keeps about a week of new leads waiting and adds about two weeks at a time", () => {
    // 60 emails a day = 20 new leads a day (3 emails each).
    expect(refillTarget(60)).toEqual({ low: 100, batch: 200 });
    // 300 a day = 100 new leads a day.
    expect(refillTarget(300)).toEqual({ low: 500, batch: 1000 });
  });

  it("strict roles only ever uses Priority 1", () => {
    const s = newAudienceState({ industries: ["Logistics"], targetTitles: ["coo"], countries: ["United States"], strictRoles: true, count: () => 7 });
    expect(s.tiers["2"].exhausted && s.tiers["3"].exhausted).toBe(true);
    expect(tierQueryParams(2, s)).toBeNull();
    expect(s.tiers["1"].total).toBe(7);
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
