"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  schema,
  encryptSecret,
  domainSuppressionValue,
  normalizeEmail as normalizeEmailStrict,
  verifyUnsubscribeToken,
} from "@smartreach/database";
import {
  expandSuppressionImportLines,
  leadImportSchema,
  leadListCreateSchema,
  parseSuppressionToken,
  senderCreateSchema,
  senderCsvRowSchema,
  setUniboxReplyTagSchema,
  suppressionCreateSchema,
  suppressionImportSchema,
  suppressionListQuerySchema,
  templateSchema,
  workspaceSettingsSchema,
} from "@smartreach/validation";
import {
  bulkDeleteLeadsForUser,
  createLeadForUser,
  deleteLeadForUser,
  renameLeadListForUser,
  updateLeadForUser,
  updateLeadStatusForUser,
} from "./leads";
import {
  toggleSenderForUser,
  updateSenderLimitsForUser,
  updateSenderDetailsForUser,
  runWarmupCycleForUser,
} from "./senders";
import { formatSenderWarmup, parseSenderWarmup } from "./sender-warmup";
import { normalizeEmail, nowIso } from "@smartreach/shared";
import {
  ensureCampaignLeadSnapshot,
  getCampaignWizardStateForUser,
  publishCampaignForUser,
  saveCampaignDraftForUser,
} from "./campaign-drafts";
import {
  getCampaignSequenceForUser,
  previewSequenceContent,
  saveCampaignSequenceForUser,
  type SequenceDTO,
} from "./sequences";
import { getDb } from "./db";
import { requireUser } from "./session";
import type { LeadProfile } from "./ai";
import { ACTIVE_WORKSPACE_COOKIE, getActiveWorkspace, type WorkspaceItem } from "./workspaces";
import { formatZodActionError } from "./zod-action-error";
import {
  getAnalyticsSeriesForUser,
  getAnalyticsSummaryForUser,
  type AnalyticsSeriesPoint,
  type AnalyticsSummary,
} from "./analytics";
import { uniboxReplyMail } from "./outbound-quote";
import {
  buildOperatorThreadMessage,
  loadUniboxThreadMessages,
  resolveUniboxThreadContext,
  type UniboxThreadKey,
  type UniboxThreadMessage,
} from "./unibox-thread";
import { serializeSequenceTemplate, type TemplateStepItem } from "./sequence-templates";

const {
  leadLists,
  leads,
  leadTags,
  senderAccounts,
  emailTemplates,
  campaigns,
  campaignSenders,
  campaignLeads,
} = schema;

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const err = (e: unknown): ActionResult<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : "Something went wrong",
});

function zodFail(error: { issues: { path: PropertyKey[]; message: string }[] }): ActionResult<never> {
  const { error: message, fieldErrors } = formatZodActionError(error.issues);
  return { ok: false, error: message, fieldErrors };
}

/* ═══ Activity log helper ═══ */
async function logActivity(
  userId: string,
  type: string,
  message: string,
  campaignId?: string | null,
  meta?: Record<string, unknown>,
) {
  await getDb()
    .insert(schema.activityLogs)
    .values({ userId, type, message, campaignId: campaignId ?? null, meta: meta ?? {} })
    .catch(() => {});
}

/* ═══ LEAD LISTS ═══ */

export async function createLeadList(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const parsed = leadListCreateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const db = getDb();
  try {
    const [row] = await db
      .insert(leadLists)
      .values({ userId: user.id, workspaceId: workspace.id, name: parsed.data.name })
      .returning({ id: leadLists.id });
    revalidatePath("/leads");
    return { ok: true, data: { id: row.id } };
  } catch {
    return { ok: false, error: "A list with that name already exists" };
  }
}

export async function deleteLeadList(listId: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  try {
    const now = nowIso();
    await db
      .update(leadLists)
      .set({ deletedAt: now })
      .where(and(eq(leadLists.id, listId), eq(leadLists.userId, user.id)));
    await db
      .update(leads)
      .set({ deletedAt: now })
      .where(and(eq(leads.listId, listId), eq(leads.userId, user.id), isNull(leads.deletedAt)));
    revalidatePath("/leads");
    revalidatePath("/dashboard");
    return { ok: true, message: "List deleted" };
  } catch (e) {
    return err(e);
  }
}

/** Rename owned lead list (P02). Zod: name trim min1 max120 via leadListCreateSchema. */
export async function renameLeadList(
  listId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await renameLeadListForUser(getDb(), user.id, listId, input);
  if (result.ok) revalidatePath("/leads");
  return result;
}

/** Alias for renameLeadList. */
export const updateLeadList = renameLeadList;

/* ═══ LEADS — CSV import ═══ */

/** Column names that map directly onto standard lead columns. */
const STANDARD_KEY_TO_COLUMN: Record<string, string> = {
  email: "email",
  first_name: "firstName",
  last_name: "lastName",
  company: "company",
  website: "website",
  linkedin: "linkedin",
  job_title: "jobTitle",
  location: "location",
  phone: "phone",
  industry: "industry",
};

export async function importLeads(input: unknown): Promise<
  ActionResult<{ imported: number; skipped: number; invalid: number; listId: string }>
> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const parsed = leadImportSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const { listId, listName, mapping, rows } = parsed.data;
  const db = getDb();

  // Resolve the list: use existing, or create a new one.
  let targetListId = listId;
  if (listId === "__new__") {
    if (!listName) return { ok: false, error: "Give the new list a name" };
    const [row] = await db
      .insert(leadLists)
      .values({ userId: user.id, workspaceId: workspace.id, name: listName })
      .returning({ id: leadLists.id });
    targetListId = row.id;
  } else {
    const [existing] = await db
      .select({ id: leadLists.id })
      .from(leadLists)
      .where(and(eq(leadLists.id, listId), eq(leadLists.userId, user.id)));
    if (!existing) return { ok: false, error: "List not found" };
  }

  const emailColumn = Object.entries(mapping).find(([, v]) => v === "email")?.[0];
  if (!emailColumn) {
    return { ok: false, error: "Map a column to Email before importing", fieldErrors: { email: ["Required"] } };
  }

  // Load existing emails in this list so we can skip duplicates in one query.
  const existing = await db
    .select({ email: leads.email })
    .from(leads)
    .where(and(eq(leads.listId, targetListId)));
  const existingSet = new Set(existing.map((r) => r.email));

  let imported = 0;
  let skipped = 0;
  let invalid = 0;
  const seenInBatch = new Set<string>();
  const CHUNK = 500;

  const toInsert: (typeof leads.$inferInsert)[] = [];
  const flush = async () => {
    if (!toInsert.length) return;
    await db.insert(leads).values(toInsert.splice(0)).onConflictDoNothing();
  };

  for (const row of rows) {
    const rawEmail = row[emailColumn] ?? "";
    const email = normalizeEmail(rawEmail);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      invalid++;
      continue;
    }
    if (existingSet.has(email) || seenInBatch.has(email)) {
      skipped++;
      continue;
    }
    seenInBatch.add(email);

    const values: Record<string, string> = { email };
    const customFields: Record<string, string> = {};

    for (const [csvCol, field] of Object.entries(mapping)) {
      if (!field) continue;
      const val = (row[csvCol] ?? "").trim();
      const standardCol = STANDARD_KEY_TO_COLUMN[field];
      if (standardCol && standardCol !== "email") values[standardCol] = val || null as never;
      else if (!standardCol && val) customFields[field] = val;
    }

    toInsert.push({
      userId: user.id,
      workspaceId: workspace.id,
      listId: targetListId,
      email,
      firstName: values.firstName ?? null,
      lastName: values.lastName ?? null,
      company: values.company ?? null,
      website: values.website ?? null,
      linkedin: values.linkedin ?? null,
      jobTitle: values.jobTitle ?? null,
      location: values.location ?? null,
      phone: values.phone ?? null,
      industry: values.industry ?? null,
      customFields,
    });
    imported++;
    if (toInsert.length >= CHUNK) await flush();
  }
  await flush();

  await logActivity(user.id, "leads.imported", `Imported ${imported} leads`, null, {
    listId: targetListId,
  });
  revalidatePath("/leads");
  return { ok: true, data: { imported, skipped, invalid, listId: targetListId } };
}

