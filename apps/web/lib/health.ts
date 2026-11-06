/**
 * Pure logic behind GET /api/health. Kept free of DB and Next imports so it
 * can be unit tested.
 */

/** The engine ticks every ENGINE_INTERVAL_MS (30s); 10 minutes means it is down. */
export const ENGINE_STALE_MS = 10 * 60 * 1000;

export interface HealthBody {
  ok: boolean;
  db: boolean;
  engine: {
    lastTickAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
  };
}

export function isStrictRequest(params: URLSearchParams): boolean {
  const v = (params.get("strict") ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Normalise whatever the driver returned for max(last_tick_at). */
export function parseTickTime(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** First column of the first row from node-postgres or neon-http execute(). */
export function firstValue(result: unknown): unknown {
  const rows = Array.isArray(result)
    ? result
    : (result as { rows?: unknown[] } | null | undefined)?.rows;
  const row = rows?.[0];
  if (!row || typeof row !== "object") return undefined;
  return Object.values(row as Record<string, unknown>)[0];
}

export function evaluateHealth(input: {
  dbOk: boolean;
  lastTickAt: unknown;
  now: Date;
  strict: boolean;
  staleAfterMs?: number;
}): { status: 200 | 503; body: HealthBody } {
  const staleAfter = input.staleAfterMs ?? ENGINE_STALE_MS;
  const tick = input.dbOk ? parseTickTime(input.lastTickAt) : null;
  // Clock skew can put the tick slightly in the future; that is not stale.
  const ageMs = tick ? Math.max(0, input.now.getTime() - tick.getTime()) : null;
  const stale = ageMs === null || ageMs > staleAfter;

  const ok = input.dbOk && (!input.strict || !stale);
  return {
    status: ok ? 200 : 503,
    body: {
      ok,
      db: input.dbOk,
      engine: {
        lastTickAt: tick ? tick.toISOString() : null,
        ageSeconds: ageMs === null ? null : Math.round(ageMs / 1000),
        stale,
      },
    },
  };
}
