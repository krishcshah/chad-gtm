/**
 * Sender signatures can carry a hidden legacy warm-up marker
 * (`<!--SR_WARMUP:{...}-->`). It must never reach a recipient, in either the
 * text or the HTML part. The helper is shared with the web app.
 */
export { hasWarmupMarker, stripWarmupMarker } from "@smartreach/shared/signature";
