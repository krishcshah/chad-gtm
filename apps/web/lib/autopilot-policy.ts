/**
 * Launch policy for autopilot / AutoGTM campaigns.
 *
 * Pure functions only (no DB, no network) so every rule here is unit-tested:
 *  - audience: work addresses only, allowed countries only
 *  - targeting: never launch on invented (simulated) industries/titles
 *  - compliance: CAN-SPAM identity (company name + postal address)
 *  - readiness: what still blocks a launch, in the order the client fixes it
 *  - rate limits on website analysis
 *  - the sending window autopilot campaigns use
 */

/* ─── Audience ───────────────────────────────────────────────────────── */

/**
 * Consumer mailbox providers and ISP mail domains. Matched exactly or as a
 * parent domain (e.g. "cfl.rr.com" matches "rr.com").
 */
export const FREEMAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Global webmail
  "gmail.com", "googlemail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "aim.com", "aol.co.uk", "love.com", "games.com", "wow.com",
  "yahoo.com", "ymail.com", "rocketmail.com", "yahoomail.com",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "passport.com", "windowslive.com",
  "protonmail.com", "protonmail.ch", "proton.me", "pm.me", "tutanota.com", "tutanota.de", "tuta.io",
  "fastmail.com", "fastmail.fm", "hushmail.com", "zohomail.com", "mail.com", "email.com",
  "inbox.com", "lycos.com", "excite.com", "usa.com", "post.com", "myself.com", "consultant.com",
  "gmx.com", "gmx.net", "gmx.de", "gmx.at", "gmx.ch", "gmx.us", "web.de", "freenet.de", "t-online.de",
  "yandex.com", "yandex.ru", "ya.ru", "mail.ru", "bk.ru", "inbox.ru", "list.ru", "rambler.ru",
  "qq.com", "163.com", "126.com", "yeah.net", "sina.com", "sina.cn", "sohu.com", "aliyun.com",
  "naver.com", "hanmail.net", "daum.net", "rediffmail.com", "seznam.cz", "wp.pl", "o2.pl", "onet.pl", "interia.pl",
  "libero.it", "virgilio.it", "tiscali.it", "alice.it", "tin.it",
  "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "sfr.fr", "neuf.fr", "club-internet.fr",
  "btinternet.com", "sky.com", "virginmedia.com", "ntlworld.com", "talktalk.net", "blueyonder.co.uk",
  "bigpond.com", "bigpond.net.au", "optusnet.com.au", "iinet.net.au", "xtra.co.nz",
  "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br",
  // US / Canada ISPs
  "comcast.net", "xfinity.com", "sbcglobal.net", "att.net", "verizon.net", "bellsouth.net", "cox.net",
  "charter.net", "spectrum.net", "earthlink.net", "mindspring.com", "juno.com", "netzero.net", "netzero.com",
  "optonline.net", "optimum.net", "rr.com", "roadrunner.com", "twc.com", "frontier.com", "frontiernet.net",
  "windstream.net", "centurylink.net", "centurytel.net", "q.com", "qwest.net", "embarqmail.com",
  "pacbell.net", "swbell.net", "ameritech.net", "prodigy.net", "flash.net", "nvbell.net", "snet.net", "wans.net",
  "cs.com", "netscape.net", "netscape.com", "compuserve.com", "suddenlink.net", "mediacombb.net", "wowway.com",
  "rcn.com", "knology.net", "hughes.net", "peoplepc.com", "excite.net",
  "rogers.com", "shaw.ca", "sympatico.ca", "videotron.ca", "telus.net", "bell.net", "cogeco.ca", "eastlink.ca",
]);

/**
 * Provider brands that are personal mail under any country TLD
 * (yahoo.co.uk, hotmail.fr, live.com.mx, gmx.es, ...).
 */
const FREEMAIL_BRANDS = new Set([
  "gmail", "googlemail", "yahoo", "ymail", "rocketmail", "hotmail", "outlook", "live", "msn",
  "aol", "icloud", "gmx", "yandex", "protonmail", "rediffmail", "libero", "windowslive",
]);

/** Common second-level public suffix labels ("co.uk", "com.au", ...). */
const SECOND_LEVEL_SUFFIX = new Set(["co", "com", "net", "org", "ne", "or", "ac", "gov", "edu"]);

export function emailDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1).trim().toLowerCase().replace(/\.$/, "") : "";
}