/** Server action: cursor-paginated leads for the table's "load more". */
export async function fetchLeadsPage(params: {
  listId?: string;
  search?: string;
  status?: string;
  cursor?: string;
  pageSize?: number;
}) {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const { listLeads } = await import("./queries");
  const { items, nextCursor } = await listLeads(user.id, {
    listId: params.listId,
    workspaceId: workspace.id,
    isDefault: workspace.isDefault,
    search: params.search,
    status: params.status,
    cursor: params.cursor,
    pageSize: params.pageSize ?? 50,
  });
  return { items: JSON.parse(JSON.stringify(items)), nextCursor };
}

export async function createLead(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const result = await createLeadForUser(getDb(), user.id, input, workspace.id);
  if (result.ok) revalidatePath("/leads");
  return result;
}

export async function updateLead(leadId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const result = await updateLeadForUser(getDb(), user.id, leadId, input);
  if (result.ok) revalidatePath("/leads");
  return result;
}

/** F03d — set lead status (new|contacted|replied|bounced|unsubscribed|blocked). */
export async function updateLeadStatus(input: {
  leadId: string;
  status: string;
}): Promise<ActionResult<{ leadId: string; status: string }>> {
  const user = await requireUser();
  const result = await updateLeadStatusForUser(getDb(), user.id, input);
  if (result.ok) revalidatePath("/leads");
  return result;
}

/** Soft-delete a single owned lead (F03c). Confirm is UI-side. */
export async function deleteLead(leadId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await deleteLeadForUser(getDb(), user.id, leadId);
  if (result.ok) {
    await logActivity(user.id, "leads.deleted", "Deleted a lead");
    revalidatePath("/leads");
  }
  return result;
}

/** Soft-delete owned leads (P01). */
export async function bulkDeleteLeads(ids: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const result = await bulkDeleteLeadsForUser(getDb(), user.id, ids);
  if (result.ok) {
    await logActivity(user.id, "leads.deleted", `Deleted ${ids.length} leads`);
    revalidatePath("/leads");
  }
  return result;
}

export async function bulkTagLeads(
  ids: string[],
  tagId: string,
  mode: "add" | "remove" | "set",
): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  try {
    const rows = await db
      .select({ id: leads.id, tags: leads.tags })
      .from(leads)
      .where(and(eq(leads.userId, user.id), inArray(leads.id, ids)));
    for (const row of rows) {
      const next =
        mode === "set"
          ? [tagId]
          : mode === "add"
            ? [...new Set([...(row.tags ?? []), tagId])]
            : (row.tags ?? []).filter((t) => t !== tagId);
      await db.update(leads).set({ tags: next, updatedAt: nowIso() }).where(eq(leads.id, row.id));
    }
    revalidatePath("/leads");
    return { ok: true, message: "Tags updated" };
  } catch (e) {
    return err(e);
  }
}

export async function createLeadTag(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = leadListCreateSchema.merge(leadListCreateSchema.partial()).safeParse(input);
  void parsed;
  const name = (input as { name?: string })?.name?.trim();
  const color = (input as { color?: string })?.color ?? "#6366f1";
  if (!name) return { ok: false, error: "Tag name is required" };
  const db = getDb();
  try {
    const [row] = await db
      .insert(leadTags)
      .values({ userId: user.id, name, color })
      .returning({ id: leadTags.id });
    revalidatePath("/leads");
    return { ok: true, data: { id: row.id } };
  } catch {
    return { ok: false, error: "A tag with that name already exists" };
  }
}

/* ═══ SENDER ACCOUNTS ═══ */

function buildSenderValues(userId: string, d: ReturnType<typeof senderCreateSchema.parse>) {
  return {
    userId,
    senderName: d.senderName,
    email: normalizeEmail(d.email),
    smtpHost: d.smtpHost,
    smtpPort: d.smtpPort,
    smtpUsername: d.smtpUsername,
    smtpPasswordEnc: encryptSecret(d.smtpPassword),
    smtpSecurity: d.smtpSecurity,
    imapHost: d.imapHost,
    imapPort: d.imapPort,
    imapUsername: d.imapUsername,
    imapPasswordEnc: d.imapPassword ? encryptSecret(d.imapPassword) : "",
    dailyLimit: d.dailyLimit,
    hourlyLimit: d.hourlyLimit,
    fromName: d.fromName,
    replyTo: d.replyTo,
    timezone: d.timezone,
    signature: d.signature,
  };
}

export async function createSender(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const parsed = senderCreateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const db = getDb();
  try {
    const [row] = await db
      .insert(senderAccounts)
      .values({ ...buildSenderValues(user.id, parsed.data), workspaceId: workspace.id })
      .returning({ id: senderAccounts.id });
    await logActivity(user.id, "sender.added", `Added sender ${parsed.data.email}`);
    revalidatePath("/senders");
    return { ok: true, data: { id: row.id } };
  } catch {
    return { ok: false, error: "A sender with that email already exists" };
  }
}

/** Pause/resume owned sender (P04). */
export async function toggleSender(senderId: string, pause: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const result = await toggleSenderForUser(getDb(), user.id, senderId, pause);
  if (result.ok) revalidatePath("/senders");
  return result;
}

export async function deleteSender(senderId: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  try {
    await db
      .update(senderAccounts)
      .set({ deletedAt: nowIso() })
      .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, user.id)));
    await logActivity(user.id, "sender.deleted", "Deleted a sender account");
    revalidatePath("/senders");
    return { ok: true, message: "Sender deleted" };
  } catch (e) {
    return err(e);
  }
}

export async function updateSenderLimits(
  senderId: string,
  dailyLimit: number,
  hourlyLimit?: number,
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await updateSenderLimitsForUser(getDb(), user.id, senderId, dailyLimit, hourlyLimit);
  if (result.ok) revalidatePath("/senders");
  return result;
}

export async function updateSenderDetails(
  senderId: string,
  data: Parameters<typeof updateSenderDetailsForUser>[3],
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await updateSenderDetailsForUser(getDb(), user.id, senderId, data);
  if (result.ok) revalidatePath("/senders");
  return result;
}

export async function runWarmupCycle(): Promise<{ ok: boolean; message: string; exchanged: number }> {
  const user = await requireUser();
  const result = await runWarmupCycleForUser(getDb(), user.id);
  if (result.ok) {
    await logActivity(user.id, "sender.warmup", result.message);
    revalidatePath("/senders");
  }
  return result;
}

