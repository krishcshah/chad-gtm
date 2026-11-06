/**
 * Call-time environment readers for the engine.
 *
 * Never read env at module load: `run.ts` loads dotenv before importing the
 * worker, but other hosts (Next.js dev runtime, tests) set env at different
 * times, and a value captured at import time silently goes stale.
 */

const DEV_APP_URL = "http://localhost:3000";

type Env = Record<string, string | undefined>;

function isProduction(env: Env): boolean {
  return (env.NODE_ENV ?? "").toLowerCase() === "production";
}

/** The configured public origin, or null when nothing usable is set. */
export function configuredAppUrl(env: Env = process.env): string | null {
  const raw = (env.APP_URL || env.NEXT_PUBLIC_APP_URL || env.BETTER_AUTH_URL || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

let warnedMissing = false;

/**
 * Public origin used for every link the engine builds (unsubscribe, tracking,
 * List-Unsubscribe). Falls back to http://localhost:3000 for local dev only;
 * in production a missing APP_URL is logged loudly (and the processor holds
 * live sends, see `appUrlReadyForLiveSend`).
 */
export function appUrl(env: Env = process.env): string {
  const url = configuredAppUrl(env);
  if (url) return url;
  if (!warnedMissing) {
    warnedMissing = true;
    const msg =
      "[engine] APP_URL is not set (or invalid). Unsubscribe and tracking links would point at " +
      `${DEV_APP_URL}. Set APP_URL to the public origin, e.g. https://autogtm.tech.`;
    if (isProduction(env)) console.error(`${msg} Live sends are held until it is set.`);
    else console.warn(msg);
  }
  return DEV_APP_URL;
}

/**
 * Live sends need a real public origin so the unsubscribe link in the footer
 * and the List-Unsubscribe header work for the recipient.
 */
export function appUrlReadyForLiveSend(env: Env = process.env): boolean {
  const url = configuredAppUrl(env);
  if (!url) return false;
  if (isProduction(env)) {
    try {
      const u = new URL(url);
      return u.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname);
    } catch {
      return false;
    }
  }
  return true;
}

/** ENGINE_BATCH_SIZE, read at call time (default 25). */
export function engineBatchSize(env: Env = process.env): number {
  const n = Number(env.ENGINE_BATCH_SIZE ?? 25);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25;
}

/** Test hook: let the missing-APP_URL warning fire again. */
export function resetEnvWarnings(): void {
  warnedMissing = false;
}
