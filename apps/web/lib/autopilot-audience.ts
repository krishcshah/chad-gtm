/**
 * Autopilot audience: every matching contact in the directory, in three
 * priority tiers, provisioned in rolling batches as sending needs them.
 *
 *   Priority 1  job title matches the run's target buyers
 *   Priority 2  another senior decision-maker in the same industries
 *   Priority 3  everyone else in those industries with a work email
 *
 * Tier 1 is sent before tier 2, and tier 2 before tier 3 (campaign_leads
 * .priority orders the scheduler). Company size never excludes anyone: within
 * each tier, people at the run's company sizes are loaded first (the "sized"
 * pass), then everyone else in the tier (the "rest" pass), each with its own
 * cursor. Nothing is loaded up front beyond a few days of sending;
 * topUpAutopilotAudiences() keeps each running campaign's queue filled and
 * counts the tier totals in the background. Every batch goes through the same
 * gates: work address in an allowed country, 90-day cross-customer cooldown,
 * the owner's and global suppressions, and de-duplication within the campaign.
 *
 * Directory SQL runs in a worker thread (directory-worker.ts) so a slow query
 * never freezes the web server.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { normalizeEmail, schema } from "@smartreach/database";
import { autopilotCountries } from "./autopilot-policy";
import { recentlyContactedEmails, suppressedEmailsFor } from "./contact-guards";
import { directoryQuery, type DirectoryLane } from "./directory-worker";
import {
  DIRECTORY_ALIVE_SQL,
  buildDirectoryWhereClause,
  getDirectoryFacets,
  industryMatchExpression,
  isDirectoryFtsReady,
  mapDirectoryRow,
  titleMatchExpression,
  type DirectoryLead,
  type DirectorySearchParams,
} from "./leads-directory";

export { titleMatchExpression };

export type Tier = 1 | 2 | 3;
export const TIERS: Tier[] = [1, 2, 3];

/** Decision-maker titles that make a contact Priority 2 when they are not a target title. */
export const SENIOR_TITLES = [
  "founder",
  "co-founder",
  "owner",
  "ceo",
  "chief",
  "president",
  "vp",
  "vice president",
  "head",
  "director",
  "partner",
  "principal",
  "general manager",
  "managing director",
];

/** One walk through a tier's directory rows in id order. */
export interface PassState {
  /** Directory row id the next batch starts after. */
  cursor: number;
  exhausted: boolean;
}

export interface TierState {
  /** Approximate number of matching contacts in this tier, every company size (before cooldown/suppression). 0 until counted. */
  total: number;
  /** Cursor of the "rest" pass (everyone in the tier when the run has no company sizes). */
  cursor: number;
  /** Contacts added to the campaign from this tier so far. */
  added: number;
  /** Every pass of this tier is done. */
  exhausted: boolean;
  /** First pass when the run has company sizes: people at those sizes. */
  sized?: PassState;
}

export interface AudienceState {
  /** 1: company size filtered the audience (read and migrated by parseAudienceState). 2: size only orders it. */
  version: 2;
  industries: string[];
  targetTitles: string[];
  countries: string[];
  /** Company sizes from the run's profile (directory team-size values): loaded first in each tier, never a filter. */
  teamSizes?: string[];
  /** "Only these job titles": Priority 2 and 3 are never contacted. */
  strictRoles?: boolean;
  tiers: Record<`${Tier}`, TierState>;
  /** Total contacts added to the campaign across tiers. */
  added: number;
  exhausted: boolean;
  /** When the tier totals were counted; null while the count is pending (the top-up counts them). */
  countedAt: string | null;
  updatedAt: string;
  /** The directory the cursors refer to (directoryFingerprint()); a new directory starts the walk again. */
  fingerprint?: string;
  /**
   * Set when the audience was closed because every contact was used. It stays
   * while the audience is closed (also through a directory rescan of a
   * completed campaign) and is dropped only when the audience really reopens.
   */
  closedReason?: "exhausted";
  closedAt?: string;
  /** Last time the top-up tried to count the totals, and how many tries in a row failed (backoff). */
  countAttemptAt?: string;
  countFailures?: number;
  /** Rows were added to the directory since the totals were counted: recount when there is time. */
  totalsStale?: boolean;
  /**
   * COUNTs finished in an earlier pass whose time ran out before the rest
   * (countAudience continues from them). Dropped with the totals or a new directory.
   */
  countProgress?: CountProgress;
}

/** The raw COUNTs countAudience combines into tier totals. */
export interface CountProgress {
  p1?: number;
  all?: number;
  senior?: number;
}

type Targeting = Pick<AudienceState, "industries" | "targetTitles" | "countries" | "teamSizes" | "strictRoles">;

