/**
 * Autopilot audience: every matching contact in the directory, in three
 * priority tiers, provisioned in rolling batches as sending needs them.
 *
 *   Priority 1  job title matches the run's target buyers
 *   Priority 2  another senior decision-maker in the same industries
 *   Priority 3  everyone else in those industries with a work email
 *
 * Tier 1 is sent before tier 2, and tier 2 before tier 3 (campaign_leads
 * .priority orders the scheduler). Nothing is loaded up front beyond a few
 * days of sending; topUpAutopilotAudiences() keeps each running campaign's
 * queue filled. Every batch goes through the same gates as before: work
 * address in an allowed country, 90-day cross-customer cooldown, the owner's
 * and global suppressions, and de-duplication within the campaign.
 */
import { autopilotCountries } from "./autopilot-policy";
import { buildDirectoryWhereClause, getDirectoryDb, mapDirectoryRow, type DirectoryLead } from "./leads-directory";

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

export interface TierState {
  /** Approximate number of matching contacts in this tier (before cooldown/suppression). */
  total: number;
  /** Directory row id the next batch starts after. */
  cursor: number;
  /** Contacts added to the campaign from this tier so far. */
  added: number;
  exhausted: boolean;
}

export interface AudienceState {
  version: 1;
  industries: string[];
  targetTitles: string[];
  countries: string[];
  tiers: Record<`${Tier}`, TierState>;
  /** Total contacts added to the campaign across tiers. */
  added: number;
  exhausted: boolean;
  countedAt: string;
  updatedAt: string;
}

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

/** Directory filter used to fetch candidates for a tier (classification is re-checked in code). */
export function tierQueryParams(tier: Tier, state: Pick<AudienceState, "industries" | "targetTitles" | "countries">) {
  const base = {
    industries: state.industries.length > 0 ? state.industries : undefined,
    countries: state.countries,
    hasEmail: true,
    hasWorkEmail: true,
  };
  if (tier === 1) return state.targetTitles.length > 0 ? { ...base, jobTitles: state.targetTitles } : null;
  if (tier === 2) return { ...base, jobTitles: SENIOR_TITLES };
  return base;
}

/** Keyset page of directory rows (ORDER BY id), fast at any depth. */
export type DirectoryPage = (params: NonNullable<ReturnType<typeof tierQueryParams>>, afterId: number, limit: number) => DirectoryLead[];
export type DirectoryCount = (params: NonNullable<ReturnType<typeof tierQueryParams>>) => number;

export const directoryPage: DirectoryPage = (params, afterId, limit) => {
  const db = getDirectoryDb();
  const { whereSql, bindings } = buildDirectoryWhereClause(params);
  const where = whereSql ? `${whereSql} AND leads.id > ?` : "WHERE leads.id > ?";
  const rows = db.prepare(`SELECT * FROM leads ${where} ORDER BY leads.id ASC LIMIT ?`).all(...bindings, afterId, limit) as any[];
  return rows.map(mapDirectoryRow);
};

