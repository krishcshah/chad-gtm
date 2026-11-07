/**
 * Company research for cold email personalization.
 *
 * Before a lead's first email, read their company's website (the homepage
 * plus up to three news, careers or about pages) and look for TRIGGERS: facts
 * about the company's own operations that change the recipient's job in a way
 * the sender's offer touches (an acquisition, new locations, funding, hiring,
 * a system change). Product marketing, customer counts and case studies are
 * not triggers and are dropped.
 *
 * Grounding: every fact must quote the page, and every name and number in the
 * fact must appear in that quote. Anything else is discarded, so the
 * copywriter can never open with an invented detail.
 *
 * Safety: only public http(s) hosts on default ports, every DNS answer must be
 * a public address (no loopback, private, link-local or metadata ranges), at
 * most 3 redirects (each re-checked), a short timeout and a size cap.
 *
 * Results are cached in memory per domain and sender offer, so colleagues at
 * the same company reuse one lookup. A failed lookup is cached briefly.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isValidDomainName } from "./lead-investigation";

export type FactSubject = "company_ops" | "product" | "customers" | "marketing";

export interface CompanyFact {
  /** One short sentence that restates the quote. */
  fact: string;
  /** Exact text from the page that supports it. */
  quote: string;
  /** Path of the page it came from, e.g. "/news". */
  page?: string;
  /** Date the page gives for it (as written), if any. */
  date?: string;
  /** 0-3: how much it changes the recipient's work in a way the offer touches. */
  relevance: number;
  /** Why it matters to the recipient, in one sentence (the model's reasoning). */
  bridge?: string;
}

export interface CompanyResearch {
  domain: string;
  /** True when the website was read. */
  fetched: boolean;
  /** One plain sentence: what the company does, for whom. Empty if unknown. */
  summary: string;
  /** Who they sell to, if the site says. */
  sellsTo: string;
  /** startup | mid-market | enterprise, when the site makes it clear. */
  sizeHint: string;
  /** Tools and systems the site names (from careers or press pages). */
  systems: string[];
  /** Grounded triggers, best first. Only these may open an email. */
  facts: CompanyFact[];
  researchedAt: string;
}

/** What the sender sells and to whom, so research looks for the right triggers. */
export interface ResearchFocus {
  senderOffer?: string;
  recipientTitle?: string;
  buyerPains?: string[];
}

const OK_TTL_MS = 7 * 24 * 3600_000;
const FAIL_TTL_MS = 6 * 3600_000;
const CACHE_MAX = 5000;
const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 600_000;
const HOME_CHARS = 4000;
const PAGE_CHARS = 3000;
const EXTRA_PAGES = 3;

const cache = new Map<string, { at: number; value: CompanyResearch }>();

export function clearCompanyResearchCache() {
  cache.clear();
}

/** Domain from a website or a work email; "" unless it is a valid public hostname. */
export function companyDomain(website?: string | null, email?: string | null): string {
  let host = "";
  const site = String(website || "").trim().toLowerCase();
  if (site) {
    try {
      host = new URL(/^https?:\/\//.test(site) ? site : `https://${site}`).hostname;
    } catch {
      host = "";
    }
  }
  if (!host && email && email.includes("@")) host = email.split("@").pop()!.trim().toLowerCase();
  host = host.replace(/^www\./, "");
  return isValidDomainName(host) ? host : "";
}

/* ─── Network safety ─────────────────────────────────────────────────── */

function isPublicIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false; // multicast + reserved
  return true;
}

function isPublicIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return false;
  if (/^fe[89ab]/.test(v)) return false; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return false; // unique local
  if (v.startsWith("ff")) return false; // multicast
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIPv4(mapped[1]!);
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPublicIPv4(ip);
  if (kind === 6) return isPublicIPv6(ip);
  return false;
}

