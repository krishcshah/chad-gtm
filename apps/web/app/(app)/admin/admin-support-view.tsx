"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Download, ExternalLink, LifeBuoy } from "lucide-react";
import { formatDateTime, timeAgo } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  NativeSelect,
  SegmentedControl,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@smartreach/ui";
import { updateTicketStatusAction } from "@/lib/support-actions";
import { TICKET_CATEGORIES, type SupportTicketDTO, type TicketStatus } from "@/lib/support-types";
import {
  NoMatches,
  RowActionsButton,
  SearchField,
  Toolbar,
  WORK_STATUSES,
  countBy,
  downloadCsv,
  safeExternalUrl,
  todayStamp,
  workStatusMeta,
  withCount,
} from "./admin-ui";

/** Category labels in sentence case ("Bug report", not "Bug Report"). */
function categoryLabel(id: string) {
  const label = TICKET_CATEGORIES.find((c) => c.id === id)?.label ?? id.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/** All support tickets across users, with status changes and a link to each thread. */
export function AdminSupportView({
  initialTickets,
  onOpenCountChange,
}: {
  initialTickets: SupportTicketDTO[];
  onOpenCountChange?: (count: number) => void;
}) {
  const [tickets, setTickets] = useState<SupportTicketDTO[]>(initialTickets);
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const statusCounts = useMemo(() => countBy(tickets, (t) => t.status), [tickets]);
  const openCount = statusCounts.open ?? 0;

  useEffect(() => {
    onOpenCountChange?.(openCount);
  }, [openCount, onOpenCountChange]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        t.heading.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.userEmail.toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, categoryFilter, search]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  const changeStatus = async (ticket: SupportTicketDTO, status: TicketStatus) => {
    if (ticket.status === status) return;
    setUpdatingId(ticket.id);
    try {
      const res = await updateTicketStatusAction(ticket.id, status);
      if (res.ok) {
        setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status } : t)));
        toast.success(`Ticket marked as ${workStatusMeta(status).label.toLowerCase()}.`);
      } else {
        toast.error(res.error || "Could not update the ticket.");
      }
    } catch {
      toast.error("Could not update the ticket. Try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `autogtm-support-tickets-${todayStamp()}.csv`,
      ["Ticket ID", "User Email", "Category", "Subject", "Description", "Status", "URL", "Created At", "Updated At"],
      filtered.map((t) => [t.id, t.userEmail, t.category, t.heading, t.description, t.status, t.url || "", t.createdAt, t.updatedAt]),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download />
            Export CSV
          </Button>
        }
      >
        <SearchField value={search} onChange={setSearch} placeholder="Search subject, message or email" label="Search tickets" />
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            size="sm"
            aria-label="Filter tickets by status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { value: "all", label: withCount("All", tickets.length) },
              ...WORK_STATUSES.map((s) => ({ value: s.value, label: withCount(s.label, statusCounts[s.value] ?? 0) })),
            ]}
          />
        </div>
        <NativeSelect
          aria-label="Filter tickets by category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-8 text-[13px] sm:w-44"
        >
          <option value="all">All categories</option>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c.id)}
            </option>
          ))}
        </NativeSelect>
      </Toolbar>

      <Card className="overflow-hidden">
        {tickets.length === 0 ? (
          <EmptyState compact icon={LifeBuoy} title="No support tickets yet" description="Tickets people open from the support page appear here." />
        ) : filtered.length === 0 ? (
          <NoMatches what="tickets" onClear={clearFilters} />
        ) : (
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[42%]">Ticket</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const status = workStatusMeta(t.status);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[420px]">
                      <Link href={`/support/${t.id}`} className="block truncate font-medium hover:underline">
                        {t.heading}
                      </Link>
                      <p className="mt-0.5 line-clamp-1 text-muted-foreground">{t.description}</p>
                      {safeExternalUrl(t.url) ? (
                        <a
                          href={safeExternalUrl(t.url)!}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-subtle-foreground hover:text-foreground hover:underline"
                        >
                          <ExternalLink className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{t.url}</span>
                        </a>
                      ) : t.url ? (
                        <span className="mt-0.5 block truncate text-xs text-subtle-foreground">{t.url}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="block truncate">{t.userEmail}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{categoryLabel(t.category)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant} dot>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular text-right">{t.messageCount || 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <time suppressHydrationWarning dateTime={t.createdAt} title={formatDateTime(t.createdAt)}>
                        {timeAgo(t.createdAt)}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/support/${t.id}`}>
                            Reply
                            <ArrowUpRight />
                          </Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <RowActionsButton label={`Change status of ${t.heading}`} disabled={updatingId === t.id} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Status</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={t.status}
                              onValueChange={(v) => void changeStatus(t, v as TicketStatus)}
                            >
                              {WORK_STATUSES.map((s) => (
                                <DropdownMenuRadioItem key={s.value} value={s.value}>
                                  {s.label}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/support/${t.id}`}>Open ticket</Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
