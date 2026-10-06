/**
 * ChadGTM Deep Autonomous Website & Company Research Engine.
 * Scrapes target domains, extracts brand and product signals,
 * and synthesizes Business Overview, ICP, and 3 distinct high-converting Offer Hooks.
 */

import { getDirectoryFacets } from "./leads-directory";
import type { AiEngineOptions } from "./ai";

export interface ScrapedCompanyData {
  url: string;
  domain: string;
  title: string;
  description: string;
  headings: string[];
  bodySnippets: string[];
  subpageSnippets: Array<{ path: string; text: string }>;
  fetchFailed: boolean;
  failureReason?: string;
}

export interface BusinessOverview {
  summary: string;
  valuePropositions: string[];
  keyDifferentiators: string[];
  targetMarket: string;
}

export interface IcpProfile {
  targetTitles: string[];
  companySizes: string[];
  industries: string[];
  painPoints: string[];
}

export interface GtmOffer {
  title: string;
  angle: string;
  valueProp: string;
  cta: string;
}

export interface CategoryIntelligence {
  serviceCategory: string;
  provenOutboundMeta: string[];
  competitorBenchmarks: Array<{ name: string; offer: string; angle: string }>;
  founderSignals?: { name?: string; role?: string; bioSnippet?: string };
}

export interface SynthesizedGtmStrategy {
  companyName: string;
  categoryIntelligence?: CategoryIntelligence;
  businessOverview: BusinessOverview;
  icpProfile: IcpProfile;
  offers: GtmOffer[];
  scrapedData: ScrapedCompanyData;
}

function cleanHtmlTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomain(rawUrl: string): string {
  try {
    let u = rawUrl.trim();
    if (!/^https?:\/\//i.test(u)) {
      u = `https://${u}`;
    }
    const parsed = new URL(u);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return rawUrl.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "");
  }
}

/**
 * Scraping and content discovery pipeline.
 */
