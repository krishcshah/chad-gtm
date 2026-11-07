/**
 * Which Blocklist entries a person may remove.
 *
 * Unsubscribes, bounces, spam complaints and erasure requests follow the
 * person across every AutoGTM customer (the pool mailboxes are shared), so
 * only an admin may remove them. Entries added by hand, by import or from a
 * "Not interested" tag belong to this customer and can be unblocked.
 *
 * Pure and safe to import from client components. The source list mirrors
 * GLOBAL_SUPPRESSION_SOURCES in @smartreach/database/compliance (which pulls
 * in node:crypto, so it can't be bundled for the browser); a unit test keeps
 * the two equal.
 */
export const PROTECTED_OPT_OUT_SOURCES = ["unsubscribe", "bounce", "complaint", "erasure"] as const;

function isGlobalSuppressionSource(source: string | null | undefined): boolean {
  return (PROTECTED_OPT_OUT_SOURCES as readonly string[]).includes(String(source ?? ""));
}

export const PROTECTED_OPT_OUT_ERROR =
  "This person unsubscribed, bounced, reported spam or asked to be removed. That opt-out protects every AutoGTM customer, so it can't be removed.";

/** True for opt-outs nobody but an admin may remove. */
export function isProtectedOptOut(source: string | null | undefined): boolean {
  return isGlobalSuppressionSource(source);
}

/** Why this entry can't be removed by this person, or null when it can. */
export function suppressionRemovalError(source: string | null | undefined, isAdmin: boolean): string | null {
  if (isAdmin) return null;
  return isProtectedOptOut(source) ? PROTECTED_OPT_OUT_ERROR : null;
}

/**
 * What "Unblock" actually does for this entry, for the confirm dialog. Never
 * promises the address will be emailed: another entry (their domain, an
 * opt-out) can still cover it, and a "Not interested" lead keeps its status,
 * so campaigns don't take it in again.
 */
export function unblockDescription(value: string | null | undefined, source: string | null | undefined): string {
  const who = String(value ?? "").trim() || "this address";
  if (source === "not_interested") {
    return `${who} said they're not interested. Unblocking removes this entry, but their lead keeps its status, so campaigns won't pick them up again. To email them, set the lead's status back to New.`;
  }
  if (isProtectedOptOut(source)) {
    return `This opt-out protects every AutoGTM customer. Removing it lets campaigns email ${who} again, unless another Blocklist entry still covers them.`;
  }
  return `Campaigns can email ${who} again, unless another Blocklist entry, such as their domain or an opt-out, still covers them. If they later unsubscribe or bounce, they're blocked again automatically.`;
}
