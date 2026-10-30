import fs from "node:fs";
import * as cheerio from "cheerio";

export interface PricingTier {
  name: string;
  price: string;
  features: string[];
}

export interface CrawledPageContent {
  url: string;
  path: string;
  title: string;
  description: string;
  headings: string[];
  keyParagraphs: string[];
  pricingSignals: string[];
  pricingTiers: PricingTier[];
  featuresAndBullets: string[];
  caseStudySignals: string[];
  competitorSignals: string[];
  wordCount: number;
  renderedWith: "static" | "headless";
}

export interface CrawledCompanyProfile {
  rawUrl: string;
  normalizedUrl: string;
  domain: string;
  rootPage: CrawledPageContent;
  subpages: CrawledPageContent[];
  combinedCorpus: string;
  fetchFailed: boolean;
  failureReason?: string;
  usedHeadlessFallback: boolean;
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const MAX_SUBPAGES = 5;
const MAX_CORPUS_CHARS = 28_000;
const STATIC_TIMEOUT_MS = 12_000;
const SUBPAGE_TIMEOUT_MS = 8_000;
const HEADLESS_TIMEOUT_MS = 20_000;
const THIN_WORD_THRESHOLD = 120;

export function normalizeTargetUrl(rawUrl: string): { normalizedUrl: string; domain: string } {
  let cleaned = rawUrl.trim();
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  try {
    const parsed = new URL(cleaned);
    const domain = parsed.hostname.replace(/^www\./i, "");
    return {
      normalizedUrl: `${parsed.protocol}//${parsed.hostname}`,
      domain,
    };
  } catch {
    const fallbackDomain = cleaned.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "");
    return {
      normalizedUrl: `https://${fallbackDomain}`,
      domain: fallbackDomain,
    };
  }
}

/**
 * Reject loopback, link-local and RFC1918 targets before fetching. The crawler
 * accepts user-supplied URLs, so this closes the obvious SSRF surface without
 * requiring a DNS resolver round-trip on every page load.
 */
export function isPublicHttpUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    return false;
  }

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
  }

  if (hostname.includes(":")) {
    if (
      hostname === "::1" ||
      hostname === "::" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80")
    ) {
      return false;
    }
  }

  return true;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function uniquePush(target: string[], value: string, max = 12, minLen = 4, maxLen = 500) {
  const cleaned = normalizeWhitespace(value);
  if (cleaned.length < minLen || cleaned.length > maxLen) return;
  if (target.includes(cleaned)) return;
  if (target.length < max) target.push(cleaned);
}

const ROI_METRIC_RE =
  /(?:\$\s?\d[\d,.]*\s?[kmb]?|\d[\d,.]*\s?%|\d+(?:\.\d+)?x\b|\b\d+\s?(?:days?|hours?|weeks?|months?)\b)/i;
const PROOF_RE =
  /(?:case study|customer story|customers?\b|clients?\b|results?\b|testimonial|success story|trusted by|used by|proof|benchmark|teams?\b|companies\b)/i;
const COMPETITOR_RE =
  /(?:unlike|compared (?:to|with)|vs\.?\s|versus|alternative(?:s)? to|better than|replaces?|switch(?:ing)? from|migrat(?:e|ing) from)/i;

/**
 * Distills raw HTML into clean, structured content using Cheerio.
 */
