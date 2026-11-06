/**
 * Mailbox warm-up: honest status only.
 *
 * AutoGTM does not run inbox warm-up. An earlier version showed a "warm-up
 * pool" that sent no email: it only bumped counters stored as a
 * `<!--SR_WARMUP:{json}-->` comment inside the sender signature, and that
 * comment then went out to recipients with the signature. Both are gone.
 *
 * This module only removes leftover markers from signatures and gives the UI
 * one clear status line.
 */

// One helper for the web app and the engine (strips the marker and the
// whitespace before it).
export { hasWarmupMarker, stripWarmupMarker } from "@smartreach/shared/signature";

export const WARMUP_STATUS_TITLE = "Warm-up isn't run by AutoGTM";

export const WARMUP_STATUS_DESCRIPTION =
  "AutoGTM doesn't warm up mailboxes and sends no warm-up email. Before cold sending from a new mailbox or domain, warm it for 2 to 4 weeks with a dedicated warm-up service, and keep daily volume low at first.";
