/**
 * Person-level lead outcomes (#30, #36).
 *
 * The same person can sit in several lists, so one email address can be
 * several lead rows for one owner. A reply, bounce or opt-out belongs to the
 * person (owner + normalized email), not to the one row the message threaded
 * to:
 *
 * - The replied campaign follows its own "Stop on reply" toggle. With it off,
 *   queued/scheduled rows keep running and only finished rows are marked
 *   replied.
 * - Every other campaign of that owner stops the person only when its own
 *   "Stop on reply" is on (the default for new campaigns).
 * - An opt-out stops every campaign, whatever the toggles say.
 * - Nothing here ever resumes a row that is already replied, failed or
 *   cancelled.
 *
 * The opt-out suppression (written by the caller) stays the cross-customer
 * guard; this module only touches the owner's own rows.
 */
import { normalizeEmail, schema } from "@smartreach/database";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { EngineDb } from "./db-port";

/** Lead statuses that mean "this person has replied" (any later outcome included). */
export const REPLIED_LEAD_STATUSES = ["replied", "interested", "meeting_booked", "won", "lost"] as const;

export function isRepliedLeadStatus(status: string | null | undefined): boolean {
  return (REPLIED_LEAD_STATUSES as readonly string[]).includes(String(status ?? ""));
}

/** Lead statuses a reply may move to 'replied' (later outcomes are kept). */
const REPLY_OVERWRITABLE_LEAD_STATUSES: ("new" | "contacted")[] = ["new", "contacted"];
/** Statuses only another bounce / unsubscribe may overwrite. */
const STICKY_LEAD_STATUSES: ("bounced" | "unsubscribed")[] = ["bounced", "unsubscribed"];

const OPEN_CAMPAIGN_LEAD_STATUSES: ("queued" | "scheduled")[] = ["queued", "scheduled"];
const OPEN_JOB_STATUSES: ("pending" | "retry" | "processing")[] = ["pending", "retry", "processing"];

/** Ids of the owner's non-deleted lead rows for this address (any list). */
export async function ownerLeadIdsForEmail(db: EngineDb, ownerId: string, email: string): Promise<string[]> {
  const normalized = normalizeEmail(String(email ?? ""));
  if (!ownerId || !normalized) return [];
  const rows: { id: string }[] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.userId, ownerId),
        sql`lower(${schema.leads.email}) = ${normalized}`,
        isNull(schema.leads.deletedAt),
      ),
    );
  return [...new Set(rows.map((r) => r.id).filter(Boolean))];
}

export interface ReplyStopRow {
  campaignLeadId: string;
  campaignId: string;
  status: string;
  stopOnReply: boolean;
}

export interface ReplyStopPlan {
  /** campaign_leads to mark 'replied' (rows of the replied campaign). */
  markReplied: string[];
  /** campaign_leads to cancel (open rows of the person's other campaigns). */
  cancel: string[];
}

/**
 * Which of the person's campaign_leads a reply stops. Pure: the caller loads
 * every campaign_lead of the person with its campaign's stopOnReply.
 */
export function planReplyStop(
  rows: ReplyStopRow[],
  opts: { repliedCampaignId: string | null; optOut: boolean },
): ReplyStopPlan {
  const markReplied: string[] = [];
  const cancel: string[] = [];
  for (const row of rows) {
    const status = String(row.status);
    const open = (OPEN_CAMPAIGN_LEAD_STATUSES as string[]).includes(status);
    const stops = opts.optOut || row.stopOnReply === true;
    if (opts.repliedCampaignId && row.campaignId === opts.repliedCampaignId) {
      if (stops) {
        if (open || status === "sent") markReplied.push(row.campaignLeadId);
      } else if (status === "sent") {
        markReplied.push(row.campaignLeadId);
      }
      continue;
    }
    if (stops && open) cancel.push(row.campaignLeadId);
  }
  return { markReplied, cancel };
}

async function loadReplyStopRows(db: EngineDb, leadIds: string[]): Promise<ReplyStopRow[]> {
  if (leadIds.length === 0) return [];
  const rows: ReplyStopRow[] = await db
    .select({
      campaignLeadId: schema.campaignLeads.id,
      campaignId: schema.campaignLeads.campaignId,
      status: schema.campaignLeads.status,
      stopOnReply: schema.campaigns.stopOnReply,
    })
    .from(schema.campaignLeads)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignLeads.campaignId))
    .where(inArray(schema.campaignLeads.leadId, leadIds));
  return rows;
}

async function applyStopPlan(
  db: EngineDb,
  plan: ReplyStopPlan,
  opts: { cancelReason: string; jobReason: string; nowIso: string },
): Promise<void> {
  if (plan.markReplied.length > 0) {
    await db
      .update(schema.campaignLeads)
      .set({ status: "replied", updatedAt: opts.nowIso })
      .where(
        and(
          inArray(schema.campaignLeads.id, plan.markReplied),
          inArray(schema.campaignLeads.status, [...OPEN_CAMPAIGN_LEAD_STATUSES, "sent"]),
        ),
      );
  }
  if (plan.cancel.length > 0) {
    await db
      .update(schema.campaignLeads)
      .set({ status: "cancelled", lastError: opts.cancelReason, updatedAt: opts.nowIso })
      .where(
        and(
          inArray(schema.campaignLeads.id, plan.cancel),
          inArray(schema.campaignLeads.status, OPEN_CAMPAIGN_LEAD_STATUSES),
        ),
      );
  }
  const stopped = [...new Set([...plan.markReplied, ...plan.cancel])];
  if (stopped.length > 0) {
    await db
      .update(schema.emailJobs)
      .set({ status: "cancelled", lastError: opts.jobReason, updatedAt: opts.nowIso })
      .where(
        and(
          inArray(schema.emailJobs.campaignLeadId, stopped),
          inArray(schema.emailJobs.status, OPEN_JOB_STATUSES),
        ),
      );
  }
}