export function distillHtml(
  html: string,
  pageUrl: string,
  renderedWith: "static" | "headless" = "static"
): CrawledPageContent {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").first().text().trim() ||
    "";

  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="twitter:description"]').attr("content") ||
    "";

  // Remove boilerplate & non-content elements
  $(
    "script, style, svg, noscript, iframe, link, meta, nav, footer, header, form, " +
      ".cookie-banner, #cookie-consent, [role='banner'], [role='contentinfo'], " +
      ".nav, .navbar, .footer, .menu, #menu, .sidebar"
  ).remove();

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    uniquePush(headings, $(el).text(), 15, 4, 150);
  });

  const featuresAndBullets: string[] = [];
  $("li").each((_, el) => {
    uniquePush(featuresAndBullets, $(el).text(), 15, 15, 250);
  });

  const keyParagraphs: string[] = [];
  const caseStudySignals: string[] = [];
  const competitorSignals: string[] = [];

  $("p, blockquote, li").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text.length < 35 || text.length > 500) return;
    uniquePush(keyParagraphs, text, 15, 35, 500);
    if (PROOF_RE.test(text) && ROI_METRIC_RE.test(text)) {
      uniquePush(caseStudySignals, text, 8, 25, 400);
    }
    if (COMPETITOR_RE.test(text)) {
      uniquePush(competitorSignals, text, 8, 25, 400);
    }
  });

  // Also catch ROI metrics in headings (common in case-study cards).
  $("h2, h3, h4, [class*='stat'], [class*='metric'], [class*='result']").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text.length >= 8 && text.length <= 200 && ROI_METRIC_RE.test(text)) {
      uniquePush(caseStudySignals, text, 10, 8, 200);
    }
  });

  const pricingSignals: string[] = [];
  $(
    "[class*='pricing'], [class*='price'], [id*='pricing'], [id*='price'], [class*='tier'], [class*='plan']"
  ).each((_, el) => {
    uniquePush(pricingSignals, $(el).text(), 8, 20, 300);
  });

  const pricingTiers: PricingTier[] = [];
  const seenTierKeys = new Set<string>();
  $("[class*='tier'], [class*='plan'], [class*='pricing-card'], [data-plan]").each((_, el) => {
    if (pricingTiers.length >= 6) return;
    const container = $(el);
    const blockText = normalizeWhitespace(container.text());
    if (blockText.length < 10 || blockText.length > 800) return;

    const priceMatch = blockText.match(/(?:[$€£]\s?\d[\d,.]*(?:\s?\/\s?(?:mo|month|yr|year|user))?|free|contact sales)/i);
    const name =
      normalizeWhitespace(container.find("h2, h3, h4, h5, [class*='name'], [class*='title']").first().text()) ||
      "";
    const price = priceMatch?.[0] || "";
    if (!price && !name) return;

    const features: string[] = [];
    container.find("li").each((__, li) => {
      uniquePush(features, $(li).text(), 6, 3, 160);
    });

    const key = `${name.toLowerCase()}|${price.toLowerCase()}`;
    if (seenTierKeys.has(key)) return;
    seenTierKeys.add(key);
    pricingTiers.push({ name, price, features });
  });

  let pagePath = "/";
  try {
    pagePath = new URL(pageUrl).pathname || "/";
  } catch {
    // Keep fallback
  }

  const wordCount = normalizeWhitespace($("body").text()).split(/\s+/).filter(Boolean).length;

  return {
    url: pageUrl,
    path: pagePath,
    title,
    description,
    headings: headings.slice(0, 15),
    keyParagraphs: keyParagraphs.slice(0, 15),
    pricingSignals: pricingSignals.slice(0, 8),
    pricingTiers,
    featuresAndBullets: featuresAndBullets.slice(0, 15),
    caseStudySignals: caseStudySignals.slice(0, 10),
    competitorSignals: competitorSignals.slice(0, 8),
    wordCount,
    renderedWith,
  };
}

/**
 * Discovers prospective subpage links from the root page HTML, ranked by
 * commercial value (pricing → proof → positioning → product).
 */
