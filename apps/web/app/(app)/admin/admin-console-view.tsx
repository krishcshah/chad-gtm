"use client";

import { useState } from "react";
import { BarChart3, Bug, UserX } from "lucide-react";
import { AdminBugReportsView } from "./admin-bug-reports-view";
import { AdminDataRemovalView } from "./admin-data-removal-view";
import { AdminAnalyticsView } from "./admin-analytics-view";
import type { BugReportDTO } from "@/lib/bug-reports";
import type { DataRemovalRequestDTO } from "@/lib/data-removal";
import type { AdminAnalyticsPayload } from "@/lib/admin-analytics";

export function AdminConsoleView({
  initialAnalytics,
  initialBugReports,
  initialDataRemovals,
}: {
  initialAnalytics: AdminAnalyticsPayload;
  initialBugReports: BugReportDTO[];
  initialDataRemovals: DataRemovalRequestDTO[];
}) {
  const [activeTab, setActiveTab] = useState<"analytics" | "bugs" | "removals">("analytics");

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "analytics"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <BarChart3 className="size-3.5" />
          <span>User Analytics & Tracking</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
              activeTab === "analytics"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {initialAnalytics.kpis.totalUsers} users
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bugs")}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "bugs"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <Bug className="size-3.5" />
          <span>Bug Reports</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
              activeTab === "bugs"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {initialBugReports.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("removals")}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "removals"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <UserX className="size-3.5" />
          <span>Data Removal Requests</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
              activeTab === "removals"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {initialDataRemovals.length}
          </span>
        </button>
      </div>

      {activeTab === "analytics" ? (
        <AdminAnalyticsView initialAnalytics={initialAnalytics} />
      ) : activeTab === "bugs" ? (
        <AdminBugReportsView initialReports={initialBugReports} />
      ) : (
        <AdminDataRemovalView initialRequests={initialDataRemovals} />
      )}
    </div>
  );
}
