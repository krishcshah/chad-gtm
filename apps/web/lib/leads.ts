/**
 * Lead create/update/delete + list rename — pure of Next session/revalidate for unit tests.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";
import {
  leadCreateSchema,
  leadListRenameSchema,
  leadUpdateSchema,
  updateLeadStatusSchema,
} from "@smartreach/validation";
import { normalizeEmail, nowIso } from "@smartreach/shared";
import { mergeLeadCustomFields, stripUndefined } from "./lead-custom-fields";
import { formatZodActionError } from "./zod-action-error";

const { leadLists, leads } = schema;

export type LeadActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
function zodFail(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): LeadActionResult<never> {
  const { error: message, fieldErrors } = formatZodActionError(error.issues);
  return { ok: false, error: message, fieldErrors };
}

function isUniqueConflict(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const code =
    e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code) : "";
  return code === "23505" || /unique|duplicate|already exists/i.test(msg);
}

export async function createLeadForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  input: unknown,
  workspaceId?: string | null,
): Promise<LeadActionResult<{ id: string }>> {
  const parsed = leadCreateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const data = parsed.data;
  const [list] = await db
    .select({ id: leadLists.id, workspaceId: leadLists.workspaceId })
    .from(leadLists)
    .where(and(eq(leadLists.id, data.listId), eq(leadLists.userId, userId), isNull(leadLists.deletedAt)));
  if (!list) return { ok: false, error: "List not found" };

  const targetWorkspaceId = workspaceId ?? list.workspaceId ?? null;
  const email = normalizeEmail(data.email);
  try {
    const [row] = await db
      .insert(leads)
      .values({
        userId,
        workspaceId: targetWorkspaceId,
        listId: data.listId,
        email,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        company: data.company ?? null,
        website: data.website ?? null,
        linkedin: data.linkedin ?? null,
        jobTitle: data.jobTitle ?? null,
        location: data.location ?? null,
        phone: data.phone ?? null,
        industry: data.industry ?? null,
        tags: data.tags ?? [],
        customFields: data.customFields ?? {},
      })
      .returning({ id: leads.id });
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    if (isUniqueConflict(e)) {
      return { ok: false, error: "A lead with that email already exists in this list" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function updateLeadForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  leadId: string,
  input: unknown,
): Promise<LeadActionResult> {
  const parsed = leadUpdateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const { customFields: patch, email, ...rest } = parsed.data;
  const setValues = stripUndefined({
    ...rest,
    ...(email !== undefined ? { email: normalizeEmail(email) } : {}),
  }) as Record<string, unknown>;

  try {
    if (patch !== undefined) {
      const [existing] = await db
        .select({ id: leads.id, customFields: leads.customFields })
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.userId, userId), isNull(leads.deletedAt)));
      if (!existing) return { ok: false, error: "Lead not found" };
      setValues.customFields = mergeLeadCustomFields(
        existing.customFields as Record<string, string>,
        patch,
      );
    }

    setValues.updatedAt = nowIso();
    await db
      .update(leads)
      .set(setValues)
      .where(and(eq(leads.id, leadId), eq(leads.userId, userId), isNull(leads.deletedAt)));
    return { ok: true, message: "Lead updated" };
  } catch (e) {
    if (isUniqueConflict(e)) {
      return { ok: false, error: "A lead with that email already exists in this list" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Soft-delete a single owned lead (F03c). Confirm is UI-side; API just deletes. */
export async function deleteLeadForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  leadId: string,
): Promise<LeadActionResult> {
  try {
    const [row] = await db
      .update(leads)
      .set({ deletedAt: nowIso(), updatedAt: nowIso() })
      .where(and(eq(leads.id, leadId), eq(leads.userId, userId), isNull(leads.deletedAt)))
      .returning({ id: leads.id });
    if (!row) return { ok: false, error: "Lead not found" };
    return { ok: true, message: "Lead deleted" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Soft-delete owned leads by id (P01). Empty ids → error. */
export async function bulkDeleteLeadsForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  ids: string[],
): Promise<LeadActionResult> {
  if (!ids.length) return { ok: false, error: "No leads selected" };
  try {
    await db
      .update(leads)
      .set({ deletedAt: nowIso(), updatedAt: nowIso() })
      .where(and(eq(leads.userId, userId), inArray(leads.id, ids)));
    return {
      ok: true,
      message: `Deleted ${ids.length} lead${ids.length > 1 ? "s" : ""}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Rename an owned lead list (P02). Uses same name rules as create (trim min1 max120). */
export async function renameLeadListForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  listId: string,
  input: unknown,
): Promise<LeadActionResult> {
  const parsed = leadListRenameSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const [list] = await db
    .select({ id: leadLists.id })
    .from(leadLists)
    .where(and(eq(leadLists.id, listId), eq(leadLists.userId, userId), isNull(leadLists.deletedAt)));
  if (!list) return { ok: false, error: "List not found" };

  try {
    await db
      .update(leadLists)
      .set({ name: parsed.data.name, updatedAt: nowIso() })
      .where(and(eq(leadLists.id, listId), eq(leadLists.userId, userId), isNull(leadLists.deletedAt)));
    return { ok: true, message: "List renamed" };
  } catch (e) {
    if (isUniqueConflict(e)) {
      return { ok: false, error: "A list with that name already exists" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** F03d — set lead funnel status (column+filter). Engine also auto-promotes. */
export async function updateLeadStatusForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  input: unknown,
): Promise<LeadActionResult<{ leadId: string; status: string }>> {
  const parsed = updateLeadStatusSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  try {
    const [row] = await db
      .update(leads)
      .set({ status: parsed.data.status, updatedAt: nowIso() })
      .where(and(eq(leads.id, parsed.data.leadId), eq(leads.userId, userId), isNull(leads.deletedAt)))
      .returning({ id: leads.id, status: leads.status });
    if (!row) return { ok: false, error: "Lead not found" };
    return { ok: true, data: { leadId: row.id, status: row.status }, message: `Status set to ${row.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
