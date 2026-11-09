import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Research may target any directory industry, not only the 40 largest. */

const INDUSTRIES = Array.from({ length: 120 }, (_, i) => `Industry ${i + 1}`).concat(["Logistics and Supply Chain", "Hospital & Health Care"]);

vi.mock("../leads-directory", () => ({
  getDirectoryFacets: () => ({
    totalLeads: 1000,
    industries: INDUSTRIES.map((value, i) => ({ value, label: value, count: 1000 - i })),
    countries: [],
    revenueRanges: [],
    teamSizes: [],
  }),
}));
vi.mock("../gtm-crawler", () => ({ crawlCompanyDomain: vi.fn() }));
// Every distinct industry in the directory (read in the worker): more than the facet cache keeps.
const dirList = vi.hoisted(() => ({ values: null as string[] | null }));
vi.mock("../directory-search-async", () => ({ directoryIndustriesAsync: vi.fn(async () => dirList.values) }));

import {
  matchDirectoryIndustries,
  researchIndustries,
  synthesizeGtmStrategy,
  type ScrapedCompanyData,
} from "../chad-gtm-research";

const scraped: ScrapedCompanyData = {
  url: "https://acme.test",
  domain: "acme.test",
  title: "Acme",
  description: "Route planning software.",
  headings: [],
  bodySnippets: [],
  subpageSnippets: [],
  combinedCorpus: "Acme plans delivery routes.",
  fetchFailed: false,
} as ScrapedCompanyData;

describe("matchDirectoryIndustries", () => {
  it("maps the model's names to exact directory values", () => {
    expect(
      matchDirectoryIndustries(
        ["logistics & supply chain", "Hospital and Health Care", "Industry 99", "Made Up", "Industry 99", 7, null],
        INDUSTRIES,
      ),
    ).toEqual(["Logistics and Supply Chain", "Hospital & Health Care", "Industry 99"]);
  });

  it("keeps at most five and ignores non-lists", () => {
    expect(matchDirectoryIndustries(INDUSTRIES, INDUSTRIES)).toHaveLength(5);
    expect(matchDirectoryIndustries("Industry 1", INDUSTRIES)).toEqual([]);
  });
});

describe("researchIndustries", () => {
  it("lists the facet cache's largest first, then every other directory value once", () => {
    expect(researchIndustries(["B", "A"], ["A", "C", "B", "D"])).toEqual(["B", "A", "C", "D"]);
    expect(researchIndustries(["B", "A"], null)).toEqual(["B", "A"]);
  });
});

describe("research industries (AI key set)", () => {
  const saved = process.env.GEMINI_API_KEY;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    dirList.values = null;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
    vi.unstubAllGlobals();
  });

  it("offers every directory industry and accepts one outside the 40 largest", async () => {
    let prompt = "";
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  companyName: "Acme",
                  icpProfile: { industries: ["industry 101", "Logistics & Supply Chain"], targetTitles: ["Head of Logistics"] },
                  offers: [],
                }),
              },
            ],
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        prompt = init.body;
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const s = await synthesizeGtmStrategy(scraped);
    expect(prompt).toContain("Industry 101");
    expect(prompt).toContain("Hospital & Health Care");
    expect(s.icpProfile.industries).toEqual(["Industry 101", "Logistics and Supply Chain"]);
    expect(s.icpProfile.targetingSource).toBe("ai");
  });

  it("accepts a real directory industry the facet cache does not list (validated against every distinct value)", async () => {
    // 400 more industries than the cache holds; the model names one far down the list.
    dirList.values = [...INDUSTRIES, ...Array.from({ length: 400 }, (_, i) => `Niche ${i + 1}`)];
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  companyName: "Acme",
                  icpProfile: { industries: ["niche 350", "Not A Directory Value"], targetTitles: ["Head of Logistics"] },
                  offers: [],
                }),
              },
            ],
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const s = await synthesizeGtmStrategy(scraped);
    expect(s.icpProfile.industries).toEqual(["Niche 350"]);
  });
});
