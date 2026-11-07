/**
 * Inbox list on the server: group, filter, count and page conversations over
 * a light index of every reply in scope. Pure (no database), so the page, the
 * "Load older" action and the client's optimistic updates share one definition.
 *
 * Grouping is `groupUniboxConversations`, the same as everywhere else.
 * Filters apply to whole CONVERSATIONS, and a page always carries every member
 * reply id, so `latest` is the conversation's true newest message whatever the
 * tag filter (#89).
 */
import { conversationTagState, groupUniboxConversations, type UniboxReplyListItem } from "./unibox-conversations";

/** Newest replies loaded into the index. Older conversations are not listed. */
export const INBOX_INDEX_CAP = 10_000;
/** Conversations per page. */
export const INBOX_PAGE_SIZE = 50;
/** Longest search the page accepts. */
export const INBOX_QUERY_MAX = 200;

export const INBOX_VIEWS = ["all", "unread", "awaiting", "needs_you"] as const;
export type InboxListView = (typeof INBOX_VIEWS)[number];

/** One reply in the index: list columns only, no bodies. */
export interface InboxIndexRow extends UniboxReplyListItem {
  fromName: string;
  snippet: string;
  tagSource?: string | null;
  agentStatus?: string | null;
  agentIntent?: string | null;
  agentSummary?: string | null;
  campaignName?: string | null;
}

/** An open Needs you card, enough to match it to a conversation. */
export interface InboxRequestRef {
  id: string;
  replyId: string | null;
  leadId: string | null;
  campaignId: string | null;
}

export interface InboxContext {
  requests: readonly InboxRequestRef[];
  /** Newest reply sent to each lead (you or the agent), keyed by `outboundKey(leadId, campaignId)`. */
  lastOutboundAt?: ReadonlyMap<string, string>;
  /** For replies with no lead: newest send anchored to that reply id (unibox_messages.reply_id). */
  lastOutboundByReply?: ReadonlyMap<string, string>;
}

export interface InboxParams {
  view?: InboxListView;
  tag?: string | null;
  q?: string | null;
  campaignId?: string | null;
  /** `${latestReceivedAt}|${latestId}` of the last conversation already shown. */
  cursor?: string | null;
  /** Always include the conversation holding this reply (a link from Needs you). */
  focusReplyId?: string | null;
  pageSize?: number;
}

export interface InboxConversationMeta {
  key: string;
  threadKey: string;
  latestId: string;
  latestReceivedAt: string;
  /** Newest first. */
  memberIds: string[];
  unread: boolean;
  needsYou: boolean;
  requestId: string | null;
  /** A reply is held because the account is not approved. */
  held: boolean;
  /** The lead wrote last and nobody (agent or you) has answered or is answering. */
  awaiting: boolean;
  /** Effective conversation tag: a person's tag wins over an automatic one. */
  tag: string | null;
  tagSource: "human" | "auto" | null;
  /** A newer automatic tag that differs from the person's tag (a hint only). */
  detectedTag: string | null;
  /** Reply that owns `tag`, or the latest reply when untagged. */
  tagReplyId: string;
}

export interface InboxCounts {
  all: number;
  unread: number;
  awaiting: number;
  needs_you: number;
}

export interface InboxResult {
  conversations: InboxConversationMeta[];
  counts: InboxCounts;
  nextCursor: string | null;
  /** Every member id of every returned conversation. */
  pageReplyIds: string[];
  focusFound: boolean;
  /** Awaiting and held over every conversation, ignoring the tag and campaign filters (the sidebar's numbers). */
  signals: InboxSignals;
}

export function outboundKey(leadId: string | null | undefined, campaignId: string | null | undefined): string {
  return `${leadId ?? ""}\u0000${campaignId ?? ""}`;
}

/** The last sends as plain objects, to pass from the server to the client. */
export interface SerializedOutbound {
  /** Keyed by `outboundKey(leadId, campaignId)`. */
  lastOutboundAt: Record<string, string>;
  /** Keyed by reply id, for replies with no lead. */
  lastOutboundByReply: Record<string, string>;
}

export function outboundMaps(
  serialized: SerializedOutbound | null | undefined,
): Pick<InboxContext, "lastOutboundAt" | "lastOutboundByReply"> {
  return {
    lastOutboundAt: new Map(Object.entries(serialized?.lastOutboundAt ?? {})),
    lastOutboundByReply: new Map(Object.entries(serialized?.lastOutboundByReply ?? {})),
  };
}