// Same rule as leads-directory normalizePhrase (kept local: tests mock that module).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function containsPhrase(title: string, phrase: string): boolean {
  const t = ` ${norm(title)} `;
  const p = norm(phrase);
  return p.length > 0 && t.includes(` ${p} `);
}

/** The tier a contact belongs to, from their job title. */
export function classifyTier(jobTitle: string | null | undefined, targetTitles: string[]): Tier {
  const title = String(jobTitle || "");
  if (!title.trim()) return 3;
  if (targetTitles.some((t) => containsPhrase(title, t))) return 1;
  if (SENIOR_TITLES.some((t) => containsPhrase(title, t))) return 2;
  return 3;
}

/**
 * Which rows of a tier a query walks: "sized" people at the run's company
 * sizes, "rest" everyone else, "all" both (counts, and runs with no sizes).
 */
export type AudiencePass = "sized" | "rest" | "all";

export type AudienceParams = DirectorySearchParams & {
  industries?: string[];
  countries: string[];
  hasEmail: true;
  hasWorkEmail: true;
};

/** Directory filter used to fetch candidates for a tier (classification is re-checked in code). */
export function tierQueryParams(tier: Tier, state: Targeting, pass: AudiencePass = "all"): AudienceParams | null {
  if (state.strictRoles && tier > 1) return null;
  const sizes = state.teamSizes ?? [];
  const base: AudienceParams = {
    industries: state.industries.length > 0 ? state.industries : undefined,
    countries: state.countries,
    hasEmail: true,
    hasWorkEmail: true,
    ...(pass === "sized" && sizes.length ? { teamSizes: sizes } : {}),
    ...(pass === "rest" && sizes.length ? { excludeTeamSizes: sizes } : {}),
  };
  // Whole phrases, the same rule classifyTier uses (also without the FTS index).
  if (tier === 1) {
    return state.targetTitles.some((t) => norm(t)) ? { ...base, jobTitles: state.targetTitles, jobTitleMatch: "phrase" } : null;
  }
  if (tier === 2) return { ...base, jobTitles: SENIOR_TITLES, jobTitleMatch: "phrase" };
  return base;
}

function ftsReady(): boolean {
  try {
    return isDirectoryFtsReady();
  } catch {
    return false;
  }
}

/**
 * How a tier's rows are read. Every plan walks rows in id order from the
 * cursor (rowid > ?), so the cursor means the same whichever plan reads it.
 */
export interface AudiencePlan {
  /** The FTS index is built. */
  fts: boolean;
  /**
   * Drive from the industries' FTS entries (AND the title phrases): only rows
   * in those industries are read. Otherwise the title phrases alone drive, or
   * (no titles) the country index.
   */
  byIndustry: boolean;
  /** Call DIRECTORY_ALIVE_SQL on every row, so the worker can stop a timed-out query. */
  alive?: boolean;
}

/** Directory rows per industry and per country (facet cache), for choosing a plan. */
export interface DirectorySizes {
  industryRows: (values: string[]) => number;
  countryRows: (values: string[]) => number;
  /** Every row in the directory (0 when unknown). */
  totalRows: () => number;
}

/**
 * The industries drive when they hold at most a quarter of the rows the other
 * plan reads (measured on the 330K-row directory: one large industry, 16% of
 * the US rows, is faster driven by industry; the five largest together, 37%,
 * are faster by country, because an FTS phrase walk costs more per row).
 */
const INDUSTRY_DRIVES_RATIO = 4;

function facetSizes(): DirectorySizes {
  let facets: ReturnType<typeof getDirectoryFacets> | null = null;
  try {
    facets = getDirectoryFacets();
  } catch {
    facets = null;
  }
  const sum = (items: Array<{ value: string; count: number }> | undefined, values: string[]) => {
    const by = new Map((items ?? []).map((i) => [i.value, Number(i.count) || 0]));
    // Not in the cache (it keeps the largest values): a small one.
    return values.reduce((n, v) => n + (by.get(v) ?? 0), 0);
  };
  return {
    industryRows: (v) => sum(facets?.industries, v),
    countryRows: (v) => sum(facets?.countries, v),
    totalRows: () => Number(facets?.totalLeads) || 0,
  };
}

/**
 * Chooses the driving index by selectivity (facet counts; an industry the
 * cache doesn't list is a small one). Narrow industries drive the walk from
 * their own FTS entries: with job titles as an FTS AND (only rows with both),
 * without titles (Priority 3) instead of the country index. Broad audiences
 * keep the plan that suits them: the title phrases alone, or the country
 * index.
 */
