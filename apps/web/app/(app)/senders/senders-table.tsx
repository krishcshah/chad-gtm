"use client";

import { useState } from "react";
import { MoreHorizontal, Pause, PanelRight, Play, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  statusVariant,
} from "@smartreach/ui";
import { connectionSummary, type SenderRow } from "./sender-types";
import { useSenderActions } from "./use-sender-actions";

export function SendersTable({
  senders,
  selectedIds,
  onSelectedChange,
  onOpen,
}: {
  senders: SenderRow[];
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  onOpen: (id: string) => void;
}) {
  const { toggle, remove, togglingId } = useSenderActions();
  // Target survives the dialog's close animation; `confirmOpen` drives visibility.
  const [deleting, setDeleting] = useState<SenderRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const visibleIds = senders.map((s) => s.id);
  const selectedVisible = visibleIds.filter((id) => selectedIds.includes(id));
  const allChecked = selectedVisible.length > 0 && selectedVisible.length === visibleIds.length;
  const headerState = allChecked ? true : selectedVisible.length > 0 ? "indeterminate" : false;

  const setRow = (id: string, checked: boolean) =>
    onSelectedChange(checked ? [...selectedIds.filter((x) => x !== id), id] : selectedIds.filter((x) => x !== id));

  const setAll = (checked: boolean) =>
    onSelectedChange(
      checked
        ? Array.from(new Set([...selectedIds, ...visibleIds]))
        : selectedIds.filter((id) => !visibleIds.includes(id)),
    );

  return (
    <>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pr-0">
                <Checkbox
                  checked={headerState}
                  onCheckedChange={(v) => setAll(v === true)}
                  aria-label={allChecked ? "Deselect all mailboxes" : "Select all mailboxes"}
                />
              </TableHead>
              <TableHead>Mailbox</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Connection</TableHead>
              <TableHead className="hidden w-[22%] sm:table-cell">Sent today</TableHead>
              <TableHead className="hidden text-right md:table-cell">Replies</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {senders.map((s) => {
              const selected = selectedIds.includes(s.id);
              const pct = s.dailyLimit > 0 ? Math.min(100, Math.round((s.usedToday / s.dailyLimit) * 100)) : 0;
              const conn = connectionSummary(s);
              const paused = s.status === "paused";
              return (
                <TableRow key={s.id} data-state={selected ? "selected" : undefined}>
                  <TableCell className="w-10 pr-0">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(v) => setRow(s.id, v === true)}
                      aria-label={`Select ${s.email}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <button
                      type="button"
                      onClick={() => onOpen(s.id)}
                      className="block w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                    >
                      <span className="block truncate font-medium hover:underline">{s.senderName || s.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.email}</span>
                    </button>
                    {/* Status and usage move under the name on small screens. */}
                    <div className="mt-1.5 flex items-center gap-2 sm:hidden">
                      <Badge variant={statusVariant(s.status)} dot className="capitalize">
                        {s.status}
                      </Badge>
                      <span className="tabular text-xs text-subtle-foreground">
                        {s.usedToday.toLocaleString()} / {s.dailyLimit.toLocaleString()} today
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={statusVariant(s.status)} dot className="capitalize">
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant={conn.variant} title={conn.detail}>
                      {conn.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-3">
                      <Progress
                        value={pct}
                        className="h-1.5 flex-1"
                        aria-label={`${s.usedToday} of ${s.dailyLimit} sent today`}
                      />
                      <span className="tabular w-16 shrink-0 text-right text-xs text-muted-foreground">
                        {s.usedToday.toLocaleString()} / {s.dailyLimit.toLocaleString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular hidden text-right font-medium md:table-cell">
                    {s.repliedCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="w-12 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${s.email}`}
                          loading={togglingId === s.id}
                        >
                          {togglingId === s.id ? null : <MoreHorizontal />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onOpen(s.id)}>
                          <PanelRight />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void toggle(s)}>
                          {paused ? <Play /> : <Pause />}
                          {paused ? "Resume sending" : "Pause sending"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          destructive
                          onSelect={() => {
                            setDeleting(s);
                            setConfirmOpen(true);
                          }}
                        >
                          <Trash2 />
                          Delete mailbox
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive
        title={`Delete ${deleting?.email ?? "this mailbox"}?`}
        description="Campaigns stop sending from this mailbox straight away. Emails already sent and replies already received are kept."
        confirmLabel="Delete mailbox"
        onConfirm={async () => {
          if (deleting) await remove(deleting);
        }}
      />
    </>
  );
}
