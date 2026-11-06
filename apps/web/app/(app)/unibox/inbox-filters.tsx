"use client";

import { Inbox, Mail, MessageSquareWarning, type LucideIcon } from "lucide-react";
import { UNIBOX_REPLY_TAGS } from "@smartreach/shared";
import {
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusDot,
  cn,
} from "@smartreach/ui";
import { tagLabel, tagVariant, type InboxView } from "./inbox-utils";

export interface ViewCounts {
  all: number;
  unread: number;
  needs_you: number;
}

const VIEWS: { value: InboxView; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "All conversations", icon: Inbox },
  { value: "unread", label: "Unread", icon: Mail },
  { value: "needs_you", label: "Needs you", icon: MessageSquareWarning },
];

const SHORT_LABEL: Record<InboxView, string> = { all: "All", unread: "Unread", needs_you: "Needs you" };

function dotTone(tag: string) {
  const v = tagVariant(tag);
  return v === "success" || v === "info" || v === "warning" || v === "destructive" ? v : "neutral";
}

/** Left rail on wide screens: views and tags. */
export function InboxFolders({
  view,
  onView,
  tag,
  onTag,
  counts,
}: {
  view: InboxView;
  onView: (view: InboxView) => void;
  tag: string;
  onTag: (tag: string) => void;
  counts: ViewCounts;
}) {
  return (
    <nav aria-label="Inbox folders" className="hidden w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-background px-3 py-4 xl:flex">
      <ul className="flex flex-col gap-0.5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.value;
          return (
            <li key={v.value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onView(v.value)}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
                  active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{v.label}</span>
                {counts[v.value] > 0 ? (
                  <span className="tabular text-xs text-subtle-foreground">{counts[v.value].toLocaleString()}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        <p className="px-2 pb-1.5 text-xs font-medium text-subtle-foreground">Tags</p>
        <ul className="flex flex-col gap-0.5">
          {["", ...UNIBOX_REPLY_TAGS].map((t) => {
            const active = tag === t;
            return (
              <li key={t || "any"}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onTag(t)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
                    active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t ? <StatusDot tone={dotTone(t)} className="mx-1" /> : <span className="mx-1 size-2 rounded-full ring-1 ring-inset ring-border-strong" aria-hidden />}
                  <span className="truncate">{t ? tagLabel(t) : "Any tag"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/** The same filters, compact, above the list on narrower screens. */
export function InboxFilterBar({
  view,
  onView,
  tag,
  onTag,
  counts,
}: {
  view: InboxView;
  onView: (view: InboxView) => void;
  tag: string;
  onTag: (tag: string) => void;
  counts: ViewCounts;
}) {
  return (
    <div className="flex items-center gap-2 xl:hidden">
      <SegmentedControl<InboxView>
        size="sm"
        aria-label="Show"
        value={view}
        onValueChange={onView}
        options={VIEWS.map((v) => ({
          value: v.value,
          label:
            v.value !== "all" && counts[v.value] > 0 ? (
              <>
                {SHORT_LABEL[v.value]} <span className="tabular text-subtle-foreground">{counts[v.value]}</span>
              </>
            ) : (
              SHORT_LABEL[v.value]
            ),
        }))}
        className="min-w-0 flex-1 [&>button]:flex-1 [&>button]:px-1.5"
      />
      <Select value={tag || "all"} onValueChange={(value) => onTag(value === "all" ? "" : value)}>
        <SelectTrigger className="h-8 w-[7.5rem] shrink-0 text-xs" aria-label="Filter by tag">
          <SelectValue placeholder="Any tag" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="all">Any tag</SelectItem>
          {UNIBOX_REPLY_TAGS.map((t) => (
            <SelectItem key={t} value={t}>
              {tagLabel(t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
