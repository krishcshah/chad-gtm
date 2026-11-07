"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { UniboxReplyTag } from "@smartreach/shared";
import { Badge, Button, ConfirmDialog, PageHeader, cn, toast } from "@smartreach/ui";
import { getUniboxThread, sendUniboxReply, syncUniboxRepliesAction } from "@/lib/actions";
import { discardRequestDraftAction, resolveAgentRequestAction } from "@/lib/autopilot-actions";
import { handBackConversationAction, takeOverConversationAction } from "@/lib/lead-conversation-actions";
import { RESUMED_AFTER_ANSWER_TOAST, TAKEN_OVER_TOAST } from "@/lib/lead-conversations";
import type { ConversationHandlerView } from "@/lib/lead-conversations-server";
import { groupUniboxConversations } from "@/lib/unibox-conversations";
import {
  awaitingContext,
  conversationFlags,
  markLatestUnread,
  markRowsRead,
  type InboxConversationMeta,
  type InboxCounts,
  type SerializedOutbound,
} from "@/lib/unibox-inbox";
import { loadInboxPageAction, markConversationReadAction, setConversationTagAction } from "@/lib/unibox-actions";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";
import { ConversationList, type ListConversation } from "./conversation-list";
import { ConversationView, NoConversation, type WaitingState } from "./conversation-view";
import { InboxFolders, type ViewCounts } from "./inbox-filters";
import {
  displayName,
  isTypingTarget,
  latestSeenAt,
  mergeThread,
  replyAsMessage,
  requestForConversation,
  tagLabel,
  type InboxView,
  type OpenRequestRow,
  type ReplyRow,
} from "./inbox-utils";
import { ReplyComposer, type ComposerRecipientBlock } from "./reply-composer";
import { StopContactingDialog } from "./stop-contacting-dialog";

/** New replies are written by the background sync; reload the list this often while the tab is visible. */
const POLL_MS = 60_000;

interface ThreadState {
  replyId: string;
  messages: UniboxThreadMessage[];
}

