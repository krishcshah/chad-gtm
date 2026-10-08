"use client";

import { useState } from "react";
import { BarChart3, Mail, Database, LifeBuoy, ShieldAlert } from "lucide-react";
import { AdminSupportView } from "./admin-support-view";
import { AdminDataRemovalView } from "./admin-data-removal-view";
import { AdminAnalyticsView } from "./admin-analytics-view";
import { AdminMailboxPoolView } from "@/components/chad-gtm/admin-pool-view";
import { AdminDirectoryView } from "./admin-directory-view";
import type { SupportTicketDTO } from "@/lib/support-types";
import type { DataRemovalRequestDTO } from "@/lib/data-removal";
import type { AdminAnalyticsPayload } from "@/lib/admin-analytics";
import type { SystemMailboxPoolStats } from "@/lib/admin-gtm-actions";
import type { DirectoryStatsDTO } from "./admin-directory-view";

export function AdminConsoleView({
  initialAnalytics,
  initialSupportTickets,
  initialDataRemovals,
  initialPoolStats,
  initialDirectoryStats,
}: {
  initialAnalytics: AdminAnalyticsPayload;
  initialSupportTickets: SupportTicketDTO[];
  initialDataRemovals: DataRemovalRequestDTO[];
  initialPoolStats: SystemMailboxPoolStats;
  initialDirectoryStats: DirectoryStatsDTO;
}) {
  const [activeTab, setActiveTab] = useState<
    "mailboxes" | "directory" | "analytics" | "support" | "compliance"
  >("mailboxes");

  return (
    <div className="space-y-6 font-sans">
      {/* Sleek Segmented Pill Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 pb-4">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-950/90 border border-zinc-800/80 shadow-xs card-shine">
          {/* Tab 1: Mailboxes */}
          <button
            type="button"
            onClick={() => setActiveTab("mailboxes")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium tracking-tight transition-all cursor-pointer ${
              activeTab === "mailboxes"
                ? "bg-zinc-800 text-white shadow-xs font-semibold"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            <Mail className="size-3.5 text-zinc-300" />
            <span>Mailboxes</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activeTab === "mailboxes"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-400"
              }`}
            >
              {initialPoolStats.activeMailboxes} active
            </span>
          </button>

          {/* Tab 2: Directory */}
          <button
            type="button"
            onClick={() => setActiveTab("directory")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium tracking-tight transition-all cursor-pointer ${
              activeTab === "directory"
                ? "bg-zinc-800 text-white shadow-xs font-semibold"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            <Database className="size-3.5 text-zinc-300" />
            <span>Directory</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activeTab === "directory"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-400"
              }`}
            >
              {initialDirectoryStats.totalLeads.toLocaleString()} leads
            </span>
          </button>

          {/* Tab 3: Analytics */}
          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium tracking-tight transition-all cursor-pointer ${
              activeTab === "analytics"
                ? "bg-zinc-800 text-white shadow-xs font-semibold"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            <BarChart3 className="size-3.5 text-zinc-300" />
            <span>Analytics</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activeTab === "analytics"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-400"
              }`}
            >
              {initialAnalytics.kpis.totalUsers} users
            </span>
          </button>

          {/* Tab 4: Support */}
          <button
            type="button"
            onClick={() => setActiveTab("support")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium tracking-tight transition-all cursor-pointer ${
              activeTab === "support"
                ? "bg-zinc-800 text-white shadow-xs font-semibold"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            <LifeBuoy className="size-3.5 text-zinc-300" />
            <span>Support</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activeTab === "support"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-400"
              }`}
            >
              {initialSupportTickets.length}
            </span>
          </button>

          {/* Tab 5: Compliance */}
          <button
            type="button"
            onClick={() => setActiveTab("compliance")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium tracking-tight transition-all cursor-pointer ${
              activeTab === "compliance"
                ? "bg-zinc-800 text-white shadow-xs font-semibold"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/50"
            }`}
          >
            <ShieldAlert className="size-3.5 text-zinc-300" />
            <span>Compliance</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activeTab === "compliance"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-400"
              }`}
            >
              {initialDataRemovals.length}
            </span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === "mailboxes" ? (
        <AdminMailboxPoolView initialStats={initialPoolStats} />
      ) : activeTab === "directory" ? (
        <AdminDirectoryView initialStats={initialDirectoryStats} />
      ) : activeTab === "analytics" ? (
        <AdminAnalyticsView initialAnalytics={initialAnalytics} />
      ) : activeTab === "support" ? (
        <AdminSupportView initialTickets={initialSupportTickets} />
      ) : (
        <AdminDataRemovalView initialRequests={initialDataRemovals} />
      )}
    </div>
  );
}
