"use client";

import * as React from "react";
import { MoreHorizontal, Search, SearchX } from "lucide-react";
import { Button, EmptyState, Input, cn } from "@smartreach/ui";

/** Search box used in every admin toolbar. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name; the placeholder is not a label. */
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-9"
      />
    </div>
  );
}

/** Toolbar row above a table: filters on the left, actions on the right. Wraps on small screens. */
export function Toolbar({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Shown inside a table card when filters hide every row. */
export function NoMatches({ onClear, what }: { onClear: () => void; what: string }) {
  return (
    <EmptyState
      compact
      icon={SearchX}
      title={`No ${what} match these filters`}
      description="Try a different search or clear the filters."
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}

/** The "..." button that opens a row's DropdownMenu. Use inside DropdownMenuTrigger asChild. */
export const RowActionsButton = React.forwardRef<HTMLButtonElement, { label: string; disabled?: boolean }>(
  ({ label, disabled, ...props }, ref) => (
    <Button ref={ref} variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} {...props}>
      <MoreHorizontal />
    </Button>
  ),
);
RowActionsButton.displayName = "RowActionsButton";

/** Quote a value for CSV: always wrapped, inner quotes doubled. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** Build a CSV file in the browser and download it. */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Only http(s) links from user-submitted reports become clickable. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Today's date as YYYY-MM-DD, for export file names. */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Count rows per status for filter labels. */
export function countBy<T, K extends string>(rows: T[], key: (row: T) => K): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** "Showing 1–25 of 140" footer with previous/next buttons. */
export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
  noun,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  noun: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return (
      <div className="border-t border-border px-5 py-3 text-xs text-subtle-foreground">
        {total.toLocaleString()} {noun}
      </div>
    );
  }
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
      <p className="tabular text-xs text-muted-foreground">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="tabular text-xs text-muted-foreground">
          {page} / {pages}
        </span>
        <Button variant="outline" size="xs" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** Statuses shared by support tickets and bug reports. Labels match the user-facing support pages. */
export const WORK_STATUSES = [
  { value: "open", label: "Open", variant: "info" },
  { value: "in_progress", label: "Ongoing", variant: "warning" },
  { value: "resolved", label: "Resolved", variant: "success" },
  { value: "closed", label: "Closed", variant: "outline" },
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number]["value"];

export function workStatusMeta(status: string) {
  return WORK_STATUSES.find((s) => s.value === status) ?? WORK_STATUSES[0];
}

/** Filter option label with a quiet count: "Open 4". */
export function withCount(label: string, count: number) {
  return (
    <>
      {label}
      <span className="tabular text-subtle-foreground">{count.toLocaleString()}</span>
    </>
  );
}
