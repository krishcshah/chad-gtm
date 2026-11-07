"use server";

/**
 * Admin triage of pool mailbox mail that matched no customer (#68) or several
 * (#69). The engine queues these in unmatched_inbound; an admin assigns each
 * to the customer it belongs to (it then shows in their Inbox, never answered
 * by the agent) or dismisses it.
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { normalizeEmail } from "@smartreach/shared";
import { getDb } from "./db";
import { requireUser } from "./session";
import { isAdmin } from "./admin";

export interface UnmatchedInboundItem {
  id: string;
  mailboxEmail: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  reason: "no_match" | "ambiguous_owner";
  candidates: { userId: string; email: string }[];
}

export type TriageResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Unauthorized: Admin privileges required.");
  return user;
}

/** The 100 newest open messages, with mailbox and possible customers. */
export async function listUnmatchedInboundAction(): Promise<UnmatchedInboundItem[]> {
  await requireAdmin();
  const db = getDb();
  const rows: any[] = await db
    .select({
      id: schema.unmatchedInbound.id,
      mailboxEmail: schema.senderAccounts.email,
      fromEmail: schema.unmatchedInbound.fromEmail,
      fromName: schema.unmatchedInbound.fromName,
      subject: schema.unmatchedInbound.subject,
      snippet: schema.unmatchedInbound.snippet,
      receivedAt: schema.unmatchedInbound.receivedAt,
      reason: schema.unmatchedInbound.reason,
      candidateUserIds: schema.unmatchedInbound.candidateUserIds,
    })
    .from(schema.unmatchedInbound)
    .innerJoin(schema.senderAccounts, eq(schema.senderAccounts.id, schema.unmatchedInbound.senderId))
    .where(eq(schema.unmatchedInbound.status, "open"))
    .orderBy(desc(schema.unmatchedInbound.receivedAt))
    .limit(100);

  const ids = [...new Set(rows.flatMap((r) => (Array.isArray(r.candidateUserIds) ? r.candidateUserIds : [])))];
  const users: { id: string; email: string }[] = ids.length
    ? await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  const emailOf = new Map(users.map((u) => [u.id, u.email]));

  return rows.map((r) => ({
    id: r.id,
    mailboxEmail: r.mailboxEmail ?? "",
    fromEmail: r.fromEmail,
    fromName: r.fromName ?? "",
    subject: r.subject ?? "",
    snippet: r.snippet ?? "",
    receivedAt: r.receivedAt,
    reason: r.reason === "ambiguous_owner" ? "ambiguous_owner" : "no_match",
    candidates: (Array.isArray(r.candidateUserIds) ? (r.candidateUserIds as string[]) : [])
      .filter((id) => emailOf.has(id))
      .map((id) => ({ userId: id, email: emailOf.get(id)! })),
  }));
}

/**
 * Give an open message to the customer with this login email. It is filed
 * under their newest campaign that emailed this address (or company) from the
 * same mailbox, else under no campaign in their default workspace.
 */