function ms(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

type MemberLike = Pick<InboxIndexRow, "id" | "receivedAt"> & Partial<Pick<InboxIndexRow, "tag" | "tagSource">>;

function newestFirst<T extends Pick<InboxIndexRow, "id" | "receivedAt">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const delta = ms(b.receivedAt) - ms(a.receivedAt);
    if (delta !== 0) return delta;
    return b.id.localeCompare(a.id);
  });
}

/**
 * The conversation's tag. A tag a person set (tagSource 'human') wins over any
 * automatic tag; automatic tags fill in only when no person tagged it. NULL
 * source with a tag counts as automatic. A person clearing the tag (human row,
 * no tag) keeps it untagged. Same rule as groupUniboxConversations (#86).
 */
export function conversationTag(members: readonly MemberLike[]): {
  tag: string | null;
  tagSource: "human" | "auto" | null;
  detectedTag: string | null;
  tagReplyId: string | null;
} {
  return conversationTagState(newestFirst(members));
}

/** The open request for a conversation: one whose reply is in it, else one for the same lead and campaign. */
export function findConversationRequest<R extends InboxRequestRef>(
  memberIds: readonly string[],
  latest: { leadId?: string | null; campaignId?: string | null },
  requests: readonly R[],
): R | null {
  const members = new Set(memberIds);
  const byReply = requests.find((r) => r.replyId != null && members.has(r.replyId));
  if (byReply) return byReply;
  const { leadId, campaignId } = latest;
  if (!leadId || !campaignId) return null;
  return requests.find((r) => r.leadId === leadId && r.campaignId === campaignId) ?? null;
}

/**
 * Agent statuses where nobody is answering the lead: never given to the agent
 * (NULL), skipped (Manual campaign, taken over by you), or escalated/failed
 * with no open Needs you card (e.g. held for a paused campaign). Everything
 * else is answered, being answered (pending, processing) or held. A
 * conversation with an open card is Needs you, never awaiting.
 */
const UNANSWERED_STATUSES = new Set(["", "skipped", "escalated", "failed"]);

/** Agent statuses where the lead's message is still open (not answered, skipped or superseded). */
const UNRESOLVED_STATUSES = new Set(["pending", "processing", "escalated", "held", "failed"]);

/** Agent status of the newest member whose message is still open, or null. `sorted` is newest first. */
function latestUnresolvedStatus(sorted: ReadonlyArray<{ agentStatus?: string | null }>): string | null {
  return sorted.find((m) => UNRESOLVED_STATUSES.has(m.agentStatus ?? ""))?.agentStatus ?? null;
}
/** Tags that need no answer. */
const NO_ANSWER_TAGS = new Set(["out_of_office", "not_interested", "lost"]);
/** The newest reply's own tag or agent intent that needs no answer. */
const NO_ANSWER_LATEST_TAGS = new Set(["out_of_office", "not_interested"]);
const NO_ANSWER_INTENTS = new Set(["out_of_office", "not_interested", "unsubscribe"]);

type FlagMember = Pick<InboxIndexRow, "id" | "receivedAt" | "readAt"> &
  Partial<Pick<InboxIndexRow, "leadId" | "campaignId" | "tag" | "tagSource" | "agentStatus" | "agentIntent">>;

/**
 * "Awaiting your reply": the lead wrote last, nobody (you or the agent) has
 * answered since, and the agent is not on it. Conversations handled by "You"
 * stay countable. Needs you and held conversations are counted there instead.
 */
function isAwaiting(
  latest: FlagMember,
  memberIds: readonly string[],
  conversationTag: string | null,
  ctx: InboxContext,
): boolean {
  if (!UNANSWERED_STATUSES.has(latest.agentStatus ?? "")) return false;
  if (NO_ANSWER_TAGS.has(conversationTag ?? "")) return false;
  if (latest.tag && NO_ANSWER_LATEST_TAGS.has(latest.tag)) return false;
  if (latest.agentIntent && NO_ANSWER_INTENTS.has(latest.agentIntent)) return false;
  let out: string | undefined;
  if (latest.leadId) {
    out = ctx.lastOutboundAt?.get(outboundKey(latest.leadId, latest.campaignId));
  } else {
    // No lead: a send anchored to any reply of this conversation.
    for (const id of memberIds) {
      const at = ctx.lastOutboundByReply?.get(id);
      if (at && (!out || ms(at) > ms(out))) out = at;
    }
  }
  return !out || ms(out) < ms(latest.receivedAt);
}

