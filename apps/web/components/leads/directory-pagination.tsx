"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button, NativeSelect } from "@smartreach/ui";

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/** Range, rows-per-page and page controls under the results table. */
export function DirectoryPagination({
  page,
  pageSize,
  total,
  totalPages,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pages = Math.max(1, totalPages);
  const from = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  const atStart = page <= 1 || isLoading;
  const atEnd = page >= pages || isLoading;
  const sizes: number[] = PAGE_SIZE_OPTIONS.includes(pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? [...PAGE_SIZE_OPTIONS]
    : [...PAGE_SIZE_OPTIONS, pageSize].sort((a, b) => a - b);

  return (
    <nav
      aria-label="Pagination"
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-2.5 sm:px-6"
    >
      <p className="tabular text-[13px] text-muted-foreground">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>

      <div className="flex items-center gap-4">
        <label className="hidden items-center gap-2 text-[13px] text-muted-foreground sm:flex">
          Rows per page
          <NativeSelect
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={isLoading}
            className="h-8 w-[76px] text-[13px]"
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(1)}
            disabled={atStart}
            aria-label="First page"
            className="hidden sm:inline-flex"
          >
            <ChevronsLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onPageChange(page - 1)} disabled={atStart} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span className="tabular px-1.5 text-[13px] text-foreground" aria-current="page">
            Page {page.toLocaleString()} of {pages.toLocaleString()}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => onPageChange(page + 1)} disabled={atEnd} aria-label="Next page">
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(pages)}
            disabled={atEnd}
            aria-label="Last page"
            className="hidden sm:inline-flex"
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}
