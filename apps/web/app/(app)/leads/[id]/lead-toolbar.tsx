"use client";

import { useEffect, useRef } from "react";
import { Download, Search, Trash2, X } from "lucide-react";
import { Button, Input, Kbd, Spinner } from "@smartreach/ui";
import { LeadStatusFilter } from "./lead-status";
import { TagMenu, type TagOpt } from "./lead-tags";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Search, status filter and export for the lead table. */
export function LeadToolbar({
  search,
  status,
  filtered,
  loading,
  selectedCount,
  onSearch,
  onStatus,
  onClearFilters,
  onExport,
}: {
  search: string;
  status: string;
  filtered: boolean;
  loading: boolean;
  selectedCount: number;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onClearFilters: () => void;
  onExport: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search, like most list tools.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector("[role=dialog]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasSelection = selectedCount > 0;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:w-80">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
          aria-hidden
        />
        <Input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && search) {
              e.preventDefault();
              onSearch("");
            }
          }}
          placeholder="Search email, name or company"
          aria-label="Search leads by email, name, or company"
          className="pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:block">
          {loading ? <Spinner /> : <Kbd aria-hidden>/</Kbd>}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 sm:flex-none">
          <LeadStatusFilter value={status} onChange={onStatus} />
        </div>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        className={hasSelection ? "invisible self-start sm:ml-auto sm:self-auto" : "self-start sm:ml-auto sm:self-auto"}
      >
        <Download />
        Export CSV
      </Button>
    </div>
  );
}

/** Floating bar with bulk actions; pinned to the bottom of the table while rows are selected. */
export function BulkActionBar({
  selectedCount,
  busy,
  tags,
  onClearSelection,
  onExport,
  onTag,
  onNewTag,
  onDelete,
}: {
  selectedCount: number;
  busy: boolean;
  tags: TagOpt[];
  onClearSelection: () => void;
  onExport: () => void;
  onTag: (tagId: string, mode: "add" | "remove") => void;
  onNewTag: () => void;
  onDelete: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border border-border bg-popover p-1.5 pl-3 text-popover-foreground shadow-lg"
    >
      <span className="tabular mr-1 text-[13px] font-medium" aria-live="polite">
        {selectedCount.toLocaleString()} selected
      </span>
      <TagMenu tags={tags} disabled={busy} onTag={onTag} onNew={onNewTag} />
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download />
        Export
      </Button>
      <Button variant="destructive-outline" size="sm" onClick={onDelete} disabled={busy}>
        <Trash2 />
        Delete
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onClearSelection} aria-label="Clear selection">
        <X />
      </Button>
    </div>
  );
}
