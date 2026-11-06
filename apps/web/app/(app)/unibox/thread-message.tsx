"use client";

import { format } from "date-fns";
import { Badge, cn } from "@smartreach/ui";
import { threadDayKey, threadDayLabel } from "@/lib/message-body";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";
import { initials, messageAuthor } from "./inbox-utils";
import { EmailBody } from "./message-body";

const ROLE_LABEL = { lead: null, you: "You", agent: "Agent", campaign: "Campaign" } as const;

function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "h:mm a");
}

/** One email in a conversation. Messages from you, the agent or the campaign sit on a muted surface. */
export function ThreadMessage({ message }: { message: UniboxThreadMessage }) {
  const author = messageAuthor(message);
  const ours = author.role !== "lead";
  const roleLabel = ROLE_LABEL[author.role];
  const time = clockTime(message.sentAt);
  const pending = message.id.startsWith("operator:pending:");

  return (
    <article
      className={cn(
        "rounded-xl border p-4",
        ours ? "border-border bg-muted/50 sm:ml-10" : "border-border bg-card shadow-xs sm:mr-10",
        pending && "opacity-70",
      )}
      aria-label={`${author.name}${roleLabel && roleLabel !== author.name ? ` (${roleLabel})` : ""}, ${time}`}
    >
      <header className="mb-3 flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ring-1 ring-inset",
            author.role === "agent"
              ? "bg-brand-soft text-brand-text ring-brand/20"
              : "bg-muted text-muted-foreground ring-border",
          )}
        >
          {initials(author.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">{author.name}</span>
            {roleLabel && roleLabel !== author.name ? (
              <Badge variant={author.role === "agent" ? "brand" : "neutral"}>{roleLabel}</Badge>
            ) : null}
          </div>
          {message.fromEmail && message.fromEmail !== author.name ? (
            <p className="truncate text-xs text-subtle-foreground">{message.fromEmail}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-xs text-subtle-foreground">
          {pending ? "Sending…" : time ? <time dateTime={message.sentAt}>{time}</time> : null}
        </span>
      </header>
      <EmailBody html={message.bodyHtml || null} text={message.bodyText || null} />
    </article>
  );
}

/** Messages grouped under day dividers ("Today", "Yesterday", "Mon, Sep 7"). */
export function ThreadTranscript({ messages }: { messages: UniboxThreadMessage[] }) {
  const nodes: React.ReactNode[] = [];
  let lastDay = "";
  for (const m of messages) {
    const key = threadDayKey(m.sentAt);
    if (key !== lastDay) {
      lastDay = key;
      const label = threadDayLabel(m.sentAt);
      if (label) {
        nodes.push(
          <li key={`day-${key}`} className="flex items-center gap-3 py-1" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="shrink-0 text-xs font-medium text-subtle-foreground">{label}</span>
            <span className="h-px flex-1 bg-border" />
          </li>,
        );
      }
    }
    nodes.push(
      <li key={m.id}>
        <ThreadMessage message={m} />
      </li>,
    );
  }
  return <ol className="flex flex-col gap-4">{nodes}</ol>;
}
