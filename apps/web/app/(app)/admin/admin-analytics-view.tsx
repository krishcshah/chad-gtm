"use client";

import React, { useState, useMemo } from "react";
import {
  Users,
  Eye,
  Mail,
  Activity,
  Search,
  Filter,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Layers,
  Clock,
  ShieldCheck,
  Server,
  ArrowUpDown,
} from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@smartreach/ui";
import { AdminUserDetailModal } from "./admin-user-detail-modal";
import type { AdminAnalyticsPayload, UserAnalyticsSummary } from "@/lib/admin-analytics";

export function AdminAnalyticsView({
  initialAnalytics,
}: {
  initialAnalytics: AdminAnalyticsPayload;
}) {
  const [data] = useState<AdminAnalyticsPayload>(initialAnalytics);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "has_mailboxes" | "no_mailboxes" | "active">("all");
  const [sortBy, setSortBy] = useState<"views" | "mailboxes" | "newest" | "last_active">("views");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { kpis, users, topRoutes, recentActivity } = data;

  // Filter & sort users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Filter criteria
      if (filterType === "has_mailboxes" && u.mailboxCount === 0) return false;
      if (filterType === "no_mailboxes" && u.mailboxCount > 0) return false;
      if (filterType === "active") {
        if (!u.lastActiveAt) return false;
        const diff = Date.now() - new Date(u.lastActiveAt).getTime();
        if (diff > 7 * 24 * 60 * 60 * 1000) return false;
      }

      // Search query
      const query = search.toLowerCase().trim();
      if (!query) return true;
      return (
        u.email.toLowerCase().includes(query) ||
        u.name.toLowerCase().includes(query) ||
        u.userId.toLowerCase().includes(query)
      );
    });
  }, [users, filterType, search]);

  const sortedUsers = useMemo(() => {
    const list = [...filteredUsers];
    if (sortBy === "views") {
      list.sort((a, b) => b.totalPageViews - a.totalPageViews);
    } else if (sortBy === "mailboxes") {
      list.sort((a, b) => b.mailboxCount - a.mailboxCount);
    } else if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "last_active") {
      list.sort((a, b) => {
        const tA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const tB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        return tB - tA;
      });
    }
    return list;
  }, [filteredUsers, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
  const currentPageUsers = sortedUsers.slice((page - 1) * pageSize, page * pageSize);

  // Format relative time helper
  function formatRelativeTime(dateStr: string | null) {
    if (!dateStr) return "Never";
    const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  // Export CSV
  function downloadCsv() {
    const headers = [
      "User ID",
      "Email",
      "Name",
      "Signup Date",
      "Email Verified",
      "Total Page Views",
      "Mailboxes Count",
      "Active Mailboxes",
      "Failing Mailboxes",
      "Top Visited Routes",
      "Last Active At",
    ];

    const rows = sortedUsers.map((u) => [
      `"${u.userId}"`,
      `"${u.email}"`,
      `"${u.name}"`,
      `"${u.createdAt}"`,
      u.emailVerified ? "Yes" : "No",
      u.totalPageViews,
      u.mailboxCount,
      u.activeMailboxes,
      u.failingMailboxes,
      `"${u.topPages.map((p) => `${p.path} (${p.count})`).join("; ")}"`,
      `"${u.lastActiveAt || "Never"}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `smartreach-user-analytics-${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* 1. Summary KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-semibold uppercase tracking-wider">Registered Users</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {kpis.totalUsers}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="size-3 text-emerald-400" />
            <span className="text-emerald-400 font-semibold">+{kpis.newUsers7d} new</span>
            <span>in last 7 days</span>
          </div>
        </div>

        {/* Total Page Views */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-semibold uppercase tracking-wider">Total Page Views</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Eye className="size-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {kpis.totalPagesVisited.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-sky-400 font-semibold">{kpis.pageViews24h} views</span>
            <span>last 24h · avg {kpis.avgPagesPerUser} / user</span>
          </div>
        </div>

        {/* Mailbox Infrastructure */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-semibold uppercase tracking-wider">Mailbox Accounts</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Mail className="size-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {kpis.totalMailboxes}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-emerald-400 font-semibold">{kpis.activeMailboxes} active</span>
            <span>· {kpis.failingMailboxes} degraded</span>
          </div>
        </div>

        {/* 7-Day Active Users */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-semibold uppercase tracking-wider">Active Engagement</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Activity className="size-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {kpis.activeUsers7d}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-purple-400 font-semibold">{kpis.activeUsersPercentage}%</span>
            <span>of userbase active this week</span>
          </div>
        </div>
      </div>

      {/* 2. Platform Traffic Distribution & Live Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Visited Routes */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="space-y-0.5">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Layers className="size-4 text-primary" /> Most Visited Platform Routes
              </h3>
              <p className="text-xs text-muted-foreground">Traffic share across key product sections</p>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
              {topRoutes.length} key surfaces
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {topRoutes.map((route) => (
              <div key={route.path} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-mono font-medium text-foreground">
                    <span className="text-primary">{route.path}</span>
                    <span className="text-[11px] text-muted-foreground font-sans truncate max-w-[180px]">
                      {route.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-foreground">{route.count}</span>
                    <span className="text-muted-foreground text-[11px]">({route.percentage}%)</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/80 transition-all duration-500"
                    style={{ width: `${Math.max(4, route.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Activity Stream */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="space-y-0.5">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Clock className="size-4 text-emerald-400" /> Live User Activity Stream
              </h3>
              <p className="text-xs text-muted-foreground">Chronological log of recent page visits</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Telemetry
            </span>
          </div>

          <div className="space-y-2 max-h-[295px] overflow-y-auto pr-1">
            {recentActivity.map((act) => (
              <div
                key={act.id}
                className="flex items-center justify-between gap-3 p-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors text-xs border border-border/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">
                    {act.userName ? act.userName[0].toUpperCase() : act.userEmail[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{act.userEmail}</div>
                    <div className="text-[11px] text-primary font-mono truncate">{act.path}</div>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                  {formatRelativeTime(act.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. User Behavior & Mailbox Analytics Directory (Main Table) */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-4 shadow-sm">
        {/* Directory Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
          <div className="space-y-0.5">
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <Users className="size-4 text-primary" /> User Tracking & Behavior Directory
            </h3>
            <p className="text-xs text-muted-foreground">
              Examine navigation frequency, mailbox adoption, and individual user sessions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              className="text-xs h-8 gap-1.5"
            >
              <Download className="size-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search user by name, email, or user ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-border/70 bg-background/80 pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Pill Buttons */}
            <div className="flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setFilterType("all");
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  filterType === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({users.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType("has_mailboxes");
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  filterType === "has_mailboxes" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                With Mailboxes ({users.filter((u) => u.mailboxCount > 0).length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType("no_mailboxes");
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  filterType === "no_mailboxes" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                0 Mailboxes
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType("active");
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  filterType === "active" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Active 7d
              </button>
            </div>

            {/* Sorter Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowUpDown className="size-3" />
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="h-7 w-[165px] rounded-lg border-border/70 bg-background px-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="views">Most Pages Visited</SelectItem>
                  <SelectItem value="mailboxes">Most Mailboxes</SelectItem>
                  <SelectItem value="newest">Newest Signups</SelectItem>
                  <SelectItem value="last_active">Last Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Directory Table */}
        <div className="rounded-xl border border-border/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-3.5">User Identity</th>
                  <th className="py-3 px-3.5">Signed Up</th>
                  <th className="py-3 px-3.5">Mailboxes</th>
                  <th className="py-3 px-3.5">Pages Visited</th>
                  <th className="py-3 px-3.5">Top Application Sections</th>
                  <th className="py-3 px-3.5">Last Seen</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {currentPageUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No users match the search and filter criteria.
                    </td>
                  </tr>
                ) : (
                  currentPageUsers.map((u) => {
                    const isAdmin = u.email === "de.krish.shah@gmail.com";
                    return (
                      <tr key={u.userId} className="hover:bg-muted/30 transition-colors">
                        {/* User Identity */}
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                              {u.name ? u.name[0].toUpperCase() : u.email[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                <span className="truncate">{u.name || "Nameless"}</span>
                                {isAdmin && (
                                  <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1 py-0.2 text-[9px] font-extrabold uppercase tracking-wider text-amber-400">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Signed Up */}
                        <td className="py-3 px-3.5 text-muted-foreground whitespace-nowrap">
                          <div>{new Date(u.createdAt).toLocaleDateString()}</div>
                          <div className="text-[10px] text-muted-foreground/80">{formatRelativeTime(u.createdAt)}</div>
                        </td>

                        {/* Mailboxes */}
                        <td className="py-3 px-3.5">
                          {u.mailboxCount === 0 ? (
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              0 mailboxes
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                  u.failingMailboxes > 0
                                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                    : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                }`}
                              >
                                <Mail className="size-3" />
                                <span>{u.mailboxCount} mailboxes</span>
                              </span>
                              {u.failingMailboxes > 0 && (
                                <div className="text-[10px] text-amber-400">
                                  {u.failingMailboxes} degraded
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Pages Visited */}
                        <td className="py-3 px-3.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-xs font-bold text-sky-400">
                            <Eye className="size-3" />
                            <span>{u.totalPageViews} views</span>
                          </span>
                        </td>

                        {/* Top Application Sections */}
                        <td className="py-3 px-3.5">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {u.topPages.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            ) : (
                              u.topPages.map((tp) => (
                                <span
                                  key={tp.path}
                                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted/60 text-foreground border border-border/60"
                                >
                                  {tp.path}: <strong className="ml-1 text-primary">{tp.count}</strong>
                                </span>
                              ))
                            )}
                          </div>
                        </td>

                        {/* Last Seen */}
                        <td className="py-3 px-3.5 text-muted-foreground whitespace-nowrap text-[11px]">
                          {formatRelativeTime(u.lastActiveAt)}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3.5 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedUserId(u.userId)}
                            className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"
                          >
                            <span>Inspect</span>
                            <ExternalLink className="size-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-t border-border/60 text-xs text-muted-foreground">
            <div>
              Showing {sortedUsers.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
              {Math.min(page * pageSize, sortedUsers.length)} of {sortedUsers.length} users
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 px-2 text-xs"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="text-[11px] font-semibold text-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 px-2 text-xs"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* User Detail Inspection Modal */}
      <AdminUserDetailModal
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}