export function audiencePlan(
  params: AudienceParams,
  opts: { fts?: boolean; sizes?: DirectorySizes; alive?: boolean } = {},
): AudiencePlan {
  const fts = opts.fts ?? ftsReady();
  const industries = params.industries ?? [];
  let byIndustry = fts && industries.length > 0 && industryMatchExpression(industries) !== null;
  if (byIndustry) {
    const sizes = opts.sizes ?? facetSizes();
    // What the other plan reads: every title match (about the whole directory's
    // share), or every row in the countries.
    const other = params.jobTitles?.length
      ? sizes.totalRows()
      : params.countries.length > 0
        ? sizes.countryRows(params.countries)
        : sizes.totalRows();
    byIndustry = other <= 0 || sizes.industryRows(industries) * INDUSTRY_DRIVES_RATIO <= other;
  }
  return { fts, byIndustry, alive: opts.alive };
}

function asPlan(params: AudienceParams, plan: AudiencePlan | boolean | undefined): AudiencePlan {
  if (plan === undefined) return audiencePlan(params);
  if (typeof plan === "boolean") {
    // Tests and callers that only know whether FTS is built: narrow by industry when possible.
    return { fts: plan, byIndustry: plan && Boolean(params.industries?.length) && industryMatchExpression(params.industries!) !== null };
  }
  return plan;
}

/**
 * The tier's matching rows, read in id order. With an FTS term (titles and/or
 * industries) SQLite walks leads_fts from the cursor (rowid > ?) and looks
 * each row up by primary key; every other filter is checked on that row.
 */
function audienceFrom(params: AudienceParams, plan: AudiencePlan): { from: string; where: string; bindings: unknown[]; idCol: string } {
  const { jobTitles, ...rest } = params;
  const title = jobTitles?.length && plan.fts ? titleMatchExpression(jobTitles) : null;
  const industry = plan.fts && plan.byIndustry && params.industries?.length ? industryMatchExpression(params.industries) : null;
  const match = title && industry ? `(${title}) AND (${industry})` : (title ?? industry);
  // The stop check (a JS call) on about one row in 64 the walk reads: stops
  // within a few dozen rows, at a small fraction of the cost of every row.
  const check = (idCol: string) => `(${idCol} % 64 <> 0 OR ${DIRECTORY_ALIVE_SQL})`;
  if (match) {
    const alive = plan.alive ? ` AND ${check("leads_fts.rowid")}` : "";
    const { whereSql, bindings } = buildDirectoryWhereClause(rest, { qualify: true });
    const extra = whereSql.replace(/^WHERE /, "");
    return {
      from: "leads_fts CROSS JOIN leads ON leads.id = leads_fts.rowid",
      where: `WHERE leads_fts MATCH ?${extra ? ` AND ${extra}` : ""}${alive}`,
      bindings: [match, ...bindings],
      idCol: "leads_fts.rowid",
    };
  }
  const { whereSql, bindings } = buildDirectoryWhereClause(params);
  const alive = plan.alive ? check("leads.id") : "";
  const where = whereSql ? `${whereSql}${alive ? ` AND ${alive}` : ""}` : alive ? `WHERE ${alive}` : "";
  return { from: "leads", where, bindings, idCol: "leads.id" };
}

/** Keyset page: rows after `afterId`, in id order. */
export function audiencePageQuery(
  params: AudienceParams,
  afterId: number,
  limit: number,
  plan?: AudiencePlan | boolean,
): { sql: string; bindings: unknown[] } {
  const q = audienceFrom(params, asPlan(params, plan));
  const where = q.where ? `${q.where} AND ${q.idCol} > ?` : `WHERE ${q.idCol} > ?`;
  return {
    sql: `SELECT leads.* FROM ${q.from} ${where} ORDER BY ${q.idCol} ASC LIMIT ?`,
    bindings: [...q.bindings, afterId, limit],
  };
}

export function audienceCountQuery(params: AudienceParams, plan?: AudiencePlan | boolean): { sql: string; bindings: unknown[] } {
  const q = audienceFrom(params, asPlan(params, plan));
  return { sql: `SELECT COUNT(*) AS c FROM ${q.from} ${q.where}`, bindings: q.bindings };
}

/** Keyset page of directory rows (ORDER BY id), fast at any depth. */
export type DirectoryPage = (
  params: AudienceParams,
  afterId: number,
  limit: number,
) => DirectoryLead[] | Promise<DirectoryLead[]>;
/** timeoutMs: stop this COUNT after this long (the caller's remaining time). */
export type DirectoryCount = (params: AudienceParams, opts?: { timeoutMs?: number }) => number | Promise<number>;

/** Directory pages read in a worker thread on the given lane (stoppable on timeout). */
export function directoryPageOn(lane: DirectoryLane, opts: { timeoutMs?: number } = {}): DirectoryPage {
  return async (params, afterId, limit) => {
    const q = audiencePageQuery(params, afterId, limit, audiencePlan(params, { alive: true }));
    const rows = await directoryQuery<any[]>(q.sql, q.bindings, "all", lane, opts);
    return (rows ?? []).map(mapDirectoryRow);
  };
}

