/**
 * Pure, client-safe part of the postal-address hold (see lib/postal-hold.ts
 * for the server lookup). Imported by client components, so no server deps.
 */

/** Campaign statuses the engine schedules or sends for. */
export const SENDING_CAMPAIGN_STATUSES = ["running", "scheduled"] as const;

/** Where the client fixes it: Settings, compliance card (the textarea id is the anchor). */
export const POSTAL_SETTINGS_HREF = "/settings#postalAddress";

export interface PostalHoldState {
  /** True when sends are held right now because the postal address is missing. */
  held: boolean;
  /** Campaigns that would be sending (running/scheduled). */
  campaigns: number;
  /** Queued jobs the engine already held back for the missing address. */
  heldJobs: number;
}

export const NO_POSTAL_HOLD: PostalHoldState = { held: false, campaigns: 0, heldJobs: 0 };

export function isPostalAddressMissing(postalAddress: string | null | undefined): boolean {
  return String(postalAddress ?? "").trim().length === 0;
}

/**
 * Pure decision. Once an address is saved the engine releases held jobs on its
 * next pass, so a stale last_error alone does not count as a hold.
 */
export function postalHoldFrom(input: {
  postalAddress: string | null | undefined;
  sendingCampaigns: number;
  heldJobs: number;
}): PostalHoldState {
  const campaigns = Math.max(0, Number(input.sendingCampaigns) || 0);
  const heldJobs = Math.max(0, Number(input.heldJobs) || 0);
  const held = isPostalAddressMissing(input.postalAddress) && (campaigns > 0 || heldJobs > 0);
  return { held, campaigns, heldJobs };
}

export function isSendingStatus(status: string | null | undefined): boolean {
  return (SENDING_CAMPAIGN_STATUSES as readonly string[]).includes(String(status ?? ""));
}
