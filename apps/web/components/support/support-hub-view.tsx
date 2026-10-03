"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@smartreach/ui";
import {
  Plus,
  Search,
  MessageSquare,
  Clock,
  ExternalLink,
  ChevronRight,
  LifeBuoy,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { formatDate } from "@smartreach/shared";
import { TicketCategoryBadge } from "./ticket-category-badge";
import { TicketStatusBadge } from "./ticket-status-badge";
import { TicketCreateForm } from "./ticket-create-form";
import { TICKET_CATEGORIES, type SupportTicketDTO, type TicketCategory, type TicketStatus } from "@/lib/support-types";

export function SupportHubView({
  tickets,
  isAdminUser,
  userEmail,
}: {
  tickets: SupportTicketDTO[];
  isAdminUser: boolean;
  userEmail: string;
}) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const filteredTickets = tickets.filter((t) => {
    if (selectedCategory !== "all" && t.category !== selectedCategory) return false;
    if (selectedStatus !== "all" && t.status !== selectedStatus) return false;
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-mono">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-400">
              Support &amp; Feedback Center
            </span>
            <span className="rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-400">
              Direct Engineering Line
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-white">
            Support Tickets &amp; Feedback
          </h1>
          <p className="text-xs text-zinc-500 font-sans mt-0.5 max-w-xl">
            Submit bug reports, propose feature ideas, share copy feedback, or connect with the core engineering team.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAdminUser && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-none border-zinc-800 bg-black text-xs font-mono uppercase tracking-wider text-zinc-300 hover:bg-zinc-900 hover:text-white h-10 px-3.5 gap-1.5"
            >
              <Link href="/admin">
                <ShieldCheck className="size-3.5" /> Universal Admin View
              </Link>
            </Button>
          )}

          <Button
            onClick={() => setCreateModalOpen(true)}
            className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs uppercase tracking-wider h-10 px-4 gap-2"
          >
            <Plus className="size-3.5" /> Create New Ticket
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Total Tickets</span>
          <div className="text-xl font-bold text-white tabular-nums">{tickets.length}</div>
        </div>
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Open</span>
          <div className="text-xl font-bold text-white tabular-nums">{openCount}</div>
        </div>
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Ongoing</span>
          <div className="text-xl font-bold text-zinc-300 tabular-nums">{inProgressCount}</div>
        </div>
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Resolved</span>
          <div className="text-xl font-bold text-emerald-400 tabular-nums">{resolvedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 size-3.5 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets by subject, description, or author..."
              className="rounded-none border-zinc-800 bg-black pl-9 text-xs text-white placeholder:text-zinc-600 focus:border-white h-9 font-mono"
            />
          </div>

          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {["all", "open", "in_progress", "resolved", "closed"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatus(st)}
                className={`rounded-none border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  selectedStatus === st
                    ? "border-white bg-zinc-900 text-white font-bold"
                    : "border-zinc-800 bg-black text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                }`}
              >
                {st === "all" ? "All Statuses" : st.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`rounded-none border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
              selectedCategory === "all"
                ? "border-zinc-600 bg-zinc-900 text-white font-bold"
                : "border-zinc-900 bg-black text-zinc-500 hover:text-zinc-300"
            }`}
          >
            All Categories
          </button>
          {TICKET_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-none border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                selectedCategory === cat.id
                  ? "border-zinc-600 bg-zinc-900 text-white font-bold"
                  : "border-zinc-900 bg-black text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets List */}
      {filteredTickets.length === 0 ? (
        <div className="rounded-none border border-dashed border-zinc-800 bg-black p-12 text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-white">
            <LifeBuoy className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              No Tickets Found
            </h3>
            <p className="text-xs text-zinc-500 font-sans max-w-md mx-auto leading-relaxed">
              {search || selectedCategory !== "all" || selectedStatus !== "all"
                ? "No support tickets match the selected filters or search query."
                : "You haven't submitted any support or feedback tickets yet. Create one anytime if you experience an issue or have a suggestion."}
            </p>
          </div>
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider border border-white h-9 px-4 gap-2"
          >
            <Plus className="size-3.5" /> Submit First Ticket
          </Button>
        </div>
      ) : (
        <div className="rounded-none border border-zinc-800 bg-zinc-950 divide-y divide-zinc-900">
          {filteredTickets.map((t) => (
            <Link
              key={t.id}
              href={`/support/${t.id}`}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-4.5 hover:bg-zinc-900/50 transition-colors gap-3 group"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <TicketCategoryBadge category={t.category} />
                  <TicketStatusBadge status={t.status} />
                  <span className="text-[10px] text-zinc-500 font-sans flex items-center gap-1">
                    <Clock className="size-2.5" /> {formatDate(t.createdAt)}
                  </span>
                  {t.userEmail !== userEmail && (
                    <span className="text-[10px] font-mono text-zinc-400">
                      by {t.userEmail}
                    </span>
                  )}
                </div>

                <div className="font-bold text-sm text-white uppercase tracking-wider group-hover:underline truncate">
                  {t.heading}
                </div>

                <p className="text-xs text-zinc-400 font-sans line-clamp-1">
                  {t.description}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                <div className="flex items-center gap-1 rounded-none border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-400">
                  <MessageSquare className="size-3 text-zinc-500" />
                  <span className="tabular-nums font-bold text-white">{t.messageCount || 1}</span>
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500 hidden sm:inline">
                    {(t.messageCount || 1) === 1 ? "msg" : "msgs"}
                  </span>
                </div>

                <div className="flex size-7 items-center justify-center rounded-none border border-zinc-800 bg-black text-zinc-400 group-hover:border-zinc-600 group-hover:text-white transition-colors">
                  <ChevronRight className="size-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Ticket Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="rounded-none border border-zinc-800 bg-zinc-950 font-mono text-zinc-100 max-w-2xl p-6">
          <DialogHeader className="space-y-1.5 text-left border-b border-zinc-800 pb-3">
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <LifeBuoy className="size-4" /> Create Support Ticket
            </DialogTitle>
            <p className="text-xs text-zinc-400 font-sans">
              Provide as much detail as possible to help our engineering team triage and resolve your request rapidly.
            </p>
          </DialogHeader>

          <div className="mt-4">
            <TicketCreateForm onSuccess={() => setCreateModalOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
