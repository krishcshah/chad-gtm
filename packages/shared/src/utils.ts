/**
 * Date helpers. We store dates as ISO strings — this keeps the app portable
 * across Drizzle drivers (better-sqlite3 locally, Neon HTTP in production)
 * and across the Cloudflare Workers boundary where Date objects don't
 * cross RPC/JSON cleanly.
 */

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Parts of "now" as seen in an IANA timezone. */
export function zonedParts(date: Date, timeZone: string): {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0-6 (Sun-Sat)
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    weekday: WEEKDAY_MAP[parts.weekday ?? "Mon"] ?? 1,
  };
}

/**
 * Wall-clock "minutes since midnight" in a timezone. Timestamps sharing this
 * value share the same business day in that timezone — perfect for
 * day-window calculations without any tz offset math.
 */
export function minutesSinceMidnight(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** Is `date` a business day (Mon–Fri) in `timeZone`? */
export function isBusinessDay(date: Date, timeZone: string): boolean {
  const wd = zonedParts(date, timeZone).weekday;
  return wd >= 1 && wd <= 5;
}

/** Start (inclusive) of "today" in UTC wall-clock terms. Combined with
 *  minutesSinceMidnight this is an approximate-but-stable day bucket that is
 *  good enough for daily counters, and it is driver-portable. */
export function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/** Add N calendar days (UTC date arithmetic — F19 sequence waits). */
export function addCalendarDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function randomBetween(min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(min + Math.random() * (max - min));
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "2024-01-15T09:30:00.000Z" — canonical storage format. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export function ensureProtocol(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

/** Human-readable date: "Jan 15, 2024". Falls back to the raw input if invalid. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Human-readable date+time: "Jan 15, 2024, 9:30 AM". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Compact relative time: "just now", "5m ago", "2h ago", "3d ago", else a date. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return formatDate(iso);
}

/** Parse a "header = sender name <a@b.com>" string into {name,email}. */
export function parseSenderAddress(raw: string): { name: string; email: string } {
  const match = /^(?:"?([^"<]*)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/.exec(raw.trim());
  if (!match) return { name: "", email: raw.trim() };
  return { name: (match[1] ?? "").replace(/["']/g, "").trim(), email: match[2] ?? raw.trim() };
}
