/** Legacy message string — kept for UI classification helpers; never thrown as a hard gate. */
export const CAMPAIGN_POSTAL_REQUIRED_ERROR =
  "Add a physical postal address under Settings → Compliance before starting a campaign (CAN-SPAM).";

/**
 * Postal is optional for staging. Always allows start/resume/publish-now.
 * Kept as a no-op so call sites and wizard-error classification stay stable.
 */
export function campaignStartPostalError(
  _postalAddress?: string | null,
): string | null {
  return null;
}