export function directoryCountOn(lane: DirectoryLane, opts: { timeoutMs?: number } = {}): DirectoryCount {
  return async (params, call = {}) => {
    const q = audienceCountQuery(params, audiencePlan(params, { alive: true }));
    const timeoutMs =
      call.timeoutMs !== undefined && opts.timeoutMs !== undefined
        ? Math.min(call.timeoutMs, opts.timeoutMs)
        : (call.timeoutMs ?? opts.timeoutMs);
    const row = await directoryQuery<{ c?: number } | null>(q.sql, q.bindings, "get", lane, { timeoutMs });
    return Number(row?.c || 0);
  };
}

/** Launch: a person is waiting. */
export const directoryPage: DirectoryPage = directoryPageOn("interactive");
/** Full counts can take seconds on a large directory: background lane. */
export const directoryCount: DirectoryCount = directoryCountOn("background");

/**
 * The pass ran out of counting time before every COUNT was done. Not a
 * failure: `progress` holds the COUNTs that finished, and the next pass
 * continues from them (no backoff).
 */
export class CountTimeUsedError extends Error {
  constructor(readonly progress: CountProgress) {
    super("No counting time left in this pass.");
    this.name = "CountTimeUsedError";
  }
}

export interface CountAudienceOptions {
  /** Start no COUNT after this (epoch ms); a running one is given only the time left. */
  deadline?: number;
  /** A COUNT's own limit (it is shortened to the time left before the deadline). */
  countTimeoutMs?: number;
  /** COUNTs already done in an earlier pass. */
  progress?: CountProgress;
  now?: () => number;
}

/**
 * Counts for the three tiers, every company size. Tiers overlap in the
 * directory, so 2 and 3 are derived. Rejects if a count fails (the caller
 * keeps the totals pending and tries again). With a deadline, rejects with
 * CountTimeUsedError (and the COUNTs done so far) when the time runs out,
 * including a COUNT stopped because it was given only the time left.
 */
export async function countAudience(
  state: Targeting,
  count: DirectoryCount = directoryCount,
  opts: CountAudienceOptions = {},
): Promise<Record<`${Tier}`, number>> {
  const now = opts.now ?? Date.now;
  const progress: CountProgress = { ...(opts.progress ?? {}) };
  const run = async (key: keyof CountProgress, p: AudienceParams | null): Promise<number> => {
    if (!p) return 0;
    const done = progress[key];
    if (typeof done === "number") return done;
    let timeoutMs = opts.countTimeoutMs;
    let shortened = false;
    if (opts.deadline !== undefined) {
      const left = opts.deadline - now();
      if (left <= 0) throw new CountTimeUsedError(progress);
      if (timeoutMs === undefined || left < timeoutMs) {
        timeoutMs = left;
        shortened = true;
      }
    }
    try {
      const n = Number(await count(p, timeoutMs !== undefined ? { timeoutMs } : undefined)) || 0;
      progress[key] = n;
      return n;
    } catch (err) {
      // Stopped only because the pass's time ran out: continue next pass, no backoff.
      if (shortened && /timed out/i.test(err instanceof Error ? err.message : String(err))) {
        throw new CountTimeUsedError(progress);
      }
      throw err;
    }
  };
  const p1Only = await run("p1", tierQueryParams(1, state));
  if (state.strictRoles) return { "1": p1Only, "2": 0, "3": 0 };
  const all = await run("all", tierQueryParams(3, state));
  const p1 = Math.min(all, p1Only);
  const senior = await run("senior", tierQueryParams(2, state));
  const p2 = Math.max(0, Math.min(all - p1, senior));
  return { "1": p1, "2": p2, "3": Math.max(0, all - p1 - p2) };
}

/** The state with counted totals. */
export function withTotals(state: AudienceState, totals: Record<`${Tier}`, number>, now = new Date()): AudienceState {
  const next: AudienceState = JSON.parse(JSON.stringify(state));
  for (const t of TIERS) next.tiers[`${t}`].total = totals[`${t}`];
  next.countedAt = now.toISOString();
  delete next.countAttemptAt;
  delete next.countFailures;
  delete next.totalsStale;
  delete next.countProgress;
  return next;
}

/** The pass's counting time ran out part way: keep the COUNTs done (not a failure). */
export function withCountProgress(state: AudienceState, progress: CountProgress): AudienceState {
  return { ...state, countProgress: { ...progress } };
}

/** A count that failed: tried now, one more failure in a row (the top-up backs off). */
export function withCountFailure(state: AudienceState, now = new Date()): AudienceState {
  return { ...state, countAttemptAt: now.toISOString(), countFailures: (state.countFailures ?? 0) + 1 };
}

/** Wait after `failures` failed counts in a row: 10 minutes, doubling, at most a day. */
export function countBackoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(24 * 60 * 60_000, 10 * 60_000 * 2 ** (failures - 1));
}

