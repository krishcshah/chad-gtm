/**
 * Pure date-range and display helpers for F13a analytics UI.
 * Does not call the database. Open and click rates are never numeric here.
 */

export const UNTRACKED_METRIC = "\u2014";

export const ANALYTICS_PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

export type AnalyticsSummaryView = {
  leadsContacted: number;
  replyCount: number;
  bounceCount: number;
  replyRate: number;
  bounceRate: number;
  openRate: number | null;
  clickRate: number | null;
  openCount?: number;
  clickCount?: number;
};

export type AnalyticsPointView = {
  date: string;
  sent: number;
  contacted: number;
  replies: number;
  bounces: number;
};

export type AnalyticsProblem = {
  kind: "error" | "permission";
  message: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isRealDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addUtcDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive range ending on `to` (UTC), `days` long. */
export function rangeEndingOn(to: string, days: number): { from: string; to: string } {
  return { to, from: addUtcDays(to, -(days - 1)) };
}

export function defaultAnalyticsRange(now = new Date(), days = 30): { from: string; to: string } {
  return rangeEndingOn(utcToday(now), days);
}

export function normalizeDateKey(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return isRealDateKey(trimmed) ? trimmed : null;
}

/**
 * Resolve a from/to query. Missing or impossible dates fall back to the last 30 UTC days.
 * A real range with from > to is an error and is not fetched.
 */
export function parseAnalyticsRange(
  from: string | undefined,
  to: string | undefined,
  now = new Date(),
): { ok: true; from: string; to: string } | { ok: false; error: string; from: string; to: string } {
  const fallback = defaultAnalyticsRange(now);
  const fromKey = normalizeDateKey(from) ?? fallback.from;
  const toKey = normalizeDateKey(to) ?? fallback.to;
  if (fromKey > toKey) {
    return {
      ok: false,
      error: "Start date must be on or before the end date.",
      from: fromKey,
      to: toKey,
    };
  }
  return { ok: true, from: fromKey, to: toKey };
}

export function isPermissionMessage(message: string): boolean {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

export function analyticsProblem(
  summary: { ok: boolean; error?: string; data?: unknown },
  series: { ok: boolean; error?: string; data?: unknown },
): AnalyticsProblem | null {
  if (summary.ok && summary.data && series.ok && series.data) return null;
  const message = !summary.ok
    ? summary.error || "Could not load analytics."
    : !series.ok
      ? series.error || "Could not load analytics."
      : "Could not load analytics.";
  return {
    kind: isPermissionMessage(message) ? "permission" : "error",
    message,
  };
}

export function isAnalyticsEmpty(summary: AnalyticsSummaryView, points: AnalyticsPointView[]): boolean {
  if (
    summary.leadsContacted > 0 ||
    summary.replyCount > 0 ||
    summary.bounceCount > 0 ||
    (summary.openCount != null && summary.openCount > 0) ||
    (summary.clickCount != null && summary.clickCount > 0)
  ) return false;
  return points.every((point) => point.sent === 0 && point.contacted === 0 && point.replies === 0 && point.bounces === 0);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** Percent for a tracked rate. Null (open/click) is always an em dash — never a number. */
export function formatAnalyticsRate(rate: number | null): string {
  if (rate == null) return UNTRACKED_METRIC;
  const rounded = Math.round(rate * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

export function formatRangeDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatChartDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function plural(count: number, singular: string, pluralLabel: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : pluralLabel}`;
}

/** Nice axis ceiling so the series is not pinned to the top edge. */
export function niceCeiling(value: number): number {
  if (value <= 1) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const normalized = value / base;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * base;
}

export function chartScale(maxValue: number): { max: number; ticks: number[] } {
  const max = niceCeiling(Math.max(maxValue, 1));
  return { max, ticks: [max, max / 2, 0] };
}

/** SVG y in a 0–100 viewBox. Larger values sit higher (smaller y). */
export function pointY(value: number, max: number): number {
  const safeMax = max <= 0 ? 1 : max;
  const t = Math.min(1, Math.max(0, value / safeMax));
  return 92 - t * 84;
}

export function seriesPeak(points: AnalyticsPointView[]): number {
  let peak = 0;
  for (const point of points) {
    peak = Math.max(peak, point.sent, point.contacted, point.replies, point.bounces);
  }
  return peak;
}

/** At most a handful of x labels so they stay readable at 375px. */
export function xLabelIndexes(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 5) return Array.from({ length: count }, (_, index) => index);
  const slots = 4;
  const indexes = new Set<number>([0, count - 1]);
  for (let i = 1; i < slots - 1; i++) {
    indexes.add(Math.round((i * (count - 1)) / (slots - 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}

export function formatTick(value: number): string {
  if (!Number.isInteger(value)) {
    return value.toFixed(1);
  }
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
