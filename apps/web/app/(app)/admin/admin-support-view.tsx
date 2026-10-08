"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@smartreach/ui";
import {
  Download,
  Search,
  MessageSquare,
  Clock,
  ExternalLink,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  LifeBuoy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@smartreach/shared";
import { TicketCategoryBadge } from "@/components/support/ticket-category-badge";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { updateTicketStatusAction } from "@/lib/support-actions";
import { TICKET_CATEGORIES, type SupportTicketDTO, type TicketCategory, type TicketStatus } from "@/lib/support-types";

export function AdminSupportView({
  initialTickets,
}: {
  initialTickets: SupportTicketDTO[];
}) {
  const [tickets, setTickets] = useState<SupportTicketDTO[]>(initialTickets);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (ticketId: string, newStatus: TicketStatus) => {
    setUpdatingId(ticketId);
    startTransition(async () => {
      const res = await updateTicketStatusAction(ticketId, newStatus);
      if (res.ok) {
        toast.success(`Ticket marked as ${newStatus}`);
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
        );
      } else {
        toast.error(res.error || "Failed to update status");
      }
      setUpdatingId(null);
    });
  };

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchHeading = t.heading.toLowerCase().includes(q);
      const matchDesc = t.description.toLowerCase().includes(q);
      const matchEmail = t.userEmail.toLowerCase().includes(q);
      if (!matchHeading && !matchDesc && !matchEmail) return false;
    }
    return true;
  });

  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;
  const closedCount = tickets.filter((t) => t.status === "closed").length;

  const downloadCsv = () => {
    const headers = [
      "Ticket ID",
      "User Email",
      "Category",
      "Subject",
      "Description",
      "Status",
      "URL",
      "Created At",
      "Updated At",
    ];

    const rows = filteredTickets.map((t) => [
      `"${t.id}"`,
      `"${t.userEmail}"`,
      `"${t.category}"`,
      `"${t.heading.replace(/"/g, '""')}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      `"${t.status}"`,
      `"${t.url || ""}"`,
      `"${t.createdAt}"`,
      `"${t.updatedAt}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `chadgtm-support-tickets-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-zinc-400 font-medium">Total Tickets</span>
          <div className="text-2xl font-bold tracking-tight text-white tabular-nums">{tickets.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-amber-400 font-medium">Open</span>
          <div className="text-2xl font-bold tracking-tight text-white tabular-nums">{openCount}</div>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-sky-400 font-medium">Ongoing</span>
          <div className="text-2xl font-bold tracking-tight text-zinc-300 tabular-nums">{inProgressCount}</div>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-emerald-400 font-medium">Resolved</span>
          <div className="text-2xl font-bold tracking-tight text-emerald-400 tabular-nums">{resolvedCount}</div>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-zinc-500 font-medium">Closed</span>
          <div className="text-2xl font-bold tracking-tight text-zinc-400 tabular-nums">{closedCount}</div>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 size-3.5 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user email, subject, or message..."
              className="rounded-lg border-zinc-800/80 bg-zinc-900/50 pl-9 text-xs text-white placeholder:text-zinc-500 focus:border-zinc-700 h-9 font-sans"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              className="rounded-lg border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white h-9 px-3 gap-1.5"
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Status & Category Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-zinc-800/80 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-zinc-400 font-medium mr-1">Status:</span>
            {["all", "open", "in_progress", "resolved", "closed"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  statusFilter === st
                    ? "bg-zinc-800 text-white font-medium shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {st === "all" ? "All" : st.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-zinc-400 font-medium mr-1">Tag:</span>
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                categoryFilter === "all"
                  ? "bg-zinc-800 text-white font-medium shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All
            </button>
            {TICKET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  categoryFilter === cat.id
                    ? "bg-zinc-800 text-white font-medium shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Universal Tickets Table */}
      {filteredTickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-10 text-center space-y-2">
          <LifeBuoy className="mx-auto size-7 text-zinc-600" />
          <p className="text-xs text-zinc-400 font-medium">No tickets matching selected filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-900/60 text-zinc-400 text-xs">
                  <th className="px-4 py-3 font-medium">User &amp; Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Subject &amp; Message</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Thread Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3.5 align-top">
                      <div className="font-medium text-white text-xs">{t.userEmail}</div>
                      <div className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                        <Clock className="size-2.5" /> {formatDate(t.createdAt)}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <TicketCategoryBadge category={t.category} />
                    </td>

                    <td className="px-4 py-3.5 align-top max-w-md">
                      <Link
                        href={`/support/${t.id}`}
                        className="font-medium text-white hover:underline text-xs block"
                      >
                        {t.heading}
                      </Link>
                      <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">
                        {t.description}
                      </p>
                      {t.url && (
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-zinc-500 hover:text-zinc-300 hover:underline flex items-center gap-1 mt-1"
                        >
                          <ExternalLink className="size-2.5" /> {t.url}
                        </a>
                      )}
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <TicketStatusBadge status={t.status} />
                    </td>

                    <td className="px-4 py-3.5 align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updatingId === t.id && isPending}
                              className="rounded-lg border-zinc-800 bg-zinc-900/80 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white h-7 px-2.5"
                            >
                              {updatingId === t.id && isPending ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <span>Change Status</span>
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-lg border-zinc-800 bg-zinc-950 font-sans text-xs">
                            <DropdownMenuItem onClick={() => handleStatusChange(t.id, "open")}>
                              Mark as Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(t.id, "in_progress")}>
                              Mark as Ongoing (In Progress)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(t.id, "resolved")}>
                              Mark as Resolved
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(t.id, "closed")}>
                              Mark as Closed
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-zinc-800 bg-zinc-900/80 text-white hover:bg-zinc-800 text-xs h-7 px-2.5 gap-1"
                        >
                          <Link href={`/support/${t.id}`}>
                            <span>Reply</span>
                            <span className="tabular-nums font-semibold">({t.messageCount || 1})</span>
                            <ChevronRight className="size-3" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
