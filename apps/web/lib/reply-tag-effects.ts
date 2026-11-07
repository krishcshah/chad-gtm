/**
 * What an Inbox tag does beyond the label.
 *
 * - Interested, Meeting booked, Won and Lost move the person's lead status
 *   (all of the owner's rows for that address). "Not interested" marks them
 *   Lost. Bounced, unsubscribed and blocked leads keep their status.
 * - Out of office (and no tag) is a label only: follow-ups keep going.
 * - "Not interested" + "Also stop contacting" adds them to the owner's
 *   blocklist (source 'not_interested'), stops every campaign of the owner
 *   for that address and tells the agent not to answer their pending
 *   messages.
 * - Retagging never resumes a sequence.
 *
 * Not a "use server" module: it takes a trusted owner id.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { normalizeEmail, schema } from "@smartreach/database";
import { addSuppression } from "@smartreach/email-engine/suppression";
import { setLeadStatusForEmail, stopAllCampaignsForEmail } from "@smartreach/email-engine/lead-outcomes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type TagLeadStatus = "interested" | "meeting_booked" | "won" | "lost";

/** Lead statuses a tag may overwrite (never bounced, unsubscribed or blocked). */
export const TAG_OVERWRITABLE_LEAD_STATUSES = [
  "new",
  "contacted",
  "replied",
  "interested",
  "meeting_booked",
  "won",
  "lost",
] as const;

export const NOT_INTERESTED_AGENT_SUMMARY = "You marked this lead Not interested.";

/** Lead status an Inbox tag writes, or null when the tag is a label only. */
export function leadStatusForTag(tag: string | null | undefined): TagLeadStatus | null {
  switch (tag) {
    case "interested":
      return "interested";
    case "meeting_booked":
      return "meeting_booked";
    case "won":
      return "won";
    case "lost":
    case "not_interested":
      return "lost";
    default:
      return null;
  }
}

export async function applyReplyTagEffects(
  db: Db,
  input: {
    ownerId: string;
    workspaceId: string | null;
    leadId: string | null;
    fromEmail: string;
    tag: string | null;
    stopContacting: boolean;
    nowIso: string;
  },
): Promise<{ stopped: boolean }> {
  const email = normalizeEmail(input.fromEmail || "");
  if (!email) return { stopped: false };

  const status = leadStatusForTag(input.tag);
  if (status) {
    await setLeadStatusForEmail(db, {
      ownerId: input.ownerId,
      email,
      status,
      nowIso: input.nowIso,
      onlyFrom: [...TAG_OVERWRITABLE_LEAD_STATUSES],
    });
  }

  if (input.tag !== "not_interested" || !input.stopContacting) return { stopped: false };

  await addSuppression(db, {
    userId: input.ownerId,
    workspaceId: input.workspaceId,
    email,
    source: "not_interested",
    reason: "Tagged Not interested in the Inbox",
  });
  await stopAllCampaignsForEmail(db, { ownerId: input.ownerId, email, reason: "stopped-by-you", nowIso: input.nowIso });
  await db
    .update(schema.replies)
    .set({
      agentStatus: "skipped",
      agentIntent: "not_interested",
      agentSummary: NOT_INTERESTED_AGENT_SUMMARY,
      agentHandledAt: input.nowIso,
    })
    .where(
      and(
        eq(schema.replies.userId, input.ownerId),
        eq(schema.replies.agentStatus, "pending"),
        input.leadId
          ? or(eq(schema.replies.leadId, input.leadId), sql`lower(${schema.replies.fromEmail}) = ${email}`)
          : sql`lower(${schema.replies.fromEmail}) = ${email}`,
      ),
    );
  return { stopped: true };
}
