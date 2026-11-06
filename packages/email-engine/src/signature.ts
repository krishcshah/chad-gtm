/**
 * Sender signatures can carry a hidden warm-up settings marker
 * (`<!--SR_WARMUP:{...}-->`, written by the web app's warm-up form). It must
 * never reach a recipient, in either the text or the HTML part.
 */
export function stripWarmupMarker(signature: string | null | undefined): string {
  return String(signature ?? "")
    .replace(/<!--\s*SR_WARMUP:[\s\S]*?-->/g, "")
    .trim();
}
