import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pickResearchLinks,
  clearCompanyResearchCache,
  companyDomain,
  fetchPageHtml,
  groundFacts,
  htmlToText,
  isFetchableUrl,
  isPublicAddress,
  researchCompany,
} from "../company-research";

const publicDns = async () => ["93.184.216.34"];
const html = `<html><head><title>Haulio | Regional freight</title><meta name="description" content="Regional freight carrier serving Texas retailers."></head>
<body><nav>Home About</nav><script>var x=1</script>
<h1>Freight that shows up</h1>
<p>Our new Dallas depot is now open, adding 40 trucks to our Texas network.</p>
<p>We move goods for grocery and home-improvement retailers across Texas and Oklahoma.</p>
${"<p>More about how we work with shippers every day across the region.</p>".repeat(3)}
</body></html>`;

const htmlResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });

afterEach(() => clearCompanyResearchCache());

describe("network safety", () => {
  it("only allows public addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.20.1.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
    expect(isPublicAddress("93.184.216.34")).toBe(true);
  });

  it("refuses IPs, ports, credentials, other schemes and private DNS answers", async () => {
    expect(await isFetchableUrl("https://127.0.0.1/", publicDns)).toBe(false);
    expect(await isFetchableUrl("https://haulio.com:8080/", publicDns)).toBe(false);
    expect(await isFetchableUrl("https://user:pw@haulio.com/", publicDns)).toBe(false);
    expect(await isFetchableUrl("file:///etc/passwd", publicDns)).toBe(false);
    expect(await isFetchableUrl("https://haulio.com/", async () => ["10.0.0.1"])).toBe(false);
    expect(await isFetchableUrl("https://haulio.com/", publicDns)).toBe(true);
  });

  it("re-checks every redirect", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://localhost/admin" } }));
    expect(await fetchPageHtml("https://haulio.com/", { fetch, resolve: publicDns })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ignores non-HTML responses", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    expect(await fetchPageHtml("https://haulio.com/", { fetch, resolve: publicDns })).toBeNull();
  });
});

describe("parsing and grounding", () => {
  it("takes the domain from the website, else the work email", () => {
    expect(companyDomain("https://www.Haulio.com/about", null)).toBe("haulio.com");
    expect(companyDomain("", "marco@haulio.com")).toBe("haulio.com");
    expect(companyDomain("not a site", null)).toBe("");
  });

  it("turns HTML into readable text without scripts or navigation", () => {
    const text = htmlToText(html);
    expect(text).toContain("Our new Dallas depot is now open");
    expect(text).toContain("Regional freight carrier serving Texas retailers.");
    expect(text).not.toContain("var x");
    expect(text).not.toContain("Home About");
  });

  it("keeps only relevant, quoted, fully supported facts about the company's own operations", () => {
    const page = htmlToText(html);
    const ok = { subject: "company_ops", relevance: 3 };
    const facts = groundFacts(
      [
        { ...ok, fact: "Haulio opened a Dallas depot.", quote: "Our new Dallas depot is now open" },
        { ...ok, fact: "Haulio won an award.", quote: "Winner of the 2025 freight excellence award" },
        { ...ok, fact: "Too short quote.", quote: "Texas" },
        // Name in the fact that is not in its quote ("Oklahoma City").
        { ...ok, fact: "Haulio opened a depot in Oklahoma City.", quote: "Our new Dallas depot is now open" },
        { ...ok, subject: "product", fact: "Haulio moves goods for retailers.", quote: "We move goods for grocery and home-improvement retailers" },
        { subject: "company_ops", relevance: 1, fact: "Haulio serves Texas and Oklahoma.", quote: "retailers across Texas and Oklahoma" },
      ],
      page,
      "Haulio",
    );
    expect(facts.map((f) => f.fact)).toEqual(["Haulio opened a Dallas depot."]);
  });

  it("never treats a customer count as the company's own scale", () => {
    const page = "Toast POS is trusted by 189,000 locations like yours.";
    const facts = groundFacts(
      [{ subject: "company_ops", relevance: 3, fact: "Toast has 189,000 locations.", quote: "trusted by 189,000 locations like yours" }],
      page,
      "Toast",
    );
    expect(facts).toEqual([]);
  });

  it("picks one news, careers and about page from the homepage links", () => {
    const home = `<a href="/news">News</a><a href="/news/2026/big-launch">x</a><a href="https://other.com/press">p</a>
      <a href="/careers">Jobs</a><a href="/about-us">About</a><a href="/pricing">Pricing</a><a href="mailto:x@y.com">m</a>`;
    expect(pickResearchLinks(home, "https://haulio.com/")).toEqual([
      "https://haulio.com/news",
      "https://haulio.com/careers",
      "https://haulio.com/about-us",
    ]);
  });
});

describe("researchCompany", () => {
  it("reads the site once per domain and returns grounded facts", async () => {
    const fetch = vi.fn().mockResolvedValue(htmlResponse(html));
    const llm = vi.fn().mockResolvedValue({
      summary: "Regional freight carrier for Texas retailers.",
      sellsTo: "retailers",
      sizeHint: "mid-market",
      systems: ["NetSuite"],
      facts: [
        { subject: "company_ops", relevance: 3, fact: "Opened a Dallas depot.", quote: "Our new Dallas depot is now open" },
        { subject: "company_ops", relevance: 3, fact: "Invented.", quote: "We are the largest carrier in America" },
      ],
    });
    const deps = { fetch, resolve: publicDns, llm };
    const a = await researchCompany({ company: "Haulio", website: "haulio.com" }, deps);
    const b = await researchCompany({ company: "Haulio", email: "dana@haulio.com" }, deps);
    expect(a?.fetched).toBe(true);
    expect(a?.facts).toHaveLength(1);
    // NetSuite is not named on the page, so it is not reported as a system they use.
    expect(a?.systems).toEqual([]);
    expect(a?.sizeHint).toBe("mid-market");
    expect(b).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("returns an empty result (not an error) when the site cannot be read", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("timeout"));
    const llm = vi.fn();
    const r = await researchCompany({ website: "haulio.com" }, { fetch, resolve: publicDns, llm });
    expect(r).toMatchObject({ domain: "haulio.com", fetched: false, facts: [] });
    expect(llm).not.toHaveBeenCalled();
  });

  it("does nothing without a usable domain", async () => {
    expect(await researchCompany({ website: "" }, { llm: vi.fn() })).toBeNull();
  });
});
