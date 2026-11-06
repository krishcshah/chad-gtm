"use client";

import * as React from "react";
import { Download, ListPlus, SlidersHorizontal, X } from "lucide-react";
import { Badge, Button } from "@smartreach/ui";
import type { ActiveFilterChip } from "./directory-utils";

interface DirectoryToolbarProps {
  total: number;
  isLoading: boolean;
  chips: ActiveFilterChip[];
  onRemoveChip: (chip: ActiveFilterChip) => void;
  onClearFilters: () => void;
  /** Opens the filter sheet below the lg breakpoint. */
  onOpenFilters: () => void;
  selectedCount: number;
  isSelectAllMatching: boolean;
  pageCount: number;
  allPageSelected: boolean;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onExport: () => void;
  isExporting: boolean;
  exportDisabled: boolean;
  onAddToList: () => void;
}

/** Result count, active filters, selection state and the bulk actions. */
export function DirectoryToolbar({
  total,
  isLoading,
  chips,
  onRemoveChip,
  onClearFilters,
  onOpenFilters,
  selectedCount,
  isSelectAllMatching,
  pageCount,
  allPageSelected,
  onSelectAllMatching,
  onClearSelection,
  onExport,
  isExporting,
  exportDisabled,
  onAddToList,
}: DirectoryToolbarProps) {
  const effectiveSelected = isSelectAllMatching ? total : selectedCount;
  const hasSelection = effectiveSelected > 0;

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="outline" size="sm" className="lg:hidden" onClick={onOpenFilters}>
          <SlidersHorizontal />
          Filters
          {chips.length > 0 ? <Badge variant="solid">{chips.length}</Badge> : null}
        </Button>

        <div className="min-w-0 flex-1 text-[13px]" aria-live="polite">
          {hasSelection ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-foreground">
                <span className="tabular">{effectiveSelected.toLocaleString()}</span> selected
                {isSelectAllMatching ? <span className="font-normal text-muted-foreground"> (every match)</span> : null}
              </span>
              {!isSelectAllMatching && allPageSelected && total > pageCount ? (
                <button
                  type="button"
                  onClick={onSelectAllMatching}
                  className="rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  Select all {total.toLocaleString()} matches
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClearSelection}
                className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                Clear selection
              </button>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {isLoading ? (
                "Searching…"
              ) : (
                <>
                  <span className="tabular font-medium text-foreground">{total.toLocaleString()}</span>{" "}
                  {total === 1 ? "person" : "people"}
                  {chips.length > 0 ? " match your filters" : " in the directory"}
                </>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            loading={isExporting}
            disabled={exportDisabled}
            title={hasSelection ? "Download the selected people as CSV" : "Download this page as CSV"}
          >
            {!isExporting ? <Download /> : null}
            {hasSelection ? "Export selected" : "Export page"}
          </Button>
          {hasSelection ? (
            <Button size="sm" onClick={onAddToList}>
              <ListPlus />
              Add to list
            </Button>
          ) : null}
        </div>
      </div>

      {chips.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.id}>
              <span className="inline-flex h-7 max-w-[260px] items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs text-foreground ring-1 ring-inset ring-border">
                <span className="truncate">{chip.label}</span>
                <button
                  type="button"
                  onClick={() => onRemoveChip(chip)}
                  aria-label={`Remove filter ${chip.label}`}
                  className="grid size-5 shrink-0 place-items-center rounded-full text-subtle-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
          <li>
            <Button variant="ghost" size="xs" onClick={onClearFilters}>
              Clear all
            </Button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
