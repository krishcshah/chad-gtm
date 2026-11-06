"use client";

import { forwardRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { UNIBOX_REPLY_TAGS, type UniboxReplyTag } from "@smartreach/shared";
import {
  Alert,
  Button,
  Kbd,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@smartreach/ui";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";
import { displayName, tagLabel, type ReplyRow } from "./inbox-utils";
import { ThreadTranscript } from "./thread-message";

/** Right pane: who the conversation is with, its tag, the transcript and (as `composer`) the reply box. */
export const ConversationView = forwardRef<
  HTMLDivElement,
  {
    reply: ReplyRow;
    /** Set when any reply in this conversation is waiting on you (agent escalated it). */
    escalation: { summary: string | null } | null;
    tag: string | null;
    messages: UniboxThreadMessage[];
    loading: boolean;
    tagPending: boolean;
    onTag: (tag: UniboxReplyTag | null) => void;
    onBack: () => void;
    composer: ReactNode;
  }
>(function ConversationView({ reply, escalation, tag, messages, loading, tagPending, onTag, onBack, composer }, scrollerRef) {
  const name = displayName(reply);
  const escalated = escalation !== null;
  const agentReplied = !escalated && reply.agentStatus === "replied";
  const agentNote = escalated ? escalation.summary : reply.agentSummary;

  return (
    <section aria-label={`Conversation with ${name}`} className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <header className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
        <Button variant="ghost" size="icon-sm" className="-ml-2 shrink-0 md:hidden" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[15px] font-semibold leading-snug tracking-[-0.01em]">
            {reply.subject || "(no subject)"}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {name} <span className="text-subtle-foreground">&lt;{reply.fromEmail}&gt;</span>
          </p>
          {reply.campaignName || reply.senderEmail ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle-foreground">
              {reply.campaignName ? (
                reply.campaignId ? (
                  <Link
                    href={`/campaigns/${reply.campaignId}`}
                    className="underline decoration-border-strong underline-offset-2 hover:text-foreground hover:decoration-foreground"
                  >
                    {reply.campaignName}
                  </Link>
                ) : (
                  <span>{reply.campaignName}</span>
                )
              ) : null}
              {reply.campaignName && reply.senderEmail ? <span aria-hidden>·</span> : null}
              {reply.senderEmail ? <span className="truncate">Received at {reply.senderEmail}</span> : null}
            </p>
          ) : null}
        </div>
        <Select
          value={tag ?? "none"}
          onValueChange={(value) => onTag(value === "none" ? null : (value as UniboxReplyTag))}
          disabled={tagPending}
        >
          <SelectTrigger className="h-8 w-[8.5rem] shrink-0 text-[13px] sm:w-40" aria-label="Tag this conversation">
            <SelectValue placeholder="No tag" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="none">No tag</SelectItem>
            {UNIBOX_REPLY_TAGS.map((t) => (
              <SelectItem key={t} value={t}>
                {tagLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-5 sm:px-6">
        {escalated || (agentReplied && reply.agentSummary) ? (
          <Alert
            variant={escalated ? "warning" : "default"}
            className="mb-5"
            action={
              escalated ? (
                <Button asChild size="xs" variant="outline">
                  <Link href="/requests">Open Needs you</Link>
                </Button>
              ) : undefined
            }
          >
            <p className="font-medium">{escalated ? "The agent is waiting for you" : "The agent replied"}</p>
            {agentNote ? <p className="mt-0.5 text-[13px] text-muted-foreground">{agentNote}</p> : null}
          </Alert>
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-3.5 w-40" />
                </div>
                <Skeleton className="mt-4 h-3.5 w-full" />
                <Skeleton className="mt-2 h-3.5 w-4/5" />
                <Skeleton className="mt-2 h-3.5 w-2/3" />
              </div>
            ))}
            <span className="sr-only">Loading conversation</span>
          </div>
        ) : (
          <ThreadTranscript messages={messages} />
        )}
      </div>

      {composer}
    </section>
  );
});

/** Shown in the right pane when nothing is selected (tablet and desktop only). */
export function NoConversation() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background p-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <Inbox className="size-5" aria-hidden />
      </span>
      <div>
        <p className="text-[15px] font-semibold">Pick a conversation</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">Read the thread, tag it and reply from here.</p>
      </div>
      <p className="hidden items-center gap-1.5 text-xs text-subtle-foreground lg:flex">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd>
        to move, <Kbd>/</Kbd> to search, <Kbd>R</Kbd> to reply
      </p>
    </div>
  );
}
