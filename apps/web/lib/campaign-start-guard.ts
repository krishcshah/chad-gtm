/** Returned when a live start would otherwise mark the campaign running and send nothing. */
export const CAMPAIGN_POSTAL_REQUIRED_ERROR =
  "Add a physical postal address under Settings → Compliance before starting a campaign (CAN-SPAM).";

/**
 * Live campaign start/resume requires a non-blank workspace postal address
 * (CAN-SPAM). Missing rows, empty strings, and whitespace-only values block.
 * A non-empty address (after trim) is allowed.
 */
export function campaignStartPostalError(postalAddress: string | null | undefined): string | null {
  if ((postalAddress ?? "").trim()) return null;
  return CAMPAIGN_POSTAL_REQUIRED_ERROR;
}