export async function scrapeCompanyWebsite(rawUrl: string): Promise<ScrapedCompanyData> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const domain = extractDomain(url);

  const fallbackResult: ScrapedCompanyData = {
    url,
    domain,
    title: domain,
    description: `Leading provider of modern solutions and services on ${domain}.`,
    headings: [],
    bodySnippets: [],
    subpageSnippets: [],
    fetchFailed: false,
  };

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 (SmartReach/ChadGTM-Engine)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      fallbackResult.fetchFailed = true;
      fallbackResult.failureReason = `HTTP ${res.status} response from host`;
      return fallbackResult;
    }

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? cleanHtmlTags(titleMatch[1]) : domain;

    // Extract meta description or og:description
    let description = "";
    const metaDescMatch =
      html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
    if (metaDescMatch) {
      description = cleanHtmlTags(metaDescMatch[1]);
    }

    // Extract H1 and H2
    const headings: string[] = [];
    const headingMatches = html.matchAll(/<h[12][^>]*>(.*?)<\/h[12]>/gi);
    for (const m of headingMatches) {
      const text = cleanHtmlTags(m[1]);
      if (text.length > 5 && text.length < 160 && !headings.includes(text)) {
        headings.push(text);
        if (headings.length >= 8) break;
      }
    }

    // Extract key paragraphs
    const bodySnippets: string[] = [];
    const pMatches = html.matchAll(/<p[^>]*>(.*?)<\/p>/gi);
    for (const m of pMatches) {
      const text = cleanHtmlTags(m[1]);
      if (text.length > 40 && text.length < 400 && !bodySnippets.includes(text)) {
        bodySnippets.push(text);
        if (bodySnippets.length >= 6) break;
      }
    }

    // Heuristically discover subpages (/about, /product, /pricing, /solutions)
    const subpageLinks: string[] = [];
    const linkMatches = html.matchAll(/<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']/gi);
    for (const lm of linkMatches) {
      const rawHref = lm[1].trim();
      if (/^(?:\/|https?:\/\/)/i.test(rawHref) && /(?:about|product|solution|pricing|features)/i.test(rawHref)) {
        try {
          const resolved = new URL(rawHref, url).toString();
          if (new URL(resolved).hostname === new URL(url).hostname && !subpageLinks.includes(resolved)) {
            subpageLinks.push(resolved);
            if (subpageLinks.length >= 2) break;
          }
        } catch {}
      }
    }

    const subpageSnippets: Array<{ path: string; text: string }> = [];
    if (subpageLinks.length > 0) {
      await Promise.allSettled(
        subpageLinks.map(async (subUrl) => {
          try {
            const subCtrl = new AbortController();
            const subTimer = setTimeout(() => subCtrl.abort(), 4000);
            const subRes = await fetch(subUrl, {
              headers,
              signal: subCtrl.signal,
            }).finally(() => clearTimeout(subTimer));

            if (subRes.ok) {
              const subHtml = await subRes.text();
              const subP = subHtml.matchAll(/<p[^>]*>(.*?)<\/p>/gi);
              const pTexts: string[] = [];
              for (const p of subP) {
                const cleaned = cleanHtmlTags(p[1]);
                if (cleaned.length > 40 && cleaned.length < 300) {
                  pTexts.push(cleaned);
                  if (pTexts.length >= 2) break;
                }
              }
              if (pTexts.length > 0) {
                const pathname = new URL(subUrl).pathname;
                subpageSnippets.push({ path: pathname, text: pTexts.join(" ") });
              }
            }
          } catch {}
        })
      );
    }

    // If body snippets are empty (e.g. client-side rendered Single Page Application like React/Vite/Next),
    // discover and inspect client-side JavaScript bundles to extract headings, features, and case studies
    if (bodySnippets.length === 0) {
      const scriptMatches = html.matchAll(/<script\s+(?:[^>]*?\s+)?src=["']([^"']+\.js)["']/gi);
      for (const sm of scriptMatches) {
        const src = sm[1];
        if (src.includes("index") || src.includes("app") || src.includes("main") || src.includes("bundle") || src.includes("assets")) {
          try {
            const scriptUrl = new URL(src, url).toString();
            const scCtrl = new AbortController();
            const scTimer = setTimeout(() => scCtrl.abort(), 4500);
            const scRes = await fetch(scriptUrl, { headers, signal: scCtrl.signal }).finally(() => clearTimeout(scTimer));
            if (scRes.ok) {
              const jsCode = await scRes.text();
              const textMatches = jsCode.matchAll(/"([^"\\]{45,260})"/g);
              for (const tm of textMatches) {
                const s = tm[1].trim();
                if (
                  !s.includes("webpack") &&
                  !s.includes("import") &&
                  !s.includes("function") &&
                  !s.includes("{") &&
                  !s.includes("}") &&
                  !s.includes("var ") &&
                  !s.includes("const ") &&
                  !bodySnippets.includes(s)
                ) {
                  bodySnippets.push(s);
                  if (bodySnippets.length >= 8) break;
                }
              }

              // Extract prominent headings from bundle
              const headingCandidates = jsCode.matchAll(/"([A-Z][A-Za-z0-9\s,–—\-]{12,70})"/g);
              for (const hc of headingCandidates) {
                const h = hc[1].trim();
                if (
                  !headings.includes(h) &&
                  (h.includes("Cold") ||
                    h.includes("Email") ||
                    h.includes("Outbound") ||
                    h.includes("Infrastructure") ||
                    h.includes("Domain") ||
                    h.includes("Deliverability") ||
                    h.includes("Platform") ||
                    h.includes("Client") ||
                    h.includes("Agency"))
                ) {
                  headings.push(h);
                  if (headings.length >= 6) break;
                }
              }
            }
          } catch {}
        }
      }
    }

    return {
      url,
      domain,
      title: title || domain,
      description: description || (headings[0] ? headings[0] : `Specialized B2B products from ${domain}`),
      headings,
      bodySnippets,
      subpageSnippets,
      fetchFailed: false,
    };
  } catch (err: any) {
    fallbackResult.fetchFailed = true;
    fallbackResult.failureReason = err?.message || "Connection timeout or SSL error";
    return fallbackResult;
  }
}

/**
 * Intelligent deterministic fallback generator when AI API key is omitted,
 * rate-limited, or during offline sandbox runs.
 */
