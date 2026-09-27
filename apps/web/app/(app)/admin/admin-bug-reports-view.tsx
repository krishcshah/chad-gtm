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
  User,
  ExternalLink,
  ChevronDown,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { BugReportDTO, BugReportStatus } from "@/lib/bug-reports";
import { updateBugReportStatusAction } from "@/lib/bug-report-actions";

export function AdminBugReportsView({ initialReports }: { initialReports: BugReportDTO[] }) {
  const [reports, setReports] = useState<BugReportDTO[]>(initialReports);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isUpdating, startTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const query = search.toLowerCase().trim();
    if (!query) return matchesStatus;

    const matchesSearch =
      r.heading.toLowerCase().includes(query) ||
      r.description.toLowerCase().includes(query) ||
      r.userEmail.toLowerCase().includes(query) ||
      (r.userName && r.userName.toLowerCase().includes(query));

    return matchesStatus && matchesSearch;
  });

  // KPI stats
  const totalCount = reports.length;
  const openCount = reports.filter((r) => r.status === "open").length;
  const investigatingCount = reports.filter((r) => r.status === "investigating").length;
  const resolvedCount = reports.filter((r) => r.status === "resolved").length;

  // Handle status update
  const handleStatusChange = (id: string, newStatus: BugReportStatus) => {
    setUpdatingId(id);
    startTransition(async () => {
      try {
        const res = await updateBugReportStatusAction(id, newStatus);
        if (res.ok) {
          setReports((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
          );
        }
      } catch (err) {
        console.error("Failed to update status:", err);
      } finally {
        setUpdatingId(null);
      }
    });
  };

  // CSV Export
  const downloadCSV = () => {
    const headers = [
      "Report ID",
      "Date (UTC)",
      "User Name",
      "User Email",
      "Heading / Title",
      "Description",
      "Status",
      "Page URL",
    ];

    const escapeCsv = (str: string | null | undefined) => {
      if (!str) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = filteredReports.map((r) => [
      escapeCsv(r.id),
      escapeCsv(r.createdAt),
      escapeCsv(r.userName || "N/A"),
      escapeCsv(r.userEmail),
      escapeCsv(r.heading),
      escapeCsv(r.description),
      escapeCsv(r.status),
      escapeCsv(r.url || ""),
    ]);

    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `smartreach-bug-reports-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
          <p className="text-xs font-medium text-muted-foreground">Total Bug Reports</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{totalCount}</p>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-amber-400">Open / Action Needed</p>
            <AlertCircle className="size-4 text-amber-400" />
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-400">{openCount}</p>
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-sky-400">Investigating</p>
            <Clock className="size-4 text-sky-400" />
          </div>
          <p className="mt-1 text-2xl font-bold text-sky-400">{investigatingCount}</p>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-emerald-400">Resolved</p>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{resolvedCount}</p>
        </div>
      </div>

      {/* Toolbar: Search, Filter & CSV Download */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports by keyword, user email..."
              className="w-full rounded-xl border border-border/60 bg-muted/30 pl-9 pr-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Status filter dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Download CSV Button */}
        <button
          type="button"
          onClick={downloadCSV}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all cursor-pointer shadow-xs"
        >
          <Download className="size-4" />
          <span>Download as CSV ({filteredReports.length})</span>
        </button>
      </div>

      {/* Bug Reports List */}
      <div className="space-y-3">
        {filteredReports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center bg-card/30">
            <CheckCircle2 className="mx-auto size-9 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">No bug reports match your filter</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Try adjusting your search query or status filter.
            </p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const formattedDate = new Date(report.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            });

            return (
              <div
                key={report.id}
                className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-xs backdrop-blur-xl transition-all hover:border-border/90"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: Info & Description */}
                  <div className="space-y-2 flex-1 min-w-0 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-foreground tracking-tight">
                        {report.heading}
                      </span>
                      <span className="text-[11px] text-muted-foreground/70">•</span>
                      <span className="text-[11px] text-muted-foreground">{formattedDate}</span>
                    </div>

                    <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed bg-muted/20 p-3 rounded-xl border border-border/40 font-mono text-[12px]">
                      {report.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
                        <User className="size-3 text-muted-foreground" />
                        {report.userName ? `${report.userName} (${report.userEmail})` : report.userEmail}
                      </span>

                      {report.url && (
                        <a
                          href={report.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          <span>Reported Page</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Right: Status Pill & Changer */}
                  <div className="flex items-center gap-2 shrink-0 sm:pt-1">
                    <div className="relative">
                      <select
                        value={report.status}
                        disabled={isUpdating && updatingId === report.id}
                        onChange={(e) => handleStatusChange(report.id, e.target.value as BugReportStatus)}
                        className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border appearance-none pr-7 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary transition-all ${
                          report.status === "open"
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : report.status === "investigating"
                            ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                            : report.status === "resolved"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-muted text-muted-foreground border-border/40"
                        }`}
                      >
                        <option value="open" className="bg-popover text-foreground">
                          Open
                        </option>
                        <option value="investigating" className="bg-popover text-foreground">
                          Investigating
                        </option>
                        <option value="resolved" className="bg-popover text-foreground">
                          Resolved
                        </option>
                        <option value="closed" className="bg-popover text-foreground">
                          Closed
                        </option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 pointer-events-none opacity-60" />
                    </div>

                    {isUpdating && updatingId === report.id && (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
