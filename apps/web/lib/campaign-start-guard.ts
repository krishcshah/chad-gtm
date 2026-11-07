/**
 * CAN-SPAM: every commercial email must carry the sender's company name and a
 * valid physical postal address. A campaign that sends (publish, start,
 * resume, Autopilot launch and Resume) is refused until the account has both
 * under Settings → Compliance. The rule itself lives in @smartreach/shared
 * (complianceIdentityProblems), so Settings, Autopilot and this gate agree.
 *
 * It applies when a campaign starts or resumes only: running campaigns keep
 * sending with a weak address and show a "fix your address" notice instead.
 */
import { complianceIdentityProblems, isUsablePostalAddress } from "@smartreach/shared";

export { isUsablePostalAddress };

export const CAMPAIGN_POSTAL_REQUIRED_ERROR =
  "Add your company name and a full postal address (street or P.O. box, city, postcode, country) under Settings → Compliance before starting a campaign. Anti-spam law (CAN-SPAM) requires both in every email.";

/**
 * CAMPAIGN_POSTAL_REQUIRED_ERROR when the company name or postal address is
 * missing or unusable, null when the campaign may start.
 */
export function campaignIdentityStartError(identity: {
  companyName?: string | null;
  postalAddress?: string | null;
}): string | null {
  return Object.keys(complianceIdentityProblems(identity)).length > 0 ? CAMPAIGN_POSTAL_REQUIRED_ERROR : null;
}

/**
 * Postal-address-only check, kept for older callers. New code should use
 * campaignIdentityStartError (company name + address).
 */
export function campaignStartPostalError(postalAddress?: string | null): string | null {
  return isUsablePostalAddress(postalAddress) ? null : CAMPAIGN_POSTAL_REQUIRED_ERROR;
}