/** The totals need counting: never counted, or stale after new rows; and not backing off. */
export function countDue(state: AudienceState, now = new Date()): boolean {
  if (state.countedAt !== null && !state.totalsStale) return false;
  const failures = state.countFailures ?? 0;
  if (!failures || !state.countAttemptAt) return true;
  return now.getTime() - Date.parse(state.countAttemptAt) >= countBackoffMs(failures);
}

/** Count order: never counted before stale, then the oldest attempt first (never tried counts as oldest). */
export function countOrder(a: AudienceState, b: AudienceState): number {
  const pending = (s: AudienceState) => (s.countedAt === null ? 0 : 1);
  if (pending(a) !== pending(b)) return pending(a) - pending(b);
  const at = (s: AudienceState) => (s.countAttemptAt ? Date.parse(s.countAttemptAt) || 0 : 0);
  return at(a) - at(b);
}

function freshTier(t: Tier, targeting: Targeting): TierState {
  // No usable target titles means no Priority 1 query; strict roles means only Priority 1.
  const none = tierQueryParams(t, targeting) === null;
  return {
    total: 0,
    cursor: 0,
    added: 0,
    exhausted: none,
    ...(targeting.teamSizes?.length ? { sized: { cursor: 0, exhausted: none } } : {}),
  };
}

/**
 * A new audience. Totals are not counted here (that can take seconds on a
 * large directory): countedAt stays null until the top-up counts them.
 */
export function newAudienceState(input: {
  industries: string[];
  targetTitles: string[];
  countries?: string[];
  teamSizes?: string[];
  strictRoles?: boolean;
  fingerprint?: string | null;
  now?: Date;
}): AudienceState {
  const countries = input.countries ?? autopilotCountries();
  const base: Targeting = {
    industries: input.industries,
    targetTitles: input.targetTitles,
    countries,
    teamSizes: input.teamSizes ?? [],
    strictRoles: Boolean(input.strictRoles),
  };
  const now = (input.now ?? new Date()).toISOString();
  const tiers = { "1": freshTier(1, base), "2": freshTier(2, base), "3": freshTier(3, base) };
  return {
    version: 2,
    ...base,
    tiers,
    added: 0,
    exhausted: TIERS.every((t) => tiers[`${t}`].exhausted),
    countedAt: null,
    updatedAt: now,
    ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
  };
}

/**
 * Reads a stored audience. Version 1 (company size was a filter) becomes
 * version 2: its cursors walked only the sized rows, so they carry over as the
 * sized pass and the rest of each tier starts from the first row.
 */
export function parseAudienceState(raw: unknown): AudienceState | null {
  const s = raw as any;
  if (!s || typeof s !== "object" || !s.tiers || typeof s.tiers !== "object") return null;
  if (s.version === 2) return s as AudienceState;
  if (s.version !== 1) return null;
  const sizes: string[] = Array.isArray(s.teamSizes) ? s.teamSizes : [];
  const targeting: Targeting = {
    industries: Array.isArray(s.industries) ? s.industries : [],
    targetTitles: Array.isArray(s.targetTitles) ? s.targetTitles : [],
    countries: Array.isArray(s.countries) ? s.countries : [],
    teamSizes: sizes,
    strictRoles: Boolean(s.strictRoles),
  };
  const tiers = {} as Record<`${Tier}`, TierState>;
  for (const t of TIERS) {
    const old = s.tiers[`${t}`] ?? {};
    const none = tierQueryParams(t, targeting) === null;
    const prev = { total: Number(old.total) || 0, added: Number(old.added) || 0 };
    tiers[`${t}`] = sizes.length
      ? { ...prev, sized: { cursor: Number(old.cursor) || 0, exhausted: Boolean(old.exhausted) || none }, cursor: 0, exhausted: none }
      : { ...prev, cursor: Number(old.cursor) || 0, exhausted: Boolean(old.exhausted) || none };
  }
  const updatedAt = String(s.updatedAt ?? new Date(0).toISOString());
  return {
    ...s,
    ...targeting,
    version: 2,
    tiers,
    added: Number(s.added) || 0,
    exhausted: TIERS.every((t) => tiers[`${t}`].exhausted),
    // Version 1 totals left out other company sizes: count again.
    countedAt: sizes.length ? null : (s.countedAt ?? null),
    updatedAt,
    // A version 1 audience that ran out keeps that proof, so a campaign the
    // engine completed for it can still run again when new people are found.
    ...(s.exhausted === true
      ? { closedReason: "exhausted" as const, closedAt: String(s.closedAt ?? updatedAt) }
      : {}),
  };
}

