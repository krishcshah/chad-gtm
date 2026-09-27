/**
 * Campaign draft / publish persistence (F09a).
 * Pure of Next.js session/revalidate so unit tests can inject a db.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import {
  campaignDraftSchema,
  campaignPublishSchema,
  type CampaignDraftInput,
  type CampaignPublishInput,
} from "@smartreach/validation";
import { nowIso } from "@smartreach/shared";
import { formatZodActionError } from "./zod-action-error";

const { campaigns, campaignSenders, campaignLeads, leads } = schema;

export type DraftActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function zodFail(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): DraftActionResult<never> {
  const { error: message, fieldErrors } = formatZodActionError(error.issues);
  return { ok: false, error: message, fieldErrors };
}

type Db = {
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
  select: (...args: any[]) => any;
};

const CAMPAIGN_FIELD_KEYS = [
  "name",
  "leadListId",
  "templateId",
  "scheduledAt",
  "businessDaysOnly",
  "sendingTimezone",
  "sendingWindowStart",
  "sendingWindowEnd",
  "dailyLimit",
  "minDelaySec",
  "maxDelaySec",
  "maxEmailsPerSenderPerDay",
  "stopOnReply",
  "retryFailed",
  "retryCount",
  "trackOpens",
  "wizardStep",
] as const;

function rawKeySet(input: unknown): Set<string> {
  if (!input || typeof input !== "object") return new Set();
  return new Set(Object.keys(input as Record<string, unknown>));
}

/** Snapshot sendable list leads into campaign_leads if none exist yet. */
export async function ensureCampaignLeadSnapshot(
  db: Db,
  campaignId: string,
  leadListId: string,
): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(campaignLeads)
    .where(eq(campaignLeads.campaignId, campaignId));
  if (Number(n) > 0) return Number(n);

  const listLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.listId, leadListId),
        sql`${leads.deletedAt} is null`,
        inArray(leads.status, ["new", "contacted"]),
      ),
    );
  if (!listLeads.length) return 0;
  const CHUNK = 500;
  for (let i = 0; i < listLeads.length; i += CHUNK) {
    await db
      .insert(campaignLeads)
      .values(
        listLeads.slice(i, i + CHUNK).map((l: { id: string }) => ({
          campaignId,
          leadId: l.id,
          status: "queued" as const,
        })),
      )
      .onConflictDoNothing();
  }
  return listLeads.length;
}

async function replaceCampaignSenders(db: Db, campaignId: string, senderIds: string[]) {
  await db.delete(campaignSenders).where(eq(campaignSenders.campaignId, campaignId));
  if (senderIds.length) {
    await db
      .insert(campaignSenders)
      .values(senderIds.map((senderId) => ({ campaignId, senderId })));
  }
}

const NULLABLE_DRAFT_FIELDS = new Set([
  "leadListId",
  "templateId",
  "scheduledAt",
  "wizardStep",
]);

function draftPatchFromInput(
  d: CampaignDraftInput,
  keys: Set<string>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of CAMPAIGN_FIELD_KEYS) {
    if (!keys.has(key)) continue;
    if (key === "name") {
      patch.name = d.name ?? "Untitled campaign";
      continue;
    }
    const val = (d as Record<string, unknown>)[key];
    if (val === undefined) {
      if (NULLABLE_DRAFT_FIELDS.has(key)) patch[key] = null;
      continue;
    }
    patch[key] = val;
  }
  // startMode affects scheduledAt when provided
  if (keys.has("startMode")) {
    if (d.startMode === "now") patch.scheduledAt = null;
    else if (d.startMode === "later" && keys.has("scheduledAt")) {
      patch.scheduledAt = d.scheduledAt ?? null;
    }
  }
  return patch;
}

