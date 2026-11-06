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
import { and, eq, inArray } from "drizzle-orm";
import type { EngineDb } from "./db-port";
import { addSuppression } from "./suppression";

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