export async function assignUnmatchedInboundAction(id: string, userEmail: string): Promise<TriageResult> {
  await requireAdmin();
  const db = getDb();
  const email = normalizeEmail(String(userEmail ?? ""));
  if (!email) return { ok: false, error: "Enter the customer's login email." };

  const [customer]: { id: string; email: string }[] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);
  if (!customer) return { ok: false, error: `No account uses ${email}.` };

  const [row]: any[] = await db
    .select()
    .from(schema.unmatchedInbound)
    .where(eq(schema.unmatchedInbound.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "This message no longer exists." };
  if (row.status !== "open") return { ok: false, error: "This message was already assigned or dismissed." };

  const [sender]: any[] = await db
    .select()
    .from(schema.senderAccounts)
    .where(eq(schema.senderAccounts.id, row.senderId))
    .limit(1);
  if (!sender) return { ok: false, error: "The mailbox this message came to no longer exists." };

  const fromEmail = normalizeEmail(String(row.fromEmail ?? ""));
  const domain = fromEmail.includes("@") ? fromEmail.slice(fromEmail.lastIndexOf("@") + 1) : "";
  const domainPattern = `%@${domain.replace(/[\\%_]/g, (c) => `\\${c}`)}`;
  const [job]: { campaignId: string; workspaceId: string | null }[] = await db
    .select({ campaignId: schema.emailJobs.campaignId, workspaceId: schema.campaigns.workspaceId })
    .from(schema.emailJobs)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.emailJobs.campaignId))
    .where(
      and(
        eq(schema.emailJobs.senderId, row.senderId),
        eq(schema.campaigns.userId, customer.id),
        inArray(schema.emailJobs.status, ["sent", "bounced"]),
        domain
          ? sql`(lower(${schema.emailJobs.toEmail}) = ${fromEmail} or lower(${schema.emailJobs.toEmail}) like ${domainPattern})`
          : sql`lower(${schema.emailJobs.toEmail}) = ${fromEmail}`,
      ),
    )
    .orderBy(desc(schema.emailJobs.sentAt))
    .limit(1);

  let workspaceId: string | null = job?.workspaceId ?? null;
  if (!workspaceId) {
    const [ws]: { id: string }[] = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.userId, customer.id))
      .orderBy(desc(schema.workspaces.isDefault), schema.workspaces.createdAt)
      .limit(1);
    workspaceId = ws?.id ?? null;
  }

  // Claim the row first so two admins can't both assign it.
  const nowIso = new Date().toISOString();
  const claimed: { id: string }[] = await db
    .update(schema.unmatchedInbound)
    .set({ status: "assigned", assignedUserId: customer.id, resolvedAt: nowIso })
    .where(and(eq(schema.unmatchedInbound.id, id), eq(schema.unmatchedInbound.status, "open")))
    .returning({ id: schema.unmatchedInbound.id });
  if (claimed.length === 0) return { ok: false, error: "This message was already assigned or dismissed." };

  let recorded: { replyId: string } | null = null;
  try {
    const { recordRoutedReply } = await import("@smartreach/email-engine/sync-replies");
    recorded = await recordRoutedReply(db, {
      sender,
      ownerId: customer.id,
      workspaceId,
      campaignId: job?.campaignId ?? null,
      lead: null,
      from: { name: row.fromName ?? "", email: fromEmail },
      subject: row.subject ?? "",
      bodies: { bodyText: row.bodyText ?? "", bodyHtml: row.bodyHtml ?? "", snippet: row.snippet ?? "" },
      messageId: row.messageId ?? null,
      receivedAt: row.receivedAt,
      routed: "admin",
    });
  } catch (err) {
    console.error("[admin-inbound-triage] assign failed", err);
  }
  if (!recorded) {
    // Put it back so it can be retried; nothing reached the customer.
    await db
      .update(schema.unmatchedInbound)
      .set({ status: "open", assignedUserId: null, resolvedAt: null })
      .where(eq(schema.unmatchedInbound.id, id));
    return { ok: false, error: "Couldn't add this message to the customer's Inbox. It may already be there." };
  }
  await db
    .update(schema.unmatchedInbound)
    .set({ replyId: recorded.replyId })
    .where(eq(schema.unmatchedInbound.id, id));
  revalidatePath("/admin");
  return { ok: true };
}

/** Drop an open message from the queue. It reaches no customer. */
export async function dismissUnmatchedInboundAction(id: string): Promise<TriageResult> {
  await requireAdmin();
  const db = getDb();
  const changed: { id: string }[] = await db
    .update(schema.unmatchedInbound)
    .set({ status: "dismissed", resolvedAt: new Date().toISOString() })
    .where(and(eq(schema.unmatchedInbound.id, id), eq(schema.unmatchedInbound.status, "open")))
    .returning({ id: schema.unmatchedInbound.id });
  if (changed.length === 0) return { ok: false, error: "This message was already assigned or dismissed." };
  revalidatePath("/admin");
  return { ok: true };
}
