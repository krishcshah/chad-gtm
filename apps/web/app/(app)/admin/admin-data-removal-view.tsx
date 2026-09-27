"use client";

import React, { useState, useTransition } from "react";
import {
  Download,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Filter,
  UserX,
  Mail,
  ChevronDown,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { DataRemovalRequestDTO, DataRemovalStatus } from "@/lib/data-removal";
import { updateDataRemovalStatusAction } from "@/lib/data-removal-actions";

export function AdminDataRemovalView({ initialRequests }: { initialRequests: DataRemovalRequestDTO[] }) {
  const [requests, setRequests] = useState<DataRemovalRequestDTO[]>(initialRequests);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isUpdating, startTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filtered requests
  const filteredRequests = requests.filter((r) => {
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const query = search.toLowerCase().trim();
    if (!query) return matchesStatus;

    const matchesSearch =
      r.contactEmail.toLowerCase().includes(query) ||
      r.description.toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  // KPI stats
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const inProgressCount = requests.filter((r) => r.status === "in_progress").length;
  const completedCount = requests.filter((r) => r.status === "completed").length;

  // Handle status update
  const handleStatusChange = (id: string, newStatus: DataRemovalStatus) => {
    setUpdatingId(id);
    startTransition(async () => {
      try {
        const res = await updateDataRemovalStatusAction(id, newStatus);
        if (res.ok) {
          setRequests((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
          );
        }
      } catch (err) {
        console.error("Failed to update removal status:", err);
      } finally {
        setUpdatingId(null);
      }
    });
  };

  // CSV Export
  const downloadCSV = () => {
    const headers = [
      "Request ID",
      "Date (UTC)",
      "Contact Email",
      "User ID",
      "Description (Requested Erasure)",
      "Status",
      "Updated At",
    ];

    const rows = filteredRequests.map((r) => [
      `"${r.id}"`,
      `"${r.createdAt}"`,
      `"${r.contactEmail.replace(/"/g, '""')}"`,
      `"${(r.userId || "anonymous visitor").replace(/"/g, '""')}"`,
      `"${r.description.replace(/"/g, '""').replace(/\n/g, " ")}"`,
      `"${r.status}"`,
      `"${r.updatedAt}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `data-removal-requests-${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: DataRemovalStatus) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
            <Clock className="size-2.5" /> Pending Review
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
            <AlertCircle className="size-2.5" /> In Progress
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            <CheckCircle2 className="size-2.5" /> Purged / Completed
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
            <XCircle className="size-2.5" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Total Requests
          </span>
          <div className="text-2xl font-bold text-foreground">{totalCount}</div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <Clock className="size-3" /> Pending Review
          </span>
          <div className="text-2xl font-bold text-amber-300">{pendingCount}</div>
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-sky-400 flex items-center gap-1">
            <AlertCircle className="size-3" /> In Progress
          </span>
          <div className="text-2xl font-bold text-sky-300">{inProgressCount}</div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="size-3" /> Purged / Done
          </span>
          <div className="text-2xl font-bold text-emerald-300">{completedCount}</div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by contact email or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-border/80 bg-card pl-9 pr-3 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="size-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-border/80 bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Statuses ({totalCount})</option>
              <option value="pending">Pending ({pendingCount})</option>
              <option value="in_progress">In Progress ({inProgressCount})</option>
              <option value="completed">Completed ({completedCount})</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={downloadCSV}
          disabled={filteredRequests.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/80 bg-secondary/80 px-3.5 py-2 text-xs font-semibold text-secondary-foreground shadow-sm hover:bg-secondary transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          <Download className="size-3.5" />
          Export CSV ({filteredRequests.length})
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Contact Email</th>
                <th className="px-4 py-3">Description (What to Remove)</th>
                <th className="px-4 py-3">Status & Action</th>
                <th className="px-4 py-3 text-right">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    <UserX className="mx-auto size-8 text-muted-foreground/50 mb-2" />
                    <p className="font-medium text-sm text-foreground">No removal requests found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {search || statusFilter !== "all"
                        ? "Try clearing filters to view all entries."
                        : "No data subjects have requested data erasure yet."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const isRowUpdating = updatingId === req.id && isUpdating;

                  return (
                    <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                      {/* Email */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1">
                          <a
                            href={`mailto:${req.contactEmail}`}
                            className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                          >
                            <Mail className="size-3 text-muted-foreground" />
                            <span>{req.contactEmail}</span>
                          </a>
                          <span className="text-[10px] text-muted-foreground">
                            {req.userId ? "Registered User" : "Public Web Request"}
                          </span>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3.5 align-top max-w-md">
                        <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                          {req.description}
                        </p>
                        <span className="text-[10px] font-mono text-muted-foreground/60 block mt-1">
                          ID: {req.id}
                        </span>
                      </td>

                      {/* Status Selector */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1.5">
                          <div>{getStatusBadge(req.status)}</div>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <select
                              disabled={isRowUpdating}
                              value={req.status}
                              onChange={(e) =>
                                handleStatusChange(
                                  req.id,
                                  e.target.value as DataRemovalStatus
                                )
                              }
                              className="h-7 rounded border border-border/80 bg-background px-2 text-[11px] text-foreground focus:border-primary focus:outline-none"
                            >
                              <option value="pending">Mark Pending</option>
                              <option value="in_progress">Mark In Progress</option>
                              <option value="completed">Mark Purged/Done</option>
                              <option value="rejected">Mark Rejected</option>
                            </select>
                            {isRowUpdating && (
                              <Loader2 className="size-3 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Submitted Date */}
                      <td className="px-4 py-3.5 align-top text-right text-muted-foreground whitespace-nowrap">
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">
                            {new Date(req.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(req.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
