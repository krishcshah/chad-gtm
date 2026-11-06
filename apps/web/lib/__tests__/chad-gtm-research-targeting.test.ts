import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../leads-directory", () => ({
  getDirectoryFacets: () => ({
    totalLeads: 100,
    industries: ["Restaurants", "Real Estate", "Financial Services", "Hospital & Health Care", "Logistics and Supply Chain"].map(
      (value, i) => ({ value, label: value, count: 100 - i }),
    ),
    countries: [],
    revenueRanges: [],
    teamSizes: [],
  }),
}));
vi.mock("../gtm-crawler", () => ({ crawlCompanyDomain: vi.fn() }));

import { synthesizeGtmStrategy, type ScrapedCompanyData } from "../chad-gtm-research";
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
