"use client";

import { forwardRef } from "react";
import { Inbox, Search, SearchX } from "lucide-react";
import { timeAgo } from "@smartreach/shared";
import { Badge, Button, EmptyState, Input, Kbd, cn } from "@smartreach/ui";
import { messagePreview } from "@/lib/message-body";
import type { UniboxConversation } from "@/lib/unibox-conversations";
import { InboxFilterBar, type ViewCounts } from "./inbox-filters";
import { displayName, initials, tagLabel, tagVariant, type InboxView, type ReplyRow } from "./inbox-utils";

export interface ListConversation extends UniboxConversation<ReplyRow> {
  needsYou: boolean;
}

/** Middle pane: search, compact filters and the conversation rows. */
export const ConversationList = forwardRef<
  HTMLInputElement,
  {
    conversations: ListConversation[];
    totalCount: number;
    activeKey: string | null;
    onSelect: (replyId: string) => void;
    query: string;
    onQuery: (q: string) => void;
    view: InboxView;
    onView: (view: InboxView) => void;
    tag: string;
    onTag: (tag: string) => void;
    counts: ViewCounts;
    onClearFilters: () => void;
  }
>(function ConversationList(
  { conversations, totalCount, activeKey, onSelect, query, onQuery, view, onView, tag, onTag, counts, onClearFilters },
  searchRef,
) {
  const filtered = Boolean(query.trim()) || view !== "all" || Boolean(tag);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Search name, email or subject"
            aria-label="Search conversations"
            className="pl-9 pr-9"
          />
          <Kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 lg:inline-flex" aria-hidden>
            /
          </Kbd>
        </div>
        <InboxFilterBar view={view} onView={onView} tag={tag} onTag={onTag} counts={counts} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          totalCount === 0 && !tag ? (
            <EmptyState
              compact
              icon={Inbox}
              title="No replies yet"
              description="When leads reply to your campaigns, the conversations show up here."
            />
          ) : (
            <EmptyState
              compact
              icon={SearchX}
              title="No conversations match"
              description={tag ? `Nothing tagged "${tagLabel(tag)}" matches these filters.` : "Try another search or filter."}
              action={
                filtered ? (
                  <Button variant="outline" size="sm" onClick={onClearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            <p className="sr-only" aria-live="polite">
              {conversations.length} conversations
            </p>
            <ul className="divide-y divide-border">
              {conversations.map((c) => (
                <ConversationRow key={c.key} conversation={c} active={c.key === activeKey} onSelect={onSelect} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
});

function ConversationRow({
  conversation: c,
  active,
  onSelect,
}: {
  conversation: ListConversation;
  active: boolean;
  onSelect: (replyId: string) => void;
}) {
  const r = c.latest;
  const name = displayName(r);
  const count = c.memberIds.length;
  return (
    <li data-conversation={c.key}>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(r.id)}
        className={cn(
          "relative flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring",
          active ? "bg-muted" : "hover:bg-muted/60",
        )}
      >
        {active ? <span className="absolute inset-y-0 left-0 w-0.5 bg-brand" aria-hidden /> : null}
        <span
          aria-hidden
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border"
        >
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("truncate text-[13px] text-foreground", c.unread ? "font-semibold" : "font-medium")}>{name}</span>
            {count > 1 ? (
              <span className="tabular shrink-0 text-xs text-subtle-foreground" aria-label={`${count} replies`}>
                {count}
              </span>
            ) : null}
            <time dateTime={r.receivedAt} className="ml-auto shrink-0 text-xs text-subtle-foreground" suppressHydrationWarning>
              {timeAgo(r.receivedAt)}
            </time>
          </span>
          <span className={cn("mt-0.5 block truncate text-[13px]", c.unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {r.subject || "(no subject)"}
          </span>
          <span className="mt-0.5 line-clamp-1 text-[13px] text-subtle-foreground">{messagePreview(r.snippet || r.bodyText)}</span>
          {c.needsYou || r.agentStatus === "replied" || c.tag ? (
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              {c.needsYou ? (
                <Badge variant="warning" dot title={r.agentSummary || undefined}>
                  Needs you
                </Badge>
              ) : r.agentStatus === "replied" ? (
                <Badge variant="neutral" title={r.agentSummary || undefined}>
                  Agent replied
                </Badge>
              ) : null}
              {c.tag ? <Badge variant={tagVariant(c.tag)}>{tagLabel(c.tag)}</Badge> : null}
            </span>
          ) : null}
        </span>
        {c.unread ? (
          <span className="mt-2 flex shrink-0 items-center">
            <span className="size-2 rounded-full bg-brand" aria-hidden />
            <span className="sr-only">Unread</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}