/**
 * The same audience against a new directory: cursors (row ids) of the old
 * file mean nothing there, so every pass starts again from the first row and
 * totals are counted again. Everyone already in the campaign stays out (the
 * already-in-list gate), and the 90-day cooldown still applies. closedReason
 * stays until the top-up really reopens the audience.
 */
export function resetForNewDirectory(state: AudienceState, fingerprint: string, now = new Date()): AudienceState {
  const next: AudienceState = JSON.parse(JSON.stringify(state));
  for (const t of TIERS) {
    const fresh = freshTier(t, next);
    const ts = next.tiers[`${t}`];
    ts.cursor = 0;
    ts.exhausted = fresh.exhausted;
    if (fresh.sized) ts.sized = fresh.sized;
    else delete ts.sized;
  }
  next.exhausted = TIERS.every((t) => next.tiers[`${t}`].exhausted);
  next.countedAt = null;
  delete next.totalsStale;
  delete next.countProgress;
  next.fingerprint = fingerprint;
  next.updatedAt = now.toISOString();
  return next;
}

export type DirectoryChange = "same" | "grown" | "new";

function parseFingerprint(f: string): { high: number; uv: string; ver: string } | null {
  const parts = f.split("|");
  // "highId|userVersion|version"; older audiences stored a 4th part (the file's device:inode), ignored now.
  if (parts.length !== 3 && parts.length !== 4) return null;
  const high = Number(parts[0]);
  if (!Number.isFinite(high) || parts[0] === "") return null;
  return { high, uv: parts[1]!, ver: parts[2]! };
}

/** The high row id a fingerprint records, or null for an unreadable one. */
export function fingerprintHighId(f: string | null | undefined): number | null {
  return f ? (parseFingerprint(f)?.high ?? null) : null;
}

/**
 * Whether any row added after `afterId` can belong to this audience (its
 * industries and countries): an indexed check, LIMIT 1.
 */
export function newRowsQuery(state: Pick<AudienceState, "industries" | "countries">, afterId: number): { sql: string; bindings: unknown[] } | null {
  const industries = (state.industries ?? []).filter((v) => typeof v === "string" && v.trim());
  if (industries.length === 0) return null;
  const countries = (state.countries ?? []).filter((v) => typeof v === "string" && v.trim());
  const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");
  const country = countries.length ? ` AND country IN (${marks(countries.length)})` : "";
  return {
    sql: `SELECT 1 AS hit FROM leads WHERE id > ? AND industry IN (${marks(industries.length)})${country} LIMIT 1`,
    bindings: [afterId, ...industries, ...countries],
  };
}

/**
 * How the directory changed since an audience walked it (directoryFingerprint):
 * "same" (also a copied or restored file), "grown" (rows only added after the
 * last id, so the saved cursors still point at the right rows) or "new" (a
 * different build or version, or a requested rescan: walk it from the start).
 * Deleting rows (erasure) never lowers the high id, so it stays "same".
 */
export function compareDirectoryFingerprints(before: string, after: string): DirectoryChange {
  if (before === after) return "same";
  const a = parseFingerprint(before);
  const b = parseFingerprint(after);
  if (!a || !b || a.uv !== b.uv || a.ver !== b.ver) return "new";
  if (b.high === a.high) return "same";
  // A lower high id with the same version is a rebuilt file nobody versioned: start over.
  return b.high > a.high ? "grown" : "new";
}

/**
 * Same directory with rows added after the last id: keep every cursor (the new
 * rows come after it) and only reopen the passes that had run out. The totals
 * stay on show; they are recounted when the top-up has time (totalsStale), and
 * only when some added row can be in this audience (`matches`: false when
 * none of the new rows is in its industries and countries).
 */
export function reopenForNewRows(
  state: AudienceState,
  fingerprint: string,
  now = new Date(),
  opts: { matches?: boolean } = {},
): AudienceState {
  const next: AudienceState = JSON.parse(JSON.stringify(state));
  for (const t of TIERS) {
    if (tierQueryParams(t, next) === null) continue;
    const ts = next.tiers[`${t}`];
    ts.exhausted = false;
    if (ts.sized) ts.sized.exhausted = false;
  }
  next.exhausted = TIERS.every((t) => next.tiers[`${t}`].exhausted);
  if (next.countedAt !== null && opts.matches !== false) {
    next.totalsStale = true;
    // Counts from before the new rows are stale too.
    delete next.countProgress;
  }
  next.fingerprint = fingerprint;
  next.updatedAt = now.toISOString();
  return next;
}

/** The audience reopened: drop the reason it was closed. */
export function withoutClosedReason(state: AudienceState): AudienceState {
  const { closedReason: _r, closedAt: _a, ...rest } = state;
  return rest as AudienceState;
}

/** Leads the gates allow, from one batch of candidates. */
export interface BatchFilters {
  /** Work address in an allowed country, or null to drop the row. */
  contactable: (rows: DirectoryLead[], countries: string[]) => DirectoryLead[];
  /** Emails that must not be added (cooldown, suppression, already in this campaign). */
  blocked: (emails: string[]) => Promise<Set<string>>;
}