export type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/** True when the URL may be fetched: http(s), default port, valid hostname, public addresses only. */
export async function isFetchableUrl(raw: string, resolve: Resolver = defaultResolver): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.port) return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (isIP(host) || !isValidDomainName(host)) return false;
  try {
    const addrs = await resolve(host);
    return addrs.length > 0 && addrs.every(isPublicAddress);
  } catch {
    return false;
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Fetch an HTML page safely; returns the final URL and HTML, or null on anything unexpected. */
export async function fetchPage(
  start: string,
  deps: { fetch?: Fetcher; resolve?: Resolver } = {},
): Promise<{ url: string; html: string } | null> {
  const doFetch: Fetcher = deps.fetch ?? ((u, i) => fetch(u, i));
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await isFetchableUrl(url, deps.resolve))) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await doFetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; AutoGTM-research/1.0; +https://autogtm.tech)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        url = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) return null;
      const type = res.headers.get("content-type") || "";
      if (!/text\/html|application\/xhtml/i.test(type)) return null;
      if (!res.body) return { url, html: (await res.text()).slice(0, MAX_BYTES) };
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        size += value.byteLength;
      }
      reader.cancel().catch(() => {});
      return { url, html: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c)))) };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Back-compat wrapper: HTML only. */
export async function fetchPageHtml(start: string, deps: { fetch?: Fetcher; resolve?: Resolver } = {}): Promise<string | null> {
  return (await fetchPage(start, deps))?.html ?? null;
}

/* ─── HTML → readable text ───────────────────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…", trade: "™", reg: "®", copy: "©" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * Readable page text for fact extraction: title and description first, then
 * real sentences, then a capped number of short fragments (menus, buttons).
 */
export function htmlToText(html: string, maxChars = HOME_CHARS): string {
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']{1,400})["']`, "i"))?.[1] ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,400})["'][^>]*(?:name|property)=["']${name}["']`, "i"))?.[1] ||
    "";
  const title = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1] || "";
  const desc = meta("description") || meta("og:description");
  const body = html
    .replace(/<(script|style|noscript|svg|iframe|template|select|button)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|form|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|li|h[1-6]|article|header|tr|a|span|time)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const clean = (l: string) => decodeEntities(l).replace(/\s+/g, " ").trim();
  const lines = body.split("\n").map(clean).filter((l) => l.length >= 3);
  const head = [clean(title), clean(desc)].filter(Boolean);
  const seen = new Set<string>(head.map((h) => h.toLowerCase()));
  const sentences: string[] = [];
  const fragments: string[] = [];
  for (const l of lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    // Spaced-out letters ("P a y r o l l") are animation markup, not text.
    if (/^(?:\S ){4,}\S$/.test(l)) continue;
    const words = l.split(" ").length;
    // Dates on news pages are short but matter.
    const isDate = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}\b|\b\d{4}-\d{2}-\d{2}\b/i.test(l);
    if (words >= 6 || isDate) sentences.push(l);
    else if (fragments.length < 30) fragments.push(l);
  }
  return [...head, ...sentences, ...fragments].join("\n").slice(0, maxChars);
}

const PAGE_PRIORITY: Array<[RegExp, number]> = [
  [/\/(news|newsroom|press|press-releases|media|announcements)(\/|$)/i, 3],
  [/\/(careers|jobs|join-us|work-with-us)(\/|$)/i, 2],
  [/\/(about|about-us|company|who-we-are|investors|investor-relations)(\/|$)/i, 1],
];

/** Same-site news, careers and about links from a homepage, best first, one per kind. */
export function pickResearchLinks(html: string, baseUrl: string, max = EXTRA_PAGES): string[] {
  const base = new URL(baseUrl);
  const host = base.hostname.replace(/^www\./, "");
  const scored = new Map<string, number>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1]!, base);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (u.hostname.replace(/^www\./, "") !== host) continue;
    if (u.pathname.split("/").filter(Boolean).length > 2) continue;
    const score = PAGE_PRIORITY.find(([re]) => re.test(u.pathname))?.[1];
    if (!score) continue;
    const key = `${u.origin}${u.pathname.replace(/\/$/, "")}`;
    scored.set(key, Math.max(scored.get(key) ?? 0, score));
  }
  const byKind = new Map<number, string>();
  for (const [url, score] of [...scored.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)) {
    if (!byKind.has(score)) byKind.set(score, url);
  }
  return [...byKind.entries()].sort((a, b) => b[0] - a[0]).map(([, url]) => url).slice(0, max);
}

/* ─── Fact extraction ────────────────────────────────────────────────── */

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const SPELLED = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "thirty", "forty", "fifty", "hundred", "thousand", "million", "billion"];