function discoverSubpageLinks(html: string, rootUrl: string, rootDomain: string): string[] {
  const $ = cheerio.load(html);
  const discovered = new Map<string, number>();

  const PRIORITY: Array<[RegExp, number]> = [
    [/pricing|plans?|packages?/, 100],
    [/case-stud|customers?|results|testimonials?/, 90],
    [/about|company|team|story/, 80],
    [/solutions?|use-cases?|industries/, 70],
    [/product|platform|features|how-it-works/, 60],
    [/compare|vs\b|alternatives?/, 50],
  ];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const resolved = new URL(href, rootUrl);
      const subDomain = resolved.hostname.replace(/^www\./i, "");

      // Only follow internal links on the same domain
      if (subDomain !== rootDomain) return;

      const path = resolved.pathname.toLowerCase();
      if (
        path === "/" ||
        path.includes("login") ||
        path.includes("signin") ||
        path.includes("signup") ||
        path.includes("auth") ||
        path.includes("dashboard") ||
        path.includes("account") ||
        path.includes("cart") ||
        path.includes("checkout") ||
        /\.(png|jpg|jpeg|gif|svg|pdf|css|js|webp|ico|xml|txt)$/i.test(path)
      ) {
        return;
      }

      const score = PRIORITY.reduce(
        (best, [re, weight]) => (re.test(path) ? Math.max(best, weight) : best),
        0
      );
      if (score === 0) return;

      const url = `${resolved.protocol}//${resolved.hostname}${resolved.pathname}`;
      discovered.set(url, Math.max(discovered.get(url) ?? 0, score));
    } catch {
      // Ignore malformed URLs
    }
  });

  return Array.from(discovered.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUBPAGES)
    .map(([url]) => url);
}

/**
 * When Cheerio sees an empty shell (client-rendered SPA), re-render with a
 * real Chromium instance. Browser resolution is explicit so production can
 * point at a system Chromium without shipping one in the repo.
 */
function resolveChromeExecutable(): string | null {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/snap/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Ignore unreadable candidates
    }
  }
  return null;
}

function isThinContent(page: CrawledPageContent): boolean {
  const substantive = page.headings.length + page.keyParagraphs.length + page.featuresAndBullets.length;
  return page.wordCount < THIN_WORD_THRESHOLD || substantive < 4;
}

class HeadlessRenderer {
  private browser: any = null;
  private launching: Promise<any> | null = null;
  private unavailable = false;

  private async getBrowser(): Promise<any> {
    if (this.browser) return this.browser;
    if (this.launching) return this.launching;
    const executablePath = resolveChromeExecutable();
    if (!executablePath) {
      this.unavailable = true;
      console.warn("[gtm-crawler] No Chromium executable found; skipping headless fallback.");
      return null;
    }
    this.launching = (async () => {
      const puppeteer = await import("puppeteer-core");
      const launch = (puppeteer as any).default?.launch ?? (puppeteer as any).launch;
      this.browser = await launch({
        executablePath,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--disable-background-networking",
        ],
        protocolTimeout: HEADLESS_TIMEOUT_MS,
      });
      return this.browser;
    })();
    try {
      return await this.launching;
    } catch (err: any) {
      this.unavailable = true;
      console.warn("[gtm-crawler] Chromium launch failed:", err?.message || err);
      return null;
    } finally {
      this.launching = null;
    }
  }

  async render(url: string): Promise<string | null> {
    if (this.unavailable) return null;
    const browser = await this.getBrowser();
    if (!browser) return null;

    try {
      const page = await browser.newPage();
      try {
        await page.setUserAgent(BROWSER_HEADERS["User-Agent"]);
        await page.setExtraHTTPHeaders({ "Accept-Language": BROWSER_HEADERS["Accept-Language"] });
        await page.goto(url, { waitUntil: "networkidle2", timeout: HEADLESS_TIMEOUT_MS });
        // Give hydrating frameworks a short window to paint above-the-fold copy.
        await page.waitForFunction(
          () => (document.body?.innerText || "").trim().split(/\s+/).length >= 40,
          { timeout: 4_000 }
        ).catch(() => undefined);
        return await page.content();
      } finally {
        await page.close().catch(() => undefined);
      }
    } catch (err: any) {
      console.warn(`[gtm-crawler] Headless render failed for ${url}:`, err?.message || err);
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }
}