function simulateGtmStrategy(
  scraped: ScrapedCompanyData,
  optionalNotes?: string,
  candidateIndustries: string[] = []
): SynthesizedGtmStrategy {
  const brandName =
    scraped.title && !scraped.title.includes("http") && scraped.title.length < 35
      ? scraped.title.split(/[-|–:]/)[0].trim()
      : scraped.domain.split(".")[0].charAt(0).toUpperCase() + scraped.domain.split(".")[0].slice(1);

  const notesText = optionalNotes ? ` Focus: ${optionalNotes}.` : "";
  const combinedText = `${scraped.title} ${scraped.description} ${scraped.headings.join(" ")} ${notesText}`.toLowerCase();

  // Industry matching heuristic against real DB industries
  let matchedIndustries = candidateIndustries.slice(0, 5);
  if (candidateIndustries.length > 0) {
    const matched = candidateIndustries.filter((ind) => {
      const lowerInd = ind.toLowerCase();
      return (
        combinedText.includes(lowerInd) ||
        (lowerInd.includes("tech") && combinedText.includes("software")) ||
        (lowerInd.includes("financial") && (combinedText.includes("fintech") || combinedText.includes("payment"))) ||
        (lowerInd.includes("marketing") && (combinedText.includes("growth") || combinedText.includes("brand"))) ||
        (lowerInd.includes("hospital") && combinedText.includes("health"))
      );
    });
    if (matched.length > 0) {
      matchedIndustries = matched.slice(0, 6);
    }
  }

  // Titles
  let targetTitles = ["VP of Sales", "Head of Business Development", "Chief Revenue Officer", "Managing Director"];
  if (combinedText.includes("engineer") || combinedText.includes("developer") || combinedText.includes("api") || combinedText.includes("devops")) {
    targetTitles = ["VP of Engineering", "Chief Technology Officer", "Head of Product", "Director of Infrastructure"];
  } else if (combinedText.includes("recruit") || combinedText.includes("talent") || combinedText.includes("hiring")) {
    targetTitles = ["Head of Talent Acquisition", "VP of People", "Managing Director", "Staffing Partner"];
  }

  // Heuristics for category & competitor intelligence
  const isInboxInfra =
    combinedText.includes("inbox") ||
    combinedText.includes("mailbox") ||
    combinedText.includes("leadskingdom") ||
    combinedText.includes("deliverability") ||
    combinedText.includes("infrastructure") ||
    combinedText.includes("secondary domain");

  const isWebDesign =
    !isInboxInfra &&
    (combinedText.includes("web design") ||
      combinedText.includes("website redesign") ||
      combinedText.includes("ui/ux") ||
      combinedText.includes("landing page") ||
      combinedText.includes("web development"));

  let categoryIntelligence: CategoryIntelligence;
  let offers: GtmOffer[];

  if (isInboxInfra) {
    categoryIntelligence = {
      serviceCategory: "Cold Email Infrastructure & Managed Mailbox Fleet",
      provenOutboundMeta: [
        "2024-2026 Google and Yahoo sender guidelines mandate strict DMARC enforcement and max 30 sends/inbox/day",
        "Isolating secondary domains from root domain prevents corporate domain blacklisting and Google Workspace bans",
        "Turnkey outbound launch from scratch enables B2B client acquisition with predictable CAC vs paying $3k+/mo in ad networks",
      ],
      competitorBenchmarks: [
        { name: "Mailforge", offer: "$3/inbox secondary infrastructure with automated DNS", angle: "Seat Cost Slash" },
        { name: "Infraforge", offer: "Private cloud cold email mailboxes with automated IP rotation", angle: "Deliverability" },
        { name: "Salesforge", offer: "Unified outbound execution with pre-warmed mailbox sync", angle: "Outbound Stack" },
      ],
    };

    offers = [
      {
        title: "Turnkey Client Acquisition Launch",
        angle: "Turnkey Outbound Setup (Zero Outbound Angle)",
        valueProp: `Build and launch your outbound sending engine from scratch with pre-warmed secondary domains, zero tech setup, and predictable client pipeline without paying $3k+/mo in ad spend.`,
        cta: `Would you be open to a 45-second video showing how peer firms launch turnkey client reach-outs?`,
      },
      {
        title: "80% Seat Cost Slash & Domain Shield",
        angle: "Secondary Domain Isolation (Active Outbound Angle)",
        valueProp: `Cut Google Workspace $7/user seat costs by 80% on secondary prospecting inboxes and completely isolate outreach to protect corporate root domain reputation.`,
        cta: `Could I send over a 1-page breakdown showing how peer teams cut secondary seat costs by 80%?`,
      },
      {
        title: "Deliverability Remediation & Compliance Audit",
        angle: "Technical DNS Alignment (Technical Defect Angle)",
        valueProp: `Audit and align missing SPF/DKIM/DMARC records and migrate to high-reputation IP pools to eliminate spam folder drops under Yahoo & Google bulk caps.`,
        cta: `Mind if I share a 40-second screen capture showing where the DNS record drop is happening?`,
      },
    ];
  } else if (isWebDesign) {
    categoryIntelligence = {
      serviceCategory: "B2B Web Design & Conversion Rate Optimization",
      provenOutboundMeta: [
        "68% of local service quotes originate on mobile devices with high drop-off on slow forms",
        "Replacing multi-field intake forms with 1-tap mobile booking doubles quote completions",
      ],
      competitorBenchmarks: [
        { name: "Boutique Design Studios", offer: "$5k-$15k custom site redesigns on 6-week timelines", angle: "Long Timeline / High Fee" },
        { name: "Webflow Agencies", offer: "Turnkey landing pages focused on conversion rate optimization", angle: "Speed & Conversion" },
      ],
    };

    offers = [
      {
        title: "Mobile Speed & Layout Shift Audit",
        angle: "Mobile Performance (Friction Angle)",
        valueProp: `Eliminate 4-second mobile layout delays and cut load times under 0.5s to capture the 30% of visitors who bounce before forms render.`,
        cta: `Mind if I send over a 45-second screen recording showing where the drop-off happens?`,
      },
      {
        title: "Frictionless 1-Tap Mobile Intake",
        angle: "Conversion Optimization (ROI Angle)",
        valueProp: `Streamline consultation booking from 12 required fields down to 3 without losing lead qualification, doubling booked quotes.`,
        cta: `Could I share a 40-second teardown showing how peer firms cut intake friction?`,
      },
      {
        title: "Direct Tap-to-Call Emergency Dispatch",
        angle: "High-Intent Dispatch (Conversion Angle)",
        valueProp: `Make primary service dispatch phone numbers 1-tap clickable on mobile screens so urgent clients never have to memorize numbers.`,
        cta: `Worth a quick look if I send the clip?`,
      },
    ];
  } else {
    categoryIntelligence = {
      serviceCategory: `${brandName} B2B Operational Solutions`,
      provenOutboundMeta: [
        "Align outbound messaging with prospect maturity: turnkey launch for newbies vs infrastructure optimization for active outbounders",
      ],
      competitorBenchmarks: [
        { name: "Legacy SaaS Suites", offer: "High monthly seat fees with complex onboarding", angle: "High Friction" },
      ],
    };

    offers = [
      {
        title: "Turnkey Client Acquisition Launch",
        angle: "New Client Pipeline (Zero Outbound Angle)",
        valueProp: `Set up an automated direct outreach engine to acquire qualified B2B clients predictably without relying solely on referrals or paid advertising.`,
        cta: `Would you be open to a 45-second video walk-through this week?`,
      },
      {
        title: "Operational Cost & Workflow Optimization",
        angle: "Efficiency & Margin (Active Teams Angle)",
        valueProp: `Eliminate manual handoffs and cut recurring SaaS infrastructure expenses by 80% with automated execution workflows.`,
        cta: `Could I send over a 1-page breakdown detailing the workflow benchmarks?`,
      },
      {
        title: "Risk-Free Diagnostic Review",
        angle: "Frictionless Audit (Diagnostic Angle)",
        valueProp: `Benchmark operational bottlenecks and deliverability health with zero setup overhead or commitment.`,
        cta: `Would you be against taking a 60-second interactive test drive this week?`,
      },
    ];
  }

  return {
    companyName: brandName,
    categoryIntelligence,
    businessOverview: {
      summary: `${brandName} empowers modern B2B organizations to accelerate growth and operational efficiency through intelligent automation and reliable workflows.${notesText}`,
      valuePropositions: [
        `Eliminate manual friction and accelerate execution speed across team operations.`,
        `Predictable, scalable output delivered without ballooning internal headcount.`,
        `Enterprise-grade reliability with seamless integration into existing toolchains.`,
      ],
      keyDifferentiators: [
        `Zero setup overhead with rapid time-to-value within days.`,
        `Tailored specifically for high-velocity mid-market and enterprise teams.`,
        `Transparent, predictable ROI backed by verified performance metrics.`,
      ],
      targetMarket: "High-growth mid-market and enterprise teams seeking operational scale.",
    },
    icpProfile: {
      targetTitles,
      companySizes: ["11-50", "51-200", "201-500"],
      industries: matchedIndustries.length > 0 ? matchedIndustries : ["Information Technology and Services", "Financial Services", "Marketing And Advertising"],
      painPoints: [
        "Time-consuming manual workflows that cap team pipeline and output.",
        "High customer acquisition costs and low response rates with traditional outreach.",
        "Difficulty scaling operations without increasing headcount and overhead.",
      ],
    },
    offers,
    scrapedData: scraped,
  };
}

