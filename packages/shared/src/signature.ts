/**
 * Legacy warm-up marker: an earlier version stored warm-up counters as a
 * hidden `<!--SR_WARMUP:{json}-->` comment inside the sender signature. It
 * must never reach a recipient. Shared by the web app and the engine so both
 * strip it the same way.
 */
const WARMUP_MARKER_RE = /\s*<!--\s*SR_WARMUP:[\s\S]*?-->/g;

/** True when the signature still carries a legacy warm-up marker. */
export function hasWarmupMarker(signature: string | null | undefined): boolean {
  if (!signature) return false;
  return new RegExp(WARMUP_MARKER_RE.source).test(signature);
}

/** The signature without any warm-up marker (and the whitespace before it), trimmed. */
export function stripWarmupMarker(signature: string | null | undefined): string {
  if (!signature) return "";
  return String(signature).replace(WARMUP_MARKER_RE, "").trim();
}
