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

export const APPROVAL_CHECK_BACK =
  "Check back here: you can launch from this screen as soon as you're approved.";

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

/** Fallback body of the "Waiting for approval" launch panel. */
export function awaitingApprovalText(emailOnApprove: boolean): string {
  return emailOnApprove
    ? "Your plan is ready. We review every new account before it can send from our mailboxes. You'll get an email when you're approved, and you can launch from this screen."
    : `Your plan is ready. We review every new account before it can send from our mailboxes. ${APPROVAL_CHECK_BACK}`;
}
