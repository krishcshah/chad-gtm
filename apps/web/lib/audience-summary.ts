/**
 * The whole Autopilot audience in plain numbers, for the run page and the
 * launch message. Totals come from chad_gtm_runs.audience (counted at launch);
 * emailed / waiting come from the campaign's leads. Pure and client-safe.
 *
 * Reads only tiers[n].total / added / exhausted and the top-level added /
 * exhausted / countedAt, so new fields in the stored state never break it.
 */

export type AudienceTier = 1 | 2 | 3;

export const AUDIENCE_TIER_LABEL: Record<AudienceTier, string> = {
  1: "Your target job titles",
  2: "Other decision-makers",
  3: "Everyone else in your industries",
};

/** Campaign leads of one priority (null = before tiers existed). */
export interface PriorityLeadCounts {
  priority: number | null;
  /** Leads in the campaign. */
  loaded: number;
  /** Got at least the first email. */
  emailed: number;
  /** In the campaign, first email not sent yet. */
  waiting: number;
}

export interface AudienceTierSummary {
  tier: AudienceTier;
  label: string;
  /** About how many contacts match; null while still counting. */
  matching: number | null;
  emailed: number;
  /** About how many are still to get their first email; null while counting. */
  toCome: number | null;
  /** Every matching contact has been found and added. */
  allAdded: boolean;
}

