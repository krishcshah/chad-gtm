"use client";

import { forwardRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, Inbox, MailOpen } from "lucide-react";
import { UNIBOX_REPLY_TAGS, type UniboxReplyTag } from "@smartreach/shared";
import {
  Alert,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Kbd,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@smartreach/ui";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";
import {
  HAND_BACK_LABEL,
  TAKE_OVER_LABEL,
  handledByLabel,
  handlerHint,
  type ConversationModeReason,
  type HandledBy,
} from "@/lib/lead-conversations";
import { displayName, tagEffect, tagLabel, type OpenRequestRow, type ReplyRow } from "./inbox-utils";
import { ThreadTranscript } from "./thread-message";

/**
 * What the conversation waits on: an open Needs you card, or the account
 * being on hold (its own state: no card, nothing can be sent yet).
 */
export type WaitingState =
  | { kind: "needs_you"; requestId: string; summary: string | null }
  | { kind: "held"; summary: string | null }
  | null;

/** Right pane: who the conversation is with, its tag, the transcript and (as `composer`) the reply box. */
export const ConversationView = forwardRef<
  HTMLDivElement,
  {
    reply: ReplyRow;
    /** Needs you (an open card) or held (account on hold); null when nothing waits on you. */
    waiting: WaitingState;
    /** The open Needs you card for this conversation, shown inline. */
    request: OpenRequestRow | null;
    /** The lead wrote after the open card's draft was made. */
    leadWroteAgain: boolean;
    /** The agent is about to answer the newest message. */
    agentDrafting: boolean;
    /** Who handles the conversation (null: not part of a campaign). */
    handler: { handledBy: HandledBy; reason: ConversationModeReason; canHandBack: boolean } | null;
    handlerPending: boolean;
    onTakeOver: () => void;
    onHandBack: () => void;
    tag: string | null;
    /** An automatic tag on a reply newer than the tag you set (#86). */
    detectedTag?: string | null;
    messages: UniboxThreadMessage[];
    loading: boolean;
    tagPending: boolean;
    onTag: (tag: UniboxReplyTag | null) => void;
    onBack: () => void;
    /** Mark the conversation unread again. */
    onMarkUnread: () => void;
    /** Done with this one: go to the next conversation. */
    onDone: () => void;
    composer: ReactNode;
  }
>(function ConversationView(
  {
    reply,
    waiting,
    request,
    leadWroteAgain,
    agentDrafting,
    handler,
    handlerPending,
    onTakeOver,
    onHandBack,
    tag,
    detectedTag,
    messages,
    loading,
    tagPending,
    onTag,
    onBack,
    onMarkUnread,
    onDone,
    composer,
  },
  scrollerRef,
) {
  const name = displayName(reply);
  const firstName = name.split(/\s+/)[0] || name;
  const needsYouId = waiting?.kind === "needs_you" ? waiting.requestId : (request?.id ?? null);
  const held = waiting?.kind === "held";
  const isWaiting = needsYouId !== null || held;
  // Who answered the newest message. A person's send never shows the agent's
  // old summary (e.g. a stale escalation reason).
  const answeredBy = isWaiting
    ? null
    : reply.agentStatus === "replied"
      ? "agent"
      : reply.agentStatus === "human_replied"
        ? "you"
        : null;
  // Escalated with no open card (e.g. held for a paused campaign): say why the agent didn't answer.
  const unanswered = !isWaiting && !answeredBy && reply.agentStatus === "escalated";
  const agentNote = answeredBy === "agent" || unanswered ? reply.agentSummary : null;
  const showHandler = handler !== null && handler.reason !== "no_campaign";

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
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={onMarkUnread} aria-label="Mark as unread">
                    <MailOpen aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mark as unread</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="outline" size="sm" onClick={onDone} aria-label="Done, go to next conversation">
              <Check aria-hidden />
              <span className="hidden sm:inline">Done</span>
            </Button>
            {/* A menu, not a Select: each tag shows what it does under its name. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={tagPending}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-[8.5rem] shrink-0 justify-between text-[13px] sm:w-40"
                  aria-label="Tag this conversation"
                >
                  <span className="truncate">{tag ? tagLabel(tag) : "No tag"}</span>
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem onSelect={() => onTag(null)}>
                  <span className="flex-1">No tag</span>
                  {tag == null ? <Check aria-hidden /> : null}
                </DropdownMenuItem>
                {UNIBOX_REPLY_TAGS.map((t) => (
                  <DropdownMenuItem key={t} onSelect={() => onTag(t)} className="items-start">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span>{tagLabel(t)}</span>
                      <span className="text-xs text-muted-foreground">{tagEffect(t)}</span>
                    </span>
                    {tag === t ? <Check aria-hidden /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {detectedTag && detectedTag !== tag ? (
            <div className="flex flex-wrap items-center justify-end gap-1 text-xs text-muted-foreground">
              <span>Detected in the latest reply: {tagLabel(detectedTag)}</span>
              <Button
                variant="ghost"
                size="xs"
                disabled={tagPending}
                onClick={() => onTag(detectedTag as UniboxReplyTag)}
              >
                Use this
              </Button>
            </div>
          ) : null}
          {showHandler ? (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Badge
                variant={handler.handledBy === "you" ? "neutral" : handler.handledBy === "agent" ? "brand" : "info"}
                title={handlerHint(handler.handledBy, handler.reason)}
              >
                {handledByLabel(handler.handledBy)}
              </Badge>
              {handler.handledBy === "you" && handler.reason === "paused" ? (
                <span className="text-xs text-muted-foreground">Agent paused</span>
              ) : null}
              {handler.handledBy !== "you" ? (
                <Button variant="ghost" size="xs" onClick={onTakeOver} loading={handlerPending}>
                  {TAKE_OVER_LABEL}
                </Button>
              ) : handler.canHandBack ? (
                <Button variant="ghost" size="xs" onClick={onHandBack} loading={handlerPending}>
                  {HAND_BACK_LABEL}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-5 sm:px-6">
        {agentDrafting && !isWaiting ? (
          <Alert variant="info" className="mb-5">
            <p className="font-medium">The agent is drafting a reply.</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {handler?.handledBy === "approve"
                ? "The draft appears in the reply box for you to approve."
                : "It goes out in a minute or two unless you take over."}
            </p>
          </Alert>
        ) : null}
        {needsYouId ? (
          <Alert variant="warning" className="mb-5">
            <p className="font-medium">The agent is waiting for you</p>
            {request ? (
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">{request.title}.</span>
                {request.question ? <> What the agent needs: {request.question}</> : null}
              </p>
            ) : waiting?.summary ? (
              <p className="mt-0.5 text-[13px] text-muted-foreground">{waiting.summary}</p>
            ) : null}
            {leadWroteAgain ? (
              <p className="mt-1 text-[13px] font-medium text-foreground">{firstName} wrote again after this was drafted.</p>
            ) : null}
            <p className="mt-1 text-[13px] text-muted-foreground">
              Answer in the reply box below. Sending your reply closes this request.
            </p>
          </Alert>
        ) : held ? (
          <Alert variant="warning" className="mb-5">
            <p className="font-medium">Your account is on hold</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              The agent won&apos;t answer and replies can&apos;t be sent until an admin approves your account. Then this
              conversation moves to Needs you.
            </p>
          </Alert>
        ) : answeredBy || unanswered ? (
          <Alert variant="default" className="mb-5">
            <p className="font-medium">
              {answeredBy === "you" ? "You replied" : answeredBy === "agent" ? "The agent replied" : "The agent didn't answer"}
            </p>
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
        to move, <Kbd>/</Kbd> to search, <Kbd>R</Kbd> to reply, <Kbd>E</Kbd> done
      </p>
    </div>
  );
}
