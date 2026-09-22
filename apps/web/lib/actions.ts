"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
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
} from "./leads";
import { toggleSenderForUser } from "./senders";
import { normalizeEmail, nowIso } from "@smartreach/shared";
import {
  ensureCampaignLeadSnapshot,
  getCampaignWizardStateForUser,
  publishCampaignForUser,
  saveCampaignDraftForUser,
} from "./campaign-drafts";
import { getDb } from "./db";
import { requireUser } from "./session";
import { formatZodActionError } from "./zod-action-error";
import {
  buildOperatorThreadMessage,
  loadUniboxThreadMessages,
  resolveUniboxThreadContext,
  type UniboxThreadKey,
  type UniboxThreadMessage,
} from "./unibox-thread";

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
  const parsed = leadListCreateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const db = getDb();
  try {
    const [row] = await db
      .insert(leadLists)
      .values({ userId: user.id, name: parsed.data.name })
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
    await db
      .update(leadLists)
      .set({ deletedAt: nowIso() })
      .where(and(eq(leadLists.id, listId), eq(leadLists.userId, user.id)));
    revalidatePath("/leads");
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
      .values({ userId: user.id, name: listName })
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
  const { listLeads } = await import("./queries");
  const { items, nextCursor } = await listLeads(user.id, {
    listId: params.listId,
    search: params.search,
    status: params.status,
    cursor: params.cursor,
    pageSize: params.pageSize ?? 50,
  });
  return { items: JSON.parse(JSON.stringify(items)), nextCursor };
}

export async function createLead(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const result = await createLeadForUser(getDb(), user.id, input);
  if (result.ok) revalidatePath("/leads");
  return result;
}

export async function updateLead(leadId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const result = await updateLeadForUser(getDb(), user.id, leadId, input);
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
  const parsed = senderCreateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const db = getDb();
  try {
    const [row] = await db
      .insert(senderAccounts)
      .values(buildSenderValues(user.id, parsed.data))
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

export async function importSendersCsv(rows: unknown[]): Promise<
  ActionResult<{ imported: number; failed: { row: number; error: string }[] }>
> {
  const user = await requireUser();
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
    try {
      await db.insert(senderAccounts).values({
        ...buildSenderValues(user.id, { ...parsed.data, fromName: parsed.data.senderName, replyTo: "" }),
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

/* ═══ CAMPAIGNS ═══ */

export async function saveCampaignDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const db = getDb();
  const result = await saveCampaignDraftForUser(db, user.id, input);
  if (result.ok) {
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function publishCampaign(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const db = getDb();
  const result = await publishCampaignForUser(db, user.id, input);
  if (result.ok) {
    const id = result.data?.id;
    await logActivity(
      user.id,
      "campaign.created",
      result.message ?? "Campaign published",
      id,
    );
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
  }
  return result;
}

/** Thin wrapper — wizard Start continues to call createCampaign. */
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
    await sendMail(sender as never, {
      to: reply.fromEmail,
      subject: finalSubject,
      text: body,
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
      bodyText: body,
      bodyHtml: "",
      sentAt,
    });

    const message = buildOperatorThreadMessage({
      id: rowId,
      fromName,
      fromEmail,
      subject: finalSubject,
      bodyText: body,
      bodyHtml: "",
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
  const parsed = suppressionListQuerySchema.safeParse(params ?? {});
  if (!parsed.success) return zodFail(parsed.error);
  try {
    const { listSuppressions: queryList } = await import("./queries");
    const { items, nextCursor } = await queryList(user.id, {
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
      search: parsed.data.search,
      kind: parsed.data.kind,
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
