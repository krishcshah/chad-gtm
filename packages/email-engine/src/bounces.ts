/**
 * Hard-bounce bookkeeping shared by the SMTP send path (synchronous 5.1.x
 * rejection) and IMAP sync (delivery-status notifications).
 *
 * A hard bounce means the ADDRESS is dead: suppress it globally (source
 * 'bounce', so no client can mail it again from the shared pool), stop the
 * lead's remaining steps, and mark the job and lead bounced. It never touches
 * the sending mailbox's health or status.
 */
import { schema } from "@smartreach/database";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { EngineDb } from "./db-port";
import { addSuppression } from "./suppression";
import { ownerLeadIdsForEmail } from "./lead-outcomes";

export interface HardBounceInput {
  email: string;
  leadId: string;
  /** The job that bounced, when known. */
  jobId?: string | null;
  campaignId?: string | null;
  /** Lead owner: the suppression row and activity log belong to them. */
  ownerUserId: string;
  workspaceId?: string | null;
  /** Enhanced status, e.g. "5.1.1". */
  status: string;
  diagnostic?: string;
  via: "smtp" | "dsn";
}

/** Returns true when this bounce was new for the lead (false = already recorded). */
export async function recordHardBounce(db: EngineDb, input: HardBounceInput): Promise<boolean> {
  const nowS = new Date().toISOString();
  const diag = String(input.diagnostic ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const reason = `Hard bounce ${input.status}${diag ? `: ${diag}` : ""}`;

  const leadRows: { status: string }[] = await db
    .select({ status: schema.leads.status })
    .from(schema.leads)
    .where(eq(schema.leads.id, input.leadId))
    .limit(1);
  const alreadyBounced = leadRows[0]?.status === "bounced";

  await addSuppression(db, {
    userId: input.ownerUserId,
    workspaceId: input.workspaceId ?? null,
    email: input.email,
    source: "bounce",
    reason,
  });

  if (input.jobId) {
    await db
      .update(schema.emailJobs)
      .set({ status: "bounced", lastError: reason.slice(0, 500), processingAt: null, updatedAt: nowS })
      .where(eq(schema.emailJobs.id, input.jobId));
  }
  // Stop every remaining step for this lead.
  await db
    .update(schema.emailJobs)
    .set({ status: "cancelled", lastError: "lead-bounced", updatedAt: nowS })
    .where(and(eq(schema.emailJobs.leadId, input.leadId), inArray(schema.emailJobs.status, ["pending", "retry"])));
  await db
    .update(schema.campaignLeads)
    .set({ status: "failed", lastError: reason.slice(0, 500), updatedAt: nowS })
    .where(
      and(
        eq(schema.campaignLeads.leadId, input.leadId),
        inArray(schema.campaignLeads.status, ["queued", "scheduled", "sent"]),
      ),
    );
  await db
    .update(schema.leads)
    .set({ status: "bounced", updatedAt: nowS })
    .where(eq(schema.leads.id, input.leadId));

  // The same address in the owner's other lists is the same dead mailbox:
  // mark those rows bounced and stop their open steps too.
  const otherLeadIds = (await ownerLeadIdsForEmail(db, input.ownerUserId, input.email)).filter(
    (id) => id !== input.leadId,
  );
  if (otherLeadIds.length > 0) {
    await db
      .update(schema.emailJobs)
      .set({ status: "cancelled", lastError: "lead-bounced", updatedAt: nowS })
      .where(and(inArray(schema.emailJobs.leadId, otherLeadIds), inArray(schema.emailJobs.status, ["pending", "retry"])));
    await db
      .update(schema.campaignLeads)
      .set({ status: "failed", lastError: reason.slice(0, 500), updatedAt: nowS })
      .where(
        and(
          inArray(schema.campaignLeads.leadId, otherLeadIds),
          inArray(schema.campaignLeads.status, ["queued", "scheduled"]),
        ),
      );
    await db
      .update(schema.leads)
      .set({ status: "bounced", updatedAt: nowS })
      .where(inArray(schema.leads.id, otherLeadIds));
  }

  if (!alreadyBounced) {
    await db.insert(schema.activityLogs).values({
      id: crypto.randomUUID(),
      userId: input.ownerUserId,
      type: "email_bounced",
      message: `${input.email} bounced (${input.status}); address suppressed and remaining steps stopped`,
      campaignId: input.campaignId ?? null,
      meta: { via: input.via, status: input.status, jobId: input.jobId ?? null },
    });
  }
  return !alreadyBounced;
}

export interface CampaignStopInput {
  email: string;
  leadId: string;
  jobId?: string | null;
  campaignId: string;
  ownerUserId: string;
  status: string;
  diagnostic?: string;
  via: "smtp" | "dsn";
}

/**
 * A permanent failure that is NOT proof the address is dead (policy / spam /
 * DMARC 5.7.x, mailbox full 5.2.2, generic 5.0.0): stop this lead in THIS
 * campaign only. No suppression is written, so the address stays mailable
 * by other clients and the lead is not marked bounced.
 * Returns true when this was new for the job.
 */
export async function recordCampaignStop(db: EngineDb, input: CampaignStopInput): Promise<boolean> {
  const nowS = new Date().toISOString();
  const diag = String(input.diagnostic ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const reason = `Delivery refused ${input.status}${diag ? `: ${diag}` : ""}`.slice(0, 500);

  let fresh = true;
  if (input.jobId) {
    const changed: { id: string }[] = await db
      .update(schema.emailJobs)
      .set({ status: "bounced", lastError: reason, processingAt: null, updatedAt: nowS })
      .where(and(eq(schema.emailJobs.id, input.jobId), inArray(schema.emailJobs.status, ["sent", "processing", "pending", "retry"])))
      .returning({ id: schema.emailJobs.id });
    fresh = changed.length > 0;
  }
  await db
    .update(schema.emailJobs)
    .set({ status: "cancelled", lastError: "lead-stopped-in-campaign", updatedAt: nowS })
    .where(
      and(
        eq(schema.emailJobs.leadId, input.leadId),
        eq(schema.emailJobs.campaignId, input.campaignId),
        inArray(schema.emailJobs.status, ["pending", "retry"]),
      ),
    );
  await db
    .update(schema.campaignLeads)
    .set({ status: "failed", lastError: reason, updatedAt: nowS })
    .where(
      and(
        eq(schema.campaignLeads.leadId, input.leadId),
        eq(schema.campaignLeads.campaignId, input.campaignId),
        inArray(schema.campaignLeads.status, ["queued", "scheduled", "sent"]),
      ),
    );
  if (fresh) {
    await db.insert(schema.activityLogs).values({
      id: crypto.randomUUID(),
      userId: input.ownerUserId,
      type: "email_blocked",
      message: `${input.email} refused the message (${input.status}); stopped for this campaign, address not suppressed`,
      campaignId: input.campaignId,
      meta: { via: input.via, status: input.status, jobId: input.jobId ?? null },
    });
  }
  return fresh;
}

/** Health points a sending mailbox loses per policy (5.7.x) refusal. */
export const POLICY_BLOCK_HEALTH_PENALTY = 5;

/**
 * A 5.7.x refusal (spam, policy, DMARC/SPF/DKIM) says something about the
 * SENDING mailbox or domain: lower its health a little and leave an activity
 * row for its owner (the admin, for pool mailboxes). The mailbox stays in
 * rotation; repeated blocks show up as falling health.
 */
export async function flagSenderPolicyBlock(
  db: EngineDb,
  input: { senderId: string; senderUserId: string; senderEmail: string; status: string; diagnostic?: string; via: "smtp" | "dsn" },
): Promise<void> {
  const nowS = new Date().toISOString();
  const domain = input.senderEmail.split("@")[1] ?? "";
  const diag = String(input.diagnostic ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  await db
    .update(schema.senderAccounts)
    .set({ health: sql`greatest(${schema.senderAccounts.health} - ${POLICY_BLOCK_HEALTH_PENALTY}, 0)`, updatedAt: nowS })
    .where(eq(schema.senderAccounts.id, input.senderId));
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId: input.senderUserId,
    type: "sender.policy_block",
    message: `${input.senderEmail} was refused for policy reasons (${input.status}); check ${domain || "the domain"}'s SPF/DKIM/DMARC and reputation${diag ? `: ${diag}` : ""}`,
    campaignId: null,
    meta: { senderId: input.senderId, domain, status: input.status, via: input.via },
  });
}
