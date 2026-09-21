/**
 * Lead create/update persistence — pure of Next session/revalidate for unit tests.
 */
import { and, eq, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { leadCreateSchema, leadUpdateSchema } from "@smartreach/validation";
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
): Promise<LeadActionResult<{ id: string }>> {
  const parsed = leadCreateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const data = parsed.data;
  const [list] = await db
    .select({ id: leadLists.id })
    .from(leadLists)
    .where(and(eq(leadLists.id, data.listId), eq(leadLists.userId, userId), isNull(leadLists.deletedAt)));
  if (!list) return { ok: false, error: "List not found" };

  const email = normalizeEmail(data.email);
  try {
    const [row] = await db
      .insert(leads)
      .values({
        userId,
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

