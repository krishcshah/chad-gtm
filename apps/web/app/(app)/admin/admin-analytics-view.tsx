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
  Check,
  Lock,
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
import { adminToggleB2bAccessAction } from "@/lib/b2b-access-actions";
import { toast } from "sonner";

export function AdminAnalyticsView({
  initialAnalytics,
}: {
  initialAnalytics: AdminAnalyticsPayload;
}) {
  const [data] = useState<AdminAnalyticsPayload>(initialAnalytics);
  const [usersList, setUsersList] = useState<UserAnalyticsSummary[]>(initialAnalytics.users);
  const [togglingB2bId, setTogglingB2bId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "has_mailboxes" | "no_mailboxes" | "active">("all");
  const [sortBy, setSortBy] = useState<"views" | "mailboxes" | "newest" | "last_active">("views");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { kpis, topRoutes, recentActivity } = data;

  const handleToggleB2bAccess = async (targetUserId: string, grant: boolean) => {
    setTogglingB2bId(targetUserId);
    try {
      const res = await adminToggleB2bAccessAction(targetUserId, grant);
      if (res.success) {
        setUsersList((prev) =>
          prev.map((u) => (u.userId === targetUserId ? { ...u, hasB2bAccess: grant } : u))
        );
        toast.success(grant ? "B2B Database access granted!" : "B2B Database access revoked.");
      } else {
        toast.error(res.error || "Action failed");
      }
    } catch {
      toast.error("Failed to update B2B access");
    } finally {
      setTogglingB2bId(null);
    }
  };

  // Filter & sort users
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
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
  }, [usersList, filterType, search]);

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
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-mono uppercase tracking-wider text-[11px]">Registered Users</span>
            <div className="p-1.5 rounded-none border border-zinc-800 bg-zinc-900 text-zinc-300">
              <Users className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold tracking-tight text-white">
            {kpis.totalUsers}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span className="text-emerald-400 font-semibold">+{kpis.newUsers7d} new</span>
            <span className="text-zinc-500">last 7 days</span>
          </div>
        </div>

        {/* Total Page Views */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-mono uppercase tracking-wider text-[11px]">Total Page Views</span>
            <div className="p-1.5 rounded-none border border-zinc-800 bg-zinc-900 text-zinc-300">
              <Eye className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold tracking-tight text-white">
            {kpis.totalPagesVisited.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span className="text-zinc-200">{kpis.pageViews24h} views 24h</span>
            <span className="text-zinc-500">· avg {kpis.avgPagesPerUser}/user</span>
          </div>
        </div>

        {/* Mailbox Infrastructure */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-mono uppercase tracking-wider text-[11px]">Mailbox Infrastructure</span>
            <div className="p-1.5 rounded-none border border-zinc-800 bg-zinc-900 text-zinc-300">
              <Mail className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold tracking-tight text-white">
            {kpis.totalMailboxes}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span className="text-emerald-400 font-semibold">{kpis.activeMailboxes} active</span>
            <span className="text-zinc-500">· {kpis.failingMailboxes} degraded</span>
          </div>
        </div>

        {/* 7-Day Active Users */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-mono uppercase tracking-wider text-[11px]">Active Engagement</span>
            <div className="p-1.5 rounded-none border border-zinc-800 bg-zinc-900 text-zinc-300">
              <Activity className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold tracking-tight text-white">
            {kpis.activeUsers7d}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span className="text-zinc-200 font-semibold">{kpis.activeUsersPercentage}%</span>
            <span className="text-zinc-500">active this week</span>
          </div>
        </div>
      </div>

      {/* 2. Platform Traffic Distribution & Live Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Visited Routes */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="space-y-0.5">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-white flex items-center gap-2">
                <Layers className="size-3.5 text-zinc-400" /> Platform Traffic Surfaces
              </h3>
              <p className="text-xs text-zinc-400">Traffic share across key product routes</p>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-none">
              {topRoutes.length} surfaces
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {topRoutes.map((route) => (
              <div key={route.path} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-mono text-zinc-200">
                    <span className="text-white font-medium">{route.path}</span>
                    <span className="text-[11px] text-zinc-500 truncate max-w-[180px]">
                      {route.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                    <span className="font-semibold text-white">{route.count}</span>
                    <span className="text-zinc-500 text-[10px]">({route.percentage}%)</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-zinc-900 rounded-none overflow-hidden border border-zinc-800/80">
                  <div
                    className="h-full rounded-none bg-white transition-all duration-500"
                    style={{ width: `${Math.max(4, route.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Activity Stream */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="space-y-0.5">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-white flex items-center gap-2">
                <Clock className="size-3.5 text-zinc-400" /> Telemetry Activity Stream
              </h3>
              <p className="text-xs text-zinc-400">Chronological stream of user navigation</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-none bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px] font-mono uppercase text-zinc-300">
              <span className="size-1.5 rounded-none bg-emerald-400 animate-pulse" /> Live
            </span>
          </div>

          <div className="space-y-2 max-h-[295px] overflow-y-auto pr-1">
            {recentActivity.map((act) => (
              <div
                key={act.id}
                className="flex items-center justify-between gap-3 p-2 rounded-none bg-zinc-900/50 hover:bg-zinc-900 transition-colors text-xs border border-zinc-800"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-6 rounded-none bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
                    {act.userName ? act.userName[0].toUpperCase() : act.userEmail[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-zinc-200 truncate">{act.userEmail}</div>
                    <div className="text-[10px] text-zinc-400 font-mono truncate">{act.path}</div>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 shrink-0 whitespace-nowrap">
                  {formatRelativeTime(act.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. User Behavior & Mailbox Analytics Directory (Main Table) */}
      <div className="rounded-none border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        {/* Directory Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="space-y-0.5">
            <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-white flex items-center gap-2">
              <Users className="size-4 text-zinc-400" /> User Telemetry Directory
            </h3>
            <p className="text-xs text-zinc-400">
              Examine navigation frequency, mailbox adoption, and individual user sessions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              className="text-xs font-mono uppercase tracking-wider h-8 gap-1.5 rounded-none border-zinc-800 bg-black text-zinc-200 hover:bg-zinc-900 hover:text-white"
            >
              <Download className="size-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search user by name, email, or user ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-none border border-zinc-800 bg-black pl-9 pr-3 py-1.5 text-xs font-mono text-white placeholder:text-zinc-500 focus:outline-none focus:border-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Pill Buttons */}
            <div className="flex items-center rounded-none border border-zinc-800 bg-black p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  setFilterType("all");
                  setPage(1);
                }}
                className={`rounded-none px-2.5 py-1 text-[10px] uppercase tracking-wider transition-all ${
                  filterType === "all" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All ({usersList.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType("has_mailboxes");
                  setPage(1);
                }}
                className={`rounded-none px-2.5 py-1 text-[10px] uppercase tracking-wider transition-all ${
                  filterType === "has_mailboxes" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                With Mailboxes ({usersList.filter((u) => u.mailboxCount > 0).length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType("no_mailboxes");
                  setPage(1);
                }}
                className={`rounded-none px-2.5 py-1 text-[10px] uppercase tracking-wider transition-all ${
                  filterType === "no_mailboxes" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
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
                className={`rounded-none px-2.5 py-1 text-[10px] uppercase tracking-wider transition-all ${
                  filterType === "active" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Active 7d
              </button>
            </div>

            {/* Sorter Dropdown */}
            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
              <ArrowUpDown className="size-3 text-zinc-500" />
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="h-7 w-[165px] rounded-none border-zinc-800 bg-black px-2.5 text-xs font-mono text-zinc-300 focus:ring-0 focus:border-zinc-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="rounded-none border-zinc-800 bg-zinc-950 font-mono text-xs">
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
        <div className="rounded-none border border-zinc-800 overflow-hidden bg-black">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">User Identity</th>
                  <th className="py-3 px-3.5">Signed Up</th>
                  <th className="py-3 px-3.5">B2B Database</th>
                  <th className="py-3 px-3.5">Mailboxes</th>
                  <th className="py-3 px-3.5">Pages Visited</th>
                  <th className="py-3 px-3.5">Top Application Sections</th>
                  <th className="py-3 px-3.5">Last Seen</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {currentPageUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono">
                      No users match the search and filter criteria.
                    </td>
                  </tr>
                ) : (
                  currentPageUsers.map((u) => {
                    const isAdmin = u.email === "de.krish.shah@gmail.com";
                    return (
                      <tr key={u.userId} className="hover:bg-zinc-900/40 transition-colors">
                        {/* User Identity */}
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="size-7 rounded-none border border-zinc-700 bg-zinc-900 text-white flex items-center justify-center font-mono font-bold text-xs shrink-0">
                              {u.name ? u.name[0].toUpperCase() : u.email[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-white flex items-center gap-1.5 font-mono text-xs">
                                <span className="truncate">{u.name || "Nameless"}</span>
                                {isAdmin && (
                                  <span className="rounded-none bg-white text-black px-1 py-0.2 text-[9px] font-mono font-extrabold uppercase tracking-wider">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono truncate">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Signed Up */}
                        <td className="py-3 px-3.5 text-zinc-400 whitespace-nowrap font-mono text-xs">
                          <div>{new Date(u.createdAt).toLocaleDateString()}</div>
                          <div className="text-[10px] text-zinc-500">{formatRelativeTime(u.createdAt)}</div>
                        </td>

                        {/* B2B Database Access */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          {isAdmin ? (
                            <span className="inline-flex items-center gap-1 rounded-none bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-zinc-300">
                              <ShieldCheck className="size-3 text-zinc-400" />
                              <span>Admin Lifetime</span>
                            </span>
                          ) : u.hasB2bAccess ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-none bg-emerald-950/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-400">
                                <Check className="size-3" />
                                <span>Unlocked</span>
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={togglingB2bId === u.userId}
                                onClick={() => handleToggleB2bAccess(u.userId, false)}
                                className="h-6 px-1.5 text-[10px] font-mono text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-none"
                                title="Revoke B2B Database access"
                              >
                                {togglingB2bId === u.userId ? "..." : "Revoke"}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-none border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                                <Lock className="size-2.5 text-zinc-500" />
                                <span>Paywalled</span>
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={togglingB2bId === u.userId}
                                onClick={() => handleToggleB2bAccess(u.userId, true)}
                                className="h-6 px-1.5 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 font-semibold rounded-none"
                                title="Grant lifetime B2B Database access"
                              >
                                {togglingB2bId === u.userId ? "..." : "Grant"}
                              </Button>
                            </div>
                          )}
                        </td>

                        {/* Mailboxes */}
                        <td className="py-3 px-3.5">
                          {u.mailboxCount === 0 ? (
                            <span className="inline-flex items-center rounded-none border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-500">
                              0 mailboxes
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[10px] font-mono font-semibold ${
                                  u.failingMailboxes > 0
                                    ? "bg-amber-950/20 text-amber-300 border border-amber-500/30"
                                    : "bg-zinc-900 text-zinc-200 border border-zinc-800"
                                }`}
                              >
                                <Mail className="size-2.5" />
                                <span>{u.mailboxCount} mailboxes</span>
                              </span>
                              {u.failingMailboxes > 0 && (
                                <div className="text-[10px] font-mono text-amber-400">
                                  {u.failingMailboxes} degraded
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Pages Visited */}
                        <td className="py-3 px-3.5">
                          <span className="inline-flex items-center gap-1 rounded-none border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-300">
                            <Eye className="size-2.5" />
                            <span>{u.totalPageViews} views</span>
                          </span>
                        </td>

                        {/* Top Application Sections */}
                        <td className="py-3 px-3.5">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {u.topPages.length === 0 ? (
                              <span className="text-[11px] font-mono text-zinc-500">—</span>
                            ) : (
                              u.topPages.map((tp) => (
                                <span
                                  key={tp.path}
                                  className="inline-flex items-center rounded-none px-1.5 py-0.5 text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800"
                                >
                                  {tp.path}: <strong className="ml-1 text-white">{tp.count}</strong>
                                </span>
                              ))
                            )}
                          </div>
                        </td>

                        {/* Last Seen */}
                        <td className="py-3 px-3.5 text-zinc-400 whitespace-nowrap text-[11px] font-mono">
                          {formatRelativeTime(u.lastActiveAt)}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedUserId(u.userId)}
                            className="h-7 text-xs font-mono rounded-none border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 gap-1.5"
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
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-t border-zinc-800 text-xs font-mono text-zinc-400">
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
                className="h-7 px-2 text-xs font-mono rounded-none border-zinc-800 bg-black text-zinc-300 hover:text-white disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="text-[11px] font-mono text-zinc-300">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 px-2 text-xs font-mono rounded-none border-zinc-800 bg-black text-zinc-300 hover:text-white disabled:opacity-40"
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