/** Per-conversation flags from its member rows. Used by the server and by the client's optimistic updates. */
export function conversationFlags(
  members: readonly FlagMember[],
  ctx: InboxContext,
): Omit<InboxConversationMeta, "key" | "threadKey" | "latestId" | "latestReceivedAt" | "memberIds"> {
  const sorted = newestFirst(members);
  const latest = sorted[0];
  const memberIds = sorted.map((m) => m.id);
  const request = latest ? findConversationRequest(memberIds, latest, ctx.requests) : null;
  // "Needs you" has one definition everywhere (badge, Needs you page, this
  // folder): an open Needs you card for the conversation. An account on hold
  // is its own state, never Needs you.
  const needsYou = request !== null;
  const held = !needsYou && latestUnresolvedStatus(sorted) === "held";
  const tag = conversationTag(sorted);
  const awaiting = Boolean(latest && !needsYou && !held && isAwaiting(latest, memberIds, tag.tag, ctx));
  return {
    unread: sorted.some((m) => !m.readAt),
    needsYou,
    requestId: request?.id ?? null,
    held,
    awaiting,
    tag: tag.tag,
    tagSource: tag.tagSource,
    detectedTag: tag.detectedTag,
    tagReplyId: tag.tagReplyId ?? latest?.id ?? "",
  };
}

export function inboxCursor(meta: Pick<InboxConversationMeta, "latestReceivedAt" | "latestId">): string {
  return `${meta.latestReceivedAt}|${meta.latestId}`;
}

function parseCursor(cursor: string | null | undefined): { at: number; id: string } | null {
  if (!cursor) return null;
  const bar = cursor.lastIndexOf("|");
  if (bar <= 0) return null;
  const at = Date.parse(cursor.slice(0, bar));
  const id = cursor.slice(bar + 1);
  if (Number.isNaN(at) || !id) return null;
  return { at, id };
}

/** True when `meta` sorts strictly after (older than) the cursor. */
function isAfterCursor(meta: InboxConversationMeta, cursor: { at: number; id: string }): boolean {
  const at = ms(meta.latestReceivedAt);
  if (at !== cursor.at) return at < cursor.at;
  return meta.latestId.localeCompare(cursor.id) < 0;
}

function matchesQuery(members: readonly InboxIndexRow[], q: string): boolean {
  return members.some((m) =>
    [m.fromName, m.fromEmail, m.subject, m.snippet, m.campaignName].some(
      (v) => typeof v === "string" && v.toLowerCase().includes(q),
    ),
  );
}

/**
 * Group the index into conversations, filter, count and page.
 * Counts cover the campaign- and tag-filtered set (not the view or search).
 */
export function buildInbox(rows: readonly InboxIndexRow[], ctx: InboxContext, params: InboxParams = {}): InboxResult {
  const pageSize = Math.max(1, params.pageSize ?? INBOX_PAGE_SIZE);
  const q = (params.q ?? "").trim().toLowerCase();
  const view = params.view ?? "all";
  const byId = new Map(rows.map((r) => [r.id, r]));

  const all = groupUniboxConversations([...rows]).map((c) => {
    const members = c.memberIds.map((id) => byId.get(id)!).filter(Boolean);
    const meta: InboxConversationMeta = {
      key: c.key,
      threadKey: c.threadKey,
      latestId: c.latest.id,
      latestReceivedAt: c.latest.receivedAt,
      memberIds: c.memberIds,
      ...conversationFlags(members, ctx),
    };
    return { meta, members };
  });

  const scoped = all.filter(({ meta, members }) => {
    if (params.campaignId && !members.some((m) => m.campaignId === params.campaignId)) return false;
    if (params.tag && meta.tag !== params.tag) return false;
    return true;
  });

  const counts: InboxCounts = { all: scoped.length, unread: 0, awaiting: 0, needs_you: 0 };
  for (const { meta } of scoped) {
    if (meta.unread) counts.unread++;
    if (meta.awaiting) counts.awaiting++;
    if (meta.needsYou) counts.needs_you++;
  }

  const matching = scoped.filter(({ meta, members }) => {
    if (view === "unread" && !meta.unread) return false;
    if (view === "needs_you" && !meta.needsYou) return false;
    if (view === "awaiting" && !meta.awaiting) return false;
    if (q && !matchesQuery(members, q)) return false;
    return true;
  });

  const cursor = parseCursor(params.cursor);
  const after = cursor ? matching.filter(({ meta }) => isAfterCursor(meta, cursor)) : matching;
  const page = after.slice(0, pageSize).map(({ meta }) => meta);
  const last = page[page.length - 1];
  const nextCursor = after.length > pageSize && last ? inboxCursor(last) : null;

  let focusFound = false;
  if (params.focusReplyId) {
    const focus = all.find(({ meta }) => meta.memberIds.includes(params.focusReplyId!));
    if (focus) {
      focusFound = true;
      if (!page.some((m) => m.key === focus.meta.key)) {
        page.push(focus.meta);
        page.sort((a, b) => {
          const delta = ms(b.latestReceivedAt) - ms(a.latestReceivedAt);
          if (delta !== 0) return delta;
          return b.latestId.localeCompare(a.latestId);
        });
      }
    }
  }

  return {
    conversations: page,
    counts,
    nextCursor,
    pageReplyIds: page.flatMap((m) => m.memberIds),
    focusFound,
    signals: inboxSignals(all.map(({ meta }) => meta)),
  };
}