export interface PickedLead {
  lead: DirectoryLead;
  tier: Tier;
}

export interface PickOptions {
  pageSize?: number;
  /** Pages one pass reads per call (the top-up continues next time). */
  maxPagesPerTier?: number;
  /** Launch: keep reading past maxPagesPerTier until someone is picked or the pass runs out. */
  untilPicked?: boolean;
  /** Stop reading new pages after this time (epoch ms); the cursors are kept. */
  deadline?: number;
  now?: () => number;
}

export interface PickResult {
  picked: PickedLead[];
  state: AudienceState;
  /** Directory rows read. */
  scanned: number;
  /** Rows that were contactable (work address in an allowed country), picked or not. */
  eligible: number;
}

/**
 * Walks the tiers strictly in order (in each tier the sized pass, then the
 * rest) and returns up to `want` new leads, advancing each pass's cursor past
 * every row it read. A lower tier is only read once every higher tier has
 * run out: when a tier stops early (page limit or deadline) the walk ends
 * there and continues from its cursor next time. Pure apart from the
 * injected directory page and filters, so it is unit-tested without a
 * database.
 */
export async function pickNextLeads(
  state: AudienceState,
  want: number,
  filters: BatchFilters,
  page: DirectoryPage = directoryPage,
  opts: PickOptions = {},
): Promise<PickResult> {
  const pageSize = opts.pageSize ?? Math.min(5000, Math.max(200, want * 3));
  const maxPages = opts.maxPagesPerTier ?? 8;
  const now = opts.now ?? Date.now;
  const next: AudienceState = JSON.parse(JSON.stringify(state));
  const sizes = next.teamSizes ?? [];
  const picked: PickedLead[] = [];
  const seen = new Set<string>();
  let scanned = 0;
  let eligible = 0;
  // Gate verdicts already looked up in this batch (lower tiers re-scan rows).
  const verdict = new Map<string, boolean>();

  const mayRead = (p: number) => {
    if (picked.length >= want) return false;
    // Past the deadline: stop, but a pass that has picked nobody yet still reads one page.
    if (opts.deadline !== undefined && (p > 0 || picked.length > 0) && now() >= opts.deadline) return false;
    return p < maxPages || Boolean(opts.untilPicked && picked.length === 0);
  };

  const walk = async (tier: Tier, params: AudienceParams, cur: PassState) => {
    for (let p = 0; mayRead(p); p++) {
      const rows = await page(params, cur.cursor, pageSize);
      scanned += rows.length;
      if (rows.length === 0) {
        cur.exhausted = true;
        return;
      }
      // Gate the whole page at once (one cooldown/suppression lookup), then walk
      // it in order, advancing the cursor only past rows actually considered, so
      // a batch that fills up mid-page never skips anyone.
      const considered = rows.map((row) => {
        const cls = classifyTier(row.jobTitle, next.targetTitles);
        // A contact belongs to the best tier its title earns; a lower tier's
        // query may still surface it (title formats vary), so accept it there.
        const lead = cls <= tier ? filters.contactable([row], next.countries)[0] : undefined;
        if (lead) eligible++;
        return { row, cls, lead };
      });
      const unchecked = [
        ...new Set(considered.filter((c) => c.lead).map((c) => c.lead!.email.toLowerCase())),
      ].filter((e) => !verdict.has(e));
      if (unchecked.length) {
        const hit = await filters.blocked(unchecked);
        for (const e of unchecked) verdict.set(e, hit.has(e));
      }
      for (const c of considered) {
        if (picked.length >= want) return;
        cur.cursor = Number(c.row.id) || cur.cursor;
        if (!c.lead) continue;
        const key = c.lead.email.toLowerCase();
        if (seen.has(key) || verdict.get(key)) continue;
        seen.add(key);
        // Record the tier the title earns, so a late-found Priority 1 contact still goes first.
        picked.push({ lead: c.lead, tier: c.cls });
        next.tiers[`${tier}`].added += 1;
      }
      if (rows.length < pageSize) {
        cur.exhausted = true;
        return;
      }
    }
  };

  for (const tier of TIERS) {
    const ts = next.tiers[`${tier}`];
    if (ts.exhausted) continue;
    if (!tierQueryParams(tier, next)) {
      ts.exhausted = true;
      if (ts.sized) ts.sized.exhausted = true;
      continue;
    }
    if (sizes.length) {
      // People at the run's company sizes first, then everyone else in the tier.
      const sized = (ts.sized ??= { cursor: 0, exhausted: false });
      if (!sized.exhausted) await walk(tier, tierQueryParams(tier, next, "sized")!, sized);
      if (sized.exhausted && picked.length < want) {
        const rest: PassState = { cursor: ts.cursor, exhausted: false };
        await walk(tier, tierQueryParams(tier, next, "rest")!, rest);
        ts.cursor = rest.cursor;
        ts.exhausted = rest.exhausted;
      }
    } else {
      const all: PassState = { cursor: ts.cursor, exhausted: false };
      await walk(tier, tierQueryParams(tier, next, "all")!, all);
      ts.cursor = all.cursor;
      ts.exhausted = all.exhausted;
    }
    // Strict order: a tier with rows left is finished before the next one starts.
    if (picked.length >= want || !ts.exhausted) break;
  }

  next.added = TIERS.reduce((sum, t) => sum + next.tiers[`${t}`].added, 0);
  next.exhausted = TIERS.every((t) => next.tiers[`${t}`].exhausted);
  next.updatedAt = new Date().toISOString();
  return { picked, state: next, scanned, eligible };
}

