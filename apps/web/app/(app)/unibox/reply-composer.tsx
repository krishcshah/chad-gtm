"use client";

import { forwardRef, useId, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, PenLine, SendHorizonal } from "lucide-react";
import { Badge, Button, Kbd, Textarea, cn } from "@smartreach/ui";

export interface ComposerQuote {
  fromName: string;
  fromEmail: string;
  receivedAt: string;
  text: string;
}

/**
 * Reply box pinned under the conversation. The server sends only the new text
 * and appends the lead's last message as a quote; the preview shows that quote.
 */
export const ReplyComposer = forwardRef<
  HTMLTextAreaElement,
  {
    recipientName: string;
    recipientEmail: string;
    senderLabel: string | null;
    body: string;
    onBodyChange: (value: string) => void;
    onSend: () => void;
    sending: boolean;
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    quote: ComposerQuote;
  }
>(function ReplyComposer(
  { recipientName, recipientEmail, senderLabel, body, onBodyChange, onSend, sending, collapsed, onCollapsedChange, quote },
  ref,
) {
  const id = useId();
  const [showQuote, setShowQuote] = useState(false);
  const firstName = recipientName.split(" ")[0] || recipientName;
  const hasDraft = body.trim().length > 0;
  const when = (() => {
    const d = new Date(quote.receivedAt);
    return Number.isNaN(d.getTime()) ? "earlier" : format(d, "EEE, MMM d, yyyy 'at' h:mm a");
  })();

  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className="flex h-10 w-full items-center gap-2 rounded-md border border-border-strong bg-card px-3 text-left text-[13px] text-muted-foreground shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <PenLine className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Reply to {recipientName}</span>
          {hasDraft ? (
            <Badge variant="neutral" className="ml-auto">
              Draft
            </Badge>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <form
      className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          To <span className="font-medium text-foreground">{recipientName}</span>
          <span className="hidden sm:inline"> &lt;{recipientEmail}&gt;</span>
          {senderLabel ? (
            <>
              {" "}
              from <span className="font-medium text-foreground">{senderLabel}</span>
            </>
          ) : null}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onCollapsedChange(true)}
          aria-label="Minimise reply box"
          title="Minimise"
        >
          <ChevronDown aria-hidden />
        </Button>
      </div>

      <label htmlFor={id} className="sr-only">
        Reply to {recipientName}
      </label>
      <Textarea
        ref={ref}
        id={id}
        rows={3}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={`Write a reply to ${firstName}…`}
        className="mt-2 max-h-48 min-h-[84px] resize-y"
      />

      {showQuote ? (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border-l-2 border-border-strong bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">
            On {when}, {quote.fromName || quote.fromEmail} &lt;{quote.fromEmail}&gt; wrote:
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words">{quote.text || "(No text)"}</p>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={showQuote}
          onClick={() => setShowQuote((v) => !v)}
          className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", showQuote && "rotate-90")} aria-hidden />
          {showQuote ? "Hide quoted message" : "Their message is quoted below your reply"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-subtle-foreground md:inline-flex" aria-hidden>
            <Kbd>⌘</Kbd>
            <Kbd>Enter</Kbd>
          </span>
          {hasDraft ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onBodyChange("")} disabled={sending}>
              Discard
            </Button>
          ) : null}
          <Button type="submit" size="sm" loading={sending} disabled={!hasDraft}>
            {sending ? null : <SendHorizonal aria-hidden />}
            {sending ? "Sending" : "Send reply"}
          </Button>
        </div>
      </div>
    </form>
  );
});
