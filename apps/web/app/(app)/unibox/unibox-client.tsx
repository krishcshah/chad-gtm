"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { UniboxReplyTag } from "@smartreach/shared";
import { Badge, Button, PageHeader, cn, toast } from "@smartreach/ui";
import { getUniboxThread, sendUniboxReply, setUniboxReplyTag, syncUniboxRepliesAction } from "@/lib/actions";
import { groupUniboxConversations } from "@/lib/unibox-conversations";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";
import { ConversationList, type ListConversation } from "./conversation-list";
import { ConversationView, NoConversation } from "./conversation-view";
import { InboxFolders, type ViewCounts } from "./inbox-filters";
import { isTypingTarget, mergeThread, replyAsMessage, type InboxView, type ReplyRow } from "./inbox-utils";
import { ReplyComposer } from "./reply-composer";

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

export function UniboxClient({ initial, initialTag = "" }: { initial: ReplyRow[]; initialTag?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ReplyRow[]>(initial);
  const [tagFilter, setTagFilter] = useState(initialTag);
  const [view, setView] = useState<InboxView>("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const [thread, setThread] = useState<ThreadState | null>(null);
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

  /* ─── Derived lists ─────────────────────────────────────────────── */

  const conversations = useMemo<ListConversation[]>(() => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    return groupUniboxConversations(rows).map((c) => ({
      ...c,
      needsYou: c.memberIds.some((id) => byId.get(id)?.agentStatus === "escalated"),
    }));
  }, [rows]);

  const counts: ViewCounts = useMemo(
    () => ({
      all: conversations.length,
      unread: conversations.filter((c) => c.unread).length,
      needs_you: conversations.filter((c) => c.needsYou).length,
    }),
    [conversations],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (view === "unread" && !c.unread) return false;
      if (view === "needs_you" && !c.needsYou) return false;
      return matchesQuery(c, q);
    });
  }, [conversations, query, view]);

  const activeConversation =
    conversations.find((c) => activeId != null && (c.latest.id === activeId || c.memberIds.includes(activeId))) ?? null;
  const messages = thread?.replyId === activeId ? thread.messages : [];
  const latestId = activeConversation?.latest.id ?? null;
  const draftKey = activeConversation?.key ?? "";
  const body = drafts[draftKey] ?? "";

  const setDraft = useCallback((key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* ─── Selection ─────────────────────────────────────────────────── */

  // Open the newest conversation on tablet and desktop. On phones the list comes first.
  useEffect(() => {
    if (didAutoSelect.current) return;
    didAutoSelect.current = true;
    const wide = typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches;
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

  const send = () => {
    if (!activeConversation || !activeId || pending) return;
    const row = activeConversation.latest;
    const convKey = activeConversation.key;
    const threadKey = activeId;
    const text = (drafts[convKey] ?? "").trim();
    if (!text) {
      toast.error("Write a message first");
      return;
    }
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
    start(async () => {
      const res = await sendUniboxReply({ replyId: row.id, body: text });
      if (res.ok && res.data?.message) {
        const message = res.data.message;
        toast.success(res.message ?? "Reply sent");
        setThread((prev) => {
          if (prev?.replyId !== threadKey) return prev;
          return { replyId: threadKey, messages: mergeThread([message], prev.messages.filter((m) => m.id !== tempId)) };
        });
        router.refresh();
      } else {
        setThread((prev) =>
          prev?.replyId === threadKey ? { replyId: threadKey, messages: prev.messages.filter((m) => m.id !== tempId) } : prev,
        );
        setDraft(convKey, text);
        toast.error(res.ok ? "Send failed" : res.error);
      }
    });
  };

  const refresh = () => {
    startRefresh(async () => {
      try {
        const syncRes = await syncUniboxRepliesAction();
        if (syncRes.ok && syncRes.data && syncRes.data.found > 0) {
          toast.success(`Found ${syncRes.data.found} new ${syncRes.data.found === 1 ? "reply" : "replies"}`);
        } else if (syncRes.ok) {
          toast("No new replies");
        }
      } catch {
        // Mailbox sync is best effort (IMAP may not be configured); still reload what is stored.
      }

      if (activeId) {
        const res = await getUniboxThread({ replyId: activeId });
        if (res.ok && res.data?.messages) {
          const fetched = res.data.messages;
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
    router.replace(tag ? `/unibox?tag=${encodeURIComponent(tag)}` : "/unibox");
  };

  const applyTag = (replyId: string, tag: UniboxReplyTag | null) => {
    startTag(async () => {
      const res = await setUniboxReplyTag({ replyId, tag });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const next = res.data?.tag ?? tag;
      setRows((prev) => prev.map((row) => (row.id === replyId ? { ...row, tag: next } : row)));
      setThread((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === `inbound:${replyId}` ? { ...m, tag: (next as UniboxReplyTag | null) ?? null } : m,
          ),
        };
      });
      toast.success(res.message ?? (next ? "Tag updated" : "Tag cleared"));
      router.refresh();
    });
  };

  const clearFilters = () => {
    setQuery("");
    setView("all");
    if (tagFilter) onTagFilter("");
  };

  /* ─── Keyboard ──────────────────────────────────────────────────── */

  const keyState = useRef({ visible, activeConversation, activeId });
  keyState.current = { visible, activeConversation, activeId };
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
  // Same rule as the list's "Needs you" badge: any reply in the conversation may be the escalated one.
  const escalatedRow = activeConversation?.needsYou
    ? (rows.find((row) => activeConversation.memberIds.includes(row.id) && row.agentStatus === "escalated") ?? null)
    : null;

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
          description="Every reply from your leads, across all mailboxes. The agent answers most of them; the ones it cannot are marked Needs you."
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
        <InboxFolders view={view} onView={setView} tag={tagFilter} onTag={onTagFilter} counts={counts} />

        <div
          className={cn(
            "min-h-0 w-full shrink-0 flex-col border-r border-border bg-card md:w-80 lg:w-96",
            activeId ? "hidden md:flex" : "flex",
          )}
        >
          <ConversationList
            ref={searchRef}
            conversations={visible}
            totalCount={conversations.length}
            activeKey={activeConversation?.key ?? null}
            onSelect={select}
            query={query}
            onQuery={setQuery}
            view={view}
            onView={setView}
            tag={tagFilter}
            onTag={onTagFilter}
            counts={counts}
            onClearFilters={clearFilters}
          />
        </div>

        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>
          {activeConversation && r ? (
            <ConversationView
              ref={scrollerRef}
              reply={r}
              escalation={escalatedRow ? { summary: escalatedRow.agentSummary ?? null } : null}
              tag={activeConversation.tag}
              messages={shown}
              loading={threadLoading && messages.length === 0}
              tagPending={tagPending}
              onTag={(tag) => applyTag(activeConversation.tagReplyId, tag)}
              onBack={() => setActiveId(null)}
              composer={
                <ReplyComposer
                  ref={composerRef}
                  recipientName={r.fromName || r.fromEmail}
                  recipientEmail={r.fromEmail}
                  senderLabel={r.senderName || r.senderEmail}
                  body={body}
                  onBodyChange={(value) => setDraft(draftKey, value)}
                  onSend={send}
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
    </>
  );
}