/**
 * Synthesize Go-To-Market strategy from scraped data using LLM or structured synthesis.
 */
export async function synthesizeGtmStrategy(
  scraped: ScrapedCompanyData,
  optionalNotes?: string,
  aiOptions?: AiEngineOptions
): Promise<SynthesizedGtmStrategy> {
  const facets = getDirectoryFacets();
  const topIndustries = facets.industries.slice(0, 30).map((i) => i.value);

  const apiKey =
    aiOptions?.apiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return simulateGtmStrategy(scraped, optionalNotes, topIndustries);
  }

  const prompt = `You are an elite B2B Go-To-Market (GTM) strategist and cold outreach architect.
Analyze the following scraped company profile and generate a comprehensive B2B outbound campaign strategy.

TARGET COMPANY INFORMATION:
- URL: ${scraped.url}
- Title: ${scraped.title}
- Description: ${scraped.description}
- Key Headings: ${scraped.headings.slice(0, 5).join(" | ")}
- Content Snippets: ${scraped.bodySnippets.slice(0, 4).join(" | ")}
- Subpage Context: ${scraped.subpageSnippets.map((s) => `${s.path}: ${s.text}`).join(" | ")}
- Optional Founder / Campaign Context: ${optionalNotes || "None provided"}

MATCHING DIRECTORY B2B INDUSTRIES (MUST PICK 3-5 EXACT STRINGS FROM THIS LIST):
${JSON.stringify(topIndustries)}

CRITICAL INSTRUCTIONS FOR OUTBOUND MATURITY ARCHITECTURE:
1. Infer the clean, concise brand name and identify the generic service category (e.g. "Cold Email Infrastructure", "Accounting & Fractional CFO", "Staffing & Recruiting", "B2B SaaS").
2. In categoryIntelligence, identify 2-3 direct or similar-size competitors, their offers/pricing models, and proven cold email meta angles for this exact niche.
3. In businessOverview, provide a 2-3 sentence summary explaining what problem the product solves, 3 value propositions, and 3 key differentiators.
4. In icp, list 3-5 high-signal decision maker job titles (e.g. "VP of Sales", "CTO", "Head of Talent"), 3 company size ranges, 3-5 matching industry strings from the list above, and 3 acute pain points.
5. In offers, create exactly 3 distinct high-converting cold email angles addressing prospect OUTBOUND MATURITY:
   - Offer 1: "Turnkey Client Acquisition Launch" (Targeting Outbound Newbies: companies relying on referrals or ads with 0 cold email active).
   - Offer 2: "Cost Slash & Domain Isolation" (Targeting Active Outbounders: cutting $7/user seat fees and isolating secondary domains).
   - Offer 3: "Technical Deliverability & Audit Fix" (Targeting Technical Defect / Deliverability Issues).

Respond STRICTLY with a valid JSON object matching this structure:
{
  "companyName": "Brand Name",
  "categoryIntelligence": {
    "serviceCategory": "Generic Category Name",
    "provenOutboundMeta": ["Meta Tip 1", "Meta Tip 2"],
    "competitorBenchmarks": [
      { "name": "Competitor 1", "offer": "Their pricing/offer", "angle": "Their angle" }
    ]
  },
  "businessOverview": {
    "summary": "2-3 concise sentences...",
    "valuePropositions": ["Prop 1", "Prop 2", "Prop 3"],
    "keyDifferentiators": ["Diff 1", "Diff 2", "Diff 3"],
    "targetMarket": "Description of primary market"
  },
  "icpProfile": {
    "targetTitles": ["Title 1", "Title 2", "Title 3"],
    "companySizes": ["11-50", "51-200", "201-500"],
    "industries": ["Exact Industry 1", "Exact Industry 2"],
    "painPoints": ["Pain 1", "Pain 2", "Pain 3"]
  },
  "offers": [
    {
      "title": "Turnkey Client Acquisition Launch",
      "angle": "New Outbound Setup",
      "valueProp": "Value statement focused on launching client acquisition from scratch without ad spend...",
      "cta": "Low-friction question CTA (under 15 words)"
    },
    {
      "title": "Cost Slash & Domain Isolation",
      "angle": "Secondary Domain Isolation",
      "valueProp": "Value statement focused on cutting $7/seat costs and protecting root domain...",
      "cta": "Low-friction question CTA (under 15 words)"
    },
    {
      "title": "Technical Deliverability & Audit Fix",
      "angle": "Technical DNS Alignment",
      "valueProp": "Value statement focused on fixing DNS records and spam drops...",
      "cta": "Low-friction question CTA (under 15 words)"
    }
  ]
}`;

  try {
    const provider = (aiOptions?.provider || "google").toLowerCase();
    let rawJson = "";

    if (provider === "openai" || (!process.env.GEMINI_API_KEY && process.env.OPENAI_API_KEY)) {
      const openAiKey = aiOptions?.apiKey || process.env.OPENAI_API_KEY!;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: aiOptions?.model || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an expert B2B Go-To-Market and cold email strategy engine. Return valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
      const data = await res.json();
      rawJson = data.choices?.[0]?.message?.content || "";
    } else {
      const geminiKey = aiOptions?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY!;
      const model = aiOptions?.model || "gemini-3.8-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
          },
        }),
      });
      if (!res.ok) {
        const candidateModels = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-flash-latest"];
        let resolved = false;
        for (const fbModel of candidateModels) {
          if (fbModel === model) continue;
          try {
            const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fbModel}:generateContent?key=${encodeURIComponent(geminiKey)}`;
            const fbRes = await fetch(fallbackUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.7,
                },
              }),
            });
            if (fbRes.ok) {
              const data = await fbRes.json();
              rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              resolved = true;
              break;
            }
          } catch {}
        }
        if (!resolved) {
          throw new Error(`Gemini error ${res.status}`);
        }
      } else {
        const data = await res.json();
        rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    }

    const cleaned = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      companyName: parsed.companyName || scraped.domain.split(".")[0],
      businessOverview: {
        summary: parsed.businessOverview?.summary || `${parsed.companyName} simplifies workflows for modern businesses.`,
        valuePropositions: Array.isArray(parsed.businessOverview?.valuePropositions)
          ? parsed.businessOverview.valuePropositions
          : ["Automate high-friction tasks", "Increase operational velocity", "Improve output quality"],
        keyDifferentiators: Array.isArray(parsed.businessOverview?.keyDifferentiators)
          ? parsed.businessOverview.keyDifferentiators
          : ["Rapid setup", "Proven ROI", "Scalable infrastructure"],
        targetMarket: parsed.businessOverview?.targetMarket || "High-growth B2B companies",
      },
      icpProfile: {
        targetTitles: Array.isArray(parsed.icpProfile?.targetTitles) ? parsed.icpProfile.targetTitles : ["VP of Sales", "CTO"],
        companySizes: Array.isArray(parsed.icpProfile?.companySizes) ? parsed.icpProfile.companySizes : ["11-50", "51-200"],
        industries: Array.isArray(parsed.icpProfile?.industries) && parsed.icpProfile.industries.length > 0
          ? parsed.icpProfile.industries
          : topIndustries.slice(0, 4),
        painPoints: Array.isArray(parsed.icpProfile?.painPoints) ? parsed.icpProfile.painPoints : ["Operational bottlenecks", "High acquisition cost"],
      },
      offers: Array.isArray(parsed.offers) && parsed.offers.length >= 3
        ? parsed.offers
        : simulateGtmStrategy(scraped, optionalNotes, topIndustries).offers,
      scrapedData: scraped,
    };
  } catch (err) {
    console.warn("[chad-gtm-research] AI synthesis failed, using high-fidelity fallback:", err);
    return simulateGtmStrategy(scraped, optionalNotes, topIndustries);
  }
}
