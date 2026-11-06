import { createHash, timingSafeEqual } from "node:crypto";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401; error: string };

/** Constant-time string compare (hash both sides so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Authorize an internal cron call. Only `Authorization: Bearer <CRON_SECRET>`
 * is accepted; User-Agent and every other header are ignored.
 * In production an unset CRON_SECRET disables the endpoint entirely.
 * Outside production with no secret configured, calls are allowed (local dev).
 */
export function authorizeCronRequest(
  authorization: string | null | undefined,
  env: { CRON_SECRET?: string; NODE_ENV?: string } = process.env
): CronAuthResult {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    if (env.NODE_ENV === "production") {
      // Same response as a bad token: do not reveal configuration state.
      return { ok: false, status: 401, error: "Unauthorized" };
    }
    return { ok: true };
  }
  const match = /^Bearer\s+(.+)$/i.exec((authorization ?? "").trim());
  if (!match || !safeEqual(match[1].trim(), secret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export type CountSummary = { [key: string]: number | CountSummary };

/**
 * Reduce an engine tick result to numbers only: finite numbers are kept,
 * arrays become their length, nested objects are summarized recursively,
 * and strings/booleans/everything else (mailbox addresses, error text,
 * campaign names, notes) are dropped.
 */
export function summarizeCounts(value: unknown, depth = 0): CountSummary {
  const out: CountSummary = {};
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) return out;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (Array.isArray(v)) out[key] = v.length;
    else if (v && typeof v === "object" && !(v instanceof Date)) {
      const nested = summarizeCounts(v, depth + 1);
      if (Object.keys(nested).length > 0) out[key] = nested;
    }
  }
  return out;
}