async function fetchStatic(url: string, timeoutMs: number): Promise<string | null> {
  if (!isPublicHttpUrl(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const finalUrl = res.url || url;
    if (!isPublicHttpUrl(finalUrl)) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Autonomous multi-tier crawler for company analysis.
 */
export async function crawlCompanyDomain(rawUrl: string): Promise<CrawledCompanyProfile> {
  const { normalizedUrl, domain } = normalizeTargetUrl(rawUrl);

  const fallbackProfile: CrawledCompanyProfile = {
    rawUrl,
    normalizedUrl,
    domain,
    rootPage: {
      url: normalizedUrl,
      path: "/",
      title: domain,
      description: `Leading provider of modern solutions and services on ${domain}.`,
      headings: [],
      keyParagraphs: [],
      pricingSignals: [],
      pricingTiers: [],
      featuresAndBullets: [],
      caseStudySignals: [],
      competitorSignals: [],
      wordCount: 0,
      renderedWith: "static",
    },
    subpages: [],
    combinedCorpus: "",
    fetchFailed: false,
    usedHeadlessFallback: false,
  };

  if (!isPublicHttpUrl(normalizedUrl)) {
    return {
      ...fallbackProfile,
      fetchFailed: true,
      failureReason: "URL resolves to a private, loopback, or non-HTTP target.",
      combinedCorpus: `Domain: ${domain}\nStatus: Refused to crawl a non-public URL.`,
    };
  }

  const renderer = new HeadlessRenderer();
  let usedHeadlessFallback = false;

  try {
    const rootHtml = await fetchStatic(normalizedUrl, STATIC_TIMEOUT_MS);
    if (!rootHtml) {
      // Static fetch blocked (bot wall / JS-only response) — try a browser once.
      const rendered = await renderer.render(normalizedUrl);
      if (!rendered) {
        return {
          ...fallbackProfile,
          fetchFailed: true,
          failureReason: "Root page could not be fetched (HTTP error, timeout, or bot wall).",
          combinedCorpus: `Domain: ${domain}\nTitle: ${domain}\nStatus: Could not crawl live root page.`,
        };
      }
      usedHeadlessFallback = true;
      const rootPageContent = distillHtml(rendered, normalizedUrl, "headless");
      return finalizeProfile({
        rawUrl,
        normalizedUrl,
        domain,
        rootPage: rootPageContent,
        subpages: [],
        combinedCorpus: buildCorpus(domain, rootPageContent, []),
        fetchFailed: false,
        usedHeadlessFallback,
      });
    }

    let rootPageContent = distillHtml(rootHtml, normalizedUrl, "static");

    // SPA / hydration shell: static HTML is structurally empty, so re-render.
    if (isThinContent(rootPageContent)) {
      const rendered = await renderer.render(normalizedUrl);
      if (rendered) {
        const hydrated = distillHtml(rendered, normalizedUrl, "headless");
        if (hydrated.wordCount > rootPageContent.wordCount) {
          rootPageContent = hydrated;
          usedHeadlessFallback = true;
        }
      }
    }

    // Discover high-value subpages from whichever root HTML was richest.
    const candidateSubpageUrls = discoverSubpageLinks(rootHtml, normalizedUrl, domain);

    const subpages: CrawledPageContent[] = [];
    const subpageResults = await Promise.allSettled(
      candidateSubpageUrls.map(async (subUrl) => {
        if (!isPublicHttpUrl(subUrl)) return null;
        const html = await fetchStatic(subUrl, SUBPAGE_TIMEOUT_MS);
        if (!html) return null;
        let page = distillHtml(html, subUrl, "static");
        if (isThinContent(page)) {
          const rendered = await renderer.render(subUrl);
          if (rendered) {
            const hydrated = distillHtml(rendered, subUrl, "headless");
            if (hydrated.wordCount > page.wordCount) {
              page = hydrated;
              usedHeadlessFallback = true;
            }
          }
        }
        return page;
      })
    );

    for (const res of subpageResults) {
      if (res.status === "fulfilled" && res.value) {
        subpages.push(res.value);
      }
    }

    return finalizeProfile({
      rawUrl,
      normalizedUrl,
      domain,
      rootPage: rootPageContent,
      subpages,
      combinedCorpus: buildCorpus(domain, rootPageContent, subpages),
      fetchFailed: false,
      usedHeadlessFallback,
    });
  } catch (error: any) {
    return {
      ...fallbackProfile,
      fetchFailed: true,
      failureReason: error?.message || "Crawler connection timed out or blocked",
      combinedCorpus: `Domain: ${domain}\nTitle: ${domain}\nStatus: Crawler encountered connection error: ${error?.message || "Timeout"}`,
    };
  } finally {
    await renderer.close();
  }
}

function finalizeProfile(profile: CrawledCompanyProfile): CrawledCompanyProfile {
  return {
    ...profile,
    combinedCorpus: profile.combinedCorpus.slice(0, MAX_CORPUS_CHARS),
  };
}

function buildCorpus(
  domain: string,
  root: CrawledPageContent,
  subpages: CrawledPageContent[]
): string {
  const sections: string[] = [
    `=== DOMAIN: ${domain} ===`,
    `=== HOMEPAGE TITLE: ${root.title} ===`,
    `=== META DESCRIPTION: ${root.description} ===`,
    `=== KEY HEADINGS ===\n${root.headings.map((h) => `- ${h}`).join("\n")}`,
    `=== VALUE PROPOSITIONS & PARAGRAPHS ===\n${root.keyParagraphs.join("\n\n")}`,
    `=== FEATURE HIGHLIGHTS ===\n${root.featuresAndBullets.map((f) => `* ${f}`).join("\n")}`,
  ];

  if (root.pricingSignals.length > 0 || root.pricingTiers.length > 0) {
    const tiers = root.pricingTiers
      .map((t) => `- ${t.name || "Tier"}: ${t.price || "n/a"}${t.features.length ? ` — ${t.features.join("; ")}` : ""}`)
      .join("\n");
    sections.push(
      `=== PRICING & PLAN SIGNALS ===\n${root.pricingSignals.join("\n")}${tiers ? `\n${tiers}` : ""}`
    );
  }

  if (root.caseStudySignals.length > 0) {
    sections.push(`=== CUSTOMER PROOF & ROI METRICS ===\n${root.caseStudySignals.map((s) => `- ${s}`).join("\n")}`);
  }

  if (root.competitorSignals.length > 0) {
    sections.push(`=== COMPETITOR / POSITIONING CONTRASTS ===\n${root.competitorSignals.map((s) => `- ${s}`).join("\n")}`);
  }

  for (const sub of subpages) {
    sections.push(
      `\n=== SUBPAGE: ${sub.path} (${sub.title}) ===\n${sub.headings.map((h) => `## ${h}`).join("\n")}\n${sub.keyParagraphs.join("\n\n")}`
    );
    if (sub.pricingSignals.length > 0 || sub.pricingTiers.length > 0) {
      sections.push(
        `Pricing Context (${sub.path}):\n${sub.pricingSignals.join("\n")}${
          sub.pricingTiers.length
            ? `\n${sub.pricingTiers.map((t) => `- ${t.name || "Tier"}: ${t.price || "n/a"}`).join("\n")}`
            : ""
        }`
      );
    }
    if (sub.caseStudySignals.length > 0) {
      sections.push(`Customer Proof (${sub.path}):\n${sub.caseStudySignals.map((s) => `- ${s}`).join("\n")}`);
    }
    if (sub.competitorSignals.length > 0) {
      sections.push(`Competitive Contrast (${sub.path}):\n${sub.competitorSignals.map((s) => `- ${s}`).join("\n")}`);
    }
  }

  return sections.join("\n\n");
}
