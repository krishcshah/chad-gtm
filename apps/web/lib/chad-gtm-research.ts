/**
 * AutoGTM Deep Autonomous Website & Company Research Engine.
 * Crawls target domains and subpages, extracts brand and product signals,
 * and synthesizes Business Overview, multi-persona ICP, and 3 bespoke
 * high-converting Offer Hooks.
 */

import { getDirectoryFacets } from "./leads-directory";
import type { AiEngineOptions } from "./ai";
import { crawlCompanyDomain, type CrawledCompanyProfile, type PricingTier } from "./gtm-crawler";
import { matchIndustriesInText, RESEARCH_BLOCKED_MESSAGE, type TargetingSource } from "./autopilot-policy";

export interface ScrapedCompanyData {
  url: string;
  domain: string;
  title: string;
  description: string;
  headings: string[];
  bodySnippets: string[];
  subpageSnippets: Array<{ path: string; text: string }>;
  pricingSignals?: string[];
  pricingTiers?: PricingTier[];
  featuresAndBullets?: string[];
  caseStudySignals?: string[];
  competitorSignals?: string[];
  combinedCorpus?: string;
  fetchFailed: boolean;
  failureReason?: string;
  usedHeadlessFallback?: boolean;
  /** Scheduling link found on the site (Calendly, Cal.com, HubSpot...). */
  bookingUrl?: string | null;
}

export interface BusinessOverview {
  summary: string;
  valuePropositions: string[];
  keyDifferentiators: string[];
  targetMarket: string;
  /** Concrete commercial proof pulled from the crawl, not invented. */
  proofPoints?: string[];
  /** Explicit competitor contrasts found on the site. */
  competitorContrasts?: Array<{ competitor: string; contrast: string }>;
  /** Extracted pricing architecture. */
  pricingTiers?: PricingTier[];
  pricingModel?: string;
}

export interface IcpPersona {
  personaType: string;
  titles: string[];
  pains: string[];
  valueAngle: string;
  proofPoint?: string;
}

