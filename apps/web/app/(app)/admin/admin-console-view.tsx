"use client";

import { useMemo, useState } from "react";
import { Badge, ErrorState, Tabs, TabsContent, TabsList, TabsTrigger } from "@smartreach/ui";
import { AdminMailboxPoolView } from "@/components/chad-gtm/admin-pool-view";
import type { SupportTicketDTO } from "@/lib/support-types";
import type { DataRemovalRequestDTO } from "@/lib/data-removal";
import type { BugReportDTO } from "@/lib/bug-reports";
import type { AdminAnalyticsPayload } from "@/lib/admin-analytics";
import type { SystemMailboxPoolStats } from "@/lib/admin-gtm-actions";
import type { AccountApprovalsPayload } from "@/lib/account-approvals";
import { AdminApprovalsView } from "./admin-approvals-view";
import { AdminAnalyticsView } from "./admin-analytics-view";
import { AdminDirectoryView, type DirectoryStatsDTO } from "./admin-directory-view";
import { AdminSupportView } from "./admin-support-view";
import { AdminBugReportsView } from "./admin-bug-reports-view";
import { AdminDataRemovalView } from "./admin-data-removal-view";
import { parseAdminTab, type AdminTab } from "./admin-tabs";

/**
 * Admin sections as underline tabs. The active tab is mirrored to `?tab=` so
 * it survives reloads and can be linked. Every panel stays mounted (hidden when
 * inactive) so changes made in one tab are not lost when switching away.
 */
export function AdminConsoleView({
  initialTab = "approvals",
  initialApprovals,
  initialAnalytics,
  initialSupportTickets,
  initialBugReports,
  initialDataRemovals,
  initialPoolStats,
  initialDirectoryStats,
}: {
  initialTab?: AdminTab;
  initialApprovals: AccountApprovalsPayload;
  initialAnalytics: AdminAnalyticsPayload;
  initialSupportTickets: SupportTicketDTO[];
  /** null when the bug reports could not be loaded. */
  initialBugReports: BugReportDTO[] | null;
  initialDataRemovals: DataRemovalRequestDTO[];
  initialPoolStats: SystemMailboxPoolStats;
  initialDirectoryStats: DirectoryStatsDTO;
}) {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [counts, setCounts] = useState({
    approvals: initialApprovals.pending.length,
    support: initialSupportTickets.filter((t) => t.status === "open").length,
    bugs: (initialBugReports ?? []).filter((r) => r.status === "open").length,
    requests: initialDataRemovals.filter((r) => r.status === "pending").length,
  });

  // Stable callbacks so child effects that report their counts do not re-run on every render.
  const { onApprovals, onSupport, onBugs, onRequests } = useMemo(() => {
    const update = (key: keyof typeof counts) => (n: number) =>
      setCounts((prev) => (prev[key] === n ? prev : { ...prev, [key]: n }));
    return {
      onApprovals: update("approvals"),
      onSupport: update("support"),
      onBugs: update("bugs"),
      onRequests: update("requests"),
    };
  }, []);

  const changeTab = (value: string) => {
    const next = parseAdminTab(value);
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // URL sync is a convenience; ignore failures.
    }
  };

  const tabs: { value: AdminTab; label: string; count?: number; countLabel?: string }[] = [
    { value: "approvals", label: "Approvals", count: counts.approvals, countLabel: "waiting" },
    { value: "users", label: "Users" },
    { value: "mailboxes", label: "Mailbox pool" },
    { value: "directory", label: "Lead directory" },
    { value: "support", label: "Support", count: counts.support, countLabel: "open" },
    { value: "bugs", label: "Bug reports", count: counts.bugs, countLabel: "open" },
    { value: "requests", label: "Data requests", count: counts.requests, countLabel: "pending" },
  ];

  return (
    <Tabs value={tab} onValueChange={changeTab}>
      <TabsList aria-label="Admin sections">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
            {t.count ? (
              <Badge variant={t.value === "approvals" ? "warning" : "neutral"} className="tabular">
                {t.count}
                <span className="sr-only"> {t.countLabel}</span>
              </Badge>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>

      <Panel value="approvals">
        <AdminApprovalsView initial={initialApprovals} onPendingCountChange={onApprovals} />
      </Panel>
      <Panel value="users">
        <AdminAnalyticsView initialAnalytics={initialAnalytics} />
      </Panel>
      <Panel value="mailboxes">
        <AdminMailboxPoolView initialStats={initialPoolStats} />
      </Panel>
      <Panel value="directory">
        <AdminDirectoryView initialStats={initialDirectoryStats} />
      </Panel>
      <Panel value="support">
        <AdminSupportView initialTickets={initialSupportTickets} onOpenCountChange={onSupport} />
      </Panel>
      <Panel value="bugs">
        {initialBugReports ? (
          <AdminBugReportsView initialReports={initialBugReports} onOpenCountChange={onBugs} />
        ) : (
          <ErrorState
            title="Bug reports did not load"
            description="The rest of the admin console works. Reload the page to try again."
            onRetry={() => window.location.reload()}
          />
        )}
      </Panel>
      <Panel value="requests">
        <AdminDataRemovalView initialRequests={initialDataRemovals} onPendingCountChange={onRequests} />
      </Panel>
    </Tabs>
  );
}

function Panel({ value, children }: { value: AdminTab; children: React.ReactNode }) {
  return (
    <TabsContent value={value} forceMount className="mt-6 data-[state=inactive]:hidden">
      {children}
    </TabsContent>
  );
}
