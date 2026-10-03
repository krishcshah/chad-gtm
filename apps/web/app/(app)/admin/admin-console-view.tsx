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
    <div className="space-y-6 font-mono">
      {/* Simplified, Boxy Monochromatic Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 pb-3">
        {/* Tab 1: Mailboxes */}
        <button
          type="button"
          onClick={() => setActiveTab("mailboxes")}
          className={`inline-flex items-center gap-2 rounded-none border px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
            activeTab === "mailboxes"
              ? "border-white bg-zinc-900 text-white font-bold"
              : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          }`}
        >
          <Mail className="size-3.5" />
          <span>Mailboxes</span>
          <span
            className={`rounded-none border px-1.5 py-0.2 text-[9px] font-bold ${
              activeTab === "mailboxes"
                ? "border-zinc-600 bg-black text-zinc-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-500"
            }`}
          >
            {initialPoolStats.activeMailboxes} active
          </span>
        </button>

        {/* Tab 2: Directory */}
        <button
          type="button"
          onClick={() => setActiveTab("directory")}
          className={`inline-flex items-center gap-2 rounded-none border px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
            activeTab === "directory"
              ? "border-white bg-zinc-900 text-white font-bold"
              : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          }`}
        >
          <Database className="size-3.5" />
          <span>Directory</span>
          <span
            className={`rounded-none border px-1.5 py-0.2 text-[9px] font-bold ${
              activeTab === "directory"
                ? "border-zinc-600 bg-black text-zinc-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-500"
            }`}
          >
            {initialDirectoryStats.totalLeads.toLocaleString()} leads
          </span>
        </button>

        {/* Tab 3: Analytics */}
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`inline-flex items-center gap-2 rounded-none border px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
            activeTab === "analytics"
              ? "border-white bg-zinc-900 text-white font-bold"
              : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          }`}
        >
          <BarChart3 className="size-3.5" />
          <span>Analytics</span>
          <span
            className={`rounded-none border px-1.5 py-0.2 text-[9px] font-bold ${
              activeTab === "analytics"
                ? "border-zinc-600 bg-black text-zinc-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-500"
            }`}
          >
            {initialAnalytics.kpis.totalUsers} users
          </span>
        </button>

        {/* Tab 4: Support */}
        <button
          type="button"
          onClick={() => setActiveTab("support")}
          className={`inline-flex items-center gap-2 rounded-none border px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
            activeTab === "support"
              ? "border-white bg-zinc-900 text-white font-bold"
              : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          }`}
        >
          <LifeBuoy className="size-3.5" />
          <span>Support</span>
          <span
            className={`rounded-none border px-1.5 py-0.2 text-[9px] font-bold ${
              activeTab === "support"
                ? "border-zinc-600 bg-black text-zinc-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-500"
            }`}
          >
            {initialSupportTickets.length}
          </span>
        </button>

        {/* Tab 5: Compliance */}
        <button
          type="button"
          onClick={() => setActiveTab("compliance")}
          className={`inline-flex items-center gap-2 rounded-none border px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
            activeTab === "compliance"
              ? "border-white bg-zinc-900 text-white font-bold"
              : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          }`}
        >
          <ShieldAlert className="size-3.5" />
          <span>Compliance</span>
          <span
            className={`rounded-none border px-1.5 py-0.2 text-[9px] font-bold ${
              activeTab === "compliance"
                ? "border-zinc-600 bg-black text-zinc-300"
                : "border-zinc-800 bg-zinc-950 text-zinc-500"
            }`}
          >
            {initialDataRemovals.length}
          </span>
        </button>
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
