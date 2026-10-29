import * as cheerio from "cheerio";

export interface CrawledPageContent {
  url: string;
  path: string;
  title: string;
  description: string;
  headings: string[];
  keyParagraphs: string[];
  pricingSignals: string[];
  featuresAndBullets: string[];
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
 * Distills raw HTML into clean, structured content using Cheerio.
 */
export function distillHtml(html: string, pageUrl: string): CrawledPageContent {
  const $ = cheerio.load(html);

  // Extract metadata before stripping elements
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

  // Extract structured headings
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length >= 4 && text.length <= 150 && !headings.includes(text)) {
      headings.push(text);
    }
  });

  // Extract bullet points / feature lists
  const featuresAndBullets: string[] = [];
  $("li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length >= 15 && text.length <= 250 && !featuresAndBullets.includes(text)) {
      featuresAndBullets.push(text);
    }
  });

  // Extract paragraphs
  const keyParagraphs: string[] = [];
  $("p").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length >= 35 && text.length <= 500 && !keyParagraphs.includes(text)) {
      keyParagraphs.push(text);
    }
  });

  // Look for pricing signals
  const pricingSignals: string[] = [];
  $(
    "[class*='pricing'], [class*='price'], [id*='pricing'], [id*='price'], [class*='tier'], [class*='plan']"
  ).each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length >= 20 && text.length <= 300 && !pricingSignals.includes(text)) {
      pricingSignals.push(text);
    }
  });

  let pagePath = "/";
  try {
    pagePath = new URL(pageUrl).pathname || "/";
  } catch {
    // Keep fallback
  }

  return {
    url: pageUrl,
    path: pagePath,
    title,
    description,
    headings: headings.slice(0, 15),
    keyParagraphs: keyParagraphs.slice(0, 15),
    pricingSignals: pricingSignals.slice(0, 8),
    featuresAndBullets: featuresAndBullets.slice(0, 15),
  };
}

/**
 * Discovers prospective subpage links from the root page HTML.
 */
function discoverSubpageLinks(html: string, rootUrl: string, rootDomain: string): string[] {
  const $ = cheerio.load(html);
  const discovered = new Set<string>();

  const PRIORITY_KEYWORDS = [
    "pricing",
    "price",
    "product",
    "features",
    "solutions",
    "about",
    "customers",
    "case-studies",
    "how-it-works",
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
      // Ignore anchors, file extensions, and auth/dashboard paths
      if (
        path === "/" ||
        path.includes("login") ||
        path.includes("signin") ||
        path.includes("signup") ||
        path.includes("auth") ||
        path.includes("app") ||
        path.includes("dashboard") ||
        /\.(png|jpg|jpeg|gif|svg|pdf|css|js|webp)$/i.test(path)
      ) {
        return;
      }

      const matchesPriority = PRIORITY_KEYWORDS.some((kw) => path.includes(kw));
      if (matchesPriority) {
        discovered.add(`${resolved.protocol}//${resolved.hostname}${resolved.pathname}`);
      }
    } catch {
      // Ignore malformed URLs
    }
  });

  return Array.from(discovered).slice(0, 3);
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
      featuresAndBullets: [],
    },
    subpages: [],
    combinedCorpus: "",
    fetchFailed: false,
  };

  try {
    const rootController = new AbortController();
    const timeout = setTimeout(() => rootController.abort(), 12000);

    const rootRes = await fetch(normalizedUrl, {
      headers: BROWSER_HEADERS,
      signal: rootController.signal,
      redirect: "follow",
    }).finally(() => clearTimeout(timeout));

    if (!rootRes.ok) {
      return {
        ...fallbackProfile,
        fetchFailed: true,
        failureReason: `HTTP ${rootRes.status} on root page`,
        combinedCorpus: `Domain: ${domain}\nTitle: ${domain}\nStatus: Could not crawl live root page (HTTP ${rootRes.status}).`,
      };
    }

    const rootHtml = await rootRes.text();
    const rootPageContent = distillHtml(rootHtml, normalizedUrl);

    // Discover high-value subpages
    const candidateSubpageUrls = discoverSubpageLinks(rootHtml, normalizedUrl, domain);

    // Concurrently crawl candidate subpages
    const subpages: CrawledPageContent[] = [];
    if (candidateSubpageUrls.length > 0) {
      const subpageResults = await Promise.allSettled(
        candidateSubpageUrls.map(async (subUrl) => {
          const subController = new AbortController();
          const subTimeout = setTimeout(() => subController.abort(), 8000);
          try {
            const res = await fetch(subUrl, {
              headers: BROWSER_HEADERS,
              signal: subController.signal,
              redirect: "follow",
            }).finally(() => clearTimeout(subTimeout));

            if (!res.ok) return null;
            const html = await res.text();
            return distillHtml(html, subUrl);
          } catch {
            return null;
          }
        })
      );

      for (const res of subpageResults) {
        if (res.status === "fulfilled" && res.value) {
          subpages.push(res.value);
        }
      }
    }

    // Build synthesized combined text corpus for LLM analysis
    const corpusSections: string[] = [
      `=== DOMAIN: ${domain} ===`,
      `=== HOMEPAGE TITLE: ${rootPageContent.title} ===`,
      `=== META DESCRIPTION: ${rootPageContent.description} ===`,
      `=== KEY HEADINGS ===\n${rootPageContent.headings.map((h) => `- ${h}`).join("\n")}`,
      `=== VALUE PROPOSITIONS & PARAGRAPHS ===\n${rootPageContent.keyParagraphs.join("\n\n")}`,
      `=== FEATURE HIGHLIGHTS ===\n${rootPageContent.featuresAndBullets.map((f) => `* ${f}`).join("\n")}`,
    ];

    if (rootPageContent.pricingSignals.length > 0) {
      corpusSections.push(
        `=== PRICING & PLAN SIGNALS ===\n${rootPageContent.pricingSignals.join("\n")}`
      );
    }

    for (const sub of subpages) {
      corpusSections.push(
        `\n=== SUBPAGE: ${sub.path} (${sub.title}) ===\n${sub.headings.map((h) => `## ${h}`).join("\n")}\n${sub.keyParagraphs.join("\n\n")}`
      );
      if (sub.pricingSignals.length > 0) {
        corpusSections.push(`Pricing Context (${sub.path}):\n${sub.pricingSignals.join("\n")}`);
      }
    }

    const combinedCorpus = corpusSections.join("\n\n");

    return {
      rawUrl,
      normalizedUrl,
      domain,
      rootPage: rootPageContent,
      subpages,
      combinedCorpus,
      fetchFailed: false,
    };
  } catch (error: any) {
    return {
      ...fallbackProfile,
      fetchFailed: true,
      failureReason: error?.message || "Crawler connection timed out or blocked",
      combinedCorpus: `Domain: ${domain}\nTitle: ${domain}\nStatus: Crawler encountered connection error: ${error?.message || "Timeout"}`,
    };
  }
}
