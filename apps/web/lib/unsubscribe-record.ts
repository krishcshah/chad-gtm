/**
 * Record a one-click unsubscribe (the public /unsubscribe page).
 *
 * Uses the engine's addSuppression, the same upsert as an unsubscribe by
 * reply: an existing manual/import/"not interested" row for this address is
 * upgraded to source 'unsubscribe', so the opt-out follows the person to every
 * customer on the shared mailbox pool.
 *
 * Not a "use server" module: it takes a trusted user id from a verified token.
 */
import { and, inArray, isNull, eq, sql } from "drizzle-orm";
import { normalizeEmail, schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { addSuppression } from "@smartreach/email-engine/suppression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function recordUnsubscribe(
  db: Db,
  input: { userId: string; email: string },
  now: string = nowIso(),
): Promise<{ email: string; leadIds: string[] }> {
  const email = normalizeEmail(input.email);
  const sameEmail = sql`lower(${schema.leads.email}) = ${email}`;
  const matchingLeads: Array<{ id: string; workspaceId: string | null }> = await db
    .select({ id: schema.leads.id, workspaceId: schema.leads.workspaceId })
    .from(schema.leads)
    .where(and(eq(schema.leads.userId, input.userId), sameEmail));

  await addSuppression(db, {
    userId: input.userId,
    workspaceId: matchingLeads[0]?.workspaceId ?? null,
    email,
    source: "unsubscribe",
    reason: "One-click unsubscribe",
  });

  await db
    .update(schema.leads)
    .set({ status: "unsubscribed", updatedAt: now })
    .where(and(eq(schema.leads.userId, input.userId), sameEmail, isNull(schema.leads.deletedAt)));

  // Cancel every pending/processing/retry email job for this recipient.
  await db
    .update(schema.emailJobs)
    .set({ status: "cancelled", lastError: "unsubscribed", updatedAt: now })
    .where(
      and(
        sql`lower(${schema.emailJobs.toEmail}) = ${email}`,
        inArray(schema.emailJobs.status, ["pending", "retry", "processing"]),
      ),
    );

  const leadIds = matchingLeads.map((l) => l.id);
  if (leadIds.length > 0) {
    await db
      .update(schema.campaignLeads)
      .set({ status: "cancelled", lastError: "unsubscribed", updatedAt: now })
      .where(
        and(
          inArray(schema.campaignLeads.leadId, leadIds),
          inArray(schema.campaignLeads.status, ["queued", "scheduled"]),
        ),
      );
  }
  return { email, leadIds };
}
