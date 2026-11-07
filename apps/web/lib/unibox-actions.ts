"use server";

/**
 * Inbox list actions: read state (#87), "Load older" paging (#88) and
 * conversation tags (#86).
 * Every write is scoped to the signed-in user's own replies.
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@smartreach/database";
import { UNIBOX_REPLY_TAGS, type UniboxReplyTag } from "@smartreach/shared";
import { getDb } from "./db";
import { applyReplyTagEffects } from "./reply-tag-effects";
import { requireUser, requireWorkspace } from "./session";
import { INBOX_QUERY_MAX, INBOX_VIEWS, type InboxListView } from "./unibox-inbox";
import { loadInboxPage, type InboxPage } from "./unibox-query";
import type { ActionResult } from "./actions";

const MAX_READ_IDS = 500;

function cleanIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 200))];
  if (ids.length === 0 || ids.length > MAX_READ_IDS) return null;
  return ids;
}

/**
 * Mark a conversation read (every member reply) or unread (its newest reply only).
 * No revalidatePath: the client already shows the change, and a reload would make the list flicker.
 */
export async function markConversationReadAction(input: {
  replyIds: string[];
  read: boolean;
}): Promise<ActionResult<{ updated: number }>> {
  const user = await requireUser();
  const ids = cleanIds(input?.replyIds);
  if (!ids) return { ok: false, error: "Pick a conversation first" };
  const db = getDb();
  const t = schema.replies;
  try {
    if (input.read !== false) {
      const rows = await db
        .update(t)
        .set({ readAt: new Date().toISOString() })
        .where(and(inArray(t.id, ids), eq(t.userId, user.id), isNull(t.readAt)))
        .returning({ id: t.id });
      return { ok: true, data: { updated: rows.length } };
    }
    const [newest] = await db
      .select({ id: t.id })
      .from(t)
      .where(and(inArray(t.id, ids), eq(t.userId, user.id)))
      .orderBy(desc(t.receivedAt), desc(t.id))
      .limit(1);
    if (!newest) return { ok: false, error: "Conversation not found" };
    await db
      .update(t)
      .set({ readAt: null })
      .where(and(eq(t.id, newest.id), eq(t.userId, user.id)));
    return { ok: true, data: { updated: 1 }, message: "Marked as unread" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the conversation" };
  }
}

export interface InboxPageParams {
  view?: string;
  tag?: string | null;
  q?: string | null;
  campaignId?: string | null;
  cursor?: string | null;
}

/** Whitelist the list params that come from the URL or the client. */
export async function sanitizeInboxParams(raw: InboxPageParams | null | undefined): Promise<{
  view: InboxListView;
  tag: string | null;
  q: string;
  campaignId: string | null;
  cursor: string | null;
}> {
  const view = (INBOX_VIEWS as readonly string[]).includes(raw?.view ?? "") ? (raw!.view as InboxListView) : "all";
  const tag = raw?.tag && (UNIBOX_REPLY_TAGS as readonly string[]).includes(raw.tag) ? raw.tag : null;
  const q = typeof raw?.q === "string" ? raw.q.trim().slice(0, INBOX_QUERY_MAX) : "";
  const campaignId = typeof raw?.campaignId === "string" && raw.campaignId.length <= 200 ? raw.campaignId || null : null;
  const cursor = typeof raw?.cursor === "string" && raw.cursor.length <= 300 ? raw.cursor || null : null;
  return { view, tag, q, campaignId, cursor };
}

/** "Load older conversations": the next page after `cursor`, with full rows for those conversations. */
export async function loadInboxPageAction(raw: InboxPageParams): Promise<ActionResult<InboxPage>> {
  const { user, workspace } = await requireWorkspace();
  try {
    const params = await sanitizeInboxParams(raw);
    const page = await loadInboxPage(user.id, workspace, params);
    return { ok: true, data: JSON.parse(JSON.stringify(page)) as InboxPage };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load older conversations" };
  }
}

const setConversationTagSchema = z.object({
  replyIds: z.array(z.string().min(1).max(200)).min(1).max(MAX_READ_IDS),
  tag: z.enum(UNIBOX_REPLY_TAGS).nullable(),
  /** With 'not_interested': also stop every campaign and the agent for this person. */
  stopContacting: z.boolean().optional(),
});

/**
 * Tag a conversation by hand (#86). The tag goes on the conversation's newest
 * reply with tagSource 'human', so it wins over automatic tags on later
 * replies (those show as "Detected in the latest reply"). `tag: null` clears
 * it and keeps it cleared. Same effects as before: lead status, and "Not
 * interested" with stopContacting blocks the address and stops every campaign.
 */
export async function setConversationTagAction(input: {
  replyIds: string[];
  tag: UniboxReplyTag | null;
  stopContacting?: boolean;
}): Promise<ActionResult<{ replyId: string; tag: UniboxReplyTag | null; stopped: boolean }>> {
  const user = await requireUser();
  const parsed = setConversationTagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a conversation and a tag" };
  const ids = [...new Set(parsed.data.replyIds)];
  const tag = parsed.data.tag;
  const db = getDb();
  const t = schema.replies;
  try {
    const [newest] = await db
      .select({ id: t.id, leadId: t.leadId, fromEmail: t.fromEmail })
      .from(t)
      .where(and(inArray(t.id, ids), eq(t.userId, user.id)))
      .orderBy(desc(t.receivedAt), desc(t.id))
      .limit(1);
    if (!newest) return { ok: false, error: "Conversation not found" };
    await db
      .update(t)
      .set({ tag, tagSource: "human" })
      .where(and(eq(t.id, newest.id), eq(t.userId, user.id)));

    const [lead] = newest.leadId
      ? await db
          .select({ workspaceId: schema.leads.workspaceId })
          .from(schema.leads)
          .where(and(eq(schema.leads.id, newest.leadId), eq(schema.leads.userId, user.id)))
          .limit(1)
      : [];
    const effect = await applyReplyTagEffects(db, {
      ownerId: user.id,
      workspaceId: lead?.workspaceId ?? null,
      leadId: newest.leadId ?? null,
      fromEmail: newest.fromEmail,
      tag,
      stopContacting: parsed.data.stopContacting === true,
      nowIso: new Date().toISOString(),
    });
    if (effect.stopped) {
      await db
        .insert(schema.activityLogs)
        .values({
          userId: user.id,
          type: "unibox.stopped_contacting",
          message: `Stopped contacting ${newest.fromEmail}`,
          campaignId: null,
          meta: { replyId: newest.id },
        })
        .catch(() => {});
    }
    revalidatePath("/unibox");
    revalidatePath("/leads");
    revalidatePath("/blocklist");
    return {
      ok: true,
      data: { replyId: newest.id, tag, stopped: effect.stopped },
      ...(effect.stopped ? { message: `Tagged Not interested. No more emails will go to ${newest.fromEmail}.` } : {}),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not tag the conversation" };
  }
}
