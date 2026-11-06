"use client";

import { MoreHorizontal, Pencil, SearchX, Trash2 } from "lucide-react";
import { timeAgo } from "@smartreach/shared";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@smartreach/ui";
import type { LeadRow } from "./lead-table";
import { LeadStatusSelect } from "./lead-status";
import { LeadTagChips, type TagOpt } from "./lead-tags";

function fullName(row: LeadRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ");
}

function addedAt(value: LeadRow["createdAt"]) {
  if (!value) return null;
  const iso = typeof value === "string" ? value : value.toISOString();
  return { iso, label: timeAgo(iso) };
}

export function LeadRowsTable({
  rows,
  selected,
  tagById,
  loading,
  statusDisabled,
  filtered,
  onToggleAll,
  onToggleOne,
  onEdit,
  onDelete,
  onStatusChange,
  onClearFilters,
}: {
  rows: LeadRow[];
  selected: Set<string>;
  tagById: Record<string, TagOpt>;
  loading: boolean;
  statusDisabled: boolean;
  filtered: boolean;
  onToggleAll: (checked: boolean) => void;
  onToggleOne: (id: string, checked: boolean) => void;
  onEdit: (row: LeadRow) => void;
  onDelete: (row: LeadRow) => void;
  onStatusChange: (leadId: string, status: string) => void;
  onClearFilters: () => void;
}) {
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <TableContainer
      aria-busy={loading || undefined}
      className={cn("transition-opacity", loading && "opacity-60")}
    >
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 pr-0">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(v) => onToggleAll(v === true)}
                disabled={rows.length === 0}
                aria-label="Select all leads shown"
              />
            </TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="p-0">
                {loading ? (
                  <p className="px-5 py-16 text-center text-sm text-muted-foreground" role="status">
                    Loading leads…
                  </p>
                ) : (
                  <EmptyState
                    compact
                    icon={SearchX}
                    title={filtered ? "No leads match these filters" : "No leads to show"}
                    description={filtered ? "Try a different search or status." : undefined}
                    action={
                      filtered ? (
                        <Button variant="outline" size="sm" onClick={onClearFilters}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const name = fullName(r);
              const added = addedAt(r.createdAt);
              const isSelected = selected.has(r.id);
              return (
                <TableRow key={r.id} data-state={isSelected ? "selected" : undefined}>
                  <TableCell className="w-10 py-2 pr-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(v) => onToggleOne(r.id, v === true)}
                      aria-label={`Select ${r.email}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-[18rem] py-2">
                    <button
                      type="button"
                      onClick={() => onEdit(r)}
                      className="block max-w-full truncate rounded-sm text-left font-medium text-foreground outline-none hover:underline hover:decoration-border-strong hover:underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring"
                      title={r.email}
                    >
                      {r.email}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-[14rem] py-2">
                    {name || r.jobTitle ? (
                      <div className="min-w-0">
                        <div className="truncate">{name || "—"}</div>
                        {r.jobTitle ? (
                          <div className="truncate text-xs text-subtle-foreground">{r.jobTitle}</div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-subtle-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[12rem] py-2">
                    {r.company ? (
                      <span className="block truncate text-muted-foreground">{r.company}</span>
                    ) : (
                      <span className="text-subtle-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <LeadStatusSelect
                      status={r.status}
                      email={r.email}
                      disabled={statusDisabled}
                      onChange={(next) => onStatusChange(r.id, next)}
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <LeadTagChips tagIds={r.tags} tagById={tagById} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-xs text-subtle-foreground">
                    {added ? (
                      // Relative time is computed on the server and again on the client.
                      <time dateTime={added.iso} suppressHydrationWarning>
                        {added.label}
                      </time>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="py-1.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.email}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onEdit(r)}>
                          <Pencil />
                          Edit lead
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => onDelete(r)}>
                          <Trash2 />
                          Delete lead
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