function matchesQuery(c: ListConversation, q: string): boolean {
  if (!q) return true;
  const r = c.latest;
  return [r.fromName, r.fromEmail, r.subject, r.snippet, r.campaignName]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

/** A send the agent was drafting against; waits for "Send mine". */
interface DraftingConflict {
  text: string;
}

/** The list filters, as they are in the URL. */
export interface InboxListParams {
  view: InboxView;
  tag: string;
  q: string;
  campaignId: string | null;
}

/** Search waits this long after the last keystroke before asking the server. */
const SEARCH_DEBOUNCE_MS = 350;

function inboxUrl(p: InboxListParams): string {
  const sp = new URLSearchParams();
  if (p.view !== "all") sp.set("view", p.view);
  if (p.tag) sp.set("tag", p.tag);
  if (p.q) sp.set("q", p.q);
  if (p.campaignId) sp.set("campaign", p.campaignId);
  const s = sp.toString();
  return s ? `/unibox?${s}` : "/unibox";
}

/** Merge rows by id; the first list wins. */
function mergeRowsById(first: ReplyRow[], second: readonly ReplyRow[]): ReplyRow[] {
  if (second.length === 0) return first;
  const seen = new Set(first.map((r) => r.id));
  return [...first, ...second.filter((r) => !seen.has(r.id))];
}

/** Conversations already listed plus "Load older" pages. */
interface OlderPages {
  paramsKey: string;
  rows: ReplyRow[];
  conversations: InboxConversationMeta[];
  nextCursor: string | null;
}

/** The open conversation, kept on screen while you read it even if a filter no longer matches. */
interface StickyConversation {
  key: string;
  meta: InboxConversationMeta;
  rows: ReplyRow[];
}

export function UniboxClient({
  initial,
  initialTag = "",
  initialReplyId = null,
  openRequests = [],
  initialView = "all",
  outbound = null,
  conversations: serverConversations,
  counts: serverCounts,
  nextCursor = null,
  capped = false,
  params,
}: {
  initial: ReplyRow[];
  initialTag?: string;
  /** Open this conversation on load (any reply id in it), e.g. from a Needs you card. */
  initialReplyId?: string | null;
  openRequests?: OpenRequestRow[];
  /** Open on this view (`?view=awaiting`). */
  initialView?: InboxView;
  /** Newest sends by you or the agent, for "Awaiting your reply". */
  outbound?: SerializedOutbound | null;
  /** This page of conversations, grouped and filtered on the server (`initial` holds their messages). */
  conversations?: InboxConversationMeta[];
  /** Counts over every conversation in scope, not just this page. */
  counts?: InboxCounts;
  /** Cursor for "Load older conversations", or null on the last page. */
  nextCursor?: string | null;
  /** Only the newest INBOX_INDEX_CAP replies were searched. */
  capped?: boolean;
  /** The filters in the URL. */
  params?: InboxListParams;
}) {
  const router = useRouter();
  const [pageRows, setRows] = useState<ReplyRow[]>(initial);
  const listParams: InboxListParams = params ?? { view: initialView, tag: initialTag, q: "", campaignId: null };
  const paramsKey = inboxUrl(listParams);
  const [older, setOlder] = useState<OlderPages | null>(null);
  const [loadingOlder, startLoadingOlder] = useTransition();
  const [searching, startSearch] = useTransition();
  const [sticky, setSticky] = useState<StickyConversation | null>(null);
  // "Load older" pages belong to one set of filters; a new set starts over. A poll refresh keeps them.
  const olderPages = older?.paramsKey === paramsKey ? older : null;
  const rows = useMemo(() => {
    let all = mergeRowsById(pageRows, olderPages?.rows ?? []);
    if (sticky) all = mergeRowsById(all, sticky.rows);
    return all;
  }, [pageRows, olderPages, sticky]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  /** Apply an optimistic change to every loaded row (this page, older pages and the open conversation). */
  const patchRows = useCallback((fn: (prev: ReplyRow[]) => ReplyRow[]) => {
    setRows(fn);
    setOlder((prev) => (prev ? { ...prev, rows: fn(prev.rows) } : prev));
    setSticky((prev) => (prev ? { ...prev, rows: fn(prev.rows) } : prev));
  }, []);
  const [requests, setRequests] = useState<OpenRequestRow[]>(openRequests);
  // Drafts the user discarded: never prefilled again on this page.
  const [discarded, setDiscarded] = useState<Set<string>>(() => new Set());
  const [conflict, setConflict] = useState<DraftingConflict | null>(null);
  const [handlerPending, startHandler] = useTransition();
  const [tagFilter, setTagFilter] = useState(initialTag);
  const [view, setView] = useState<InboxView>(initialView);
  const [query, setQuery] = useState(listParams.q);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const [thread, setThread] = useState<ThreadState | null>(null);
  // Opted out / on your blocklist, per opened conversation (from getUniboxThread).
  const [recipientBlock, setRecipientBlock] = useState<{ replyId: string; block: ComposerRecipientBlock | null } | null>(
    null,
  );
  const [confirmBlocked, setConfirmBlocked] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [pending, start] = useTransition();
  const [tagPending, startTag] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  const fetchGen = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const didAutoSelect = useRef(false);

  useEffect(() => {
    setRows(initial);
    setTagFilter(initialTag);
  }, [initial, initialTag]);

  useEffect(() => {
    setRequests(openRequests);
  }, [openRequests]);

  /* ─── Derived lists ─────────────────────────────────────────────── */

  // Server mode: the page's conversations, "Load older" pages and the open one. The server fixes
  // grouping and order over every reply in scope; the client only adds what is loaded.
  const listMeta = useMemo<InboxConversationMeta[] | null>(() => {
    if (!serverConversations) return null;
    const seen = new Set<string>();
    const out: InboxConversationMeta[] = [];
    for (const m of [...serverConversations, ...(olderPages?.conversations ?? [])]) {
      if (seen.has(m.key)) continue;
      seen.add(m.key);
      out.push(m);
    }
    if (sticky && !seen.has(sticky.key)) {
      out.push(sticky.meta);
      out.sort((a, b) => {
        const delta = (Date.parse(b.latestReceivedAt) || 0) - (Date.parse(a.latestReceivedAt) || 0);
        return delta !== 0 ? delta : b.latestId.localeCompare(a.latestId);
      });
    }
    return out;
  }, [serverConversations, olderPages, sticky]);

  const conversations = useMemo<ListConversation[]>(() => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ctx = awaitingContext(outbound, requests);
    const groups = listMeta
      ? listMeta.map((m) => ({ key: m.key, threadKey: m.threadKey, memberIds: m.memberIds, latestId: m.latestId }))
      : groupUniboxConversations(rows).map((c) => ({
          key: c.key,
          threadKey: c.threadKey,
          memberIds: c.memberIds,
          latestId: c.latest.id,
        }));
    const out: ListConversation[] = [];
    for (const g of groups) {
      const members = g.memberIds.map((id) => byId.get(id)).filter((r): r is ReplyRow => Boolean(r));
      const latest = byId.get(g.latestId) ?? members[0];
      if (!latest) continue;
      // One definition (lib/unibox-inbox): Needs you = an open card; held = account on hold. Recomputed
      // from the loaded rows so read and tag changes show at once.
      const flags = conversationFlags(members, ctx);
      out.push({
        key: g.key,
        threadKey: g.threadKey,
        latest,
        memberIds: g.memberIds,
        unread: flags.unread,
        tag: flags.tag,
        tagSource: flags.tagSource,
        detectedTag: flags.detectedTag,
        tagReplyId: flags.tagReplyId || latest.id,
        needsYou: flags.needsYou,
        requestId: flags.requestId,
        held: flags.held,
        awaiting: flags.awaiting,
      });
    }
    return out;
  }, [rows, requests, outbound, listMeta]);

  const counts: ViewCounts = useMemo(() => {
    const local = {
      all: conversations.length,
      unread: conversations.filter((c) => c.unread).length,
      awaiting: conversations.filter((c) => c.awaiting).length,
      needs_you: conversations.filter((c) => c.needsYou).length,
    };
    if (!serverCounts) return local;
    // Server counts cover every conversation in scope; shift them by what changed here since.
    const served = new Map(
      [...(serverConversations ?? []), ...(olderPages?.conversations ?? [])].map((m) => [m.key, m] as const),
    );
    const next = { all: serverCounts.all, unread: serverCounts.unread, awaiting: serverCounts.awaiting, needs_you: serverCounts.needs_you };
    for (const c of conversations) {
      const m = served.get(c.key);
      if (!m) continue;
      next.unread += Number(c.unread) - Number(m.unread);
      next.awaiting += Number(Boolean(c.awaiting)) - Number(m.awaiting);
      next.needs_you += Number(c.needsYou) - Number(m.needsYou);
    }
    return {
      all: next.all,
      unread: Math.max(0, next.unread),
      awaiting: Math.max(0, next.awaiting),
      needs_you: Math.max(0, next.needs_you),
    };
  }, [conversations, serverCounts, serverConversations, olderPages]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      // The open conversation stays put while you read it (e.g. it is now read, in the Unread view).
      const open = activeId != null && (c.latest.id === activeId || c.memberIds.includes(activeId));
      if (!open) {
        if (view === "unread" && !c.unread) return false;
        if (view === "needs_you" && !c.needsYou) return false;
        if (view === "awaiting" && !c.awaiting) return false;
        if (listMeta && tagFilter && c.tag !== tagFilter) return false;
      }
      // Server mode searches every message of every conversation on the server.
      return listMeta ? true : matchesQuery(c, q);
    });
  }, [conversations, query, view, activeId, listMeta, tagFilter]);

  const activeConversation =
    conversations.find((c) => activeId != null && (c.latest.id === activeId || c.memberIds.includes(activeId))) ?? null;
  const messages = thread?.replyId === activeId ? thread.messages : [];
  const shownBlock = recipientBlock?.replyId === activeId ? recipientBlock.block : null;
  const latestId = activeConversation?.latest.id ?? null;
  const draftKey = activeConversation?.key ?? "";
  const activeRequest = activeConversation ? requestForConversation(activeConversation, requests) : null;
  const requestDraft =
    activeRequest && !discarded.has(activeRequest.id) && activeRequest.draftReply.trim() ? activeRequest.draftReply : "";
  // An open card's draft prefills the reply box until the user edits or discards it.
  const body = drafts[draftKey] ?? requestDraft;

  const setDraft = useCallback((key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* ─── Selection ─────────────────────────────────────────────────── */

  // Open the newest conversation on tablet and desktop. On phones the list comes first.
  useEffect(() => {
    if (didAutoSelect.current) return;
    didAutoSelect.current = true;
    const wide = typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches;
    const linked = initialReplyId
      ? conversations.find((c) => c.latest.id === initialReplyId || c.memberIds.includes(initialReplyId))
      : undefined;
    if (linked) {
      // Opened from a link to this conversation: show it, its row and its reply box.
      setActiveId(linked.latest.id);
      requestAnimationFrame(() =>
        document.querySelector(`[data-conversation="${CSS.escape(linked.key)}"]`)?.scrollIntoView({ block: "nearest" }),
      );
      return;
    }
    // A link to a reply this workspace's Inbox doesn't list (another workspace, or gone).
    if (initialReplyId) toast.info("That conversation isn't in this workspace's Inbox.");
    const first = conversations[0];
    if (wide && first) setActiveId(first.latest.id);
    // On phones the thread gets the screen; the reply box opens on demand.
    if (!wide) setComposerCollapsed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback((replyId: string) => {
    setActiveId(replyId);
  }, []);

  // Scroll only the transcript. scrollIntoView would also scroll the clipped page frame.
  const scrollToBottom = (instant = false) => {
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: instant ? "auto" : "smooth" });
    });
  };

  /* ─── Thread loading ────────────────────────────────────────────── */

  useEffect(() => {
    if (!activeId) {
      setThread(null);
      setThreadLoading(false);
      return;
    }
    const gen = ++fetchGen.current;
    let cancelled = false;
    setThreadLoading(true);
    setThread({ replyId: activeId, messages: [] });
    (async () => {
      const res = await getUniboxThread({ replyId: activeId });
      if (cancelled || gen !== fetchGen.current) return;
      const fetched = res.ok && res.data?.messages ? res.data.messages : [];
      setRecipientBlock({ replyId: activeId, block: res.ok ? (res.data?.recipientBlock ?? null) : null });
      setConfirmBlocked(false);
      setThread((prev) => {
        const optimistic =
          prev?.replyId === activeId ? prev.messages.filter((m) => !fetched.some((f) => f.id === m.id)) : [];
        return { replyId: activeId, messages: mergeThread(fetched, optimistic) };
      });
      setThreadLoading(false);
      scrollToBottom(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // A new reply arrived in the open conversation (poll or sync): reload its transcript quietly.
  // Only when the same conversation got a newer reply; switching conversations is handled above.
  const seenLatest = useRef<{ key: string; latest: string } | null>(null);
  const activeKey = activeConversation?.key ?? null;
  useEffect(() => {
    const prev = seenLatest.current;
    seenLatest.current = activeKey && latestId ? { key: activeKey, latest: latestId } : null;
    if (!activeId || !activeKey || !latestId || !prev) return;
    if (prev.key !== activeKey || prev.latest === latestId) return;
    const key = activeId;
    (async () => {
      const res = await getUniboxThread({ replyId: key });
      if (!res.ok || !res.data?.messages) return;
      const fetched = res.data.messages;
      setThread((current) => {
        if (current?.replyId !== key) return current;
        const optimistic = current.messages.filter(
          (m) => m.id.startsWith("operator:pending:") && !fetched.some((f) => f.id === m.id),
        );
        return { replyId: key, messages: mergeThread(fetched, optimistic) };
      });
    })();
  }, [activeId, activeKey, latestId]);

  // The open conversation left the list (re-tagged out of the filter, or gone after a reload).
  // Drop the selection so phones are not left on an empty pane with no way back.
  useEffect(() => {
    if (activeId && !activeConversation) setActiveId(null);
  }, [activeId, activeConversation]);

  /* ─── Read state ────────────────────────────────────────────────── */

  /** Mark these replies read now, and on the server; put them back if that fails. */
  const markRead = useCallback(
    (memberIds: string[], unreadIds: string[]) => {
      if (unreadIds.length === 0) return;
      const undo = new Set(unreadIds);
      patchRows((prev) => markRowsRead(prev, memberIds, new Date().toISOString()));
      const revert = (error: string) => {
        patchRows((prev) => prev.map((r) => (undo.has(r.id) ? { ...r, readAt: null } : r)));
        toast.error(error);
      };
      markConversationReadAction({ replyIds: memberIds, read: true })
        .then((res) => {
          if (!res.ok) revert(res.error);
        })
        .catch(() => revert("Could not mark the conversation read"));
    },
    [patchRows],
  );

  // Opening a conversation reads it. Conversations the agent handled stay unread until you open
  // them, on purpose: you should see what it sent. The open one is kept on screen (`sticky`) so it
  // does not vanish from a filtered view, e.g. Unread, until you pick another.
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const listMetaRef = useRef(listMeta);
  listMetaRef.current = listMeta;
  useEffect(() => {
    if (!activeKey) {
      setSticky(null);
      return;
    }
    const c = conversationsRef.current.find((x) => x.key === activeKey);
    if (!c) return;
    const meta = listMetaRef.current?.find((m) => m.key === activeKey);
    if (meta) {
      const ids = new Set(c.memberIds);
      setSticky({ key: activeKey, meta, rows: rowsRef.current.filter((r) => ids.has(r.id)) });
    }
    if (c.unread) {
      const ids = new Set(c.memberIds);
      markRead(c.memberIds, rowsRef.current.filter((r) => ids.has(r.id) && !r.readAt).map((r) => r.id));
    }
    // Only when a different conversation opens; "Mark as unread" must not be undone here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  /* ─── Filters in the URL (server mode) ──────────────────────────── */

  // The search last sent to the URL, so a pending search is not sent again with stale filters.
  const sentQ = useRef<string | null>(null);
  const navigate = useCallback(
    (next: Partial<InboxListParams>) => {
      if (next.q !== undefined) sentQ.current = next.q;
      router.replace(inboxUrl({ ...listParams, ...next }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, paramsKey],
  );

  // Search runs on the server over every conversation; wait for a pause in typing.
  useEffect(() => {
    if (!params) return;
    const q = query.trim().slice(0, 200);
    if (q === listParams.q || q === sentQ.current) return;
    const timer = window.setTimeout(() => startSearch(() => navigate({ q })), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, paramsKey]);

  const onView = (next: InboxView) => {
    setView(next);
    if (params) navigate({ view: next });
  };

  /** The next page after the last one shown. */
  const moreCursor = olderPages ? olderPages.nextCursor : nextCursor;
  const loadOlder = () => {
    const cursor = moreCursor;
    if (!cursor || loadingOlder) return;
    const key = paramsKey;
    startLoadingOlder(async () => {
      const res = await loadInboxPageAction({
        view: listParams.view,
        tag: listParams.tag || null,
        q: listParams.q,
        campaignId: listParams.campaignId,
        cursor,
      }).catch(() => null);
      if (!res || !res.ok || !res.data) {
        toast.error(res && !res.ok ? res.error : "Could not load older conversations");
        return;
      }
      const data = res.data;
      setOlder((prev) => {
        const base: OlderPages =
          prev?.paramsKey === key ? prev : { paramsKey: key, rows: [], conversations: [], nextCursor: null };
        const keys = new Set(base.conversations.map((c) => c.key));
        return {
          paramsKey: key,
          rows: mergeRowsById(base.rows, data.rows as ReplyRow[]),
          conversations: [...base.conversations, ...data.conversations.filter((c) => !keys.has(c.key))],
          nextCursor: data.nextCursor,
        };
      });
    });
  };

  useEffect(() => {
    scrollToBottom(true);
    const timer = setTimeout(() => scrollToBottom(true), 60);
    return () => clearTimeout(timer);
  }, [activeId, messages.length, composerCollapsed]);

  /* ─── Polling ───────────────────────────────────────────────────── */

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  /* ─── Actions ───────────────────────────────────────────────────── */

  const send = (opts: { force?: boolean; text?: string } = {}) => {
    if (!activeConversation || !activeId || pending) return;
    const row = activeConversation.latest;
    const convKey = activeConversation.key;
    const threadKey = activeId;
    const request = activeRequest;
    const text = (opts.text ?? body).trim();
    if (!text) {
      toast.error("Write a message first");
      return;
    }
    // Everything the user had on screen before this send.
    const memberRows = rows.filter((x) => activeConversation.memberIds.includes(x.id));
    const seenLatestAt = latestSeenAt(memberRows, messages.filter((m) => !m.id.startsWith("operator:pending:")));
    const tempId = `operator:pending:${crypto.randomUUID()}`;
    const optimistic: UniboxThreadMessage = {
      id: tempId,
      direction: "operator",
      fromRole: "operator",
      fromName: row.senderName || "You",
      fromEmail: row.senderEmail || "",
      subject: row.subject ? (row.subject.startsWith("Re:") ? row.subject : `Re: ${row.subject}`) : null,
      bodyHtml: "",
      bodyText: text,
      sentAt: new Date().toISOString(),
    };
    setDraft(convKey, "");
    setThread((prev) => ({
      replyId: threadKey,
      messages: mergeThread([optimistic], prev?.replyId === threadKey ? prev.messages : []),
    }));
    const undoOptimistic = () => {
      setThread((prev) =>
        prev?.replyId === threadKey ? { replyId: threadKey, messages: prev.messages.filter((m) => m.id !== tempId) } : prev,
      );
      setDraft(convKey, text);
    };
    start(async () => {
      if (request) {
        // A Needs you card is open: sending answers it. The agent picks the
        // conversation back up only when it handles it (not Manual, paused or taken over).
        const res = await resolveAgentRequestAction({ requestId: request.id, body: text, seenLatestAt: seenLatestAt ?? undefined });
        if (!res.ok) {
          undoOptimistic();
          toast.error(res.error);
          router.refresh();
          return;
        }
        setRequests((prev) => prev.filter((r) => r.id !== request.id));
        if (res.data?.agentOff === false) {
          toast.success(RESUMED_AFTER_ANSWER_TOAST, {
            action: { label: "Take over", onClick: () => changeHandler(row.id, "take") },
          });
        } else {
          toast.success(res.message ?? "Reply sent");
        }
        const fresh = await getUniboxThread({ replyId: threadKey });
        if (fresh.ok && fresh.data?.messages) {
          const fetched = fresh.data.messages;
          setThread((prev) => (prev?.replyId === threadKey ? { replyId: threadKey, messages: mergeThread(fetched, []) } : prev));
        }
        router.refresh();
        return;
      }
      const res = await sendUniboxReply({
        replyId: row.id,
        body: text,
        force: opts.force,
        seenLatestReplyId: row.id,
        confirmBlocked: shownBlock?.level === "own" && confirmBlocked,
      });
      if (res.ok && res.data?.message) {
        const message = res.data.message;
        if (res.data.takenOver) {
          applyHandler(row.id, { handledBy: "you", reason: "conversation", canHandBack: true });
          toast.success(TAKEN_OVER_TOAST, {
            action: { label: "Hand back", onClick: () => changeHandler(row.id, "back") },
          });
        } else {
          toast.success(res.message ?? "Reply sent");
        }
        setThread((prev) => {
          if (prev?.replyId !== threadKey) return prev;
          return { replyId: threadKey, messages: mergeThread([message], prev.messages.filter((m) => m.id !== tempId)) };
        });
        router.refresh();
        return;
      }
      undoOptimistic();
      if (!res.ok && res.fieldErrors?.agent) {
        // The agent holds this message: ask before sending over it.
        setConflict({ text });
        return;
      }
      toast.error(res.ok ? "Send failed" : res.error);
      // A newer message or a changed conversation: show what changed.
      if (!res.ok && res.fieldErrors?.conversation) router.refresh();
    });
  };

  /** Update every row of the conversation that `replyId` belongs to. */
  const applyHandler = (
    replyId: string,
    view: Pick<ConversationHandlerView, "handledBy" | "reason" | "canHandBack">,
  ) => {
    patchRows((prev) => {
      const anchor = prev.find((x) => x.id === replyId);
      if (!anchor?.leadId || !anchor.campaignId) return prev;
      return prev.map((x) =>
        x.leadId === anchor.leadId && x.campaignId === anchor.campaignId
          ? { ...x, handledBy: view.handledBy, handlerReason: view.reason, canHandBack: view.canHandBack }
          : x,
      );
    });
  };

  const changeHandler = (replyId: string, kind: "take" | "back") => {
    // Taking over closes the conversation's Needs you card: keep its draft in the reply box.
    const anchor = rows.find((x) => x.id === replyId);
    const conv = conversations.find((c) => c.latest.id === replyId || c.memberIds.includes(replyId)) ?? null;
    const openRequest = conv ? requestForConversation(conv, requests) : null;
    const keptDraft =
      conv && openRequest && drafts[conv.key] === undefined && !discarded.has(openRequest.id) && openRequest.draftReply.trim()
        ? { key: conv.key, text: openRequest.draftReply }
        : null;
    startHandler(async () => {
      const res =
        kind === "take" ? await takeOverConversationAction({ replyId }) : await handBackConversationAction({ replyId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (kind === "take" && anchor?.leadId && anchor.campaignId) {
        if (keptDraft) setDraft(keptDraft.key, keptDraft.text);
        setRequests((prev) =>
          prev.filter((r) => !(r.leadId === anchor.leadId && r.campaignId === anchor.campaignId) && r.id !== openRequest?.id),
        );
      }
      if (res.data?.handler) applyHandler(replyId, res.data.handler);
      toast.success(res.message ?? (kind === "take" ? TAKEN_OVER_TOAST : "Handed back"));
      router.refresh();
    });
  };

  const discardDraft = () => {
    if (!activeConversation) return;
    const convKey = activeConversation.key;
    setDraft(convKey, "");
    const request = activeRequest;
    if (!request) return;
    setDiscarded((prev) => new Set(prev).add(request.id));
    void discardRequestDraftAction(request.id).then((res) => {
      if (!res.ok) toast.error(res.error);
    });
  };

  const refresh = () => {
    startRefresh(async () => {
      try {
        const syncRes = await syncUniboxRepliesAction();
        if (syncRes.ok && syncRes.data && syncRes.data.found > 0) {
          toast.success(`Found ${syncRes.data.found} new ${syncRes.data.found === 1 ? "reply" : "replies"}`);
        } else if (syncRes.ok) {
          const checked = syncRes.data?.checked ?? 0;
          toast(
            checked > 0
              ? `No new replies. Checked ${checked} ${checked === 1 ? "mailbox" : "mailboxes"} just now.`
              : "No new replies. Replies are also checked automatically every few minutes.",
          );
        }
      } catch {
        // Mailbox sync is best effort (IMAP may not be configured); still reload what is stored.
      }

      if (activeId) {
        const res = await getUniboxThread({ replyId: activeId });
        if (res.ok && res.data?.messages) {
          const fetched = res.data.messages;
          setRecipientBlock({ replyId: activeId, block: res.data.recipientBlock ?? null });
          setThread((prev) => {
            const optimistic =
              prev?.replyId === activeId
                ? prev.messages.filter((m) => m.id.startsWith("operator:pending:") && !fetched.some((f) => f.id === m.id))
                : [];
            return { replyId: activeId, messages: mergeThread(fetched, optimistic) };
          });
        } else if (!res.ok) {
          toast.error(res.error);
        }
      }
      router.refresh();
    });
  };

  const onTagFilter = (tag: string) => {
    setTagFilter(tag);
    if (params) navigate({ tag });
    else router.replace(tag ? `/unibox?tag=${encodeURIComponent(tag)}` : "/unibox");
  };

  // "Not interested" asks first: it can also stop all contact with the lead.
  const [notInterested, setNotInterested] = useState<{ replyIds: string[]; name: string; email: string } | null>(null);
  /** Tag the whole conversation; the tag you pick wins over automatic tags (#86). */
  const onTagConversation = (replyIds: string[], row: Pick<ReplyRow, "fromName" | "fromEmail">, tag: UniboxReplyTag | null) => {
    if (tag === "not_interested") {
      setNotInterested({ replyIds, name: displayName(row), email: row.fromEmail });
      return;
    }
    applyTag(replyIds, tag);
  };

  const applyTag = (replyIds: string[], tag: UniboxReplyTag | null, stopContacting?: boolean) => {
    startTag(async () => {
      const res = await setConversationTagAction({ replyIds, tag, ...(stopContacting === undefined ? {} : { stopContacting }) });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setNotInterested(null);
      // The server tags the conversation's newest reply.
      const replyId = res.data?.replyId ?? replyIds[0]!;
      const next = res.data?.tag ?? tag;
      patchRows((prev) => prev.map((row) => (row.id === replyId ? { ...row, tag: next, tagSource: "human" } : row)));
      setThread((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === `inbound:${replyId}` ? { ...m, tag: (next as UniboxReplyTag | null) ?? null } : m,
          ),
        };
      });
      toast.success(res.message ?? (next ? `Tagged ${tagLabel(next)}` : "Tag cleared"));
      router.refresh();
    });
  };

  const clearFilters = () => {
    setQuery("");
    setView("all");
    setTagFilter("");
    if (params) navigate({ view: "all", tag: "", q: "", campaignId: null });
    else if (tagFilter) onTagFilter("");
  };

  /** "Mark as unread": the newest message is unread again. On phones, back to the list. */
  const markUnread = () => {
    const c = activeConversation;
    if (!c) return;
    const ids = c.memberIds;
    const before = new Map(rows.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.readAt] as const));
    patchRows((prev) => markLatestUnread(prev, ids));
    const revert = (error: string) => {
      patchRows((prev) => prev.map((r) => (before.has(r.id) ? { ...r, readAt: before.get(r.id) ?? null } : r)));
      toast.error(error);
    };
    markConversationReadAction({ replyIds: ids, read: false })
      .then((res) => {
        if (res.ok) toast.success("Marked as unread");
        else revert(res.error);
      })
      .catch(() => revert("Could not mark the conversation unread"));
    if (!window.matchMedia("(min-width: 768px)").matches) setActiveId(null);
  };

  /** "Done": read, then the next conversation in the list (on phones, back to the list). */
  const done = () => {
    const c = activeConversation;
    if (!c) return;
    if (c.unread) {
      const ids = new Set(c.memberIds);
      markRead(c.memberIds, rows.filter((r) => ids.has(r.id) && !r.readAt).map((r) => r.id));
    }
    if (!window.matchMedia("(min-width: 768px)").matches) {
      setActiveId(null);
      return;
    }
    const index = visible.findIndex((x) => x.key === c.key);
    const next = (index >= 0 ? visible[index + 1] : visible[0]) ?? (index > 0 ? visible[index - 1] : undefined);
    if (next && next.key !== c.key) {
      setActiveId(next.latest.id);
      document.querySelector(`[data-conversation="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: "nearest" });
    } else {
      setActiveId(null);
    }
  };

  /* ─── Keyboard ──────────────────────────────────────────────────── */

  const keyState = useRef({ visible, activeConversation, activeId, done, markUnread });
  keyState.current = { visible, activeConversation, activeId, done, markUnread };
  const lastKey = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const prev = lastKey.current;
      lastKey.current = { key: e.key.toLowerCase(), at: Date.now() };
      // "g" starts the app's go-to shortcuts; leave the next key to them.
      if (prev.key === "g" && Date.now() - prev.at < 900) return;

      const { visible: list, activeConversation: current, activeId: id } = keyState.current;
      const key = e.key.toLowerCase();
      if (key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (key === "j" || key === "k") {
        if (list.length === 0) return;
        e.preventDefault();
        const index = current ? list.findIndex((c) => c.key === current.key) : -1;
        const nextIndex = key === "j" ? Math.min(list.length - 1, index + 1) : Math.max(0, index < 0 ? 0 : index - 1);
        const next = list[nextIndex];
        if (!next) return;
        setActiveId(next.latest.id);
        document
          .querySelector(`[data-conversation="${CSS.escape(next.key)}"]`)
          ?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (key === "r" && id) {
        e.preventDefault();
        setComposerCollapsed(false);
        requestAnimationFrame(() => composerRef.current?.focus());
        return;
      }
      if (key === "e" && current) {
        e.preventDefault();
        keyState.current.done();
        return;
      }
      if (key === "u" && current) {
        e.preventDefault();
        keyState.current.markUnread();
        return;
      }
      if (e.key === "Escape" && id && !window.matchMedia("(min-width: 768px)").matches) {
        setActiveId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ─── Render ────────────────────────────────────────────────────── */

  const r = activeConversation?.latest ?? null;
  const shown = r && !threadLoading && messages.length === 0 ? [replyAsMessage(r)] : messages;
  // Same rule as the list's badges: Needs you = an open card, held = the account is on hold.
  const memberRow = (status: string) =>
    activeConversation
      ? (rows.find((row) => activeConversation.memberIds.includes(row.id) && row.agentStatus === status) ?? null)
      : null;
  const waiting: WaitingState =
    activeConversation?.needsYou && activeConversation.requestId
      ? {
          kind: "needs_you",
          requestId: activeConversation.requestId,
          summary: memberRow("escalated")?.agentSummary ?? null,
        }
      : activeConversation?.held
        ? { kind: "held", summary: memberRow("held")?.agentSummary ?? null }
        : null;
  const leadWroteAgain = Boolean(
    activeRequest &&
      activeConversation &&
      rows.some(
        (row) =>
          activeConversation.memberIds.includes(row.id) &&
          (Date.parse(row.receivedAt) || 0) > (Date.parse(activeRequest.createdAt) || 0),
      ),
  );

  return (
    <>
      {/* Phones: one compact row so the list gets the screen. */}
      <div className={cn("flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:hidden", activeId && "hidden")}>
        <h1 className="text-xl font-semibold tracking-[-0.025em]">Inbox</h1>
        <Button variant="outline" size="sm" onClick={refresh} loading={refreshing}>
          {refreshing ? null : <RefreshCw aria-hidden />}
          Check for replies
        </Button>
      </div>
      <div className={cn("hidden shrink-0 border-b border-border px-6 pb-5 pt-6 lg:px-8", activeId ? "md:block" : "sm:block")}>
        <PageHeader
          title="Inbox"
          description="Replies from your leads, newest first. Where the agent is on, it answers them and marks what it can't as Needs you. Everything else waits under Awaiting your reply."
          meta={
            counts.unread > 0 ? <Badge variant="neutral">{counts.unread.toLocaleString()} unread</Badge> : null
          }
          actions={
            <Button variant="outline" size="sm" onClick={refresh} loading={refreshing}>
              {refreshing ? null : <RefreshCw aria-hidden />}
              Check for new replies
            </Button>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <InboxFolders view={view} onView={onView} tag={tagFilter} onTag={onTagFilter} counts={counts} />

        <div
          className={cn(
            "min-h-0 w-full shrink-0 flex-col border-r border-border bg-card md:w-80 lg:w-96",
            activeId ? "hidden md:flex" : "flex",
          )}
        >
          <ConversationList
            ref={searchRef}
            conversations={visible}
            totalCount={counts.all}
            activeKey={activeConversation?.key ?? null}
            onSelect={select}
            query={query}
            onQuery={setQuery}
            view={view}
            onView={onView}
            tag={tagFilter}
            onTag={onTagFilter}
            counts={counts}
            onClearFilters={clearFilters}
            searching={searching}
            hasMore={Boolean(moreCursor)}
            loadingOlder={loadingOlder}
            onLoadOlder={loadOlder}
            capped={capped}
            campaignFilter={
              listParams.campaignId
                ? {
                    id: listParams.campaignId,
                    name:
                      rows.find((x) => x.campaignId === listParams.campaignId && x.campaignName)?.campaignName ??
                      "This campaign",
                  }
                : null
            }
            onClearCampaign={params ? () => navigate({ campaignId: null }) : undefined}
          />
        </div>

        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>
          {activeConversation && r ? (
            <ConversationView
              ref={scrollerRef}
              reply={r}
              waiting={waiting}
              request={activeRequest}
              leadWroteAgain={leadWroteAgain}
              agentDrafting={r.agentStatus === "pending" || r.agentStatus === "processing"}
              handler={
                r.handledBy
                  ? { handledBy: r.handledBy, reason: r.handlerReason ?? "campaign", canHandBack: Boolean(r.canHandBack) }
                  : null
              }
              handlerPending={handlerPending}
              onTakeOver={() => changeHandler(r.id, "take")}
              onHandBack={() => changeHandler(r.id, "back")}
              tag={activeConversation.tag}
              detectedTag={activeConversation.detectedTag}
              messages={shown}
              loading={threadLoading && messages.length === 0}
              tagPending={tagPending}
              onTag={(tag) => onTagConversation(activeConversation.memberIds, r, tag)}
              onBack={() => setActiveId(null)}
              onMarkUnread={markUnread}
              onDone={done}
              composer={
                <ReplyComposer
                  ref={composerRef}
                  recipientName={r.fromName || r.fromEmail}
                  recipientEmail={r.fromEmail}
                  senderLabel={r.senderName || r.senderEmail}
                  body={body}
                  onBodyChange={(value) => setDraft(draftKey, value)}
                  onSend={() => send()}
                  agentDraft={
                    requestDraft && activeRequest ? { text: requestDraft, source: activeRequest.draftSource } : null
                  }
                  onDiscardDraft={discardDraft}
                  recipientBlock={shownBlock}
                  confirmBlocked={confirmBlocked}
                  onConfirmBlockedChange={setConfirmBlocked}
                  sending={pending}
                  collapsed={composerCollapsed}
                  onCollapsedChange={(collapsed) => {
                    setComposerCollapsed(collapsed);
                    if (!collapsed) {
                      requestAnimationFrame(() => composerRef.current?.focus());
                      setTimeout(() => scrollToBottom(), 50);
                    }
                  }}
                  quote={{
                    fromName: r.fromName,
                    fromEmail: r.fromEmail,
                    receivedAt: r.receivedAt,
                    text: r.bodyText || r.snippet || "",
                  }}
                />
              }
            />
          ) : (
            <NoConversation />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
        title="The agent is drafting a reply"
        description="Send yours instead? The agent's reply won't go out, and you take over this conversation."
        confirmLabel="Send mine"
        onConfirm={() => {
          const text = conflict?.text;
          setConflict(null);
          if (text) send({ force: true, text });
        }}
      />
      <StopContactingDialog
        target={notInterested}
        pending={tagPending}
        onCancel={() => setNotInterested(null)}
        onConfirm={(stopContacting) => {
          if (notInterested) applyTag(notInterested.replyIds, "not_interested", stopContacting);
        }}
      />
    </>
  );
}
