/**
 * CAN-SPAM: every commercial email must carry a valid physical postal address
 * of the sender. A campaign that sends (publish, start, resume) is refused
 * until the account has one under Settings → Compliance.
 */
export const CAMPAIGN_POSTAL_REQUIRED_ERROR =
  "Add a physical postal address under Settings → Compliance before starting a campaign (CAN-SPAM).";

/** Shortest text we accept as an address (e.g. "1 Main St, NY"). */
const MIN_POSTAL_LENGTH = 8;

/** True when the text plausibly is a postal address, not blank or a placeholder. */
export function isUsablePostalAddress(postalAddress?: string | null): boolean {
  const v = (postalAddress ?? "").replace(/\s+/g, " ").trim();
  if (v.length < MIN_POSTAL_LENGTH) return false;
  // A street/PO box/postcode always has at least one digit.
  if (!/\d/.test(v)) return false;
  return true;
}

/**
 * Returns CAMPAIGN_POSTAL_REQUIRED_ERROR when the address is missing or
 * unusable, null when sending may go ahead.
 */
export function campaignStartPostalError(postalAddress?: string | null): string | null {
  return isUsablePostalAddress(postalAddress) ? null : CAMPAIGN_POSTAL_REQUIRED_ERROR;
}
