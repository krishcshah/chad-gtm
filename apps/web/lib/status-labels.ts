/**
 * User-facing names for campaign statuses, so the same outreach reads the
 * same on Overview, Campaigns and Autopilot (#96). 'Live' matches Autopilot's
 * PHASE_BADGE. Colours stay with statusVariant(raw status).
 */
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Live",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

/** 'running' → 'Live'; an unknown 'needs_input' → 'Needs input'. */
export function campaignStatusLabel(status: string): string {
  const known = CAMPAIGN_STATUS_LABEL[status];
  if (known) return known;
  const spaced = String(status ?? "").replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "";
}