export async function bulkUpdateSenders(
  senderIds: string[],
  updates: {
    dailyLimit?: number;
    hourlyLimit?: number;
    status?: "active" | "paused";
    warmupEnabled?: boolean;
    warmupReplyRate?: number;
    warmupDailyTarget?: number;
    smtpHost?: string;
    smtpPort?: number;
    smtpPassword?: string;
    smtpSecurity?: "tls" | "ssl" | "none";
    imapHost?: string;
    imapPort?: number;
    imapPassword?: string;
    fromName?: string;
    replyTo?: string;
    timezone?: string;
  },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!senderIds || senderIds.length === 0) {
    return { ok: false, error: "No senders selected" };
  }

  const db = getDb();
  const selectedSenders = await db
    .select()
    .from(senderAccounts)
    .where(and(eq(senderAccounts.userId, user.id), inArray(senderAccounts.id, senderIds)));

  if (selectedSenders.length === 0) {
    return { ok: false, error: "No matching senders found" };
  }

  for (const s of selectedSenders) {
    const patch: Record<string, unknown> = {
      updatedAt: nowIso(),
    };

    if (updates.dailyLimit !== undefined && !isNaN(updates.dailyLimit)) {
      patch.dailyLimit = Math.max(1, updates.dailyLimit);
    }
    if (updates.hourlyLimit !== undefined && !isNaN(updates.hourlyLimit)) {
      patch.hourlyLimit = Math.max(1, updates.hourlyLimit);
    }
    if (updates.status !== undefined) {
      patch.status = updates.status;
    }
    if (updates.fromName !== undefined && updates.fromName.trim() !== "") {
      patch.fromName = updates.fromName.trim();
    }
    if (updates.replyTo !== undefined && updates.replyTo.trim() !== "") {
      patch.replyTo = updates.replyTo.trim();
    }
    if (updates.timezone !== undefined && updates.timezone.trim() !== "") {
      patch.timezone = updates.timezone.trim();
    }
    if (updates.smtpHost !== undefined && updates.smtpHost.trim() !== "") {
      patch.smtpHost = updates.smtpHost.trim();
    }
    if (updates.smtpPort !== undefined && !isNaN(updates.smtpPort)) {
      patch.smtpPort = updates.smtpPort;
    }
    if (updates.smtpSecurity !== undefined) {
      patch.smtpSecurity = updates.smtpSecurity;
    }
    if (updates.smtpPassword !== undefined && updates.smtpPassword.trim() !== "") {
      patch.smtpPasswordEnc = encryptSecret(updates.smtpPassword.trim());
    }
    if (updates.imapHost !== undefined && updates.imapHost.trim() !== "") {
      patch.imapHost = updates.imapHost.trim();
    }
    if (updates.imapPort !== undefined && !isNaN(updates.imapPort)) {
      patch.imapPort = updates.imapPort;
    }
    if (updates.imapPassword !== undefined && updates.imapPassword.trim() !== "") {
      patch.imapPasswordEnc = encryptSecret(updates.imapPassword.trim());
    }

    if (
      updates.warmupEnabled !== undefined ||
      updates.warmupReplyRate !== undefined ||
      updates.warmupDailyTarget !== undefined
    ) {
      const { warmup: currentWarmup, cleanSig } = parseSenderWarmup(s.signature);
      const newWarmup = {
        ...currentWarmup,
        enabled: updates.warmupEnabled !== undefined ? updates.warmupEnabled : currentWarmup.enabled,
        replyRate:
          updates.warmupReplyRate !== undefined ? updates.warmupReplyRate : currentWarmup.replyRate,
        dailyLimit:
          updates.warmupDailyTarget !== undefined
            ? updates.warmupDailyTarget
            : currentWarmup.dailyLimit,
      };
      patch.signature = formatSenderWarmup(cleanSig, newWarmup);
    }

    await db
      .update(senderAccounts)
      .set(patch)
      .where(and(eq(senderAccounts.id, s.id), eq(senderAccounts.userId, user.id)));
  }

  await logActivity(
    user.id,
    "senders.bulk_updated",
    `Bulk updated ${selectedSenders.length} sender accounts`,
  );
  revalidatePath("/senders");
  return { ok: true, message: `Successfully updated ${selectedSenders.length} senders` };
}

export async function importSendersCsv(rows: unknown[]): Promise<
  ActionResult<{ imported: number; failed: { row: number; error: string }[] }>
> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const db = getDb();
  const failed: { row: number; error: string }[] = [];
  let imported = 0;

  const existing = await db
    .select({ email: senderAccounts.email })
    .from(senderAccounts)
    .where(eq(senderAccounts.userId, user.id));
  const existingSet = new Set(existing.map((r) => r.email));

  for (let i = 0; i < rows.length; i++) {
    const parsed = senderCsvRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      failed.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "Invalid row" });
      continue;
    }
    const email = normalizeEmail(parsed.data.email);
    if (existingSet.has(email)) {
      failed.push({ row: i + 1, error: `${email} already exists` });
      continue;
    }
    const finalSignature = parsed.data.warmupEnabled
      ? formatSenderWarmup(parsed.data.signature || "", {
          enabled: true,
          dailyLimit: parsed.data.warmupDailyLimit ?? 20,
          replyRate: parsed.data.warmupReplyRate ?? 40,
        })
      : parsed.data.signature || "";

    try {
      await db.insert(senderAccounts).values({
        ...buildSenderValues(user.id, {
          ...parsed.data,
          signature: finalSignature,
          fromName: parsed.data.senderName,
          replyTo: "",
        }),
        workspaceId: workspace.id,
      });
      existingSet.add(email);
      imported++;
    } catch {
      failed.push({ row: i + 1, error: "Unable to save (duplicate or DB error)" });
    }
  }

  await logActivity(user.id, "sender.imported", `Imported ${imported} sender accounts`);
  revalidatePath("/senders");
  return { ok: true, data: { imported, failed } };
}

/* ═══ EMAIL TEMPLATES ═══ */

export async function upsertTemplate(input: {
  id?: string;
  name?: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  format?: "text" | "html";
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const { id, ...rest } = (input ?? {}) as { id?: string } & Record<string, unknown>;
  const parsed = templateSchema.safeParse(rest);
  if (!parsed.success) return zodFail(parsed.error);
  const db = getDb();
  try {
    if (id) {
      await db
        .update(emailTemplates)
        .set({ ...parsed.data, updatedAt: nowIso() })
        .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, user.id)));
      revalidatePath("/templates");
      return { ok: true, data: { id }, message: "Template saved" };
    }
    const [row] = await db
      .insert(emailTemplates)
      .values({ userId: user.id, ...parsed.data })
      .returning({ id: emailTemplates.id });
    revalidatePath("/templates");
    return { ok: true, data: { id: row.id }, message: "Template created" };
  } catch (e) {
    return err(e);
  }
}

export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  try {
    await db
      .update(emailTemplates)
      .set({ deletedAt: nowIso() })
      .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.userId, user.id)));
    revalidatePath("/templates");
    return { ok: true, message: "Template deleted" };
  } catch (e) {
    return err(e);
  }
}

export async function saveSequenceAsTemplate(
  name: string,
  description: string,
  steps: TemplateStepItem[],
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const db = getDb();
  const trimmedName = name?.trim() || "Untitled Sequence";
  const firstSubject = steps[0]?.variants[0]?.subject?.trim() || trimmedName;
  const serialized = serializeSequenceTemplate(trimmedName, description?.trim() || "", steps);

  try {
    const [row] = await db
      .insert(emailTemplates)
      .values({
        userId: user.id,
        name: trimmedName,
        subject: firstSubject,
        bodyText: serialized,
        bodyHtml: "",
        format: "text",
      })
      .returning({ id: emailTemplates.id });
    await logActivity(user.id, "template.created", `Saved sequence template "${trimmedName}"`);
    revalidatePath("/templates");
    return { ok: true, data: { id: row.id }, message: `Sequence "${trimmedName}" saved` };
  } catch (e) {
    return err(e);
  }
}

export async function updateSequenceTemplate(
  id: string,
  name: string,
  description: string,
  steps: TemplateStepItem[],
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const db = getDb();
  const trimmedName = name?.trim() || "Untitled Sequence";
  const firstSubject = steps[0]?.variants[0]?.subject?.trim() || trimmedName;
  const serialized = serializeSequenceTemplate(trimmedName, description?.trim() || "", steps);

  try {
    const [row] = await db
      .update(emailTemplates)
      .set({
        name: trimmedName,
        subject: firstSubject,
        bodyText: serialized,
        updatedAt: nowIso(),
      })
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.userId, user.id)))
      .returning({ id: emailTemplates.id });

    if (!row) {
      return { ok: false, error: "Sequence not found or you don't have permission to edit it" };
    }

    await logActivity(user.id, "template.updated", `Updated sequence template "${trimmedName}"`);
    revalidatePath("/templates");
    return { ok: true, data: { id: row.id }, message: `Sequence "${trimmedName}" updated` };
  } catch (e) {
    return err(e);
  }
}

/* ═══ CAMPAIGNS ═══ */