export interface IcpProfile {
  targetTitles: string[];
  companySizes: string[];
  industries: string[];
  painPoints: string[];
  personas?: IcpPersona[];
  /**
   * Where industries/titles came from. "simulated" means hard-coded defaults
   * that were not derived from the client; autopilot never launches on those.
   */
  targetingSource?: TargetingSource;
  /** False when the targeting is not grounded in the client's site or notes. */
  targetingGrounded?: boolean;
  /** Client-facing explanation when targetingGrounded is false. */
  targetingIssue?: string;
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

/**
 * Resilient multi-tier crawling pipeline.
 */
export async function scrapeCompanyWebsite(rawUrl: string): Promise<ScrapedCompanyData> {
  const profile: CrawledCompanyProfile = await crawlCompanyDomain(rawUrl);

  const subpageSnippets = profile.subpages.map((sub) => ({
    path: sub.path,
    text: [
      sub.title ? `Title: ${sub.title}` : "",
      sub.headings.length ? `Headings: ${sub.headings.join(" | ")}` : "",
      sub.keyParagraphs.slice(0, 3).join(" "),
      sub.pricingSignals.length ? `Pricing: ${sub.pricingSignals.join(" ")}` : "",
      sub.caseStudySignals.length ? `Proof: ${sub.caseStudySignals.slice(0, 3).join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" — "),
  }));

  return {
    url: profile.normalizedUrl,
    domain: profile.domain,
    title: profile.rootPage.title,
    description: profile.rootPage.description,
    headings: profile.rootPage.headings,
    bodySnippets: profile.rootPage.keyParagraphs,
    subpageSnippets,
    pricingSignals: profile.rootPage.pricingSignals,
    pricingTiers: profile.rootPage.pricingTiers,
    featuresAndBullets: profile.rootPage.featuresAndBullets,
    caseStudySignals: profile.rootPage.caseStudySignals,
    competitorSignals: profile.rootPage.competitorSignals,
    combinedCorpus: profile.combinedCorpus,
    fetchFailed: profile.fetchFailed,
    failureReason: profile.failureReason,
    usedHeadlessFallback: profile.usedHeadlessFallback,
    bookingUrl: profile.bookingUrl ?? null,
  };
}

function buildResearchPrompt(
  scraped: ScrapedCompanyData,
  optionalNotes: string | undefined,
  topIndustries: string[]
): string {
  return `You are the best B2B positioning strategist in the world. You have one job: turn a company's website into outbound campaigns that a busy operator would actually reply to.

Analyze the crawl below. Be concrete. If the site does not say it, do not invent it.

=== SCRAPED DOMAIN & CORPUS DATA ===
${scraped.combinedCorpus || `URL: ${scraped.url}\nTitle: ${scraped.title}\nDescription: ${scraped.description}`}

=== OPTIONAL USER-PROVIDED CONTEXT / OFFER NOTES ===
${optionalNotes || "None provided"}

=== AVAILABLE B2B DIRECTORY TARGET INDUSTRIES (CHOOSE 3-5 EXACT MATCHING STRINGS) ===
${JSON.stringify(topIndustries)}

=== WHAT "GOOD" LOOKS LIKE ===
- Specific beats clever. Name the actual workflow, cost, or failure mode.
- Write like a sharp founder talking to a peer, not a marketing department.
- No hype. No adjectives that could describe any software company.
- Never invent a metric, customer name, or integration. Use only claims present in the crawl.
- If pricing is visible, capture the exact tiers and what each gates.

=== BANNED LANGUAGE (never output these) ===
"hope this finds you well", "I wanted to reach out", "just checking in", "game-changer", "revolutionize", "seamlessly", "unlock", "supercharge", "elevate", "leverage", "robust", "cutting-edge", "bespoke", "tailored solutions", "in today's fast-paced world", "take your business to the next level", "I'll keep this brief", "quick question".

=== TASKS ===
1. Brand inference: clean brand name from the crawl (e.g. "Resend", "Retool").
2. Category intelligence: exact market category, the two outbound angles that actually work in this category, and 2-3 real competitors with their positioning.
3. Business overview:
   - summary: 2-3 punchy sentences. Problem → mechanism → who it is for.
   - valuePropositions: exactly 3, each with a concrete outcome.
   - keyDifferentiators: exactly 3, each something a competitor cannot honestly claim.
   - targetMarket: one clear sentence naming the buying audience.
   - proofPoints: up to 3 verbatim-ish proof/ROI claims found on the site (empty array if none).
   - competitorContrasts: up to 3 { competitor, contrast } pairs explicitly supported by the crawl.
   - pricingTiers: up to 5 { name, price, features[] } extracted from the crawl (empty array if none).
   - pricingModel: one phrase describing how they charge (e.g. "usage-based", "per seat", "annual contract").
4. Multi-persona ICP. Build three distinct buying personas:
   - Economic Buyer: owns budget and business risk (e.g. CEO, CFO, COO).
   - Technical Buyer: owns implementation, security, and integration risk (e.g. CTO, VP Engineering, Head of Data).
   - End User / Champion: lives with the daily workflow (e.g. Head of Ops, Staff Engineer, RevOps Lead).
   Each persona needs: titles (2-3), pains (2), valueAngle (one sentence in their language), proofPoint (optional, from the crawl).
   Also provide the flat targetTitles (3-5), companySizes (2-3 brackets), industries (3-5 EXACT strings from the directory list), and painPoints (3).
5. Three bespoke outbound offers. Each must be specific to THIS company:
   - Angle 1 — Acute Pain Relief: the daily friction their buyer already complains about.
   - Angle 2 — Direct ROI & Velocity: measurable speed, cost, or revenue impact (only if the crawl supports it).
   - Angle 3 — Proof: a result, customer type or way of working the crawl actually shows, framed as why the buyer can trust it.
   An AI agent sends these emails and nobody makes custom work for prospects, so NEVER offer a free audit, teardown, benchmark, report, video, pilot or any deliverable unless the website itself sells it. The ask is interest in a conversation.
   CTAs must be one short permission question, under 12 words. No calendar links. No "15-minute call".

Respond STRICTLY with a valid JSON object matching this exact schema:
{
  "companyName": "Inferred Brand Name",
  "categoryIntelligence": {
    "serviceCategory": "Exact Market Category",
    "provenOutboundMeta": ["Category outbound principle 1", "Category outbound principle 2"],
    "competitorBenchmarks": [
      { "name": "Competitor A", "offer": "Their positioning", "angle": "The hook that works against them" },
      { "name": "Competitor B", "offer": "Their positioning", "angle": "The hook that works against them" }
    ]
  },
  "businessOverview": {
    "summary": "2-3 sentences...",
    "valuePropositions": ["...", "...", "..."],
    "keyDifferentiators": ["...", "...", "..."],
    "targetMarket": "...",
    "proofPoints": ["...", "..."],
    "competitorContrasts": [{ "competitor": "Name", "contrast": "Specific contrast" }],
    "pricingTiers": [{ "name": "Pro", "price": "$49/mo", "features": ["...", "..."] }],
    "pricingModel": "per seat"
  },
  "icpProfile": {
    "targetTitles": ["...", "...", "..."],
    "companySizes": ["11-50", "51-200"],
    "industries": ["Exact Industry From List", "Another Exact Industry"],
    "painPoints": ["...", "...", "..."],
    "personas": [
      {
        "personaType": "Economic Buyer",
        "titles": ["CFO", "COO"],
        "pains": ["...", "..."],
        "valueAngle": "...",
        "proofPoint": "..."
      },
      {
        "personaType": "Technical Buyer",
        "titles": ["CTO", "VP Engineering"],
        "pains": ["...", "..."],
        "valueAngle": "...",
        "proofPoint": "..."
      },
      {
        "personaType": "End User / Champion",
        "titles": ["Head of Operations", "RevOps Lead"],
        "pains": ["...", "..."],
        "valueAngle": "...",
        "proofPoint": "..."
      }
    ]
  },
  "offers": [
    {
      "title": "Bespoke Offer Title 1",
      "angle": "Acute Pain Relief",
      "valueProp": "Specific value proposition tailored to the pain...",
      "cta": "Low-friction permission question (under 12 words)"
    },
    {
      "title": "Bespoke Offer Title 2",
      "angle": "Direct ROI & Velocity",
      "valueProp": "...",
      "cta": "..."
    },
    {
      "title": "Bespoke Offer Title 3",
      "angle": "Zero-Risk Proof",
      "valueProp": "...",
      "cta": "..."
    }
  ]
}`;
}

async function callOpenAiJson(
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs = 45_000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an elite GTM strategist. Return only valid JSON. Never invent facts that are not supported by the provided crawl.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.35,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OpenAI API error: HTTP ${res.status}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiJson(
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs = 45_000
): Promise<string> {
  const candidates = Array.from(
    new Set([model, "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"])
  );

  let lastError = "Gemini API error";
  for (const candidate of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        candidate
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const makeBody = (withThinkingConfig: boolean) =>
        JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are an elite GTM strategist. Return only valid JSON. Never invent facts that are not supported by the provided crawl.",
              },
            ],
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
            ...(withThinkingConfig ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        });

      let res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: makeBody(true),
        signal: controller.signal,
      });
      if (res.status === 400) {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: makeBody(false),
          signal: controller.signal,
        });
      }

      if (!res.ok) {
        lastError = `Gemini API error (${candidate}): HTTP ${res.status}`;
        continue;
      }
      const data: any = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      lastError = `Gemini returned an empty response (${candidate})`;
    } catch (err: any) {
      lastError = err?.message || lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

function parseJsonObject(raw: string): any {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON");
  }
}

/**
 * Deep multi-stage AI reasoning pipeline.
 */
export async function synthesizeGtmStrategy(
  scraped: ScrapedCompanyData,
  optionalNotes?: string,
  aiOptions?: AiEngineOptions
): Promise<SynthesizedGtmStrategy> {
  const facets = getDirectoryFacets();
  const topIndustries = facets.industries.slice(0, 40).map((i) => i.value);
  const allIndustries = facets.industries.map((i) => i.value);

  const explicitProvider = (aiOptions?.provider || "").toLowerCase();
  const openAiKey = process.env.OPENAI_API_KEY;
  const geminiKey =
    aiOptions?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  const provider: "openai" | "google" =
    explicitProvider === "openai" || (!geminiKey && openAiKey) ? "openai" : "google";
  const apiKey = provider === "openai" ? aiOptions?.apiKey || openAiKey : geminiKey;

  if (!apiKey) {
    return simulateGtmStrategy(scraped, optionalNotes, topIndustries, allIndustries);
  }

  const prompt = buildResearchPrompt(scraped, optionalNotes, topIndustries);

  try {
    const rawJson =
      provider === "openai"
        ? await callOpenAiJson(prompt, apiKey, aiOptions?.model || "gpt-5-mini")
        : await callGeminiJson(prompt, apiKey, aiOptions?.model || "gemini-3.8-flash");

    const parsed = parseJsonObject(rawJson);

    const industries = Array.isArray(parsed.icpProfile?.industries)
      ? parsed.icpProfile.industries.filter((ind: string) => topIndustries.includes(ind))
      : [];
    const modelTitles = Array.isArray(parsed.icpProfile?.targetTitles)
      ? parsed.icpProfile.targetTitles.map((t: unknown) => String(t ?? "").trim()).filter(Boolean)
      : [];
    // The model only counts as the source of targeting if it actually chose
    // directory industries and titles; otherwise the defaults below are invented.
    // When the site could not be read, the model's choice is grounded only if
    // the client told us who they sell to (the notes are in the prompt).
    const notesGiven = hasClientNotes(optionalNotes);
    const modelGrounded =
      industries.length > 0 && modelTitles.length > 0 && (!scraped.fetchFailed || notesGiven);
    // Otherwise fall back to directory industries the client's notes name
    // (a blocked site must not trap the run in needs_research for good).
    const notesIndustries = modelGrounded ? [] : matchIndustriesInNotes(optionalNotes, allIndustries, 3);
    const notesGrounded = !modelGrounded && notesIndustries.length > 0;
    const grounded = modelGrounded || notesGrounded;

    return {
      companyName: parsed.companyName || scraped.domain,
      categoryIntelligence: parsed.categoryIntelligence,
      businessOverview: {
        summary:
          parsed.businessOverview?.summary ||
          scraped.description ||
          `${scraped.domain} sells software to modern teams.`,
        valuePropositions: normalizeStringArray(parsed.businessOverview?.valuePropositions, 3, [
          "Replace manual work with a faster, repeatable workflow.",
          "Reduce operating cost without adding headcount.",
          "Ship measurable outcomes in the first week.",
        ]),
        keyDifferentiators: normalizeStringArray(parsed.businessOverview?.keyDifferentiators, 3, [
          "Purpose-built for the workflow it replaces.",
          "Fast to deploy without a services engagement.",
          "Transparent pricing with no long lock-in.",
        ]),
        targetMarket:
          parsed.businessOverview?.targetMarket ||
          "High-growth teams with an owner for this workflow.",
        proofPoints: normalizeStringArray(parsed.businessOverview?.proofPoints, 3, []),
        competitorContrasts: Array.isArray(parsed.businessOverview?.competitorContrasts)
          ? parsed.businessOverview.competitorContrasts.slice(0, 3)
          : [],
        pricingTiers: Array.isArray(parsed.businessOverview?.pricingTiers)
          ? parsed.businessOverview.pricingTiers.slice(0, 5)
          : scraped.pricingTiers?.slice(0, 5) || [],
        pricingModel: parsed.businessOverview?.pricingModel || "",
      },
      icpProfile: {
        targetTitles: notesGrounded && modelTitles.length === 0
          ? [...OWNER_TITLES]
          : normalizeStringArray(parsed.icpProfile?.targetTitles, 3, [
              "Founder",
              "VP of Operations",
              "Head of Engineering",
            ]),
        companySizes: normalizeStringArray(parsed.icpProfile?.companySizes, 2, [
          "11-50",
          "51-200",
        ]),
        industries: notesGrounded
          ? notesIndustries
          : industries.length > 0
            ? industries
            : topIndustries.slice(0, 3),
        painPoints: normalizeStringArray(parsed.icpProfile?.painPoints, 3, [
          "The workflow is manual, fragmented, and expensive to scale.",
          "Existing tools require too much setup and maintenance.",
          "Leadership cannot see cost or performance in one place.",
        ]),
        personas: normalizePersonas(parsed.icpProfile?.personas),
        targetingSource: modelGrounded ? "ai" : notesGrounded ? "heuristic" : "simulated",
        targetingGrounded: grounded,
        ...(grounded ? {} : { targetingIssue: ungroundedReason(scraped) }),
      },
      offers: normalizeOffers(parsed.offers, scraped.domain),
      scrapedData: scraped,
    };
  } catch (err) {
    console.error("[chad-gtm-research] AI synthesis failed, using grounded fallback:", err);
    return simulateGtmStrategy(scraped, optionalNotes, topIndustries, allIndustries);
  }
}

/** Decision makers to target when we only know the industry, not the buyer function. */
const OWNER_TITLES = ["Founder", "Owner", "CEO", "President"] as const;

function hasClientNotes(notes?: string): boolean {
  return String(notes ?? "").replace(/[^a-z0-9]/gi, "").length >= 3;
}

/** Words that never identify an industry on their own ("Financial Services" is not "services"). */
const GENERIC_INDUSTRY_WORDS = new Set([
  "and", "the", "for", "services", "service", "management", "practice", "care", "goods", "development",
  "organization", "organizations", "institutions", "other", "general", "products", "production", "related",
  "consumer", "business", "businesses", "supplies", "equipment", "international", "public", "industrial",
  "electronic", "electrical", "professional", "online", "information", "technology", "systems", "media",
  "companies", "company", "industry", "industries", "fine", "office", "facilities", "affairs", "relations",
  "program", "materials", "agent", "careers", "buyers", "seller", "excellent", "customer", "real",
]);

/**
 * Everyday words clients use for directory industries. Values are directory
 * industry names; a value only counts if it exists in the live directory.
 */
const INDUSTRY_SYNONYMS: Record<string, string[]> = {
  dental: ["Medical Practice", "Hospital & Health Care"],
  dentist: ["Medical Practice", "Hospital & Health Care"],
  dentistry: ["Medical Practice", "Hospital & Health Care"],
  orthodontist: ["Medical Practice"],
  clinic: ["Medical Practice", "Hospital & Health Care"],
  healthcare: ["Hospital & Health Care"],
  hospital: ["Hospital & Health Care"],
  law: ["Law Practice", "Legal Services"],
  doctor: ["Medical Practice"],
  physician: ["Medical Practice"],
  chiropractor: ["Alternative Medicine", "Medical Practice"],
  therapist: ["Mental Health Care", "Health, Wellness and Fitness"],
  gym: ["Health, Wellness and Fitness"],
  vet: ["Veterinary"],
  lawyer: ["Law Practice", "Legal Services"],
  attorney: ["Law Practice", "Legal Services"],
  realtor: ["Real Estate"],
  brokerage: ["Real Estate"],
  property: ["Real Estate"],
  mortgage: ["Financial Services"],
  accountant: ["Accounting"],
  bookkeeper: ["Accounting"],
  bookkeeping: ["Accounting"],
  cpa: ["Accounting"],
  saas: ["Computer Software"],
  software: ["Computer Software"],
  startup: ["Computer Software", "Internet"],
  ecommerce: ["Retail", "Internet"],
  shopify: ["Retail", "Internet"],
  store: ["Retail"],
  shop: ["Retail"],
  agency: ["Marketing and Advertising"],
  freight: ["Logistics and Supply Chain", "Transportation/Trucking/Railroad"],
  trucking: ["Transportation/Trucking/Railroad", "Logistics and Supply Chain"],
  shipping: ["Logistics and Supply Chain"],
  warehouse: ["Warehousing", "Logistics and Supply Chain"],
  contractor: ["Construction"],
  roofing: ["Construction"],
  plumbing: ["Construction"],
  plumber: ["Construction"],
  hvac: ["Construction"],
  builder: ["Construction"],
  hotel: ["Hospitality"],
  car: ["Automotive"],
  dealership: ["Automotive"],
  dealer: ["Automotive"],
  cafe: ["Restaurants", "Food & Beverages"],
  bakery: ["Food & Beverages", "Restaurants"],
  school: ["Education Management", "Primary/Secondary Education"],
  university: ["Higher Education"],
  college: ["Higher Education"],
  nonprofit: ["Non-Profit Organization Management"],
  charity: ["Non-Profit Organization Management"],
  recruiter: ["Staffing and Recruiting"],
  recruitment: ["Staffing and Recruiting"],
  manufacturer: ["Machinery", "Industrial Automation"],
  bank: ["Banking"],
  insurer: ["Insurance"],
  consultancy: ["Management Consulting"],
  consultant: ["Management Consulting"],
  photographer: ["Photography"],
  salon: ["Cosmetics", "Health, Wellness and Fitness"],
  spa: ["Health, Wellness and Fitness"],
};

/** Generic words in the same stemmed form as the tokens they are compared with. */
const GENERIC_INDUSTRY_STEMS = new Set([...GENERIC_INDUSTRY_WORDS].map((w) => stemWord(w)));

/** Lower-case, crude singular: "clinics" -> "clinic", "companies" -> "company", "logistics" -> "logistic". */
function stemWord(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function wordsOf(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/e-commerce/g, "ecommerce")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stemWord);
}

/** Case-insensitive de-duplication that keeps the first (most common) spelling. */
function uniqueIndustries(list: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of list) {
    const key = name.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Directory industries named in the client's own notes. Looser than
 * matchIndustriesInText (which guards against stray words in a crawled page):
 * one mention of a distinctive industry word or a common synonym is enough,
 * because the client typed it in answer to "who do you sell to?".
 * Returns exact directory values, best match first.
 */
export function matchIndustriesInNotes(notes: string | undefined, industries: string[], max = 3): string[] {
  const words = wordsOf(notes || "");
  if (words.length === 0) return [];
  const noteWords = new Set(words);
  const byKey = new Map<string, string>();
  industries.forEach((name) => {
    const key = String(name || "").toLowerCase().trim();
    if (key && !byKey.has(key)) byKey.set(key, name);
  });

  const scores = new Map<string, { industry: string; score: number; order: number }>();
  const add = (industry: string, score: number, order: number) => {
    const prev = scores.get(industry);
    if (prev) prev.score += score;
    else scores.set(industry, { industry, score, order });
  };

  industries.forEach((industry, order) => {
    const name = String(industry || "").trim();
    // Skip compound facet values ("Real Estate,Residential Real Estate,...").
    if (!name || /,\S/.test(name)) return;
    const tokens = [...new Set(wordsOf(name))].filter((t) => t.length >= 4 && !GENERIC_INDUSTRY_STEMS.has(t));
    const hits = tokens.filter((t) => noteWords.has(t)).length;
    if (hits > 0) add(name, hits * 2, order);
  });

  for (const word of noteWords) {
    // Own-property lookup only: notes like "constructor" must not hit Object.prototype.
    const targets = Object.prototype.hasOwnProperty.call(INDUSTRY_SYNONYMS, word) ? INDUSTRY_SYNONYMS[word] : [];
    for (const target of targets) {
      const actual = byKey.get(target.toLowerCase());
      if (actual) add(actual, 1, industries.indexOf(actual));
    }
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score || a.order - b.order);
  return uniqueIndustries(
    ranked.map((s) => s.industry),
    max,
  );
}

function ungroundedReason(scraped: ScrapedCompanyData): string {
  if (scraped.fetchFailed) {
    return "We couldn't read your website (it may block automated visits or need a login), so we haven't sent anything. Retry, or add a short note about who you sell to.";
  }
  return RESEARCH_BLOCKED_MESSAGE;
}

function normalizeStringArray(value: unknown, min: number, fallback: string[]): string[] {
  const arr = Array.isArray(value)
    ? value.map((v) => String(v).trim()).filter(Boolean)
    : [];
  return arr.length >= min ? arr : arr.length > 0 ? [...arr, ...fallback].slice(0, Math.max(min, arr.length)) : fallback;
}

function normalizePersonas(value: unknown): IcpPersona[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p: any) => p && typeof p === "object")
    .slice(0, 3)
    .map((p: any) => ({
      personaType: String(p.personaType || "Buyer"),
      titles: Array.isArray(p.titles) ? p.titles.map(String).slice(0, 3) : [],
      pains: Array.isArray(p.pains) ? p.pains.map(String).slice(0, 3) : [],
      valueAngle: String(p.valueAngle || ""),
      proofPoint: p.proofPoint ? String(p.proofPoint) : undefined,
    }));
}

function normalizeOffers(value: unknown, domain: string): GtmOffer[] {
  if (Array.isArray(value) && value.length >= 3) {
    return value.slice(0, 3).map((o: any, idx: number) => ({
      title: String(o?.title || `Offer ${idx + 1}`),
      angle: String(o?.angle || "Direct Value"),
      valueProp: String(o?.valueProp || ""),
      cta: String(o?.cta || "Open to a quick look?"),
    }));
  }
  return [
    {
      title: "Operational Friction Relief",
      angle: "Acute Pain Relief",
      valueProp: `Remove the manual step that slows down the team behind ${domain}.`,
      cta: "Worth a quick look?",
    },
    {
      title: "Speed & Margin",
      angle: "Direct ROI & Velocity",
      valueProp: "Cut the time and cost of this workflow without adding headcount.",
      cta: "Open to seeing the math?",
    },
    {
      title: "How It Works",
      angle: "Proof",
      valueProp: `A plain walkthrough of how ${domain} would fit the team's current workflow.`,
      cta: "Want me to explain how it would work?",
    },
  ];
}

/**
 * Grounded heuristic synthesis fallback when AI API keys are not reachable.
 * Uses only signals actually present in the crawl.
 */
function simulateGtmStrategy(
  scraped: ScrapedCompanyData,
  optionalNotes?: string,
  topIndustries: string[] = [],
  allIndustries: string[] = topIndustries
): SynthesizedGtmStrategy {
  const brandName =
    scraped.title && scraped.title.length < 40
      ? scraped.title.split(/[-|·–]/)[0].trim()
      : scraped.domain.split(".")[0];

  // Heuristic targeting: only directory industries the client names on their
  // own site or in their notes. Anything else would be invented, so the run is
  // marked ungrounded and autopilot asks the client instead of launching.
  const ownWords = [
    optionalNotes || "",
    scraped.fetchFailed ? "" : scraped.combinedCorpus || "",
    scraped.fetchFailed ? "" : [scraped.title, scraped.description, ...(scraped.headings || [])].join(" "),
  ].join(" \n ");
  // The client's notes are an explicit answer to "who do you sell to", so one
  // loose mention there is enough ("dental clinics", "logistics companies").
  const namedIndustries = uniqueIndustries(
    [...matchIndustriesInNotes(optionalNotes, allIndustries, 3), ...matchIndustriesInText(ownWords, allIndustries, 3)],
    3,
  );
  const grounded = namedIndustries.length > 0;

  const primaryIndustry = namedIndustries[0] || topIndustries[0] || "Software & Technology";
  const secondaryIndustry = namedIndustries[1] || (grounded ? "" : topIndustries[1] || "Internet");
  const tertiaryIndustry = namedIndustries[2] || (grounded ? "" : topIndustries[2] || "Information Technology");
  const icpIndustries = [primaryIndustry, secondaryIndustry, tertiaryIndustry].filter(Boolean);

  const proofPoints = (scraped.caseStudySignals || []).slice(0, 3);
  const contrasts = (scraped.competitorSignals || []).slice(0, 2).map((signal) => ({
    competitor: extractCompetitorName(signal),
    contrast: signal,
  }));
  const pricingTiers = (scraped.pricingTiers || []).slice(0, 5);

  const hasPricing = pricingTiers.length > 0;
  const firstValue = scraped.featuresAndBullets?.[0] || "";
  const secondValue = scraped.featuresAndBullets?.[1] || "";
  const description =
    scraped.description ||
    `helps teams replace a manual workflow with a faster, measurable process`;

  return {
    companyName: brandName,
    categoryIntelligence: {
      serviceCategory: `${brandName} — ${primaryIndustry}`,
      provenOutboundMeta: [
        "Lead with the specific workflow the buyer already owns, not the category.",
        "Use one grounded proof point; never stack adjectives.",
      ],
      competitorBenchmarks: contrasts.length
        ? contrasts.map((c) => ({
            name: c.competitor,
            offer: "Incumbent alternative mentioned on the site",
            angle: c.contrast,
          }))
        : [
            {
              name: "Incumbent tools",
              offer: "Broader platform with heavier setup",
              angle: "Faster time-to-value without a services engagement",
            },
          ],
    },
    businessOverview: {
      summary: `${brandName} ${description.replace(/^We\s+/i, "")}`.trim(),
      valuePropositions: [
        firstValue || "Replace the manual workflow with one owned system.",
        secondValue || "Cut the operating cost of the process without new headcount.",
        "See whether it works in a short, low-risk pilot.",
      ],
      keyDifferentiators: [
        "Built for this specific workflow rather than a generic platform.",
        "Deploys without a long integration or services project.",
        hasPricing ? "Pricing is visible and scales with usage." : "Transparent commercial model.",
      ],
      targetMarket: `Teams that already employ someone responsible for this workflow.`,
      proofPoints,
      competitorContrasts: contrasts,
      pricingTiers,
      pricingModel: hasPricing ? "Published tiers" : "",
    },
    icpProfile: {
      // With grounded industries, aim at the owners/decision makers of those
      // businesses rather than guessing a functional buyer.
      targetTitles: grounded
        ? [...OWNER_TITLES]
        : ["Founder", "VP of Operations", "Head of Engineering"],
      companySizes: ["11-50", "51-200", "201-500"],
      industries: icpIndustries,
      targetingSource: grounded ? "heuristic" : "simulated",
      targetingGrounded: grounded,
      ...(grounded ? {} : { targetingIssue: ungroundedReason(scraped) }),
      painPoints: [
        "The current process is manual, fragmented, and hard to audit.",
        "Existing tools take too long to implement and maintain.",
        "Leadership lacks a single view of cost and throughput.",
      ],
      personas: [
        {
          personaType: "Economic Buyer",
          titles: ["Founder", "COO", "CFO"],
          pains: ["Cost scales faster than output.", "No clear payback story for the current stack."],
          valueAngle: "Lower the cost of the workflow while making the output measurable.",
          proofPoint: proofPoints[0],
        },
        {
          personaType: "Technical Buyer",
          titles: ["CTO", "VP Engineering", "Head of Data"],
          pains: ["Integration and maintenance steal engineering time.", "Security review stalls adoption."],
          valueAngle: "Deploy quickly without owning another brittle internal system.",
          proofPoint: proofPoints[1],
        },
        {
          personaType: "End User / Champion",
          titles: ["Head of Operations", "RevOps Lead", "Staff Engineer"],
          pains: ["Manual reconciliation eats the week.", "Workarounds break at scale."],
          valueAngle: "Get the daily workflow down to a repeatable few clicks.",
          proofPoint: proofPoints[2],
        },
      ],
    },
    offers: [
      {
        title: "Operational Friction Relief",
        angle: "Acute Pain Relief",
        valueProp: `Remove the manual step that slows down ${brandName}'s buyer every week.`,
        cta: "Worth a quick look?",
      },
      {
        title: "Speed & Margin",
        angle: "Direct ROI & Velocity",
        valueProp: "Cut the time and cost of this workflow without adding headcount.",
        cta: "Open to seeing the math?",
      },
      {
        title: "Zero-Risk Teardown",
        angle: "Zero-Risk Proof",
        valueProp: "A short, specific teardown of where the current workflow leaks time.",
        cta: "Mind if I send it over?",
      },
    ],
    scrapedData: {
      ...scraped,
      caseStudySignals: proofPoints,
      competitorSignals: scraped.competitorSignals || [],
      pricingTiers,
    },
  };
}

function extractCompetitorName(signal: string): string {
  const match = signal.match(
    /(?:unlike|compared (?:to|with)|vs\.?|versus|alternative(?:s)? to|better than|replaces?)\s+([A-Z][A-Za-z0-9.+-]{1,24})/
  );
  return match?.[1] || "Incumbent tools";
}