export const directoryCount: DirectoryCount = (params) => {
  const db = getDirectoryDb();
  const { whereSql, bindings } = buildDirectoryWhereClause(params);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM leads ${whereSql}`).get(...bindings) as { c?: number } | undefined;
  return Number(row?.c || 0);
};

/** Counts for the three tiers. Tiers overlap in the directory, so 2 and 3 are derived. */
export function countAudience(
  state: Pick<AudienceState, "industries" | "targetTitles" | "countries">,
  count: DirectoryCount = directoryCount,
): Record<`${Tier}`, number> {
  const safe = (p: ReturnType<typeof tierQueryParams>) => {
    if (!p) return 0;
    try {
      return count(p);
    } catch (err) {
      console.warn("[autopilot-audience] count failed", err);
      return 0;
    }
  };
  const all = safe(tierQueryParams(3, state));
  const p1 = Math.min(all, safe(tierQueryParams(1, state)));
  const senior = safe(tierQueryParams(2, state));
  const p2 = Math.max(0, Math.min(all - p1, senior));
  return { "1": p1, "2": p2, "3": Math.max(0, all - p1 - p2) };
}

export function newAudienceState(input: {
  industries: string[];
  targetTitles: string[];
  countries?: string[];
  count?: DirectoryCount;
  now?: Date;
}): AudienceState {
  const countries = input.countries ?? autopilotCountries();
  const base = { industries: input.industries, targetTitles: input.targetTitles, countries };
  const totals = countAudience(base, input.count);
  const now = (input.now ?? new Date()).toISOString();
  const tier = (t: Tier): TierState => ({
    total: totals[`${t}`],
    cursor: 0,
    added: 0,
    // No target titles means there is no Priority 1 query to run.
    exhausted: t === 1 && input.targetTitles.length === 0,
  });
  return { version: 1, ...base, tiers: { "1": tier(1), "2": tier(2), "3": tier(3) }, added: 0, exhausted: false, countedAt: now, updatedAt: now };
}

export function parseAudienceState(raw: unknown): AudienceState | null {
  const s = raw as AudienceState | null;
  if (!s || s.version !== 1 || !s.tiers) return null;
  return s;
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

/**
 * Walks the tiers in order and returns up to `want` new leads, advancing each
 * tier's cursor past every row it scanned. Pure apart from the injected
 * directory page and filters, so it is unit-tested without a database.
 */
export async function pickNextLeads(
  state: AudienceState,
  want: number,
  filters: BatchFilters,
  page: DirectoryPage = directoryPage,
  opts: { pageSize?: number; maxPagesPerTier?: number } = {},
): Promise<{ picked: PickedLead[]; state: AudienceState }> {
  const pageSize = opts.pageSize ?? Math.min(5000, Math.max(200, want * 3));
  const maxPages = opts.maxPagesPerTier ?? 8;
  const next: AudienceState = JSON.parse(JSON.stringify(state));
  const picked: PickedLead[] = [];
  const seen = new Set<string>();

  for (const tier of TIERS) {
    const ts = next.tiers[`${tier}`];
    if (ts.exhausted) continue;
    const params = tierQueryParams(tier, next);
    if (!params) {
      ts.exhausted = true;
      continue;
    }
    for (let p = 0; p < maxPages && picked.length < want; p++) {
      const rows = page(params, ts.cursor, pageSize);
      if (rows.length === 0) {
        ts.exhausted = true;
        break;
      }
      // Gate the whole page at once (one cooldown/suppression lookup), then walk
      // it in order, advancing the cursor only past rows actually considered, so
      // a batch that fills up mid-page never skips anyone.
      const considered = rows.map((row) => {
        const cls = classifyTier(row.jobTitle, next.targetTitles);
        // A contact belongs to the best tier its title earns; a lower tier's
        // query may still surface it (title formats vary), so accept it there.
        const lead = cls <= tier ? filters.contactable([row], next.countries)[0] : undefined;
        return { row, cls, lead };
      });
      const emails = considered.filter((c) => c.lead).map((c) => c.lead!.email.toLowerCase());
      const blocked = emails.length ? await filters.blocked(emails) : new Set<string>();
      let full = false;
      for (const c of considered) {
        if (picked.length >= want) {
          full = true;
          break;
        }
        ts.cursor = Number(c.row.id) || ts.cursor;
        if (!c.lead) continue;
        const key = c.lead.email.toLowerCase();
        if (seen.has(key) || blocked.has(key)) continue;
        seen.add(key);
        // Record the tier the title earns, so a late-found Priority 1 contact still goes first.
        picked.push({ lead: c.lead, tier: c.cls });
        ts.added += 1;
      }
      if (full) break;
      if (rows.length < pageSize) {
        ts.exhausted = true;
        break;
      }
    }
    if (picked.length >= want) break;
  }

  next.added = TIERS.reduce((sum, t) => sum + next.tiers[`${t}`].added, 0);
  next.exhausted = TIERS.every((t) => next.tiers[`${t}`].exhausted);
  next.updatedAt = new Date().toISOString();
  return { picked, state: next };
}

/** How many leads a campaign should have waiting: about a week of sending. */
export function refillTarget(dailyLimit: number): { low: number; batch: number } {
  const d = Math.max(30, Math.min(500, Math.round(dailyLimit || 30)));
  return { low: d * 3, batch: Math.min(5000, d * 7) };
}

