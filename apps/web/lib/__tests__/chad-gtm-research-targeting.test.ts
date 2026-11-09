import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../leads-directory", () => ({
  getDirectoryFacets: () => ({
    totalLeads: 100,
    industries: [
      "Restaurants",
      "Real Estate",
      "Financial Services",
      "Hospital & Health Care",
      "Logistics and Supply Chain",
    ].map(
      (value, i) => ({ value, label: value, count: 100 - i }),
    ),
    countries: [],
    revenueRanges: [],
    teamSizes: [],
  }),
}));
vi.mock("../gtm-crawler", () => ({ crawlCompanyDomain: vi.fn() }));
vi.mock("../directory-search-async", () => ({ directoryIndustriesAsync: vi.fn(async () => null) }));

import { matchIndustriesInNotes, synthesizeGtmStrategy, type ScrapedCompanyData } from "../chad-gtm-research";
import { assessTargeting } from "../autopilot-policy";

const KEYS = ["OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

function scraped(overrides: Partial<ScrapedCompanyData> = {}): ScrapedCompanyData {
  return {
    url: "https://acme.test",
    domain: "acme.test",
    title: "Acme",
    description: "Route planning software.",
    headings: [],
    bodySnippets: [],
    subpageSnippets: [],
    combinedCorpus: "Acme plans delivery routes.",
    fetchFailed: false,
    ...overrides,
  };
}

describe("synthesizeGtmStrategy targeting provenance (no AI key)", () => {
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
  });

  it("marks invented directory-default targeting as simulated so autopilot will not launch", async () => {
    const s = await synthesizeGtmStrategy(scraped());
    expect(s.icpProfile.targetingSource).toBe("simulated");
    expect(s.icpProfile.targetingGrounded).toBe(false);
    expect(assessTargeting(s.icpProfile).grounded).toBe(false);
  });

  it("grounds targeting in industries the client's site names", async () => {
    const s = await synthesizeGtmStrategy(
      scraped({ combinedCorpus: "Route planning for logistics and supply chain teams. Built for logistics and supply chain." }),
    );
    expect(s.icpProfile.targetingSource).toBe("heuristic");
    expect(s.icpProfile.industries).toEqual(["Logistics and Supply Chain"]);
    expect(assessTargeting(s.icpProfile).grounded).toBe(true);
  });

  it("uses the client's notes as a grounding source", async () => {
    const s = await synthesizeGtmStrategy(scraped(), "We sell to hospital & health care providers");
    expect(s.icpProfile.industries).toContain("Hospital & Health Care");
    expect(assessTargeting(s.icpProfile).grounded).toBe(true);
  });

  it("ignores the crawl when the site could not be read", async () => {
    const s = await synthesizeGtmStrategy(
      scraped({ fetchFailed: true, combinedCorpus: "real estate real estate", failureReason: "403" }),
    );
    expect(s.icpProfile.targetingSource).toBe("simulated");
    expect(s.icpProfile.targetingIssue).toMatch(/couldn't read your website/);
  });

  it("marks an LLM failure as simulated", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await synthesizeGtmStrategy(scraped());
    expect(s.icpProfile.targetingSource).toBe("simulated");
  });

  it("marks model output with no directory industries as not grounded", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  companyName: "Acme",
                  icpProfile: { industries: ["Made Up Industry"], targetTitles: ["COO"] },
                  offers: [],
                }),
              },
            ],
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const s = await synthesizeGtmStrategy(scraped());
    expect(s.icpProfile.targetingSource).toBe("simulated");
    expect(assessTargeting(s.icpProfile).grounded).toBe(false);
  });

  it("accepts model-chosen directory industries and titles", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  companyName: "Acme",
                  icpProfile: { industries: ["Logistics and Supply Chain"], targetTitles: ["Head of Logistics"] },
                  offers: [],
                }),
              },
            ],
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const s = await synthesizeGtmStrategy(scraped());
    expect(s.icpProfile.targetingSource).toBe("ai");
    expect(assessTargeting(s.icpProfile).grounded).toBe(true);
  });
});

function geminiBody(icpProfile: Record<string, unknown>) {
  return {
    candidates: [
      { content: { parts: [{ text: JSON.stringify({ companyName: "Acme", icpProfile, offers: [] }) }] } },
    ],
  };
}