export interface AudienceSummary {
  /** "tiers": from the stored audience. "batch": an older run, only what was loaded. */
  kind: "tiers" | "batch";
  counting: boolean;
  matching: number | null;
  emailed: number;
  waiting: number;
  toCome: number | null;
  /** Every matching contact has been added to the campaign. */
  allAdded: boolean;
  /** Everyone has been emailed: nothing left to start. */
  usedUp: boolean;
  tiers: AudienceTierSummary[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
};

function tierState(raw: unknown, t: AudienceTier): { total: number | null; added: number; exhausted: boolean } | null {
  const tiers = (raw as { tiers?: Record<string, unknown> } | null)?.tiers;
  const s = tiers?.[String(t)] as { total?: unknown; added?: unknown; exhausted?: unknown } | undefined;
  if (!s || typeof s !== "object") return null;
  return { total: num(s.total), added: num(s.added) ?? 0, exhausted: s.exhausted === true };
}

/** True when the stored audience has tier state to read. */
export function hasAudienceState(raw: unknown): boolean {
  return ([1, 2, 3] as AudienceTier[]).some((t) => tierState(raw, t) !== null);
}

export function summarizeAudience(raw: unknown, leads: PriorityLeadCounts[]): AudienceSummary {
  const byTier = new Map<number | null, PriorityLeadCounts>();
  let loaded = 0;
  let emailed = 0;
  let waiting = 0;
  for (const r of leads) {
    const key = r.priority === null || r.priority === undefined ? null : Number(r.priority);
    const prev = byTier.get(key) ?? { priority: key, loaded: 0, emailed: 0, waiting: 0 };
    prev.loaded += Number(r.loaded) || 0;
    prev.emailed += Number(r.emailed) || 0;
    prev.waiting += Number(r.waiting) || 0;
    byTier.set(key, prev);
    loaded += Number(r.loaded) || 0;
    emailed += Number(r.emailed) || 0;
    waiting += Number(r.waiting) || 0;
  }

  if (!hasAudienceState(raw)) {
    // Older run: all we know is what was loaded.
    return {
      kind: "batch",
      counting: false,
      matching: loaded,
      emailed,
      waiting,
      toCome: waiting,
      allAdded: true,
      usedUp: loaded > 0 && waiting === 0,
      tiers: [],
    };
  }

  const top = raw as { exhausted?: unknown; countedAt?: unknown; version?: unknown; teamSizes?: unknown };
  // Version 1 with company sizes counted only those sizes and may say "used up"
  // too early; the top-up recounts it as version 2. A newer version is unknown here.
  const stale =
    (top.version === 1 && Array.isArray(top.teamSizes) && top.teamSizes.length > 0) ||
    (typeof top.version === "number" && top.version > 2);
  const stillCounting = top.countedAt === null || stale;
  const tiers: AudienceTierSummary[] = [];
  let counting = stillCounting;
  for (const t of [1, 2, 3] as AudienceTier[]) {
    const read = tierState(raw, t) ?? { total: null, added: 0, exhausted: false };
    const s = stale ? { ...read, exhausted: false } : read;
    const rows = byTier.get(t) ?? { priority: t, loaded: 0, emailed: 0, waiting: 0 };
    let matching: number | null;
    let toCome: number | null;
    if (s.exhausted) {
      // Everything was found: the real number is what was added.
      matching = Math.max(s.added, rows.loaded);
      toCome = rows.waiting;
    } else if (s.total === null || stillCounting) {
      counting = true;
      matching = null;
      toCome = null;
    } else {
      matching = Math.max(s.total, s.added, rows.loaded);
      toCome = rows.waiting + Math.max(0, s.total - s.added);
    }
    // A tier that was never in scope (no target titles, or "only these titles") has nothing to show.
    if (s.exhausted && matching === 0 && rows.emailed === 0) continue;
    tiers.push({ tier: t, label: AUDIENCE_TIER_LABEL[t], matching, emailed: rows.emailed, toCome, allAdded: s.exhausted });
  }

  const allAdded = !stale && (top.exhausted === true || tiers.every((t) => t.allAdded));
  const sum = (pick: (t: AudienceTierSummary) => number | null) =>
    tiers.some((t) => pick(t) === null) ? null : tiers.reduce((n, t) => n + (pick(t) ?? 0), 0);
  // Leads without a priority (loaded before tiers) still count as emailed / waiting.
  const untiered = byTier.get(null);
  const matching = counting ? null : (sum((t) => t.matching) ?? 0) + (untiered?.loaded ?? 0);
  const toCome = counting ? null : (sum((t) => t.toCome) ?? 0) + (untiered?.waiting ?? 0);
  return {
    kind: "tiers",
    counting,
    matching,
    emailed,
    waiting,
    toCome,
    allAdded,
    usedUp: allAdded && waiting === 0 && emailed > 0,
    tiers,
  };
}

/**
 * The lead total a campaign list shows. An Autopilot run's campaign holds only
 * the contacts loaded so far, so lists show the whole matching audience
 * instead (or say it is still being counted); other campaigns show their leads.
 */
export function campaignListTotal(
  rawAudience: unknown,
  loaded: number,
): { total: number; counting: boolean; wholeAudience: boolean } {
  if (!hasAudienceState(rawAudience)) return { total: loaded, counting: false, wholeAudience: false };
  const s = summarizeAudience(rawAudience, []);
  if (s.counting || s.matching === null) return { total: loaded, counting: true, wholeAudience: true };
  return { total: Math.max(s.matching, loaded), counting: false, wholeAudience: true };
}

/** "1,200 leads" / "24,000 matching contacts" / "Counting matching contacts" for a campaign list row. */
export function campaignTotalLabel(c: { total: number; wholeAudience?: boolean; audienceCounting?: boolean }): string {
  if (c.audienceCounting) return "Counting matching contacts";
  const n = c.total.toLocaleString("en-US");
  if (c.wholeAudience) return `${n} matching ${c.total === 1 ? "contact" : "contacts"}`;
  return `${n} ${c.total === 1 ? "lead" : "leads"}`;
}

/** Sending days until everyone has had a first email, at `perDay` emails a day (3 per lead). */
export function sendingDaysLeft(toCome: number | null, perDay: number): number | null {
  const newPerDay = Math.floor(Math.max(0, perDay) / 3);
  if (toCome === null || newPerDay <= 0) return null;
  return Math.ceil(toCome / newPerDay);
}

/** "about 3 weeks" style wording for a number of weekday sending days. */
export function describeSendingDays(days: number): string {
  if (days <= 1) return "about a day";
  if (days < 10) return `about ${days} sending days`;
  const weeks = Math.round(days / 5);
  if (weeks < 9) return `about ${weeks} weeks`;
  const months = Math.round(days / 22);
  if (months < 24) return `about ${months} months`;
  return `about ${Math.round(days / 260)} years`;
}

/** One line on when the audience runs out, or null when there is nothing useful to say. */
export function audienceRunwayLine(summary: AudienceSummary, perDay: number): string | null {
  if (summary.usedUp) return "Everyone who matches has had the first email. Follow-ups still go out.";
  if (summary.counting || summary.toCome === null) return null;
  const days = sendingDaysLeft(summary.toCome, perDay);
  if (days === null) return null;
  const pace = Math.floor(Math.max(0, perDay) / 3).toLocaleString("en-US");
  return `At about ${pace} new leads a day, everyone gets a first email in ${describeSendingDays(days)}.`;
}

/** The launch toast: the whole audience, never the first batch as if it were a cap. */
export function launchSuccessMessage(raw: unknown): string {
  if (!hasAudienceState(raw)) return "Outreach is live. AutoGTM will work through every matching contact, Priority 1 first.";
  const s = summarizeAudience(raw, []);
  const order = s.tiers.some((t) => t.tier === 1) ? ", Priority 1 first" : "";
  if (s.counting || !s.matching) return `Outreach is live. AutoGTM will work through every matching contact${order}.`;
  return `Outreach is live. AutoGTM will work through all ${s.matching.toLocaleString("en-US")} matching contacts${order}.`;
}