/** Names and numbers in a fact sentence that its quote must also contain. */
export function factTokens(fact: string, companyName = ""): string[] {
  const company = new Set(squash(companyName).split(" ").filter(Boolean));
  const words = fact.replace(/[’']s\b/g, "").split(/\s+/);
  const out: string[] = [];
  words.forEach((w, i) => {
    const bare = w.replace(/[^A-Za-z0-9]/g, "");
    if (!bare) return;
    const lower = bare.toLowerCase();
    if (company.has(lower)) return;
    if (/\d/.test(bare)) out.push(lower);
    else if (SPELLED.includes(lower)) out.push(lower);
    else if (i > 0 && /^[A-Z]/.test(bare) && bare.length > 1) out.push(lower);
  });
  return out;
}

const SCALE_BRAG = /\b(trusted by|used by|loved by|customers|clients|users|professionals|businesses|locations|members|restaurants|firms)\b/i;

/**
 * Keep only facts that are (a) quoted from the page, (b) fully supported by
 * their quote, (c) about the company's own operations, and (d) relevant.
 */
export function groundFacts(facts: unknown, pageText: string, companyName = ""): CompanyFact[] {
  if (!Array.isArray(facts)) return [];
  const page = ` ${squash(pageText)} `;
  const out: CompanyFact[] = [];
  for (const f of facts as any[]) {
    const fact = String(f?.fact || "").trim();
    const quote = String(f?.quote || "").trim();
    const q = squash(quote);
    if (!fact || fact.length > 220 || q.length < 12 || !page.includes(` ${q} `)) continue;
    const subject = String(f?.subject || "company_ops") as FactSubject;
    if (subject !== "company_ops") continue;
    // "Trusted by 189,000 locations" is their customers, never their own scale.
    if (SCALE_BRAG.test(quote) && /\d/.test(quote)) continue;
    const quoted = ` ${q} `;
    if (factTokens(fact, companyName).some((t) => !quoted.includes(` ${t} `))) continue;
    const relevance = Math.max(0, Math.min(3, Number(f?.relevance) || 0));
    if (relevance < 2) continue;
    out.push({
      fact,
      quote,
      page: f?.page ? String(f.page).slice(0, 80) : undefined,
      date: f?.date ? String(f.date).slice(0, 40) : undefined,
      relevance,
      bridge: f?.bridge ? String(f.bridge).slice(0, 240) : undefined,
    });
  }
  return out.sort((a, b) => b.relevance - a.relevance).slice(0, 3);
}

const EXTRACT_SYSTEM =
  "You research companies for a B2B seller. You find concrete facts about how a company is changing that would make a specific person there care about a specific offer. You never guess and never stretch a fact. Return one JSON object.";

export function buildExtractionPrompt(
  company: string,
  domain: string,
  pages: Array<{ path: string; text: string }>,
  focus: ResearchFocus = {},
): string {
  const name = company || domain;
  const body = pages.map((p) => `PAGE ${p.path}\n"""\n${p.text}\n"""`).join("\n\n");
  return `Company researched: ${name} (${domain})
Seller's offer: ${focus.senderOffer || "(not given)"}
Person we will email there: ${focus.recipientTitle || "(unknown title)"}
Problems the offer solves: ${(focus.buyerPains ?? []).join("; ") || "(not given)"}

${body}

Find TRIGGERS: facts about ${name}'s OWN operations that change the daily work of the person above in a way the seller's offer touches. Good triggers: acquisitions, mergers, new entities or subsidiaries, new locations, offices or countries, funding, going public, fast growth or hiring (especially roles near the person above), leadership changes, system or tool changes, restructuring.
Prefer the most significant event relative to the company's size: a small tuck-in at a large public company matters less than a major merger. Events (acquisitions, openings, funding, hires, launches) need the date the page gives; with no date, rate relevance at most 1 unless the page clearly says it is current.
NOT triggers (never return these): features of their product, their customer or user counts ("trusted by 10,000 teams"), case studies about their customers, awards, slogans, blog topics, pricing, legal text.

Return JSON:
{
  "summary": "one plain sentence: what ${name} does and for whom, max 25 words",
  "sellsTo": "who their customers are, a few words, or empty",
  "sizeHint": "startup | mid-market | enterprise | empty (only if the pages make it clear: a stock listing such as NYSE or Nasdaq means enterprise; Fortune 500; employee or office counts)",
  "systems": ["tools the company ITSELF uses that the person above would work in (from job posts or press), not integrations it sells; else empty"],
  "facts": [
    {
      "fact": "one short sentence that ONLY restates the quote; every name, number and place in it must appear in the quote",
      "quote": "the exact words from one PAGE above: a contiguous span of a single line, copied verbatim, 6-35 words",
      "page": "the PAGE path it came from",
      "date": "the date the page gives for it, as written, or empty",
      "subject": "company_ops | product | customers | marketing",
      "relevance": 0,
      "bridge": "one sentence: the concrete consequence for this person, without guessing"
    }
  ]
}
relevance: 3 = clearly changes this person's work in a way the offer helps; 2 = plausibly; 1 = weak; 0 = none.
Return only facts you rate 2 or 3, best first, at most 4. If nothing qualifies, return an empty facts array. An empty array is a good answer; a stretched fact is a bad one.`;
}

export interface ResearchDeps {
  fetch?: Fetcher;
  resolve?: Resolver;
  /** Prompt + system in, parsed JSON (or null without a model) out. */
  llm: (prompt: string, system: string) => Promise<any>;
  now?: () => number;
}

function focusKey(focus: ResearchFocus): string {
  const s = `${focus.senderOffer || ""}|${focus.recipientTitle || ""}`.toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

/** Homepage plus up to three news, careers or about pages, as readable text. */
export async function readCompanySite(
  domain: string,
  deps: { fetch?: Fetcher; resolve?: Resolver } = {},
): Promise<Array<{ path: string; text: string }>> {
  const home = (await fetchPage(`https://${domain}/`, deps)) ?? (await fetchPage(`https://www.${domain}/`, deps));
  if (!home) return [];
  const pages: Array<{ path: string; text: string }> = [{ path: "/", text: htmlToText(home.html, HOME_CHARS) }];
  for (const link of pickResearchLinks(home.html, home.url)) {
    const p = await fetchPage(link, deps);
    if (p) pages.push({ path: new URL(link).pathname || "/", text: htmlToText(p.html, PAGE_CHARS) });
  }
  return pages;
}

export function parseExtraction(raw: any, domain: string, company: string, pages: Array<{ text: string }>, now: number): CompanyResearch {
  const allText = pages.map((p) => p.text).join("\n");
  let size = String(raw?.sizeHint || "").toLowerCase().trim();
  // A stock listing on the site settles it.
  if (!size && /\b(?:NYSE|NASDAQ|Nasdaq|LSE|TSX)\s*:\s*[A-Z]{1,5}\b/.test(allText)) size = "enterprise";
  return {
    domain,
    fetched: true,
    summary: String(raw?.summary || "").trim().slice(0, 240),
    sellsTo: String(raw?.sellsTo || "").trim().slice(0, 120),
    sizeHint: ["startup", "mid-market", "enterprise"].includes(size) ? size : "",
    // A system only counts if a page actually names it.
    systems: (Array.isArray(raw?.systems) ? raw.systems : [])
      .map((s: unknown) => String(s || "").trim())
      .filter((s: string) => s.length > 1 && allText.toLowerCase().includes(s.toLowerCase()))
      .slice(0, 6),
    facts: groundFacts(raw?.facts, allText, company),
    researchedAt: new Date(now).toISOString(),
  };
}

export async function researchCompany(
  input: { company?: string | null; website?: string | null; email?: string | null },
  deps: ResearchDeps,
  focus: ResearchFocus = {},
): Promise<CompanyResearch | null> {
  const domain = companyDomain(input.website, input.email);
  if (!domain) return null;
  const now = deps.now ? deps.now() : Date.now();
  // Triggers depend on who we write to, so the cache is per domain + focus.
  const key = `${domain}|${focusKey(focus)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < (hit.value.fetched ? OK_TTL_MS : FAIL_TTL_MS)) return hit.value;

  let result: CompanyResearch = {
    domain,
    fetched: false,
    summary: "",
    sellsTo: "",
    sizeHint: "",
    systems: [],
    facts: [],
    researchedAt: new Date(now).toISOString(),
  };

  const pages = await readCompanySite(domain, deps);
  if (pages.map((p) => p.text).join("\n").length >= 200) {
    try {
      const company = String(input.company || "");
      const raw = await deps.llm(buildExtractionPrompt(company, domain, pages, focus), EXTRACT_SYSTEM);
      if (raw) result = parseExtraction(raw, domain, company, pages, now);
    } catch (err) {
      console.warn(`[company-research] extraction failed for ${domain}:`, (err as Error)?.message || err);
    }
  }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: now, value: result });
  return result;
}