/**
 * A person replied (or opted out) in `campaignId`: mark every lead row of
 * theirs for this owner replied (from new/contacted only) and stop their
 * campaigns per planReplyStop.
 */
export async function stopLeadAfterReply(
  db: EngineDb,
  input: {
    ownerId: string;
    email: string;
    leadId: string;
    campaignId: string | null;
    optOut: boolean;
    nowIso: string;
  },
): Promise<ReplyStopPlan> {
  const leadIds = [...new Set([...(await ownerLeadIdsForEmail(db, input.ownerId, input.email)), input.leadId])].filter(
    Boolean,
  );
  await db
    .update(schema.leads)
    .set({ status: "replied", updatedAt: input.nowIso })
    .where(and(inArray(schema.leads.id, leadIds), inArray(schema.leads.status, REPLY_OVERWRITABLE_LEAD_STATUSES)));
  const rows = await loadReplyStopRows(db, leadIds);
  const plan = planReplyStop(rows, { repliedCampaignId: input.campaignId, optOut: input.optOut });
  await applyStopPlan(db, plan, {
    cancelReason: input.optOut ? "opted-out" : "replied-to-another-campaign",
    jobReason: "lead-replied",
    nowIso: input.nowIso,
  });
  return plan;
}

/** campaign_leads.last_error when an unassigned reply (several possible owners) stopped a row. */
export const UNASSIGNED_REPLY_STOP_REASON = "replied-owner-unclear";

/**
 * A message from this person matched several customers (an unthreaded reply
 * to a mailbox more than one customer sent them mail from, #69), so it is
 * recorded for nobody until an admin assigns it. Fail closed meanwhile: stop
 * every candidate's open sends to the person, per each campaign's "Stop on
 * reply" (every campaign for an opt-out). Lead statuses are left alone; the
 * admin's assignment records the reply for the right customer.
 */
export async function stopCandidatesAfterUnassignedReply(
  db: EngineDb,
  input: { ownerIds: string[]; email: string; optOut: boolean; nowIso: string },
): Promise<ReplyStopPlan> {
  const all: ReplyStopPlan = { markReplied: [], cancel: [] };
  for (const ownerId of [...new Set(input.ownerIds.filter(Boolean))]) {
    const leadIds = await ownerLeadIdsForEmail(db, ownerId, input.email);
    const rows = await loadReplyStopRows(db, leadIds);
    const plan = planReplyStop(rows, { repliedCampaignId: null, optOut: input.optOut });
    await applyStopPlan(db, plan, {
      cancelReason: input.optOut ? "opted-out" : UNASSIGNED_REPLY_STOP_REASON,
      jobReason: "lead-replied",
      nowIso: input.nowIso,
    });
    all.markReplied.push(...plan.markReplied);
    all.cancel.push(...plan.cancel);
  }
  return all;
}

/** Stop every open campaign_lead of this person for this owner (opt-out from anywhere). */
export async function stopAllCampaignsForEmail(
  db: EngineDb,
  input: { ownerId: string; email: string; reason: string; nowIso: string },
): Promise<ReplyStopPlan> {
  const leadIds = await ownerLeadIdsForEmail(db, input.ownerId, input.email);
  const rows = await loadReplyStopRows(db, leadIds);
  const plan = planReplyStop(rows, { repliedCampaignId: null, optOut: true });
  await applyStopPlan(db, plan, { cancelReason: input.reason, jobReason: input.reason, nowIso: input.nowIso });
  return plan;
}

/**
 * Set the status of every lead row of this person for this owner. A bounced or
 * unsubscribed row is only overwritten by another bounce / unsubscribe.
 * `onlyFrom` limits the change to rows currently in those statuses.
 */
export async function setLeadStatusForEmail(
  db: EngineDb,
  input: { ownerId: string; email: string; status: string; nowIso: string; onlyFrom?: string[] },
): Promise<void> {
  const normalized = normalizeEmail(String(input.email ?? ""));
  if (!input.ownerId || !normalized) return;
  if (input.onlyFrom && input.onlyFrom.length === 0) return;
  const conditions = [
    eq(schema.leads.userId, input.ownerId),
    sql`lower(${schema.leads.email}) = ${normalized}`,
    isNull(schema.leads.deletedAt),
  ];
  if (!(STICKY_LEAD_STATUSES as string[]).includes(input.status)) {
    conditions.push(notInArray(schema.leads.status, STICKY_LEAD_STATUSES));
  }
  if (input.onlyFrom) conditions.push(inArray(schema.leads.status, input.onlyFrom as any));
  await db
    .update(schema.leads)
    .set({ status: input.status, updatedAt: input.nowIso })
    .where(and(...conditions));
}
