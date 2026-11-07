/**
 * Pending-approval copy. Only promise an approval email when the system mailer
 * is configured (SYSTEM_SMTP_*); otherwise approveUserAction sends nothing and
 * the client would wait for an email that never comes.
 *
 * Pure and client-safe: callers pass whether the mailer is configured.
 */

/** "we'll email you" / "You'll get an email when you're approved" style sentences or clauses. */
const EMAIL_PROMISE_SENTENCE = /\s*You['’]ll get an email when you['’]re approved\.?/gi;
const EMAIL_PROMISE_CLAUSE = /,?\s*and we['’]ll email you when we do\.?/gi;

/** Removes any approval-email promise from server-provided copy when no email will be sent. */
export function approvalCopy(text: string, emailOnApprove: boolean): string {
  if (emailOnApprove) return text;
  const stripped = text
    .replace(EMAIL_PROMISE_CLAUSE, ".")
    .replace(EMAIL_PROMISE_SENTENCE, "")
    .replace(/\.\.+/g, ".")
    .trim();
  return stripped;
}

/** Body of the slim pending-approval banner shown across the app. */
export function approvalBannerText(emailOnApprove: boolean): string {
  return emailOnApprove
    ? "Set everything up now. Nothing sends until we approve your account, and we'll email you when we do."
    : "Set everything up now. Nothing sends until we approve your account. Check back here: the banner disappears once you're approved.";
}

/** Title of the banner shown when an admin revoked sending for an account that was approved before. */
export const REVOKED_BANNER_TITLE = "Sending is paused by AutoGTM.";

/** Body of the revoked-sending banner. Never says "pending approval": this account was approved before. */
export function revokedBannerText(): string {
  return "Your campaigns are on hold and the agent is holding replies. Contact support to find out why and turn sending back on.";
}

/**
 * Body of the "Waiting for approval" launch panel. The global banner is the only
 * place that explains approval (and whether we'll email); the card only says
 * what it adds: the plan is ready and Launch is locked.
 */
export function awaitingApprovalText(): string {
  return "Your plan is ready. Launch unlocks as soon as your account is approved.";
}