/**
 * How many not-yet-contacted leads a campaign keeps waiting. Each lead takes
 * three emails, so new leads per day ≈ daily limit / 3: refill when fewer
 * than about a week of new leads remain, adding about two weeks' worth.
 */
export function refillTarget(dailyLimit: number): { low: number; batch: number } {
  const d = Math.max(30, Math.min(500, Math.round(dailyLimit || 30)));
  const perDay = Math.ceil(d / 3);
  return { low: perDay * 5, batch: Math.min(5000, Math.max(200, perDay * 10)) };
}

/* ─── Database side ──────────────────────────────────────────────────── */

type Db = any;

/** The gates every new contact must pass: cooldown, suppression, not already in the list. */
export function audienceGates(
  db: Db,
  input: { userId: string; listId?: string | null; contactable: BatchFilters["contactable"] },
): BatchFilters {
  return {
    contactable: input.contactable,
    blocked: async (emails: string[]) => {
      if (!emails.length) return new Set<string>();
      const [contacted, suppressed] = await Promise.all([
        recentlyContactedEmails(db, emails),
        suppressedEmailsFor(db, input.userId, emails),
      ]);
      const out = new Set<string>([...contacted, ...suppressed]);
      if (input.listId) {
        const existing: Array<{ email: string }> = await db
          .select({ email: schema.leads.email })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.listId, input.listId),
              inArray(sql`lower(${schema.leads.email})`, emails.map((e) => e.toLowerCase())),
            ),
          );
        for (const r of existing) out.add(String(r.email).toLowerCase());
      }
      return out;
    },
  };
}

/** Insert picked contacts into the campaign's list; returns new lead id → tier. */
export async function insertAudienceLeads(
  db: Db,
  input: {
    picked: PickedLead[];
    userId: string;
    workspaceId: string | null;
    listId: string;
    contactFields: (lead: DirectoryLead) => Record<string, unknown>;
  },
): Promise<Map<string, Tier>> {
  const ids = new Map<string, Tier>();
  const CHUNK = 200;
  for (let i = 0; i < input.picked.length; i += CHUNK) {
    const rows = input.picked.slice(i, i + CHUNK).map(({ lead, tier }) => {
      const id = crypto.randomUUID();
      ids.set(id, tier);
      return {
        id,
        userId: input.userId,
        workspaceId: input.workspaceId,
        listId: input.listId,
        email: normalizeEmail(lead.email),
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.companyName,
        website: lead.companyWebsite,
        jobTitle: lead.jobTitle,
        location: lead.location,
        industry: lead.industry,
        status: "new" as const,
        ...input.contactFields(lead),
        tags: ["autogtm", "b2b-verified", `priority-${tier}`],
      };
    });
    await db.insert(schema.leads).values(rows).onConflictDoNothing();
  }
  return ids;
}

/** Stamp each new campaign_leads row with its lead's tier (scheduler order). */
export async function applyPriorities(db: Db, campaignId: string, tiers: Map<string, Tier>) {
  for (const tier of TIERS) {
    const leadIds = [...tiers].filter(([, t]) => t === tier).map(([id]) => id);
    for (let i = 0; i < leadIds.length; i += 500) {
      await db
        .update(schema.campaignLeads)
        .set({ priority: tier })
        .where(and(eq(schema.campaignLeads.campaignId, campaignId), inArray(schema.campaignLeads.leadId, leadIds.slice(i, i + 500))));
    }
  }
}

/** Not-yet-contacted leads waiting in a campaign (step 1, still queued). */
export async function waitingNewLeads(db: Db, campaignId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.campaignLeads)
    .where(
      and(
        eq(schema.campaignLeads.campaignId, campaignId),
        eq(schema.campaignLeads.stepPosition, 1),
        inArray(schema.campaignLeads.status, ["queued", "scheduled"]),
      ),
    );
  return Number(row?.n ?? 0);
}