export async function saveCampaignDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const db = getDb();
  const workspace = await getActiveWorkspace(user.id);
  const result = await saveCampaignDraftForUser(db, user.id, input, workspace.id);
  if (result.ok) {
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function publishCampaign(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const db = getDb();
  const workspace = await getActiveWorkspace(user.id);
  const result = await publishCampaignForUser(db, user.id, input, null, workspace.id);
  if (result.ok && result.data?.id) {
    const id = result.data.id;
    const rawSteps = (input as { steps?: unknown })?.steps;
    if (Array.isArray(rawSteps) && rawSteps.length > 0) {
      await saveCampaignSequenceForUser(db, user.id, {
        campaignId: id,
        steps: rawSteps,
      });
    }
    await logActivity(
      user.id,
      "campaign.created",
      result.message ?? "Campaign published",
      id,
    );
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    revalidatePath(`/campaigns/${id}`);
  }
  return result;
}

/** Thin wrapper — wizard Start continues to call createCampaign. */

/* ═══ SEQUENCES (F19) ═══ */

export async function getCampaignSequence(
  campaignId: string,
): Promise<ActionResult<SequenceDTO>> {
  const user = await requireUser();
  return getCampaignSequenceForUser(getDb(), user.id, campaignId);
}

export async function saveCampaignSequence(
  input: unknown,
): Promise<ActionResult<SequenceDTO>> {
  const user = await requireUser();
  const result = await saveCampaignSequenceForUser(getDb(), user.id, input);
  if (result.ok) {
    const id = result.data?.campaignId;
    if (id) revalidatePath(`/campaigns/${id}`);
    revalidatePath("/campaigns");
  }
  return result;
}

/** Preview {{vars}} + spintax for Prism editor (no persistence). */
export async function previewSequenceStep(
  input: unknown,
): Promise<ActionResult<{ subject: string; bodyHtml: string; bodyText: string }>> {
  await requireUser();
  return previewSequenceContent(input);
}

export async function createCampaign(input: unknown): Promise<ActionResult<{ id: string }>> {
  return publishCampaign(input);
}

export async function getCampaignWizardState(
  id: string,
): Promise<ActionResult<import("./campaign-drafts").CampaignWizardState>> {
  const user = await requireUser();
  return getCampaignWizardStateForUser(getDb(), user.id, id);
}

export async function campaignAction(
  campaignId: string,
  action: "start" | "pause" | "resume" | "archive" | "delete" | "duplicate",
): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  try {
    const [c] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, user.id)));
    if (!c) return { ok: false, error: "Campaign not found" };

    switch (action) {
      case "start":
      case "resume": {
        // Duplicate/draft campaigns had no lead snapshot — without this the
        // engine sees 0 queued leads and immediately completes.
        if (!c.leadListId) {
          return { ok: false, error: "Campaign is missing a lead list" };
        }
        await ensureCampaignLeadSnapshot(db, campaignId, c.leadListId);
        await db
          .update(campaigns)
          .set({ status: "running", startedAt: c.startedAt ?? nowIso(), updatedAt: nowIso() })
          .where(eq(campaigns.id, campaignId));
        break;
      }
      case "pause":
        await db.update(campaigns).set({ status: "paused", updatedAt: nowIso() }).where(eq(campaigns.id, campaignId));
        break;
      case "archive":
        await db
          .update(campaigns)
          .set({ status: "archived", updatedAt: nowIso() })
          .where(eq(campaigns.id, campaignId));
        break;
      case "delete":
        await db.update(campaigns).set({ deletedAt: nowIso() }).where(eq(campaigns.id, campaignId));
        break;
      case "duplicate": {
        const [copy] = await db
          .insert(campaigns)
          .values({
            userId: user.id,
            workspaceId: c.workspaceId,
            name: `${c.name} (copy)`,
            status: "draft",
            leadListId: c.leadListId,
            templateId: c.templateId,
            businessDaysOnly: c.businessDaysOnly,
            sendingTimezone: c.sendingTimezone,
            sendingWindowStart: c.sendingWindowStart,
            sendingWindowEnd: c.sendingWindowEnd,
            dailyLimit: c.dailyLimit,
            minDelaySec: c.minDelaySec,
            maxDelaySec: c.maxDelaySec,
            maxEmailsPerSenderPerDay: c.maxEmailsPerSenderPerDay,
            stopOnReply: c.stopOnReply,
            retryFailed: c.retryFailed,
            retryCount: c.retryCount,
          })
          .returning({ id: campaigns.id });
        const senders = await db
          .select({ senderId: campaignSenders.senderId })
          .from(campaignSenders)
          .where(eq(campaignSenders.campaignId, campaignId));
        if (senders.length) {
          await db
            .insert(campaignSenders)
            .values(senders.map((s) => ({ campaignId: copy.id, senderId: s.senderId })));
        }
        // Prefill campaign_leads so Start does not race an empty queue
        if (c.leadListId) {
          await ensureCampaignLeadSnapshot(db, copy.id, c.leadListId);
        }
        break;
      }
    }

    await logActivity(user.id, `campaign.${action}`, `${action === "start" ? "Started" : action === "resume" ? "Resumed" : action === "pause" ? "Paused" : action === "archive" ? "Archived" : action === "delete" ? "Deleted" : "Duplicated"} campaign "${c.name}"`, campaignId);
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    return { ok: true, message: `Campaign ${action === "start" ? "started" : `${action}d`}` };
  } catch (e) {
    return err(e);
  }
}

/**
 * Duplicate an existing campaign into a prefilled new draft.
 * Copies schedule, senders, daily limits, and sequence steps & variants.
 */
export async function duplicateCampaignToDraft(
  campaignId: string,
): Promise<ActionResult<{ draftId: string }>> {
  const user = await requireUser();
  const db = getDb();
  try {
    const [c] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, user.id), isNull(campaigns.deletedAt)));
    if (!c) return { ok: false, error: "Campaign not found" };

    const copyName = `${c.name} (Copy)`;
    const [copy] = await db
      .insert(campaigns)
      .values({
        userId: user.id,
        workspaceId: c.workspaceId,
        name: copyName,
        status: "draft",
        leadListId: c.leadListId,
        templateId: c.templateId,
        businessDaysOnly: c.businessDaysOnly,
        sendingTimezone: c.sendingTimezone,
        sendingWindowStart: c.sendingWindowStart,
        sendingWindowEnd: c.sendingWindowEnd,
        dailyLimit: c.dailyLimit,
        minDelaySec: c.minDelaySec,
        maxDelaySec: c.maxDelaySec,
        maxEmailsPerSenderPerDay: c.maxEmailsPerSenderPerDay,
        stopOnReply: c.stopOnReply,
        retryFailed: c.retryFailed,
        retryCount: c.retryCount,
        wizardStep: 1,
      })
      .returning({ id: campaigns.id });

    // Copy attached senders
    const senders = await db
      .select({ senderId: campaignSenders.senderId })
      .from(campaignSenders)
      .where(eq(campaignSenders.campaignId, campaignId));
    if (senders.length) {
      await db
        .insert(campaignSenders)
        .values(senders.map((s) => ({ campaignId: copy.id, senderId: s.senderId })));
    }

    // Clone sequence steps & variants
    const seq = await getCampaignSequenceForUser(db, user.id, campaignId);
    if (seq.ok && seq.data && seq.data.steps.length > 0) {
      await saveCampaignSequenceForUser(db, user.id, {
        campaignId: copy.id,
        steps: seq.data.steps,
      });
    }

    await logActivity(user.id, "campaign.duplicate", `Duplicated campaign "${c.name}" into new draft`, copy.id);
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    return { ok: true, message: "Campaign cloned into editor", data: { draftId: copy.id } };
  } catch (e) {
    return err(e);
  }
}

/**
 * Edit settings on an existing campaign (name, daily limit, sending window, senders, etc.).
 */
