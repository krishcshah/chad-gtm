/**
 * Server-side Inbox loading shared by the Inbox page, the sidebar badge and
 * Needs you, so all of them see the same conversations in the same
 * workspace scope.
 */
import { cache } from "react";
import { and, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { wsCondition } from "./queries";
import { conversationKey, loadConversationHandlers, type ConversationHandlerView } from "./lead-conversations-server";
import {
  INBOX_INDEX_CAP,
  awaitingContext,
  buildInbox,
  buildInboxConversations,
  createTtlMemo,
  inboxSignals,
  outboundKey,
  type InboxContext,
  type InboxConversationMeta,
  type InboxCounts,
  type InboxIndexRow,
  type InboxParams,
  type InboxRequestRef,
  type InboxSignals,
  type SerializedOutbound,
} from "./unibox-inbox";
import type { WorkspaceItem } from "./workspaces";

type AnyDb = any;

/** Inbox replies visible in this workspace (needs replies joined to campaigns and sender_accounts). */
export function inboxScopeConditions(userId: string, workspace: Pick<WorkspaceItem, "id" | "isDefault">): SQL[] {
  const t = schema;
  const conds: SQL[] = [eq(t.replies.userId, userId)];
  if (workspace.isDefault) {
    conds.push(
      sql`(${t.campaigns.workspaceId} = ${workspace.id} OR ${t.senderAccounts.workspaceId} = ${workspace.id} OR (${t.campaigns.workspaceId} IS NULL AND ${t.senderAccounts.workspaceId} IS NULL))`
    );
  } else {
    conds.push(
      sql`(${t.campaigns.workspaceId} = ${workspace.id} OR ${t.senderAccounts.workspaceId} = ${workspace.id})`
    );
  }
  return conds;
}

/** Newest send by you or the agent per lead and campaign (and per reply, for replies with no lead). */
export async function loadLastOutbound(db: AnyDb, userId: string): Promise<SerializedOutbound> {
  const t = schema.uniboxMessages;
  const [byLead, byReply]: [any[], any[]] = await Promise.all([
    db
      .select({ leadId: t.leadId, campaignId: t.campaignId, sentAt: sql<string>`max(${t.sentAt})` })
      .from(t)
      .where(and(eq(t.userId, userId), eq(t.direction, "operator"), isNotNull(t.leadId)))
      .groupBy(t.leadId, t.campaignId),
    db
      .select({ replyId: t.replyId, sentAt: sql<string>`max(${t.sentAt})` })
      .from(t)
      .where(and(eq(t.userId, userId), eq(t.direction, "operator"), isNull(t.leadId), isNotNull(t.replyId)))
      .groupBy(t.replyId),
  ]);
  const out: SerializedOutbound = { lastOutboundAt: {}, lastOutboundByReply: {} };
  for (const r of byLead) {
    if (r.leadId && r.sentAt) out.lastOutboundAt[outboundKey(r.leadId, r.campaignId)] = String(r.sentAt);
  }
  for (const r of byReply) {
    if (r.replyId && r.sentAt) out.lastOutboundByReply[r.replyId] = String(r.sentAt);
  }
  return out;
}

/**
 * Open Needs you cards ("open" and "sending"), in the workspace's scope when
 * one is given: the same rule as the Needs you page and the sidebar badge
 * (cards with no workspace count as the default workspace's).
 */
export async function loadOpenInboxRequests(
  db: AnyDb,
  userId: string,
  workspace?: Pick<WorkspaceItem, "id" | "isDefault"> | null,
): Promise<InboxRequestRef[]> {
  const t = schema.agentRequests;
  const scope = workspace ? wsCondition(t.workspaceId, workspace.id, workspace.isDefault) : undefined;
  return db
    .select({ id: t.id, replyId: t.replyId, leadId: t.leadId, campaignId: t.campaignId })
    .from(t)
    .where(and(eq(t.userId, userId), inArray(t.status, ["open", "sending"]), ...(scope ? [scope] : [])))
    .orderBy(desc(t.createdAt));
}

export interface InboxIndex {
  rows: InboxIndexRow[];
  ctx: InboxContext;
  /** Last sends, as loaded for `ctx` (the Inbox client reuses them). */
  outbound: SerializedOutbound;
}

/** The Inbox's newest replies (list columns only), open cards and last sends. Cached per request. */
export function loadInboxIndex(userId: string, workspace: Pick<WorkspaceItem, "id" | "isDefault">): Promise<InboxIndex> {
  return loadInboxIndexCached(userId, workspace.id, workspace.isDefault);
}

/** Counts for the sidebar and Needs you: conversations awaiting your reply, and held ones. Cached per request. */
export function loadInboxSignals(userId: string, workspace: Pick<WorkspaceItem, "id" | "isDefault">): Promise<InboxSignals> {
  return loadInboxSignalsCached(userId, workspace.id, workspace.isDefault);
}

/**
 * The layout renders on every full page load, refresh and revalidation, and
 * the full count reads up to INBOX_INDEX_CAP replies. The sidebar badge may
 * lag by up to this long; the Inbox and Needs you pages always count fresh
 * (and refresh this cache when they do).
 */
const BADGE_TTL_MS = 30_000;
const badgeMemo = createTtlMemo<InboxSignals>(BADGE_TTL_MS, 1000);

function badgeKey(userId: string, workspaceId: string, isDefault: boolean): string {
  return `${userId}\u0000${workspaceId}\u0000${isDefault ? 1 : 0}`;
}

/** Signals for the sidebar badge: a recent count when there is one, else a fresh count. */
export async function loadInboxBadgeSignals(
  userId: string,
  workspace: Pick<WorkspaceItem, "id" | "isDefault">,
): Promise<InboxSignals> {
  const recent = badgeMemo.get(badgeKey(userId, workspace.id, workspace.isDefault));
  if (recent) return recent;
  return loadInboxSignals(userId, workspace);
}

/** Drop the user's cached badge counts (call after a change that moves them, e.g. a reply sent). */
export function forgetInboxBadgeSignals(userId: string): void {
  badgeMemo.forget(`${userId}\u0000`);
}

// React's cache compares arguments by identity, so key on primitives.
const loadInboxIndexCached = cache(
  async (userId: string, workspaceId: string, isDefault: boolean): Promise<InboxIndex> => {
    const workspace = { id: workspaceId, isDefault };
    const db = getDb();
    const t = schema;
    const [rows, requests, outbound] = await Promise.all([
      db
        .select({
          id: t.replies.id,
          leadId: t.replies.leadId,
          campaignId: t.replies.campaignId,
          fromName: t.replies.fromName,
          fromEmail: t.replies.fromEmail,
          subject: t.replies.subject,
          snippet: t.replies.snippet,
          receivedAt: t.replies.receivedAt,
          readAt: t.replies.readAt,
          tag: t.replies.tag,
          tagSource: t.replies.tagSource,
          agentStatus: t.replies.agentStatus,
          agentIntent: t.replies.agentIntent,
          campaignName: t.campaigns.name,
        })
        .from(t.replies)
        .leftJoin(t.campaigns, eq(t.replies.campaignId, t.campaigns.id))
        .leftJoin(t.senderAccounts, eq(t.replies.senderId, t.senderAccounts.id))
        .where(and(...inboxScopeConditions(userId, workspace)))
        .orderBy(desc(t.replies.receivedAt))
        .limit(INBOX_INDEX_CAP),
      loadOpenInboxRequests(db, userId, workspace),
      loadLastOutbound(db, userId),
    ]);
    return { rows: rows as InboxIndexRow[], ctx: awaitingContext(outbound, requests), outbound };
  },
);

const loadInboxSignalsCached = cache(
  async (userId: string, workspaceId: string, isDefault: boolean): Promise<InboxSignals> => {
    const { rows, ctx } = await loadInboxIndexCached(userId, workspaceId, isDefault);
    const signals = inboxSignals(buildInboxConversations(rows, ctx));
    badgeMemo.set(badgeKey(userId, workspaceId, isDefault), signals);
    return signals;
  },
);

/* ─── Inbox list page (#88) ───────────────────────────────────────────── */

/** One reply with its bodies, as the Inbox shows it (matches the client's ReplyRow). */
export interface InboxPageRow {
  id: string;
  leadId: string | null;
  campaignId: string | null;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: string;
  readAt: string | null;
  tag: string | null;
  tagSource: string | null;
  agentStatus: string | null;
  agentIntent: string | null;
  agentSummary: string | null;
  messageId: string | null;
  campaignName: string | null;
  senderEmail: string | null;
  senderName: string | null;
  handledBy?: ConversationHandlerView["handledBy"];
  handlerReason?: ConversationHandlerView["reason"];
  canHandBack?: boolean;
}

export interface InboxPage {
  /** Every member reply of every conversation on this page. */
  rows: InboxPageRow[];
  conversations: InboxConversationMeta[];
  counts: InboxCounts;
  nextCursor: string | null;
  /** The index hit INBOX_INDEX_CAP: older replies are not listed. */
  capped: boolean;
  focusFound: boolean;
}

/** Full rows for these reply ids (the user's own only), with who handles each conversation. */
export async function loadInboxRows(userId: string, ids: readonly string[]): Promise<InboxPageRow[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const t = schema;
  const out: InboxPageRow[] = [];
  // Keep the IN list a sane size.
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const rows = await db
      .select({
        id: t.replies.id,
        leadId: t.replies.leadId,
        campaignId: t.replies.campaignId,
        fromName: t.replies.fromName,
        fromEmail: t.replies.fromEmail,
        subject: t.replies.subject,
        snippet: t.replies.snippet,
        bodyText: t.replies.bodyText,
        bodyHtml: t.replies.bodyHtml,
        receivedAt: t.replies.receivedAt,
        readAt: t.replies.readAt,
        tag: t.replies.tag,
        tagSource: t.replies.tagSource,
        agentStatus: t.replies.agentStatus,
        agentIntent: t.replies.agentIntent,
        agentSummary: t.replies.agentSummary,
        messageId: t.replies.messageId,
        campaignName: t.campaigns.name,
        senderEmail: t.senderAccounts.email,
        senderName: t.senderAccounts.senderName,
      })
      .from(t.replies)
      .leftJoin(t.campaigns, eq(t.replies.campaignId, t.campaigns.id))
      .leftJoin(t.senderAccounts, eq(t.replies.senderId, t.senderAccounts.id))
      .where(and(eq(t.replies.userId, userId), inArray(t.replies.id, chunk)));
    out.push(...(rows as InboxPageRow[]));
  }
  const handlers = await loadConversationHandlers(db, userId, out);
  return out.map((row) => {
    const view = handlers.get(conversationKey(row.leadId, row.campaignId));
    return view ? { ...row, handledBy: view.handledBy, handlerReason: view.reason, canHandBack: view.canHandBack } : row;
  });
}

/** One page of conversations: grouped, filtered and paged over the whole index, then full rows for that page. */
export async function loadInboxPage(
  userId: string,
  workspace: Pick<WorkspaceItem, "id" | "isDefault">,
  params: InboxParams,
): Promise<InboxPage> {
  const { rows: index, ctx } = await loadInboxIndex(userId, workspace);
  const result = buildInbox(index, ctx, params);
  // Same numbers as loadInboxSignals: keep the sidebar badge in step with this fresh count.
  badgeMemo.set(badgeKey(userId, workspace.id, workspace.isDefault), result.signals);
  const rows = await loadInboxRows(userId, result.pageReplyIds);
  return {
    rows,
    conversations: result.conversations,
    counts: result.counts,
    nextCursor: result.nextCursor,
    capped: index.length >= INBOX_INDEX_CAP,
    focusFound: result.focusFound,
  };
}