export function isFreemailDomain(rawDomain: string): boolean {
  const domain = rawDomain.trim().toLowerCase().replace(/\.$/, "");
  if (!domain) return false;
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (FREEMAIL_DOMAINS.has(labels.slice(i).join("."))) return true;
  }
  // brand.tld or brand.co.tld (country variants of the big webmail brands)
  if (labels.length === 2 && FREEMAIL_BRANDS.has(labels[0]!)) return true;
  if (labels.length === 3 && FREEMAIL_BRANDS.has(labels[0]!) && SECOND_LEVEL_SUFFIX.has(labels[1]!)) return true;
  // email.msn.com, mail.yahoo.com style subdomains
  if (labels.length >= 3 && FREEMAIL_BRANDS.has(labels[labels.length - 2]!)) return true;
  return false;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isWorkEmail(address: string | null | undefined): boolean {
  const value = String(address || "").trim();
  if (!EMAIL_SHAPE.test(value)) return false;
  return !isFreemailDomain(emailDomain(value));
}

/**
 * The address autopilot may email for a directory lead: its work address,
 * only when that address is not a consumer/ISP mailbox. The directory's
 * generic `email` column is used only when it equals the work address, so a
 * lead whose primary email is personal is never contacted at that address.
 */
export function pickWorkAddress(lead: { email?: string | null; workEmail?: string | null }): string | null {
  const work = String(lead.workEmail || "").trim();
  if (work && isWorkEmail(work)) return work;
  return null;
}

export const DEFAULT_AUTOPILOT_COUNTRIES = ["United States"];

