/**
 * One outreach, two controls: a campaign's status (campaigns.status) is the
 * one owner of on/off and completion; an Autopilot run's status mirrors it,
 * written by the same code path. Pure rules plus small db helpers; not a
 * "use server" module.
 */
import { eq } from "drizzle-orm";
import { schema } from "@smartreach/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type CampaignCommand =
  | "start"
  | "resume"
  | "pause"
  | "archive"
  | "delete"
  | "duplicate"
  | "unarchive"
  | "retry_failed";

export const CAMPAIGN_COMPLETED_START_ERROR =
  "This campaign has finished: every lead has been through the sequence. Duplicate it to run it again, or retry its failed leads.";
export const CAMPAIGN_ARCHIVED_START_ERROR = "This campaign is archived. Unarchive it first; it comes back paused.";
export const CAMPAIGN_PAUSE_ERROR = "Only a running or scheduled campaign can be paused.";
export const CAMPAIGN_UNARCHIVE_ERROR = "Only an archived campaign can be unarchived.";
export const RETRY_FAILED_ARCHIVED_ERROR = "Unarchive this campaign first.";
export const RETRY_FAILED_NOT_STARTED_ERROR = "This campaign hasn't started yet, so no leads have failed.";
export const NO_RETRYABLE_FAILED_LEADS_ERROR = "No failed leads can be retried. Bounced addresses are never retried.";

/** The run status that mirrors a campaign status. */
export function runStatusForCampaign(status: string, deleted: boolean): "active" | "paused" | "completed" {
  if (deleted || status === "completed" || status === "archived") return "completed";
  if (status === "running" || status === "scheduled") return "active";
  return "paused";
}

/** Why this command can't run on the campaign right now, or null when it can. */
export function campaignCommandError(
  c: { status: string; deletedAt?: string | null },
  cmd: CampaignCommand,
): string | null {
  if (c.deletedAt) return "Campaign not found";
  switch (cmd) {
    case "start":
    case "resume":
      if (c.status === "completed") return CAMPAIGN_COMPLETED_START_ERROR;
      if (c.status === "archived") return CAMPAIGN_ARCHIVED_START_ERROR;
      return null;
    case "pause":
      return c.status === "running" || c.status === "scheduled" ? null : CAMPAIGN_PAUSE_ERROR;
    case "unarchive":
      return c.status === "archived" ? null : CAMPAIGN_UNARCHIVE_ERROR;
    case "retry_failed":
      if (c.status === "archived") return RETRY_FAILED_ARCHIVED_ERROR;
      if (c.status === "draft" || c.status === "scheduled") return RETRY_FAILED_NOT_STARTED_ERROR;
      return null;
    default:
      return null;
  }
}

/**
 * A failed lead may be re-queued only when none of its emails bounced: a
 * bounced address is never retried.
 */
export function retryableFailedLead(cl: { status: string }, jobs: Array<{ status: string }>): boolean {
  return cl.status === "failed" && !jobs.some((j) => j.status === "bounced");
}

/**
 * Mirror a campaign's new status on its Autopilot run(s). Write the campaign
 * first, then call this, so the engine-visible state never runs ahead.
 * Returns the run ids (none for a manual campaign).
 */
export async function syncRunStatusForCampaign(
  db: Db,
  campaignId: string,
  campaignStatus: string,
  deleted = false,
): Promise<string[]> {
  const rows: Array<{ id: string }> = await db
    .update(schema.chadGtmRuns)
    .set({ status: runStatusForCampaign(campaignStatus, deleted), updatedAt: new Date().toISOString() })
    .where(eq(schema.chadGtmRuns.campaignId, campaignId))
    .returning({ id: schema.chadGtmRuns.id });
  return Array.isArray(rows) ? rows.map((r) => r.id) : [];
}

/* ─── Settings an Autopilot campaign fixes on purpose ─────────────────── */

export const AUTOPILOT_SETTINGS_LOCKED_ERROR =
  "Autopilot sets this campaign's schedule, pace and stop-on-reply. Change the daily volume on its Autopilot page.";

const AUTOPILOT_LOCKED_FIELDS = [
  "dailyLimit",
  "sendingWindowStart",
  "sendingWindowEnd",
  "sendingTimezone",
  "businessDaysOnly",
  "stopOnReply",
  "minDelaySec",
  "maxDelaySec",
] as const;

export type AutopilotLockedField = (typeof AUTOPILOT_LOCKED_FIELDS)[number];

/**
 * A non-admin can't change the schedule, pace, daily limit or stop-on-reply
 * of an Autopilot campaign. Resubmitting the current values (or leaving them
 * out) is fine; admins and manual campaigns are never locked.
 */
export function autopilotSettingsLockError(args: {
  isAdmin: boolean;
  isAutopilot: boolean;
  current: Partial<Record<AutopilotLockedField, unknown>>;
  input: Partial<Record<AutopilotLockedField, unknown>>;
}): string | null {
  if (args.isAdmin || !args.isAutopilot) return null;
  for (const field of AUTOPILOT_LOCKED_FIELDS) {
    const next = args.input[field];
    if (next === undefined) continue;
    const cur = args.current[field];
    const same = typeof cur === "number" || typeof next === "number" ? Number(next) === Number(cur) : next === cur;
    if (!same) return AUTOPILOT_SETTINGS_LOCKED_ERROR;
  }
  return null;
}
