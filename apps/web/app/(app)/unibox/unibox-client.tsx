"use client";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, ChevronUp, Inbox, RefreshCw, SendHorizonal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { UNIBOX_REPLY_TAGS, type UniboxReplyTag } from "@smartreach/shared";
import {
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@smartreach/ui";
import { getUniboxThread, sendUniboxReply, setUniboxReplyTag } from "@/lib/actions";
import { messagePreview, prepareMessageBody, resolveBubbleSide, threadDayKey, threadDayLabel } from "@/lib/message-body";
import { groupUniboxConversations } from "@/lib/unibox-conversations";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";
import { EmailBody } from "./message-body";

const TAG_LABEL: Record<UniboxReplyTag, string> = {
  out_of_office: "Out of office",
  not_interested: "Not interested",
  interested: "Interested",
  meeting_booked: "Meeting booked",
  won: "Won",
  lost: "Lost",
};

function tagLabel(tag: string): string {
  return TAG_LABEL[tag as UniboxReplyTag] ?? tag;
}

interface ReplyRow {
  id: string;
  leadId: string | null;
  campaignId: string | null;
  fromName: string; fromEmail: string; subject: string; snippet: string;
  bodyText: string; bodyHtml: string; receivedAt: string; readAt: string | null;
  tag: string | null;
  campaignName: string | null; senderEmail: string | null; senderName: string | null;
}

interface ThreadState {
  replyId: string;
  messages: UniboxThreadMessage[];
}

function sortAscending(messages: UniboxThreadMessage[]): UniboxThreadMessage[] {
  return [...messages].sort((a, b) => {
    const ta = Date.parse(a.sentAt) || 0;
    const tb = Date.parse(b.sentAt) || 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/** Fetched transcript wins on id; keep optimistic rows the server has not returned yet. */
function mergeThread(fetched: UniboxThreadMessage[], optimistic: UniboxThreadMessage[]): UniboxThreadMessage[] {
  const map = new Map<string, UniboxThreadMessage>();
  for (const m of optimistic) map.set(m.id, m);
  for (const m of fetched) map.set(m.id, m);
  return sortAscending([...map.values()]);
}

function senderLabel(m: UniboxThreadMessage): string {
  if (resolveBubbleSide(m) === "right") return m.fromName || "You";
  if (m.direction === "campaign" || m.fromRole === "automation") return m.fromName || m.fromEmail || "Campaign";
  return m.fromName || m.fromEmail || "Lead";
}

function roleHint(m: UniboxThreadMessage): string {
  if (m.direction === "campaign" || m.fromRole === "automation") return "Campaign";
  return "";
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "h:mm a");
}

function replyAsMessage(r: ReplyRow): UniboxThreadMessage {
  return {
    id: `inbound:${r.id}`,
    direction: "inbound",
    fromRole: "lead",
    fromName: r.fromName || "",
    fromEmail: r.fromEmail,
    subject: r.subject || null,
    bodyHtml: r.bodyHtml || "",
    bodyText: r.bodyText || r.snippet || "",
    sentAt: r.receivedAt,
    tag: (r.tag as UniboxReplyTag | null) ?? null,
  };
}

function ThreadBubble({ m }: { m: UniboxThreadMessage }) {
  const right = resolveBubbleSide(m) === "right";
  const rich = prepareMessageBody({ html: m.bodyHtml, text: m.bodyText }).kind === "html";
  const time = clockTime(m.sentAt);
  const hint = roleHint(m);
  const initial = (senderLabel(m).trim()[0] || "?").toUpperCase();
  const bubble = rich
    ? ""
    : right
      ? "rounded-2xl rounded-br-sm bg-[#312e81] px-3.5 py-2.5 text-white shadow-sm"
      : m.direction === "campaign" || m.fromRole === "automation"
        ? "rounded-2xl rounded-bl-sm border border-border bg-muted px-3.5 py-2.5 text-foreground shadow-sm"
        : "rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-2.5 text-foreground shadow-sm";

  return (
    <div className={`flex w-full items-end gap-2 ${right ? "justify-end" : "justify-start"}`}>
      {!right ? (
        <span className="mb-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground" aria-hidden>
          {initial}
        </span>
      ) : null}
      <article className={`flex min-w-0 flex-col gap-1 ${right ? "items-end" : "items-start"} ${rich ? "max-w-[min(96%,64rem)]" : "max-w-[min(92%,54rem)]"}`}>
        <p className={`flex items-baseline gap-2 text-[11px] text-muted-foreground ${right ? "flex-row-reverse" : ""}`}>
          <span className="truncate font-medium text-foreground">{senderLabel(m)}</span>
          {hint && hint !== senderLabel(m) ? <span>{hint}</span> : null}
          {time ? <time dateTime={m.sentAt}>{time}</time> : null}
        </p>
        <div className={bubble}>
          <EmailBody html={m.bodyHtml || null} text={m.bodyText || null} tone={right && !rich ? "inverse" : "default"} />
        </div>
      </article>
    </div>
  );
}

function ThreadTranscript({ messages }: { messages: UniboxThreadMessage[] }) {
  const nodes: React.ReactNode[] = [];
  let lastDay = "";
  for (const m of messages) {
    const key = threadDayKey(m.sentAt);
    if (key !== lastDay) {
      lastDay = key;
      const label = threadDayLabel(m.sentAt);
      if (label) {
        nodes.push(
          <div key={`day-${key}`} className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground/80">
              {label}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>,
        );
      }
    }
    nodes.push(<ThreadBubble key={m.id} m={m} />);
  }
  return <>{nodes}</>;
}

export function UniboxClient({ initial, initialTag = "" }: { initial: ReplyRow[]; initialTag?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ReplyRow[]>(initial);
  const [tagFilter, setTagFilter] = useState(initialTag);
  const conversations = useMemo(() => groupUniboxConversations(rows), [rows]);
  const [activeId, setActiveId] = useState<string | null>(() => groupUniboxConversations(initial)[0]?.latest.id ?? null);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [tagPending, startTag] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showQuotedPreview, setShowQuotedPreview] = useState(false);
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const fetchGen = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const unread = conversations.filter((c) => c.unread).length;
  const activeConversation =
    conversations.find((c) => activeId != null && (c.latest.id === activeId || c.memberIds.includes(activeId))) ?? null;
  const messages = thread?.replyId === activeId ? thread.messages : [];

  const scrollToBottom = (instant = false) => {
    requestAnimationFrame(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
      bottomAnchorRef.current?.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "end" });
    });
  };

  useEffect(() => {
    setRows(initial);
    setTagFilter(initialTag);
  }, [initial, initialTag]);

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
          prev?.replyId === activeId
            ? prev.messages.filter((m) => !fetched.some((f) => f.id === m.id))
            : [];
        return { replyId: activeId, messages: mergeThread(fetched, optimistic) };
      });
      setThreadLoading(false);
      scrollToBottom(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    scrollToBottom(true);
    const timer = setTimeout(() => scrollToBottom(true), 60);
    return () => clearTimeout(timer);
  }, [activeId, messages.length, composerCollapsed]);

  const send = (row: ReplyRow) => {
    const text = body.trim();
    if (!text) { toast.error("Write a message first"); return; }
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
    setBody("");
    setThread((prev) => {
      const base = prev?.replyId === row.id ? prev.messages : [];
      return { replyId: row.id, messages: mergeThread([optimistic], base) };
    });
    start(async () => {
      const res = await sendUniboxReply({ replyId: row.id, body: text });
      if (res.ok && res.data?.message) {
        const message = res.data.message;
        toast.success(res.message ?? "Reply sent");
        setThread((prev) => {
          const base = (prev?.replyId === row.id ? prev.messages : []).filter((m) => m.id !== tempId);
          return { replyId: row.id, messages: mergeThread([message], base) };
        });
        router.refresh();
      } else {
        setThread((prev) => ({
          replyId: row.id,
          messages: (prev?.replyId === row.id ? prev.messages : []).filter((m) => m.id !== tempId),
        }));
        setBody(text);
        toast.error(res.ok ? "Send failed" : res.error);
      }
    });
  };

  const refresh = () => {
    startRefresh(async () => {
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

  const onTagFilter = (value: string) => {
    const tag = value === "all" ? "" : value;
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
        if (!prev || prev.replyId !== replyId) return prev;
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

  return (
    <div className="unibox-root flex h-[calc(100dvh-3.5rem)] lg:h-dvh flex-col p-2 sm:p-4 lg:p-5 gap-3 w-full max-w-none overflow-hidden flex-1">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <Inbox className="size-5" aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">UniBox</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-500">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {unread} unread
              </span>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Unified prospect responses & live outreach thread manager.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
            className="h-8 gap-1.5 text-xs font-medium shadow-xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh Inbox"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
        <div className={`w-full md:w-[320px] lg:w-[350px] shrink-0 min-h-0 flex-col border-r border-border/60 ${activeId ? "hidden md:flex" : "flex"}`}>
          {/* List Sub-header with Filter & Count */}
          <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3.5 py-2.5 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Threads ({conversations.length})
            </span>
            <div className="flex items-center gap-1.5">
              <Select value={tagFilter || "all"} onValueChange={onTagFilter}>
                <SelectTrigger className="h-7 w-[9rem] bg-background text-xs" aria-label="Filter by reply tag">
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All tags</SelectItem>
                  {UNIBOX_REPLY_TAGS.map((tag) => (
                    <SelectItem key={tag} value={tag} className="text-xs">{tagLabel(tag)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border/40">
            {conversations.length === 0 && (
              <EmptyState
                icon={Inbox}
                title={tagFilter ? "No replies with this tag" : "No replies yet"}
                description={
                  tagFilter
                    ? "Choose another tag, or show every reply."
                    : "When prospects reply to your campaigns, conversations appear here in Unibox."
                }
                className="m-4 border-0 bg-transparent py-10"
              />
            )}
            {conversations.map((c) => {
              const r = c.latest;
              const name = r.fromName || r.fromEmail.split("@")[0];
              const isUnread = c.unread;
              const isActive = activeConversation?.key === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setActiveId(r.id)}
                  className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    isActive ? "bg-accent/60" : "hover:bg-accent/30"
                  } ${isUnread ? "bg-primary/[0.04]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[13px] ${isUnread ? "font-bold text-foreground" : "font-medium"}`}>
                      {name}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {r.receivedAt ? formatDistanceToNow(new Date(r.receivedAt), { addSuffix: true }) : ""}
                    </span>
                  </div>
                  <span className={`truncate text-xs ${isUnread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {r.subject || "(no subject)"}
                  </span>
                  {c.tag ? (
                    <span className="mt-0.5 inline-flex w-fit rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                      {tagLabel(c.tag)}
                    </span>
                  ) : null}
                  <span className="line-clamp-1 text-[11px] text-muted-foreground/80">
                    {messagePreview(r.snippet || r.bodyText)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`flex min-h-0 flex-col bg-card/40 ${activeId ? "flex" : "hidden md:flex"}`}>
          {activeConversation ? (
            (() => {
              const r = activeConversation.latest;
              if (!r) {
                return (
                  <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                    Select a conversation to read and reply.
                  </div>
                );
              }
              const name = r.fromName || r.fromEmail;
              const shown = !threadLoading && messages.length === 0 ? [replyAsMessage(r)] : messages;
              return (
                <>
                  <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.subject || "(no subject)"}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {name} {"<"}{r.fromEmail}{">"}
                        {r.senderEmail ? ` → ${r.senderEmail}` : ""}
                      </p>
                      {r.campaignName && <span className="mt-2 inline-block rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{r.campaignName}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Select
                        value={activeConversation.tag ?? "none"}
                        onValueChange={(value) =>
                          applyTag(activeConversation.tagReplyId, value === "none" ? null : (value as UniboxReplyTag))
                        }
                        disabled={tagPending}
                      >
                        <SelectTrigger className="h-8 w-[11.5rem]" aria-label="Reply tag">
                          <SelectValue placeholder="No tag" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No tag</SelectItem>
                          {UNIBOX_REPLY_TAGS.map((tag) => (
                            <SelectItem key={tag} value={tag}>{tagLabel(tag)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button type="button" aria-label="Back to conversations" onClick={() => setActiveId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
                    </div>
                  </div>
                  <div ref={scrollerRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-12 sm:px-4 sm:pb-16">
                    {threadLoading && messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Loading conversation…</p>
                    ) : (
                      <>
                        <ThreadTranscript messages={shown} />
                        <div ref={bottomAnchorRef} className="h-2 shrink-0" aria-hidden />
                      </>
                    )}
                  </div>
                  <div className="border-t border-border/60 bg-muted/20 p-3 sm:p-4 shrink-0 transition-all duration-200">
                    {composerCollapsed ? (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setComposerCollapsed(false);
                          setTimeout(() => scrollToBottom(), 50);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setComposerCollapsed(false);
                          }
                        }}
                        className="group flex items-center justify-between rounded-lg border border-border/80 bg-background px-3.5 py-2.5 shadow-xs cursor-pointer hover:bg-muted/30 hover:border-primary/40 transition-all"
                      >
                        <div className="flex items-center gap-2.5 text-xs text-muted-foreground truncate">
                          <SendHorizonal className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                          <span className="font-medium text-foreground truncate">Reply to {name}</span>
                          <span className="hidden sm:inline text-muted-foreground/80 truncate">&lt;{r.fromEmail}&gt;</span>
                          {body.trim() ? (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
                              Draft saved
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/70 hidden md:inline truncate">
                              Click to write reply…
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setComposerCollapsed(false);
                            setTimeout(() => scrollToBottom(), 50);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
                          title="Expand composer"
                          aria-label="Expand composer"
                        >
                          <ChevronUp className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border/80 bg-background shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/50 bg-muted/20 px-3.5 py-2 text-[11px] text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                            <span className="flex items-center gap-1 truncate">
                              <span className="font-semibold text-foreground/70">From:</span>
                              <span className="font-medium text-foreground">{r.senderName || r.senderEmail}</span>
                            </span>
                            <span className="flex items-center gap-1 truncate">
                              <span className="font-semibold text-foreground/70">To:</span>
                              <span className="font-medium text-foreground">{name}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="hidden text-[10px] text-muted-foreground/60 sm:inline">⌘+Enter to send</span>
                            <button
                              type="button"
                              onClick={() => setComposerCollapsed(true)}
                              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title="Collapse composer"
                              aria-label="Collapse composer"
                            >
                              <ChevronDown className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="p-3">
                          <Textarea
                            id="unibox-reply"
                            rows={3}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                e.preventDefault();
                                send(r);
                              }
                            }}
                            placeholder={`Write your email reply to ${name.split(" ")[0]}…`}
                            className="min-h-[75px] max-h-[180px] resize-y border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>

                        <div className="border-t border-border/40 bg-muted/10 px-3.5 py-2">
                          <button
                            type="button"
                            onClick={() => setShowQuotedPreview(!showQuotedPreview)}
                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <ChevronRight className={cn("size-3.5 transition-transform", showQuotedPreview && "rotate-90")} />
                            <span>{showQuotedPreview ? "Hide quoted message" : "Show quoted message"}</span>
                          </button>

                          {showQuotedPreview ? (
                            <div className="mt-2 rounded-md border-l-2 border-primary/40 bg-muted/40 p-2.5 text-xs text-muted-foreground">
                              <p className="font-medium text-foreground/80">
                                On {r.receivedAt ? format(new Date(r.receivedAt), "EEE, MMM d, yyyy 'at' h:mm a") : "earlier"} {r.fromName || r.fromEmail} &lt;{r.fromEmail}&gt; wrote:
                              </p>
                              <p className="mt-1 line-clamp-6 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground/90">
                                {r.bodyText || r.snippet || "(No content)"}
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-3.5 py-2">
                          <div className="flex items-center gap-2">
                            <Button onClick={() => send(r)} disabled={pending || !body.trim()} size="sm">
                              <SendHorizonal className="size-4" />
                              {pending ? "Sending email…" : "Send email"}
                            </Button>
                            {body.trim() ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setBody("")}
                                className="text-xs text-muted-foreground hover:text-destructive"
                              >
                                Discard
                              </Button>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            Thread headers preserved
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Select a conversation to read and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