/** AUTOPILOT_COUNTRIES: comma list of directory country names. Default "United States". */
export function parseAutopilotCountries(raw: string | undefined | null): string[] {
  const list = String(raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return list.length > 0 ? Array.from(new Set(list)) : [...DEFAULT_AUTOPILOT_COUNTRIES];
}

export function autopilotCountries(env: Record<string, string | undefined> = process.env): string[] {
  return parseAutopilotCountries(env.AUTOPILOT_COUNTRIES);
}

/** Country check for a directory lead (case-insensitive exact name match). */
export function isAllowedCountry(country: string | null | undefined, allowed: string[]): boolean {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return false;
  return allowed.some((c) => c.trim().toLowerCase() === value);
}

/* ─── Sending window ─────────────────────────────────────────────────── */

export const DEFAULT_AUTOPILOT_TIMEZONE = "America/New_York";

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** AUTOPILOT_TIMEZONE (IANA name). Invalid or empty values fall back to America/New_York. */
export function resolveAutopilotTimezone(raw: string | undefined | null): string {
  const tz = String(raw ?? "").trim();
  return isValidTimeZone(tz) ? tz : DEFAULT_AUTOPILOT_TIMEZONE;
}

/** Monday–Friday, 09:00–17:00 in the autopilot timezone. */
export function autopilotSendingWindow(env: Record<string, string | undefined> = process.env) {
  return {
    businessDaysOnly: true,
    sendingTimezone: resolveAutopilotTimezone(env.AUTOPILOT_TIMEZONE),
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:00",
  } as const;
}

/* ─── Targeting provenance ───────────────────────────────────────────── */

/**
 * Where the ICP targeting (industries + titles) came from.
 *  ai         the model chose it from the crawl
 *  heuristic  no model; industries named on the client's own site or notes
 *  simulated  hard-coded defaults, not derived from the client — never launch
 */
export type TargetingSource = "ai" | "heuristic" | "simulated";

export interface TargetingAssessment {
  grounded: boolean;
  source: TargetingSource | "unknown";
  reason?: string;
}

export const RESEARCH_BLOCKED_MESSAGE =
  "We couldn't work out who to target from your website, so we haven't sent anything. Retry the research, or add a short note about who you sell to (for example \"dental clinics\" or \"logistics companies\").";

export const RESEARCH_REFRESH_MESSAGE =
  "This plan was made before we started checking where targeting comes from. Retry the research so we only email the audience your website describes.";

/**
 * Is this run's targeting safe to launch autopilot on? Only targeting the
 * model chose from the crawl ("ai") or industries the client named
 * ("heuristic") qualifies. Runs saved before provenance was recorded have no
 * source and must be re-researched, since they may hold invented defaults.
 * (Guided runs skip this check: the client reviewed and edited the targeting.)
 */
export function assessTargeting(icpProfile: unknown): TargetingAssessment {
  const icp = (icpProfile && typeof icpProfile === "object" ? icpProfile : {}) as Record<string, any>;
  const source = icp.targetingSource as TargetingSource | undefined;
  const industries = Array.isArray(icp.industries) ? icp.industries.filter(Boolean) : [];
  if (industries.length === 0) {
    return { grounded: false, source: source ?? "unknown", reason: RESEARCH_BLOCKED_MESSAGE };
  }
  if (source !== "ai" && source !== "heuristic") {
    return { grounded: false, source: "unknown", reason: RESEARCH_REFRESH_MESSAGE };
  }
  if (icp.targetingGrounded === false) {
    return {
      grounded: false,
      source,
      reason: typeof icp.targetingIssue === "string" && icp.targetingIssue ? icp.targetingIssue : RESEARCH_BLOCKED_MESSAGE,
    };
  }
  return { grounded: true, source };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Directory industries explicitly named in the client's own words (crawl +
 * notes), most-mentioned first. Single-word industries need two mentions so a
 * stray "internet" or "retail" in a footer does not decide the audience.
 */
export function matchIndustriesInText(text: string, industries: string[], max = 3): string[] {
  const corpus = ` ${String(text || "").toLowerCase().replace(/\s+/g, " ")} `;
  if (corpus.trim().length === 0) return [];
  const scored: Array<{ industry: string; hits: number; order: number }> = [];
  industries.forEach((industry, order) => {
    const name = String(industry || "").trim();
    if (name.length < 4) return;
    const variants = new Set([name.toLowerCase(), name.toLowerCase().replace(/&/g, "and")]);
    let hits = 0;
    for (const v of variants) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(v)}([^a-z0-9]|$)`, "g");
      hits += (corpus.match(re) || []).length;
    }
    const multiWord = /\s/.test(name);
    if (hits >= (multiWord ? 1 : 2)) scored.push({ industry: name, hits, order });
  });
  scored.sort((a, b) => b.hits - a.hits || a.order - b.order);
  return scored.slice(0, max).map((s) => s.industry);
}

/* ─── CAN-SPAM identity ──────────────────────────────────────────────── */

export interface ComplianceIdentity {
  companyName?: string | null;
  postalAddress?: string | null;
}

export interface ComplianceProblems {
  companyName?: string;
  postalAddress?: string;
}

/** Field errors for the sender identity every commercial email must carry. */
export function complianceProblems(identity: ComplianceIdentity): ComplianceProblems {
  const out: ComplianceProblems = {};
  const name = String(identity.companyName || "").trim();
  const address = String(identity.postalAddress || "").trim();
  if (name.length < 2) out.companyName = "Enter your company's legal or trading name.";
  if (name.length > 200) out.companyName = "Company name is too long (200 characters max).";
  if (address.length < 10 || !/\d/.test(address) || !/[a-z]/i.test(address)) {
    out.postalAddress =
      "Enter a full physical postal address (street or P.O. box, city, postcode, country). The law requires it in every email.";
  }
  if (address.length > 1000) out.postalAddress = "Postal address is too long.";
  return out;
}

export function hasCompliantIdentity(identity: ComplianceIdentity): boolean {
  return Object.keys(complianceProblems(identity)).length === 0;
}

/* ─── Launch readiness ───────────────────────────────────────────────── */

export type LaunchBlocker =
  | { kind: "research"; message: string }
  | { kind: "details"; missing: Array<"bookingUrl" | "companyName" | "postalAddress">; message: string }
  | { kind: "approval"; message: string };

export interface ReadinessInput {
  icpProfile: unknown;
  /** Only autopilot runs require research-grounded targeting; guided runs were human-reviewed. */
  requireGroundedTargeting: boolean;
  bookingUrl: string | null | undefined;
  /** Booking link is required for autopilot (the reply agent books calls). */
  requireBookingUrl: boolean;
  identity: ComplianceIdentity;
  approved: boolean;
}

export const AWAITING_APPROVAL_MESSAGE =
  "Your plan is ready. We review every new account before it can send from our mailboxes, and you can launch from this screen as soon as you're approved.";

/** Every reason a launch cannot happen yet, in the order the client resolves them. */
export function launchBlockers(input: ReadinessInput): LaunchBlocker[] {
  const blockers: LaunchBlocker[] = [];
  if (input.requireGroundedTargeting) {
    const t = assessTargeting(input.icpProfile);
    if (!t.grounded) blockers.push({ kind: "research", message: t.reason || RESEARCH_BLOCKED_MESSAGE });
  }
  const missing: Array<"bookingUrl" | "companyName" | "postalAddress"> = [];
  if (input.requireBookingUrl && !String(input.bookingUrl || "").trim()) missing.push("bookingUrl");
  const problems = complianceProblems(input.identity);
  if (problems.companyName) missing.push("companyName");
  if (problems.postalAddress) missing.push("postalAddress");
  if (missing.length > 0) {
    blockers.push({ kind: "details", missing, message: detailsMessage(missing) });
  }
  if (!input.approved) blockers.push({ kind: "approval", message: AWAITING_APPROVAL_MESSAGE });
  return blockers;
}

function detailsMessage(missing: string[]): string {
  const parts: string[] = [];
  if (missing.includes("bookingUrl")) parts.push("where interested leads should book");
  if (missing.includes("companyName") || missing.includes("postalAddress")) {
    parts.push("your company name and postal address for the email footer (required by anti-spam law)");
  }
  return `Before we send anything we need ${parts.join(", and ")}.`;
}

/* ─── Launch failures ────────────────────────────────────────────────── */

export type LaunchFailureCode = "no_senders" | "no_leads" | "all_contacted" | "error";

export interface LaunchFailure {
  code: LaunchFailureCode;
  message: string;
  at: string;
}

export const LAUNCH_FAILURE_MESSAGES: Record<LaunchFailureCode, string> = {
  no_senders:
    "All of our sending mailboxes are busy right now, so nothing has been sent. Your plan is saved. Retry the launch in a little while.",
  no_leads:
    "We couldn't find enough verified business contacts for this audience in the countries we send to. Retry the research with a note about who you sell to, or broaden the audience in guided setup.",
  all_contacted:
    "Everyone matching this audience was contacted by another campaign in the last 90 days. Retry the research with a broader description of who you sell to.",
  error: "The launch didn't complete and nothing was sent. Your plan is saved, so you can retry.",
};

/* ─── Run phase (what mission control / the launcher show) ───────────── */

export type RunPhase =
  | "live"
  | "paused"
  | "completed"
  | "needs_research"
  | "needs_details"
  | "awaiting_approval"
  | "ready"
  | "launch_failed"
  | "launching"
  | "draft";

export interface RunPhaseInput {
  status: string;
  campaignId: string | null | undefined;
  autopilot: boolean;
  launchFailure?: LaunchFailure | null;
  blockers: LaunchBlocker[];
}

/**
 * One phase per run. A run only counts as live when it actually has a
 * campaign; an autopilot run without one is always one of the blocked or
 * failed phases (never an orphan "Live").
 */
export function deriveRunPhase(input: RunPhaseInput): RunPhase {
  if (input.campaignId) {
    if (input.status === "completed") return "completed";
    return input.status === "active" ? "live" : "paused";
  }
  if (!input.autopilot && input.status !== "needs_input") {
    return input.status === "analyzing" ? "launching" : "draft";
  }
  const first = input.blockers[0];
  if (first?.kind === "research") return "needs_research";
  if (first?.kind === "details") return "needs_details";
  if (input.launchFailure) return "launch_failed";
  if (first?.kind === "approval") return "awaiting_approval";
  // Was waiting (e.g. for approval) and nothing blocks any more.
  if (input.status === "ready") return "ready";
  if (input.status === "analyzing") return "launching";
  // Nothing blocks and no recorded failure, yet there is no campaign: treat it
  // as a launch that never completed so the client gets a retry button.
  return "launch_failed";
}

/** Read the launch failure stored on a run (calibration_profile.launchFailure). */
export function readLaunchFailure(calibrationProfile: unknown): LaunchFailure | null {
  const raw = (calibrationProfile as any)?.launchFailure;
  if (!raw || typeof raw !== "object" || typeof raw.message !== "string") return null;
  const code: LaunchFailureCode = ["no_senders", "no_leads", "all_contacted", "error"].includes(raw.code)
    ? raw.code
    : "error";
  return { code, message: raw.message, at: String(raw.at || "") };
}

/* ─── Rate limits ────────────────────────────────────────────────────── */

export const ANALYSIS_LIMITS = { perHour: 10, perDay: 30 } as const;

/** null when allowed; otherwise a message the client can act on. */
export function analysisRateLimitError(
  counts: { lastHour: number; lastDay: number },
  limits: { perHour: number; perDay: number } = ANALYSIS_LIMITS,
): string | null {
  if (counts.lastDay >= limits.perDay) {
    return `You've analyzed ${limits.perDay} websites in the last 24 hours, which is the daily limit. Try again tomorrow, or open one of your existing campaigns below.`;
  }
  if (counts.lastHour >= limits.perHour) {
    return `You've analyzed ${limits.perHour} websites in the last hour. Please wait a bit before starting another, or open one of your existing campaigns below.`;
  }
  return null;
}

/* ─── Sample emails (plan preview) ───────────────────────────────────── */

/** Resolve {a|b} spintax to one option (deterministic by seed) without touching {{tokens}}. */
export function resolveSpintax(text: string, seed = 0): string {
  let n = 0;
  return text.replace(/(?<!\{)\{([^{}]*\|[^{}]*)\}(?!\})/g, (_m, body: string) => {
    const options = body.split("|");
    const pick = options[(seed + n++) % options.length] ?? options[0] ?? "";
    return pick;
  });
}

export function fillMergeTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key: string) => {
    const v = values[key.toLowerCase()];
    return v != null && v !== "" ? v : m;
  });
}
