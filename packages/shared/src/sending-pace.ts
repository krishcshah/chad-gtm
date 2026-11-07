/**
 * Gap between two emails from the same mailbox. Campaigns choose a random
 * gap between minDelaySec and maxDelaySec; the engine honours it, but never
 * goes below MIN_GAP_SEC (the mailboxes are shared) or above MAX_GAP_SEC.
 */
export const MIN_GAP_SEC = 45;
export const MAX_GAP_SEC = 3600;
/** How far ahead the scheduler books a mailbox's emails (seconds). */
export const PACING_HORIZON_SEC = 900;

const DEFAULT_MIN_GAP_SEC = 90;
const DEFAULT_MAX_GAP_SEC = 240;

/** The gap range the engine actually uses for a campaign's stored values. */
export function effectiveGapRange(min: unknown, max: unknown): { min: number; max: number } {
  const rawMin = typeof min === "number" && Number.isFinite(min) ? min : DEFAULT_MIN_GAP_SEC;
  const rawMax = typeof max === "number" && Number.isFinite(max) ? max : DEFAULT_MAX_GAP_SEC;
  const lo = Math.round(Math.min(MAX_GAP_SEC, Math.max(MIN_GAP_SEC, rawMin)));
  const hi = Math.round(Math.min(MAX_GAP_SEC, Math.max(lo, rawMax)));
  return { min: lo, max: hi };
}