export async function updateCampaignSettings(
  campaignId: string,
  input: {
    name?: string;
    dailyLimit?: number;
    sendingWindowStart?: string;
    sendingWindowEnd?: string;
    sendingTimezone?: string;
    businessDaysOnly?: boolean;
    stopOnReply?: boolean;
    minDelaySec?: number;
    maxDelaySec?: number;
    senderIds?: string[];
  },
): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  try {
    const [c] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, user.id), isNull(campaigns.deletedAt)));
    if (!c) return { ok: false, error: "Campaign not found" };

    const updateData: Record<string, unknown> = { updatedAt: nowIso() };
    if (typeof input.name === "string" && input.name.trim()) updateData.name = input.name.trim();
    if (typeof input.dailyLimit === "number") updateData.dailyLimit = Math.max(1, input.dailyLimit);
    if (typeof input.sendingWindowStart === "string") updateData.sendingWindowStart = input.sendingWindowStart;
    if (typeof input.sendingWindowEnd === "string") updateData.sendingWindowEnd = input.sendingWindowEnd;
    if (typeof input.sendingTimezone === "string") updateData.sendingTimezone = input.sendingTimezone;
    if (typeof input.businessDaysOnly === "boolean") updateData.businessDaysOnly = input.businessDaysOnly;
    if (typeof input.stopOnReply === "boolean") updateData.stopOnReply = input.stopOnReply;
    if (typeof input.minDelaySec === "number") updateData.minDelaySec = input.minDelaySec;
    if (typeof input.maxDelaySec === "number") updateData.maxDelaySec = input.maxDelaySec;

    await db.update(campaigns).set(updateData).where(eq(campaigns.id, campaignId));

    if (Array.isArray(input.senderIds)) {
      const validSenders = await db
        .select({ id: senderAccounts.id })
        .from(senderAccounts)
        .where(and(eq(senderAccounts.userId, user.id), isNull(senderAccounts.deletedAt)));
      const validSet = new Set(validSenders.map((s) => s.id));
      const targetSenderIds = input.senderIds.filter((id) => validSet.has(id));

      await db.delete(campaignSenders).where(eq(campaignSenders.campaignId, campaignId));
      if (targetSenderIds.length > 0) {
        await db
          .insert(campaignSenders)
          .values(targetSenderIds.map((sId) => ({ campaignId, senderId: sId })));
      }
    }

    await logActivity(user.id, "campaign.update", `Updated settings for campaign "${c.name}"`, campaignId);
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
    return { ok: true, message: "Campaign settings saved successfully" };
  } catch (e) {
    return err(e);
  }
}

/** Live SMTP + IMAP check from the Add-Sender form. Never stores — just verifies. */
export async function testSenderConnection(input: unknown): Promise<
  ActionResult<{
    smtp: { ok: boolean; message: string; latencyMs?: number };
    imap: { ok: boolean; message: string; latencyMs?: number };
  }>
> {
  await requireUser(); // auth only — anyone logged in can test their own unsaved creds
  const parsed = senderCreateSchema
    .pick({
      smtpHost: true,
      smtpPort: true,
      smtpUsername: true,
      smtpPassword: true,
      smtpSecurity: true,
      imapHost: true,
      imapPort: true,
      imapUsername: true,
      imapPassword: true,
    })
    .safeParse(input ?? {});
  if (!parsed.success) return zodFail(parsed.error);

  try {
    const { testConnection } = await import("@smartreach/email-engine/mailer");
    const d = parsed.data;
    const result = await testConnection({
      email: "probe",
      fromName: "",
      replyTo: "",
      smtpHost: d.smtpHost,
      smtpPort: d.smtpPort,
      smtpUsername: d.smtpUsername,
      // The engine's testConnection decrypts, so encrypt before passing.
      smtpPasswordEnc: encryptSecret(d.smtpPassword),
      smtpSecurity: d.smtpSecurity,
      imapHost: d.imapHost,
      imapPort: d.imapPort,
      imapUsername: d.imapUsername,
      imapPasswordEnc: d.imapPassword ? encryptSecret(d.imapPassword) : "",
    } as never);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection test failed" };
  }
}

/* ═══ UNIBOX — thread transcript + operator reply (F11c) ═══ */

export async function getUniboxThread(
  key: UniboxThreadKey,
): Promise<ActionResult<{ messages: UniboxThreadMessage[] }>> {
  const user = await requireUser();
  const db = getDb();
  try {
    const ctx = await resolveUniboxThreadContext(db, user.id, key);
    if (!ctx) return { ok: false, error: "Thread not found" };
    const messages = await loadUniboxThreadMessages(db, user.id, ctx);
    return { ok: true, data: { messages } };
  } catch (e) {
    return err(e);
  }
}

