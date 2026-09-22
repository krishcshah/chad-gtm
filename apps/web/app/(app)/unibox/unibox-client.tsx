"use client";
import { format, formatDistanceToNow } from "date-fns";
import { Inbox, SendHorizonal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, EmptyState, Textarea } from "@smartreach/ui";
import { getUniboxThread, sendUniboxReply } from "@/lib/actions";
import { messagePreview, threadDayKey, threadDayLabel } from "@/lib/message-body";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";
import { MessageBody } from "./message-body";

interface ReplyRow {
  id: string; fromName: string; fromEmail: string; subject: string; snippet: string;
  bodyText: string; bodyHtml: string; receivedAt: string; readAt: string | null;
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
  if (m.direction === "operator") return m.fromName || "You";
  if (m.direction === "campaign") return m.fromName || m.fromEmail || "Campaign";
  return m.fromName || m.fromEmail || "Lead";
}

function directionLabel(m: UniboxThreadMessage): string {
  if (m.direction === "operator") return "You";
  if (m.direction === "campaign") return "Campaign";
  return "Lead";
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
  };
}

function ThreadBubble({ m }: { m: UniboxThreadMessage }) {
  const right = m.direction === "operator";
  const time = clockTime(m.sentAt);
  return (
    <div className={`flex w-full ${right ? "justify-end" : "justify-start"}`}>
      <article
        className={`w-full max-w-[min(100%,34rem)] rounded-2xl border px-3 py-2.5 shadow-sm ${
          right
            ? "rounded-br-md border-primary/35 bg-primary/10"
            : "rounded-bl-md border-border bg-card"
        }`}
      >
        <header className="mb-2 flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            {senderLabel(m)}
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {directionLabel(m)}
            </span>
          </p>
          {time ? (
            <time dateTime={m.sentAt} className="shrink-0 text-[11px] text-muted-foreground">
              {time}
            </time>
          ) : null}
        </header>
        {m.subject ? <p className="mb-2 text-xs font-medium text-foreground/80">{m.subject}</p> : null}
        <MessageBody html={m.bodyHtml} text={m.bodyText} />
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

export function UniboxClient({ initial }: { initial: ReplyRow[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const fetchGen = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const unread = initial.filter((r) => !r.readAt).length;
  const messages = thread?.replyId === activeId ? thread.messages : [];

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
    start(async () => {
      const res = await sendUniboxReply({ replyId: row.id, body: text });
      if (res.ok) {
        toast.success(res.message ?? "Reply sent");
        setBody("");
        const message = res.data?.message;
        if (message) {
          setThread((prev) => {
            const base = prev?.replyId === row.id ? prev.messages : [];
            return { replyId: row.id, messages: mergeThread([message], base) };
          });
        }
        router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <div className="unibox-root flex h-dvh flex-col lg:-ml-60 lg:pl-60">
      <header className="flex items-center justify-between pb-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Inbox className="size-4" aria-hidden /></span>
          Unibox
        </h1>
        <span className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground">{unread} unread</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(240px,320px)_1fr] overflow-hidden rounded-xl border bg-card">
        <div className={`min-h-0 overflow-y-auto border-r border-border/60 ${activeId ? "hidden md:block" : "block"}`}>
          {initial.length === 0 && (
            <EmptyState
              icon={Inbox}
              title="No replies yet"
              description="When prospects reply to your campaigns, conversations appear here in Unibox."
              className="m-4 border-0 bg-transparent py-10"
            />
          )}
          {initial.map((r) => {
            const name = r.fromName || r.fromEmail.split("@")[0];
            const isUnread = !r.readAt;
            const isActive = activeId === r.id;
            return (
              <button key={r.id} type="button" onClick={() => setActiveId(r.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-border/50 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isActive ? "bg-accent/60" : "hover:bg-accent/30"} ${isUnread ? "bg-primary/[0.04]" : ""}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-[13px] ${isUnread ? "font-semibold" : "font-medium"}`}>{name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{r.receivedAt ? formatDistanceToNow(new Date(r.receivedAt), { addSuffix: true }) : ""}</span>
                </span>
                <span className={`truncate text-xs ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>{r.subject || "(no subject)"}</span>
                <span className="line-clamp-1 text-[11px] text-muted-foreground/80">{messagePreview(r.snippet || r.bodyText)}</span>
              </button>
            );
          })}
        </div>

        <div className={`flex min-h-0 flex-col bg-card/40 ${activeId ? "flex" : "hidden md:flex"}`}>
          {activeId ? (
            (() => {
              const r = initial.find((x) => x.id === activeId);
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
                    <button type="button" aria-label="Back to conversations" onClick={() => setActiveId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
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