describe("targeting from the client's notes", () => {
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
  });

  const blocked = () => scraped({ fetchFailed: true, combinedCorpus: "", failureReason: "403" });

  it("lets a blocked site leave needs_research when the notes name the audience (AI key set)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify(geminiBody({ industries: ["Logistics and Supply Chain"], targetTitles: ["Operations Manager"] })),
          { status: 200 },
        ),
      ),
    );
    const s = await synthesizeGtmStrategy(blocked(), "We sell to logistics companies");
    expect(s.icpProfile.targetingSource).toBe("ai");
    expect(s.icpProfile.targetingGrounded).toBe(true);
    expect(assessTargeting(s.icpProfile).grounded).toBe(true);
  });

  it("still refuses a blocked site with no notes (AI key set)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(geminiBody({ industries: ["Restaurants"], targetTitles: ["Owner"] })), { status: 200 }),
      ),
    );
    const s = await synthesizeGtmStrategy(blocked());
    expect(s.icpProfile.targetingGrounded).toBe(false);
    expect(s.icpProfile.targetingIssue).toMatch(/couldn't read your website/);
  });

  it("falls back to industries the notes name when the model picks none (AI key set)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(geminiBody({ industries: [], targetTitles: [] })), { status: 200 })),
    );
    const s = await synthesizeGtmStrategy(blocked(), "dental clinics");
    expect(s.icpProfile.targetingSource).toBe("heuristic");
    expect(s.icpProfile.industries).toEqual(["Hospital & Health Care"]);
    expect(s.icpProfile.targetTitles).toEqual(["Founder", "Owner", "CEO", "President"]);
    expect(assessTargeting(s.icpProfile).grounded).toBe(true);
  });

  it("grounds the suggested examples in heuristic mode (no AI key)", async () => {
    const dental = await synthesizeGtmStrategy(blocked(), "dental clinics");
    expect(dental.icpProfile.targetingSource).toBe("heuristic");
    expect(assessTargeting(dental.icpProfile).grounded).toBe(true);

    const logistics = await synthesizeGtmStrategy(scraped(), "logistics companies");
    expect(logistics.icpProfile.industries).toEqual(["Logistics and Supply Chain"]);
    expect(assessTargeting(logistics.icpProfile).grounded).toBe(true);
  });
});

describe("matchIndustriesInNotes", () => {
  const directory = [
    "Restaurants",
    "Real Estate",
    "Financial Services",
    "Hospital & Health Care",
    "Law Practice",
    "Medical Practice",
    "Logistics and Supply Chain",
    "Logistics And Supply Chain",
    "Real Estate,Residential Real Estate,Commercial Real Estate",
    "Health, Wellness and Fitness",
  ];

  it("matches the examples the UI suggests", () => {
    expect(matchIndustriesInNotes("dental clinics", directory)).toEqual(["Hospital & Health Care", "Medical Practice"]);
    expect(matchIndustriesInNotes("logistics companies", directory)).toEqual(["Logistics and Supply Chain"]);
    expect(matchIndustriesInNotes('"dental clinics" or "logistics companies"', directory)).toContain(
      "Logistics and Supply Chain",
    );
  });

  it("matches one plain mention, plurals and synonyms", () => {
    expect(matchIndustriesInNotes("restaurant owners", directory)).toEqual(["Restaurants"]);
    expect(matchIndustriesInNotes("law firms and attorneys", directory)).toEqual(["Law Practice"]);
    expect(matchIndustriesInNotes("gyms and fitness studios", directory)).toEqual(["Health, Wellness and Fitness"]);
  });

  it("ignores generic words, compound facets and prototype keys", () => {
    expect(matchIndustriesInNotes("services for real people", directory)).toEqual([]);
    expect(matchIndustriesInNotes("constructor toString __proto__", directory)).toEqual([]);
    expect(matchIndustriesInNotes("", directory)).toEqual([]);
    expect(matchIndustriesInNotes("real estate agents", directory)).toEqual(["Real Estate"]);
  });

  it("only returns industries that exist in the directory", () => {
    expect(matchIndustriesInNotes("dental clinics", ["Restaurants"])).toEqual([]);
  });
});

describe("matchIndustriesInNotes generic words", () => {
  it("does not match on plural generic words like 'institutions' or 'supplies'", () => {
    const directory = ["Museums and Institutions", "Business Supplies and Equipment", "Restaurants"];
    expect(matchIndustriesInNotes("financial institutions", directory)).toEqual([]);
    expect(matchIndustriesInNotes("office supplies", directory)).toEqual([]);
    expect(matchIndustriesInNotes("museums", directory)).toEqual(["Museums and Institutions"]);
  });
});
