import { desc, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { requireAdmin } from "./admin";

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
 * Submit a data removal request (from settings or public page).
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

/**
 * Admin action: update status of a data removal request.
 */
export async function updateDataRemovalStatusForAdmin(
  currentUser: { email?: string | null },
  requestId: string,
  status: DataRemovalStatus
): Promise<{ ok: boolean; error?: string }> {
  requireAdmin(currentUser);
  const db = getDb();
  const nowIso = new Date().toISOString();

  await db
    .update(schema.dataRemovalRequests)
    .set({
      status,
      updatedAt: nowIso,
    })
    .where(eq(schema.dataRemovalRequests.id, requestId));

  return { ok: true };
}
