"use client";
import { format, formatDistanceToNow } from "date-fns";
import { Inbox, RefreshCw, SendHorizonal, X } from "lucide-react";
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
      <article className={`flex min-w-0 flex-col gap-1 ${right ? "items-end" : "items-start"} ${rich ? "max-w-[min(92%,40rem)]" : "max-w-[min(85%,28rem)]"}`}>
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
  const fetchGen = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const unread = conversations.filter((c) => c.unread).length;
  const activeConversation =
    conversations.find((c) => activeId != null && (c.latest.id === activeId || c.memberIds.includes(activeId))) ?? null;
  const messages = thread?.replyId === activeId ? thread.messages : [];

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
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeId, messages.length]);

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
    <div className="unibox-root flex h-dvh flex-col lg:-ml-60 lg:pl-60">
      <header className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Inbox className="size-4" aria-hidden /></span>
          Unibox
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tagFilter || "all"} onValueChange={onTagFilter}>
            <SelectTrigger className="h-8 w-[11.5rem]" aria-label="Filter by reply tag">
              <SelectValue placeholder="All tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {UNIBOX_REPLY_TAGS.map((tag) => (
                <SelectItem key={tag} value={tag}>{tagLabel(tag)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <span className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground">{unread} unread</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(240px,320px)_1fr] overflow-hidden rounded-xl border bg-card">
        <div className={`min-h-0 overflow-y-auto border-r border-border/60 ${activeId ? "hidden md:block" : "block"}`}>
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
              <button key={c.key} type="button" onClick={() => setActiveId(r.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-border/50 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isActive ? "bg-accent/60" : "hover:bg-accent/30"} ${isUnread ? "bg-primary/[0.04]" : ""}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-[13px] ${isUnread ? "font-semibold" : "font-medium"}`}>{name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{r.receivedAt ? formatDistanceToNow(new Date(r.receivedAt), { addSuffix: true }) : ""}</span>
                </span>
                <span className={`truncate text-xs ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>{r.subject || "(no subject)"}</span>
                {c.tag ? (
                  <span className="mt-1 inline-flex w-fit rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                    {tagLabel(c.tag)}
                  </span>
                ) : null}
                <span className="line-clamp-1 text-[11px] text-muted-foreground/80">{messagePreview(r.snippet || r.bodyText)}</span>
              </button>
            );
          })}
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
                  <div ref={scrollerRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-4">
                    {threadLoading && messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Loading conversation…</p>
                    ) : (
                      <ThreadTranscript messages={shown} />
                    )}
                  </div>
                  <div className="border-t border-border/60 px-5 py-3">
                    <label htmlFor="unibox-reply" className="mb-2 block text-xs font-medium text-muted-foreground">Reply via {r.senderEmail ?? "your sender"}</label>
                    <Textarea id="unibox-reply" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Hi ${name.split(" ")[0]},…`} />
                    <div className="mt-2.5 flex items-center gap-2">
                      <Button onClick={() => send(r)} disabled={pending} size="sm">
                        <SendHorizonal className="size-4" /> {pending ? "Sending…" : "Send reply"}
                      </Button>
                    </div>
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