export async function saveCampaignDraftForUser(
  db: Db,
  userId: string,
  input: unknown,
  workspaceId?: string | null,
): Promise<DraftActionResult<{ id: string }>> {
  const parsed = campaignDraftSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;
  const keys = rawKeySet(input);

  try {
    if (d.id) {
      const [existing] = await db
        .select({ id: campaigns.id, status: campaigns.status })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, d.id),
            eq(campaigns.userId, userId),
            sql`${campaigns.deletedAt} is null`,
          ),
        );
      if (!existing) return { ok: false, error: "Campaign not found" };
      if (existing.status !== "draft") {
        return { ok: false, error: "Only draft campaigns can be saved as draft" };
      }

      const patch = draftPatchFromInput(d, keys);
      patch.updatedAt = nowIso();
      patch.status = "draft";
      if (workspaceId) {
        patch.workspaceId = workspaceId;
      }
      await db.update(campaigns).set(patch).where(eq(campaigns.id, d.id));

      if (keys.has("senderIds") && d.senderIds !== undefined) {
        await replaceCampaignSenders(db, d.id, d.senderIds);
      }

      return { ok: true, data: { id: d.id } };
    }

    const insertValues: Record<string, unknown> = {
      userId,
      workspaceId: workspaceId ?? null,
      name: d.name ?? "Untitled campaign",
      status: "draft",
      leadListId: d.leadListId ?? null,
      templateId: d.templateId ?? null,
      wizardStep: d.wizardStep ?? null,
      scheduledAt: d.startMode === "now" ? null : (d.scheduledAt ?? null),
      businessDaysOnly: d.businessDaysOnly ?? false,
    };
    if (d.sendingTimezone !== undefined) insertValues.sendingTimezone = d.sendingTimezone;
    if (d.sendingWindowStart !== undefined) insertValues.sendingWindowStart = d.sendingWindowStart;
    if (d.sendingWindowEnd !== undefined) insertValues.sendingWindowEnd = d.sendingWindowEnd;
    if (d.dailyLimit !== undefined) insertValues.dailyLimit = d.dailyLimit;
    if (d.minDelaySec !== undefined) insertValues.minDelaySec = d.minDelaySec;
    if (d.maxDelaySec !== undefined) insertValues.maxDelaySec = d.maxDelaySec;
    if (d.maxEmailsPerSenderPerDay !== undefined) {
      insertValues.maxEmailsPerSenderPerDay = d.maxEmailsPerSenderPerDay;
    }
    if (d.stopOnReply !== undefined) insertValues.stopOnReply = d.stopOnReply;
    if (d.retryFailed !== undefined) insertValues.retryFailed = d.retryFailed;
    if (d.retryCount !== undefined) insertValues.retryCount = d.retryCount;
    if (d.trackOpens !== undefined) insertValues.trackOpens = d.trackOpens;

    const [row] = await db
      .insert(campaigns)
      .values(insertValues)
      .returning({ id: campaigns.id });

    if (d.senderIds?.length) {
      await replaceCampaignSenders(db, row.id, d.senderIds);
    }

    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export async function publishCampaignForUser(
  db: Db,
  userId: string,
  input: unknown,
  _postalAddress?: string | null,
  workspaceId?: string | null,
): Promise<DraftActionResult<{ id: string }>> {
  const parsed = campaignPublishSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data as CampaignPublishInput;

  // Postal is optional — no start/publish gate.
  const status = d.startMode === "now" ? "running" : "scheduled";
  const scheduledAt = d.startMode === "later" ? d.scheduledAt : null;
  const startedAt = d.startMode === "now" ? nowIso() : null;

  const fieldValues = {
    name: d.name,
    leadListId: d.leadListId,
    templateId: d.templateId,
    status: status as "running" | "scheduled",
    scheduledAt,
    businessDaysOnly: d.businessDaysOnly,
    sendingTimezone: d.sendingTimezone,
    sendingWindowStart: d.sendingWindowStart,
    sendingWindowEnd: d.sendingWindowEnd,
    dailyLimit: d.dailyLimit,
    minDelaySec: d.minDelaySec,
    maxDelaySec: d.maxDelaySec,
    maxEmailsPerSenderPerDay: d.maxEmailsPerSenderPerDay,
    stopOnReply: d.stopOnReply,
    retryFailed: d.retryFailed,
    retryCount: d.retryCount,
    trackOpens: d.trackOpens,
    wizardStep: null as null,
    startedAt,
    updatedAt: nowIso(),
  };

  try {
    if (d.id) {
      const [existing] = await db
        .select({ id: campaigns.id, status: campaigns.status })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, d.id),
            eq(campaigns.userId, userId),
            sql`${campaigns.deletedAt} is null`,
          ),
        );
      if (!existing) return { ok: false, error: "Campaign not found" };
      if (existing.status !== "draft") {
        return { ok: false, error: "Only draft campaigns can be published" };
      }

      await db
        .update(campaigns)
        .set({
          ...fieldValues,
          ...(workspaceId ? { workspaceId } : {}),
        })
        .where(eq(campaigns.id, d.id));
      await replaceCampaignSenders(db, d.id, d.senderIds);
      const n = await ensureCampaignLeadSnapshot(db, d.id, d.leadListId);
      return {
        ok: true,
        data: { id: d.id },
        message: `Campaign published with ${n} leads`,
      };
    }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        userId,
        workspaceId: workspaceId ?? null,
        ...fieldValues,
      })
      .returning({ id: campaigns.id });

    await db
      .insert(campaignSenders)
      .values(d.senderIds.map((senderId) => ({ campaignId: campaign.id, senderId })));

    const listLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.listId, d.leadListId),
          sql`${leads.deletedAt} is null`,
          inArray(leads.status, ["new", "contacted"]),
        ),
      );

    if (listLeads.length) {
      const CHUNK = 500;
      for (let i = 0; i < listLeads.length; i += CHUNK) {
        await db
          .insert(campaignLeads)
          .values(
            listLeads.slice(i, i + CHUNK).map((l: { id: string }) => ({
              campaignId: campaign.id,
              leadId: l.id,
              status: "queued" as const,
            })),
          )
          .onConflictDoNothing();
      }
    }

    return {
      ok: true,
      data: { id: campaign.id },
      message: "Campaign created",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export type CampaignWizardState = {
  id: string;
  name: string;
  leadListId: string | null;
  templateId: string | null;
  senderIds: string[];
  wizardStep: number | null;
  scheduledAt: string | null;
  businessDaysOnly: boolean;
  sendingTimezone: string;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  dailyLimit: number;
  minDelaySec: number;
  maxDelaySec: number;
  maxEmailsPerSenderPerDay: number;
  stopOnReply: boolean;
  retryFailed: boolean;
  retryCount: number;
  trackOpens: boolean;
  startMode: "now" | "later";
};

export async function getCampaignWizardStateForUser(
  db: Db,
  userId: string,
  id: string,
): Promise<DraftActionResult<CampaignWizardState>> {
  try {
    const [c] = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, id),
          eq(campaigns.userId, userId),
          sql`${campaigns.deletedAt} is null`,
        ),
      );
    if (!c || c.status !== "draft") {
      return { ok: false, error: "Campaign not found" };
    }
    const senders = await db
      .select({ senderId: campaignSenders.senderId })
      .from(campaignSenders)
      .where(eq(campaignSenders.campaignId, id));

    return {
      ok: true,
      data: {
        id: c.id,
        name: c.name,
        leadListId: c.leadListId ?? null,
        templateId: c.templateId ?? null,
        senderIds: senders.map((s: { senderId: string }) => s.senderId),
        wizardStep: c.wizardStep ?? null,
        scheduledAt: c.scheduledAt ?? null,
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
        trackOpens: c.trackOpens ?? true,
        startMode: c.scheduledAt ? "later" : "now",
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}
