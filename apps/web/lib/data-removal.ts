import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { normalizeEmail, schema } from "@smartreach/database";
import { getDb, type Db } from "./db";
import { requireAdmin } from "./admin";
import { deleteDirectoryLeadsByEmail, directoryCountByEmail } from "./leads-directory";

export type DataRemovalStatus = "pending" | "in_progress" | "completed" | "rejected";

export interface DataRemovalRequestDTO {
  id: string;
  userId: string | null;
  contactEmail: string;
  description: string;
  status: DataRemovalStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Global block for an erasure request: a suppressions row with no owner and
 * source 'erasure', which applies to every user (GLOBAL_SUPPRESSION_SOURCES).
 * Inserted once per address. Errors propagate so callers fail closed.
 */
export async function ensureErasureSuppression(db: Db, email: string): Promise<void> {
  const value = normalizeEmail(email);
  const [existing] = await db
    .select({ id: schema.suppressions.id })
    .from(schema.suppressions)
    .where(and(eq(schema.suppressions.value, value), eq(schema.suppressions.source, "erasure")))
    .limit(1);
  if (existing) return;
  await db.insert(schema.suppressions).values({
    userId: null,
    workspaceId: null,
    value,
    kind: "email",
    source: "erasure",
    reason: "Removal request",
  });
}

/**
 * Submit a data removal request (from settings or public page). The address
 * is blocked for every customer straight away, before the request is stored;
 * over-blocking from the public form is the safe direction.
 */
export async function submitDataRemovalRequest(data: {
  contactEmail: string;
  description: string;
  userId?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const email = data.contactEmail?.trim().toLowerCase();
  const description = data.description?.trim();

  if (!email || !email.includes("@") || email.length < 5) {
    return { ok: false, error: "Please enter a valid contact email address." };
  }
  if (!description || description.length < 3) {
    return { ok: false, error: "Please describe what information you want removed." };
  }

  const db = getDb();
  const requestId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  try {
    await ensureErasureSuppression(db, email);
  } catch (err) {
    console.error("[data-removal] Could not add erasure suppression:", err);
    return { ok: false, error: "We could not record your request. Try again." };
  }

  await db.insert(schema.dataRemovalRequests).values({
    id: requestId,
    userId: data.userId || null,
    contactEmail: email,
    description,
    status: "pending",
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  return { ok: true, id: requestId };
}

/**
 * Admin view: lists all data removal requests.
 */
export async function listAllDataRemovalRequestsForAdmin(currentUser: { email?: string | null }): Promise<DataRemovalRequestDTO[]> {
  requireAdmin(currentUser);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.dataRemovalRequests)
    .orderBy(desc(schema.dataRemovalRequests.createdAt))
    .limit(500);

  return rows as DataRemovalRequestDTO[];
}

async function loadRequest(db: Db, requestId: string) {
  const [row] = await db
    .select({ contactEmail: schema.dataRemovalRequests.contactEmail, status: schema.dataRemovalRequests.status })
    .from(schema.dataRemovalRequests)
    .where(eq(schema.dataRemovalRequests.id, requestId))
    .limit(1);
  return row ?? null;
}

export const ERASE_FIRST_ERROR = "Delete their data first, then mark the request completed.";

/**
 * Admin action: carry out an erasure request. Blocks the address for everyone,
 * deletes it from the lead directory, soft-deletes every customer's leads with
 * that address and cancels anything still queued to it. Safe to run again.
 */
export async function eraseDataForRemovalRequestForAdmin(
  currentUser: { email?: string | null },
  requestId: string
): Promise<{ ok: boolean; error?: string; directoryDeleted?: number; leadsDeleted?: number }> {
  requireAdmin(currentUser);
  const db = getDb();
  const request = await loadRequest(db, requestId);
  if (!request) return { ok: false, error: "This request no longer exists." };
  const email = normalizeEmail(request.contactEmail);
  const nowIso = new Date().toISOString();

  // Block first, so nothing can be sent to them while the rest runs.
  await ensureErasureSuppression(db, email);

  const directoryDeleted = deleteDirectoryLeadsByEmail(email);

  const matching = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(eq(sql`lower(${schema.leads.email})`, email));
  const leadIds = matching.map((l) => l.id);

  let leadsDeleted = 0;
  if (leadIds.length > 0) {
    const deleted = await db
      .update(schema.leads)
      .set({ deletedAt: nowIso, updatedAt: nowIso })
      .where(and(inArray(schema.leads.id, leadIds), isNull(schema.leads.deletedAt)))
      .returning({ id: schema.leads.id });
    leadsDeleted = deleted.length;

    await db
      .update(schema.campaignLeads)
      .set({ status: "cancelled", lastError: "erased", updatedAt: nowIso })
      .where(
        and(
          inArray(schema.campaignLeads.leadId, leadIds),
          inArray(schema.campaignLeads.status, ["queued", "scheduled"])
        )
      );
  }

  await db
    .update(schema.emailJobs)
    .set({ status: "cancelled", lastError: "erased", updatedAt: nowIso })
    .where(
      and(
        eq(sql`lower(${schema.emailJobs.toEmail})`, email),
        inArray(schema.emailJobs.status, ["pending", "retry", "processing"])
      )
    );

  if (request.status === "pending") {
    await db
      .update(schema.dataRemovalRequests)
      .set({ status: "in_progress", updatedAt: nowIso })
      .where(and(eq(schema.dataRemovalRequests.id, requestId), eq(schema.dataRemovalRequests.status, "pending")));
  }

  return { ok: true, directoryDeleted, leadsDeleted };
}

/**
 * Admin action: update status of a data removal request. 'completed' is only
 * allowed once no customer lead and no directory record has the address.
 */
export async function updateDataRemovalStatusForAdmin(
  currentUser: { email?: string | null },
  requestId: string,
  status: DataRemovalStatus
): Promise<{ ok: boolean; error?: string }> {
  requireAdmin(currentUser);
  const db = getDb();
  const nowIso = new Date().toISOString();

  if (status === "completed") {
    const request = await loadRequest(db, requestId);
    if (!request) return { ok: false, error: "This request no longer exists." };
    const email = normalizeEmail(request.contactEmail);
    const [active] = await db
      .select({ n: count() })
      .from(schema.leads)
      .where(and(eq(sql`lower(${schema.leads.email})`, email), isNull(schema.leads.deletedAt)));
    if (Number(active?.n ?? 0) > 0 || directoryCountByEmail(email) > 0) {
      return { ok: false, error: ERASE_FIRST_ERROR };
    }
  }

  await db
    .update(schema.dataRemovalRequests)
    .set({
      status,
      updatedAt: nowIso,
    })
    .where(eq(schema.dataRemovalRequests.id, requestId));

  return { ok: true };
}