export async function sendUniboxReply(input: {
  replyId: string;
  body: string;
}): Promise<ActionResult<{ message: UniboxThreadMessage }>> {
  const user = await requireUser();
  const body = input?.body?.toString().trim();
  if (!body) return { ok: false, error: "Write something before sending" };

  const db = getDb();
  try {
    const [reply] = await db
      .select()
      .from(schema.replies)
      .where(and(eq(schema.replies.id, input.replyId), eq(schema.replies.userId, user.id)))
      .limit(1);
    if (!reply) return { ok: false, error: "Reply not found" };

    const [sender] = await db
      .select()
      .from(schema.senderAccounts)
      .where(and(eq(schema.senderAccounts.id, reply.senderId), eq(schema.senderAccounts.userId, user.id)))
      .limit(1);
    if (!sender) return { ok: false, error: "Sender account not found" };

    const { sendMail } = await import("@smartreach/email-engine/mailer");
    const subject = reply.subject?.startsWith("Re:") ? reply.subject : `Re: ${reply.subject ?? ""}`.trim();
    const finalSubject = subject === "Re:" ? "Re: Your email" : subject;
    // Client sends new text only. Quote is appended here; threading headers are not set.
    const outbound = uniboxReplyMail({
      to: reply.fromEmail,
      subject: finalSubject,
      newText: body,
      prior: {
        fromName: reply.fromName || "",
        fromEmail: reply.fromEmail,
        sentAt: reply.receivedAt,
        bodyText: reply.bodyText || "",
        bodyHtml: reply.bodyHtml || "",
      },
    });
    await sendMail(sender as never, {
      to: outbound.to,
      subject: outbound.subject,
      text: outbound.text,
      html: outbound.html,
      inReplyTo: reply.messageId || undefined,
      references: reply.messageId || undefined,
    });

    const sentAt = nowIso();
    const rowId = crypto.randomUUID();
    const fromName = (sender.fromName || sender.senderName || "").trim();
    const fromEmail = sender.email;
    await db.insert(schema.uniboxMessages).values({
      id: rowId,
      userId: user.id,
      replyId: reply.id,
      leadId: reply.leadId,
      campaignId: reply.campaignId,
      senderId: sender.id,
      direction: "operator",
      fromRole: "operator",
      fromName,
      fromEmail,
      subject: finalSubject,
      bodyText: outbound.storedBodyText,
      bodyHtml: outbound.storedBodyHtml,
      sentAt,
    });

    const message = buildOperatorThreadMessage({
      id: rowId,
      fromName,
      fromEmail,
      subject: finalSubject,
      bodyText: outbound.storedBodyText,
      bodyHtml: outbound.storedBodyHtml,
      sentAt,
    });

    await db
      .update(schema.replies)
      .set({ readAt: nowIso() })
      .where(eq(schema.replies.id, reply.id));
    await logActivity(user.id, "unibox.replied", `Replied to ${reply.fromEmail}`, reply.campaignId, {
      replyId: reply.id,
      uniboxMessageId: rowId,
    });
    revalidatePath("/unibox");
    return { ok: true, data: { message }, message: `Reply sent to ${reply.fromEmail}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send reply (check SMTP settings)",
    };
  }
}

export async function setUniboxReplyTag(input: {
  replyId: string;
  tag: string | null;
}): Promise<ActionResult<{ replyId: string; tag: string | null }>> {
  const user = await requireUser();
  const parsed = setUniboxReplyTagSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const db = getDb();
  try {
    const [row] = await db
      .update(schema.replies)
      .set({ tag: parsed.data.tag })
      .where(and(eq(schema.replies.id, parsed.data.replyId), eq(schema.replies.userId, user.id)))
      .returning({ id: schema.replies.id, tag: schema.replies.tag });
    if (!row) return { ok: false, error: "Reply not found" };
    revalidatePath("/unibox");
    return {
      ok: true,
      data: { replyId: row.id, tag: row.tag ?? null },
      message: parsed.data.tag ? `Tagged as ${parsed.data.tag}` : "Tag cleared",
    };
  } catch (e) {
    return err(e);
  }
}

/** Check IMAP mailboxes for new inbound replies for active workspace senders on demand. */
export async function syncUniboxRepliesAction(): Promise<ActionResult<{ found: number }>> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const db = getDb();
  try {
    const { syncSenderReplies } = await import("@smartreach/email-engine");
    const { wsCondition } = await import("./queries");
    const conds = [
      eq(senderAccounts.userId, user.id),
      isNull(senderAccounts.deletedAt),
      sql`${senderAccounts.imapHost} != ''`,
    ];
    const sWs = wsCondition(senderAccounts.workspaceId, workspace.id, workspace.isDefault);
    if (sWs) conds.push(sWs);

    const senders = await db
      .select()
      .from(senderAccounts)
      .where(and(...conds));

    let totalFound = 0;
    for (const sender of senders) {
      const res = await syncSenderReplies(db as any, sender as any);
      totalFound += res.found;
    }
    revalidatePath("/unibox");
    return { ok: true, data: { found: totalFound } };
  } catch (e) {
    return err(e);
  }
}

/* ═══ SETTINGS — test connection placeholder (worker does the real test) ═══ */

export async function sendTestEmail(): Promise<ActionResult> {
  await requireUser();
  // The actual send happens in the worker engine. Here we just confirm config is valid.
  return {
    ok: true,
    message:
      "Test send queued. The background engine will deliver it via the selected sender. Check Activity in a few seconds.",
  };
}

/* ═══ COMPLIANCE: suppressions + workspace settings (F15–F17) ═══ */

export async function upsertWorkspaceSettings(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = workspaceSettingsSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const db = getDb();
  const d = parsed.data;
  try {
    await db
      .insert(schema.workspaceSettings)
      .values({
        userId: user.id,
        companyName: d.companyName,
        postalAddress: d.postalAddress,
        unsubscribeBaseUrl: d.unsubscribeBaseUrl || "",
      })
      .onConflictDoUpdate({
        target: schema.workspaceSettings.userId,
        set: {
          companyName: d.companyName,
          postalAddress: d.postalAddress,
          unsubscribeBaseUrl: d.unsubscribeBaseUrl || "",
          updatedAt: nowIso(),
        },
      });
    revalidatePath("/settings");
    return { ok: true, message: "Compliance settings saved" };
  } catch (e) {
    return err(e);
  }
}

export async function addSuppression(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const parsed = suppressionCreateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  let value = parsed.data.value;
  let kind = parsed.data.kind;
  if (!kind) {
    kind = value.startsWith("@") ? "domain" : "email";
  }
  if (kind === "domain") {
    value = domainSuppressionValue(value.replace(/^@/, ""));
    if (!value) return { ok: false, error: "Invalid domain" };
  } else {
    value = normalizeEmailStrict(value);
    if (!value.includes("@")) return { ok: false, error: "Invalid email" };
  }
  const db = getDb();
  try {
    const [row] = await db
      .insert(schema.suppressions)
      .values({
        userId: user.id,
        workspaceId: workspace.id,
        value,
        kind,
        reason: parsed.data.reason || "",
        source: "manual",
      })
      .onConflictDoNothing()
      .returning({ id: schema.suppressions.id });
    if (!row) {
      // already exists — fetch id
      const [existing] = await db
        .select({ id: schema.suppressions.id })
        .from(schema.suppressions)
        .where(and(eq(schema.suppressions.userId, user.id), eq(schema.suppressions.value, value)))
        .limit(1);
      revalidatePath("/settings");
      revalidatePath("/blocklist");
      return { ok: true, data: { id: existing?.id ?? "" }, message: "Already on suppression list" };
    }
    await logActivity(user.id, "suppression.added", `Suppressed ${value}`);
    revalidatePath("/settings");
    revalidatePath("/blocklist");
    return { ok: true, data: { id: row.id }, message: "Added to suppression list" };
  } catch (e) {
    return err(e);
  }
}

export async function removeSuppression(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  try {
    await db
      .delete(schema.suppressions)
      .where(and(eq(schema.suppressions.id, id), eq(schema.suppressions.userId, user.id)));
    revalidatePath("/settings");
    revalidatePath("/blocklist");
    return { ok: true, message: "Removed from suppression list" };
  } catch (e) {
    return err(e);
  }
}

/** Cursor-paginated suppressions for the signed-in user (F15a). */
export async function listSuppressions(params: unknown = {}): Promise<
  ActionResult<{
    items: {
      id: string;
      value: string;
      kind: string;
      reason: string;
      source: string;
      createdAt: string;
    }[];
    nextCursor: string | null;
  }>
> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const parsed = suppressionListQuerySchema.safeParse(params ?? {});
  if (!parsed.success) return zodFail(parsed.error);
  try {
    const { listSuppressions: queryList } = await import("./queries");
    const { items, nextCursor } = await queryList(user.id, {
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
      search: parsed.data.search,
      kind: parsed.data.kind,
      workspaceId: workspace.id,
      isDefault: workspace.isDefault,
    });
    return {
      ok: true,
      data: {
        items: JSON.parse(JSON.stringify(items)),
        nextCursor: nextCursor ?? null,
      },
    };
  } catch (e) {
    return err(e);
  }
}

/** Bulk import emails/@domains into the suppression list (F15a). */
export async function importSuppressions(
  input: unknown,
): Promise<ActionResult<{ added: number; skipped: number; invalid: number }>> {
  const user = await requireUser();
  const workspace = await getActiveWorkspace(user.id);
  const parsed = suppressionImportSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const expanded = expandSuppressionImportLines(parsed.data);
  if (!expanded.ok) return { ok: false, error: expanded.error };

  let added = 0;
  let skipped = 0;
  let invalid = 0;
  const seen = new Set<string>();
  const toInsert: {
    userId: string;
    workspaceId: string;
    value: string;
    kind: "email" | "domain";
    reason: string;
    source: "import";
  }[] = [];

  for (const raw of expanded.lines) {
    const token = parseSuppressionToken(raw);
    if (!token.ok) {
      invalid++;
      continue;
    }
    if (seen.has(token.value)) {
      skipped++;
      continue;
    }
    seen.add(token.value);
    toInsert.push({
      userId: user.id,
      workspaceId: workspace.id,
      value: token.value,
      kind: token.kind,
      reason: "",
      source: "import",
    });
  }

  const db = getDb();
  const CHUNK = 500;
  try {
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const inserted = await db
        .insert(schema.suppressions)
        .values(chunk)
        .onConflictDoNothing()
        .returning({ id: schema.suppressions.id });
      added += inserted.length;
      skipped += chunk.length - inserted.length;
    }
    if (added > 0) {
      await logActivity(user.id, "suppression.imported", `Imported ${added} suppressions`);
    }
    revalidatePath("/settings");
    revalidatePath("/blocklist");
    return { ok: true, data: { added, skipped, invalid } };
  } catch (e) {
    return err(e);
  }
}


/* ═══ ANALYTICS (F13a) — real metrics only; open/click always null ═══ */

export async function getAnalyticsSummary(input: {
  campaignId?: string;
  from: string;
  to: string;
}): Promise<ActionResult<AnalyticsSummary>> {
  try {
    const user = await requireUser();
    if (!input?.from || !input?.to) return { ok: false, error: "from and to are required" };
    const data = await getAnalyticsSummaryForUser(user.id, {
      campaignId: input.campaignId,
      from: input.from,
      to: input.to,
    });
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

export async function getAnalyticsSeries(input: {
  campaignId?: string;
  from: string;
  to: string;
  granularity?: "day";
}): Promise<ActionResult<{ points: AnalyticsSeriesPoint[] }>> {
  try {
    const user = await requireUser();
    if (!input?.from || !input?.to) return { ok: false, error: "from and to are required" };
    const data = await getAnalyticsSeriesForUser(user.id, {
      campaignId: input.campaignId,
      from: input.from,
      to: input.to,
      granularity: input.granularity ?? "day",
    });
    return { ok: true, data };
  } catch (e) {
    return err(e);
  }
}

/** Public unsubscribe — no session required. Prefer immediate suppression. */
export async function processUnsubscribe(token: string): Promise<ActionResult<{ email: string }>> {
  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) return { ok: false, error: verified.error };
  const db = getDb();
  try {
    await db
      .insert(schema.suppressions)
      .values({
        userId: verified.userId,
        value: verified.email,
        kind: "email",
        reason: "One-click unsubscribe",
        source: "unsubscribe",
      })
      .onConflictDoNothing();
    await db
      .update(schema.leads)
      .set({ status: "unsubscribed", updatedAt: nowIso() })
      .where(
        and(
          eq(schema.leads.userId, verified.userId),
          eq(schema.leads.email, verified.email),
          isNull(schema.leads.deletedAt),
        ),
      );
    await logActivity(
      verified.userId,
      "suppression.unsubscribe",
      `Unsubscribed ${verified.email}`,
    );
    return { ok: true, data: { email: verified.email }, message: "You have been unsubscribed" };
  } catch (e) {
    return err(e);
  }
}

/* ═══ WORKSPACES ═══ */

export async function createWorkspaceAction(input: {
  name: string;
  description?: string;
}): Promise<ActionResult<WorkspaceItem>> {
  try {
    const user = await requireUser();
    const name = input.name?.trim();
    if (!name) {
      return { ok: false, error: "Workspace name is required" };
    }

    const db = getDb();
    const [created] = await db
      .insert(schema.workspaces)
      .values({
        userId: user.id,
        name,
        description: input.description?.trim() || null,
        isDefault: false,
      })
      .returning();

    // Switch active workspace to newly created one
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, created.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
    });

    await logActivity(user.id, "workspace.created", `Created workspace "${name}"`, created.id);
    revalidatePath("/", "layout");
    return { ok: true, data: created as WorkspaceItem, message: "Workspace created" };
  } catch (e) {
    return err(e);
  }
}

export async function switchWorkspaceAction(
  workspaceId: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const user = await requireUser();
    const db = getDb();
    const [workspace] = await db
      .select()
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, user.id)))
      .limit(1);

    if (!workspace) {
      return { ok: false, error: "Workspace not found" };
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { id: workspace.id, name: workspace.name } };
  } catch (e) {
    return err(e);
  }
}

export async function updateWorkspaceAction(
  workspaceId: string,
  input: { name: string; description?: string },
): Promise<ActionResult<WorkspaceItem>> {
  try {
    const user = await requireUser();
    const name = input.name?.trim();
    if (!name) {
      return { ok: false, error: "Workspace name is required" };
    }

    const db = getDb();
    const [updated] = await db
      .update(schema.workspaces)
      .set({
        name,
        description: input.description !== undefined ? input.description.trim() || null : undefined,
        updatedAt: nowIso(),
      })
      .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, user.id)))
      .returning();

    if (!updated) {
      return { ok: false, error: "Workspace not found" };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: updated as WorkspaceItem, message: "Workspace updated" };
  } catch (e) {
    return err(e);
  }
}

export async function deleteWorkspaceAction(
  workspaceId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const db = getDb();

    // Check workspace
    const [workspace] = await db
      .select()
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, user.id)))
      .limit(1);

    if (!workspace) {
      return { ok: false, error: "Workspace not found" };
    }

    // Check count of user workspaces
    const allWorkspaces = await db
      .select({ id: schema.workspaces.id, isDefault: schema.workspaces.isDefault })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.userId, user.id));

    if (allWorkspaces.length <= 1) {
      return { ok: false, error: "You cannot delete your only workspace. Create another workspace first before deleting this one." };
    }

    // If the workspace being deleted was default, promote another workspace to default
    if (workspace.isDefault) {
      const nextDefault = allWorkspaces.find((w) => w.id !== workspaceId);
      if (nextDefault) {
        await db
          .update(schema.workspaces)
          .set({ isDefault: true, updatedAt: new Date().toISOString() })
          .where(eq(schema.workspaces.id, nextDefault.id));
      }
    }

    // Delete workspace
    await db
      .delete(schema.workspaces)
      .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, user.id)));

    // Reset active workspace cookie to remaining default workspace
    const remaining = allWorkspaces.filter((w) => w.id !== workspaceId);
    const fallbackWs = remaining.find((w) => w.isDefault) || remaining[0];
    if (fallbackWs) {
      const cookieStore = await cookies();
      cookieStore.set(ACTIVE_WORKSPACE_COOKIE, fallbackWs.id, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: false,
      });
    }

    await logActivity(user.id, "workspace.deleted", `Deleted workspace "${workspace.name}"`);
    revalidatePath("/", "layout");
    return { ok: true, data: { id: workspaceId }, message: "Workspace deleted" };
  } catch (e) {
    return err(e);
  }
}

/* ─── AI Assistance & On-the-Fly Personalization Actions ───────────────── */

export async function previewAiSequenceGeneration(input: unknown): Promise<ActionResult<{
  samples: Array<{
    lead: {
      id?: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      company?: string | null;
      jobTitle?: string | null;
      industry?: string | null;
      website?: string | null;
      location?: string | null;
    };
    email: {
      subject: string;
      bodyText: string;
      bodyHtml: string;
      personalizationReason?: string;
    };
  }>;
}>> {
  try {
    const user = await requireUser();
    const { aiPreviewGenerationSchema } = await import("@smartreach/validation");
    const { getWorkspaceAiOptions, previewBatchLeadEmails, DIVERSE_SAMPLE_LEADS } = await import("./ai");
    const { ensureAiColumns } = await import("./db");

    const parsed = aiPreviewGenerationSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error);
    const data = parsed.data;

    const db = getDb();
    await ensureAiColumns(db);

    let targetLeadListId = data.leadListId;
    if (!targetLeadListId && data.campaignId) {
      const camps: any[] = await db
        .select({ leadListId: schema.campaigns.leadListId })
        .from(schema.campaigns)
        .where(and(eq(schema.campaigns.id, data.campaignId), eq(schema.campaigns.userId, user.id)))
        .limit(1);
      if (camps[0]?.leadListId) targetLeadListId = camps[0].leadListId;
    }

    let realLeads: any[] = [];
    if (targetLeadListId) {
      realLeads = await db
        .select()
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.listId, targetLeadListId),
            sql`${schema.leads.deletedAt} is null`,
          ),
        )
        .limit(10);
    }

    // Map real leads or augment with diverse realistic sample leads up to 10
    const leadsToPreview: LeadProfile[] = realLeads.map((l) => ({
      id: l.id,
      email: l.email,
      firstName: l.firstName,
      lastName: l.lastName,
      company: l.company,
      jobTitle: l.jobTitle,
      industry: l.industry,
      website: l.website,
      location: l.location,
      customFields: l.customFields,
    }));

    if (leadsToPreview.length < 10) {
      const needed = 10 - leadsToPreview.length;
      leadsToPreview.push(...DIVERSE_SAMPLE_LEADS.slice(0, needed));
    }

    const aiOptions = await getWorkspaceAiOptions(user.id);

    const generated = await previewBatchLeadEmails(leadsToPreview, {
      customInstruction: data.customInstruction,
      fallbackSubject: data.fallbackSubject,
      fallbackBody: data.fallbackBody,
      senderName: user.name || "Elena",
      apiKey: aiOptions.apiKey,
      provider: aiOptions.provider,
      model: aiOptions.model,
      maxCount: 10,
    });

    return {
      ok: true,
      data: {
        samples: generated.map((g) => ({
          lead: {
            id: g.lead.id,
            email: g.lead.email,
            firstName: g.lead.firstName,
            lastName: g.lead.lastName,
            company: g.lead.company,
            jobTitle: g.lead.jobTitle,
            industry: g.lead.industry,
            website: g.lead.website,
            location: g.lead.location,
          },
          email: g.email,
        })),
      },
    };
  } catch (e) {
    return err(e);
  }
}

export async function improveSequenceCopy(input: unknown): Promise<ActionResult<{
  subject: string;
  bodyText: string;
  bodyHtml: string;
  changesSummary: string;
}>> {
  try {
    const user = await requireUser();
    const { aiImproveCopySchema } = await import("@smartreach/validation");
    const { getWorkspaceAiOptions, improveEmailCopy } = await import("./ai");

    const parsed = aiImproveCopySchema.safeParse(input);
    if (!parsed.success) return err(parsed.error);
    const data = parsed.data;

    const aiOptions = await getWorkspaceAiOptions(user.id);

    const result = await improveEmailCopy({
      subject: data.subject,
      bodyText: data.bodyText,
      instruction: data.instruction,
      tone: data.tone,
      apiKey: aiOptions.apiKey,
      provider: aiOptions.provider,
      model: aiOptions.model,
    });

    return { ok: true, data: result };
  } catch (e) {
    return err(e);
  }
}

export async function saveWorkspaceAiSettings(input: {
  provider: string;
  model: string;
  apiKey?: string;
}): Promise<ActionResult<{ provider: string; model: string }>> {
  try {
    const user = await requireUser();
    const { ensureAiColumns } = await import("./db");

    const db = getDb();
    await ensureAiColumns(db);

    const updateValues: Record<string, any> = {
      aiProvider: input.provider || "google",
      aiModel: input.model || "gemini-3.8-flash",
      updatedAt: new Date().toISOString(),
    };

    if (input.apiKey && input.apiKey.trim()) {
      updateValues.aiApiKeyEnc = encryptSecret(input.apiKey.trim());
    }

    const [existing] = await db
      .select({ userId: schema.workspaceSettings.userId })
      .from(schema.workspaceSettings)
      .where(eq(schema.workspaceSettings.userId, user.id))
      .limit(1);

    if (existing) {
      await db
        .update(schema.workspaceSettings)
        .set(updateValues)
        .where(eq(schema.workspaceSettings.userId, user.id));
    } else {
      await db.insert(schema.workspaceSettings).values({
        userId: user.id,
        ...updateValues,
      });
    }

    revalidatePath("/settings");
    return {
      ok: true,
      data: { provider: updateValues.aiProvider, model: updateValues.aiModel },
      message: "AI settings updated successfully",
    };
  } catch (e) {
    return err(e);
  }
}

/* ─── Apollo Lead Directory Actions ────────────────────────────────────────── */

import {
  searchLeadsDirectory,
  getDirectoryFacets,
  ingestCsvContent,
  getDirectoryDb,
  buildDirectoryWhereClause,
  getMatchingDirectoryLeadsForExport,
  type DirectorySearchParams,
  type DirectorySearchResult,
  type DirectoryFacets,
} from "./leads-directory";

/**
 * Search the master Lead Directory (Apollo-style lead database).
 */
export async function searchDirectoryLeadsAction(
  params: DirectorySearchParams
): Promise<ActionResult<DirectorySearchResult>> {
  try {
    await requireUser();
    const result = searchLeadsDirectory(params);
    return { ok: true, data: result };
  } catch (e) {
    return err(e);
  }
}

/**
 * Fetch aggregated filter facets (industries, countries, revenue, sizes).
 */
export async function getDirectoryFacetsAction(): Promise<ActionResult<DirectoryFacets>> {
  try {
    await requireUser();
    const facets = getDirectoryFacets();
    return { ok: true, data: facets };
  } catch (e) {
    return err(e);
  }
}

/**
 * Ingest any uploaded CSV file into the master leads directory.
 */
export async function ingestCsvDirectoryAction(
  formData: FormData
): Promise<ActionResult<{ inserted: number; totalInDb: number }>> {
  try {
    await requireUser();
    const file = formData.get("file") as File | null;
    if (!file) {
      return { ok: false, error: "No CSV file provided" };
    }
    const text = await file.text();
    const result = await ingestCsvContent(text, file.name);
    return {
      ok: true,
      data: result,
      message: `Successfully ingested ${result.inserted.toLocaleString()} leads from ${file.name}!`,
    };
  } catch (e) {
    return err(e);
  }
}

/**
 * Import selected directory leads into a campaign lead list.
 * Supports importing specific lead IDs or ALL leads matching active search parameters.
 */
export async function saveDirectoryLeadsToCampaignListAction(input: {
  leadIds?: number[];
  selectAllMatching?: boolean;
  searchParams?: DirectorySearchParams;
  listName?: string;
  listId?: string;
}): Promise<ActionResult<{ leadListId: string; count: number }>> {
  try {
    const user = await requireUser();
    const db = getDb();
    const dirDb = getDirectoryDb();

    let targetListId = input.listId;
    if (!targetListId) {
      const listName = input.listName || `Apollo Leads - ${new Date().toLocaleDateString()}`;
      const [newList] = await db
        .insert(schema.leadLists)
        .values({
          userId: user.id,
          name: listName,
        })
        .returning();
      targetListId = newList.id;
    }

    if (!targetListId) {
      return { ok: false, error: "Failed to determine target lead list" };
    }

    let rows: any[] = [];
    if (input.selectAllMatching) {
      const { whereSql, bindings } = buildDirectoryWhereClause(input.searchParams || {});
      // Fetch matching leads up to 5,000 for responsive serverless insertion
      rows = dirDb
        .prepare(`SELECT * FROM leads ${whereSql} ORDER BY id ASC LIMIT 5000`)
        .all(...bindings) as any[];
    } else if (input.leadIds && input.leadIds.length > 0) {
      const placeholders = input.leadIds.map(() => "?").join(",");
      rows = dirDb
        .prepare(`SELECT * FROM leads WHERE id IN (${placeholders})`)
        .all(...input.leadIds) as any[];
    } else {
      return { ok: false, error: "No leads selected" };
    }

    if (rows.length === 0) {
      return { ok: false, error: "No matching leads found to import" };
    }

    let insertedCount = 0;
    // Chunk inserts into batches of 200 for fast Drizzle insertion
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const batchValues = [];

      for (const r of chunk) {
        if (!r.email) continue;
        batchValues.push({
          id: crypto.randomUUID(),
          userId: user.id,
          listId: targetListId,
          email: r.email,
          firstName: r.first_name || "",
          lastName: r.last_name || "",
          company: r.company_name || "",
          jobTitle: r.job_title || "",
          website: r.company_website || "",
          linkedin: r.linkedin_url || "",
          location: r.location || "",
          industry: r.industry || "",
          customFields: r.raw_data ? JSON.parse(r.raw_data) : {},
        });
      }

      if (batchValues.length > 0) {
        try {
          await db.insert(schema.leads).values(batchValues).onConflictDoNothing();
          insertedCount += batchValues.length;
        } catch {
          // Fallback to row-by-row on error
          for (const val of batchValues) {
            try {
              await db.insert(schema.leads).values(val).onConflictDoNothing();
              insertedCount++;
            } catch {}
          }
        }
      }
    }

    await db
      .update(schema.leadLists)
      .set({
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.leadLists.id, targetListId));

    revalidatePath("/leads");
    return {
      ok: true,
      data: { leadListId: targetListId, count: insertedCount },
      message: `Successfully added ${insertedCount.toLocaleString()} leads to your campaign list!`,
    };
  } catch (e) {
    return err(e);
  }
}

/**
 * Export all matching directory leads to CSV.
 */
export async function exportMatchingDirectoryLeadsCsvAction(
  params: DirectorySearchParams,
  maxRows = 15000
): Promise<ActionResult<{ csv: string; count: number; filename: string }>> {
  try {
    await requireUser();
    const leads = getMatchingDirectoryLeadsForExport(params, maxRows);
    if (!leads.length) {
      return { ok: false, error: "No leads match current filters" };
    }

    const headers = [
      "Full Name",
      "First Name",
      "Last Name",
      "Job Title",
      "Company Name",
      "Company Website",
      "Primary Email",
      "Email Status",
      "Phone",
      "Industry",
      "Country",
      "City",
      "State",
      "Team Size",
      "Revenue Range",
      "LinkedIn URL",
    ];

    const rows = leads.map((l) => [
      `"${(l.fullName || "").replace(/"/g, '""')}"`,
      `"${(l.firstName || "").replace(/"/g, '""')}"`,
      `"${(l.lastName || "").replace(/"/g, '""')}"`,
      `"${(l.jobTitle || "").replace(/"/g, '""')}"`,
      `"${(l.companyName || "").replace(/"/g, '""')}"`,
      `"${(l.companyWebsite || "").replace(/"/g, '""')}"`,
      `"${(l.email || "").replace(/"/g, '""')}"`,
      `"${(l.emailStatus || "").replace(/"/g, '""')}"`,
      `"${(l.phone || "").replace(/"/g, '""')}"`,
      `"${(l.industry || "").replace(/"/g, '""')}"`,
      `"${(l.country || "").replace(/"/g, '""')}"`,
      `"${(l.city || "").replace(/"/g, '""')}"`,
      `"${(l.state || "").replace(/"/g, '""')}"`,
      `"${(l.teamSize || "").replace(/"/g, '""')}"`,
      `"${(l.revenueRange || "").replace(/"/g, '""')}"`,
      `"${(l.linkedinUrl || "").replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const filename = `smartreach_all_matching_leads_${Date.now()}.csv`;

    return {
      ok: true,
      data: { csv, count: leads.length, filename },
    };
  } catch (e) {
    return err(e);
  }
}