/* ─── Awaiting your reply (sidebar badge, Needs you, Inbox view) ───────── */

/** The InboxContext for a set of open requests and last sends. */
export function awaitingContext(
  outbound: SerializedOutbound | null | undefined,
  requests: readonly InboxRequestRef[] = [],
): InboxContext {
  return { requests, ...outboundMaps(outbound) };
}

/**
 * True when a conversation (its member rows) is "Awaiting your reply":
 * not Needs you, not held, the newest reply was never given to the agent or
 * was skipped by it, needs an answer, and nobody has sent anything since.
 */
export function isAwaitingReply(members: readonly FlagMember[], ctx: InboxContext): boolean {
  return members.length > 0 && conversationFlags(members, ctx).awaiting;
}

/** Every conversation's flags, without filtering or paging. */
export function buildInboxConversations(
  rows: readonly InboxIndexRow[],
  ctx: InboxContext,
): Array<Pick<InboxConversationMeta, "key" | "latestId" | "memberIds" | "unread" | "needsYou" | "held" | "awaiting" | "tag">> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return groupUniboxConversations([...rows]).map((c) => {
    const flags = conversationFlags(c.memberIds.map((id) => byId.get(id)!).filter(Boolean), ctx);
    return { key: c.key, latestId: c.latest.id, memberIds: c.memberIds, ...flags };
  });
}

export interface InboxSignals {
  /** Conversations awaiting your reply. */
  awaiting: number;
  /** Conversations with a held reply. */
  held: number;
}

export function inboxSignals(conversations: ReadonlyArray<{ awaiting: boolean; held: boolean }>): InboxSignals {
  let awaiting = 0;
  let held = 0;
  for (const c of conversations) {
    if (c.awaiting) awaiting++;
    if (c.held) held++;
  }
  return { awaiting, held };
}

/**
 * A small in-process cache with a time limit and a size limit, for values
 * that may be a few seconds old (the sidebar badge). `forget(prefix)` drops
 * every key that starts with `prefix`.
 */
export interface TtlMemo<V> {
  get(key: string, now?: number): V | undefined;
  set(key: string, value: V, now?: number): void;
  forget(prefix: string): void;
}

export function createTtlMemo<V>(ttlMs: number, maxEntries: number): TtlMemo<V> {
  const entries = new Map<string, { at: number; value: V }>();
  return {
    get(key, now = Date.now()) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now - hit.at >= ttlMs || now < hit.at) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value, now = Date.now()) {
      entries.delete(key);
      entries.set(key, { at: now, value });
      // Map keeps insertion order: the first key is the oldest write.
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    forget(prefix) {
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) entries.delete(key);
      }
    },
  };
}

/* ─── Read state (optimistic updates; the server action does the same) ─── */

/** Set readAt on every unread row in `ids`. Rows already read and other rows are unchanged. */
export function markRowsRead<T extends { id: string; readAt: string | null }>(
  rows: readonly T[],
  ids: readonly string[],
  atIso: string,
): T[] {
  const set = new Set(ids);
  return rows.map((r) => (set.has(r.id) && !r.readAt ? { ...r, readAt: atIso } : r));
}

/** Clear readAt on the newest row in `ids`, so the conversation is unread again. */
export function markLatestUnread<T extends { id: string; readAt: string | null; receivedAt: string }>(
  rows: readonly T[],
  ids: readonly string[],
): T[] {
  const set = new Set(ids);
  const newest = newestFirst(rows.filter((r) => set.has(r.id)))[0];
  if (!newest) return [...rows];
  return rows.map((r) => (r.id === newest.id ? { ...r, readAt: null } : r));
}
