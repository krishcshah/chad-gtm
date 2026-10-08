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
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { DataRemovalRequestDTO, DataRemovalStatus } from "@/lib/data-removal";
import { updateDataRemovalStatusAction } from "@/lib/data-removal-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@smartreach/ui";

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
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            <Clock className="size-2.5" /> Pending Review
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-200">
            <AlertCircle className="size-2.5" /> In Progress
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <CheckCircle2 className="size-2.5" /> Purged / Completed
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 text-[10px] font-medium text-rose-400">
            <XCircle className="size-2.5" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-zinc-400 font-medium">
            Total Requests
          </span>
          <div className="text-2xl font-bold tracking-tight text-white">{totalCount}</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-amber-400 font-medium flex items-center gap-1">
            <Clock className="size-3" /> Pending Review
          </span>
          <div className="text-2xl font-bold tracking-tight text-amber-400">{pendingCount}</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-sky-400 font-medium flex items-center gap-1">
            <AlertCircle className="size-3" /> In Progress
          </span>
          <div className="text-2xl font-bold tracking-tight text-zinc-200">{inProgressCount}</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 space-y-1 card-shine shadow-xs">
          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="size-3" /> Purged / Done
          </span>
          <div className="text-2xl font-bold tracking-tight text-emerald-400">{completedCount}</div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by contact email or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-800/80 bg-zinc-900/50 pl-9 pr-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="size-3.5 text-zinc-500" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[170px] rounded-lg border-zinc-800/80 bg-zinc-900/50 px-2.5 text-xs text-zinc-300 focus:ring-0 focus:border-zinc-700">
                <SelectValue placeholder={`All Statuses (${totalCount})`} />
              </SelectTrigger>
              <SelectContent align="end" className="rounded-lg border-zinc-800 bg-zinc-950 text-xs">
                <SelectItem value="all">All Statuses ({totalCount})</SelectItem>
                <SelectItem value="pending">Pending ({pendingCount})</SelectItem>
                <SelectItem value="in_progress">In Progress ({inProgressCount})</SelectItem>
                <SelectItem value="completed">Completed ({completedCount})</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <button
          type="button"
          onClick={downloadCSV}
          disabled={filteredRequests.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="size-3.5" />
          Export CSV ({filteredRequests.length})
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="border-b border-zinc-800/80 bg-zinc-900/60 text-xs font-medium text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Contact Email</th>
                <th className="px-4 py-3 font-medium">Description (Requested Erasure)</th>
                <th className="px-4 py-3 font-medium">Status & Action</th>
                <th className="px-4 py-3 text-right font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-zinc-500">
                    <UserX className="mx-auto size-8 text-zinc-600 mb-2" />
                    <p className="font-semibold text-sm text-zinc-300">No removal requests found</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
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
                    <tr key={req.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* Email */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1">
                          <a
                            href={`mailto:${req.contactEmail}`}
                            className="font-medium text-white hover:text-zinc-300 transition-colors flex items-center gap-1.5"
                          >
                            <Mail className="size-3 text-zinc-500" />
                            <span>{req.contactEmail}</span>
                          </a>
                          <span className="text-[11px] text-zinc-500">
                            {req.userId ? "Registered User" : "Public Web Request"}
                          </span>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3.5 align-top max-w-md">
                        <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                          {req.description}
                        </p>
                        <span className="text-[10px] text-zinc-500 block mt-1 font-mono">
                          ID: {req.id}
                        </span>
                      </td>

                      {/* Status Selector */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1.5">
                          <div>{getStatusBadge(req.status)}</div>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <Select
                              disabled={isRowUpdating}
                              value={req.status}
                              onValueChange={(val) =>
                                handleStatusChange(
                                  req.id,
                                  val as DataRemovalStatus
                                )
                              }
                            >
                              <SelectTrigger className="h-7 w-[140px] rounded-lg border-zinc-800 bg-zinc-900/80 px-2 text-[11px] text-zinc-300 focus:ring-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent align="start" className="rounded-lg border-zinc-800 bg-zinc-950 text-xs">
                                <SelectItem value="pending">Mark Pending</SelectItem>
                                <SelectItem value="in_progress">Mark In Progress</SelectItem>
                                <SelectItem value="completed">Mark Purged/Done</SelectItem>
                                <SelectItem value="rejected">Mark Rejected</SelectItem>
                              </SelectContent>
                            </Select>
                            {isRowUpdating && (
                              <Loader2 className="size-3 animate-spin text-zinc-400" />
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Submitted Date */}
                      <td className="px-4 py-3.5 align-top text-right text-zinc-400 whitespace-nowrap text-xs">
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-white">
                            {new Date(req.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <div className="text-[10px] text-zinc-500">
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
