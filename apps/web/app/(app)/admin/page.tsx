import Link from "next/link";
import { Button, PageHeader, StatePanel } from "@smartreach/ui";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { listAllTicketsForAdmin } from "@/lib/support";
import { listAllDataRemovalRequestsForAdmin } from "@/lib/data-removal";
import { listAllBugReportsForAdmin } from "@/lib/bug-reports";
import { getAdminUserAnalytics } from "@/lib/admin-analytics";
import { getSystemMailboxPoolStats } from "@/lib/admin-gtm-actions";
import { getDirectoryStats } from "@/lib/leads-directory";
import { listAccountApprovalsAction } from "@/lib/admin-actions";
import { Page } from "@/components/layout/page";
import { AdminConsoleView } from "./admin-console-view";
import { parseAdminTab } from "./admin-tabs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
  description: "Approve accounts, run the shared mailbox pool and lead directory, and handle support and data requests.",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const user = await requireUser();

  if (!isAdmin(user)) {
    return (
      <Page width="narrow">
        <StatePanel
          kind="permission"
          title="Admins only"
          description="This page is for AutoGTM administrators. If you need help, open a support ticket and we will get back to you."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/support">Go to support</Link>
            </Button>
          }
        />
      </Page>
    );
  }

  const { tab } = await searchParams;

  const [analytics, supportTickets, removalRequests, poolStats, approvals, bugReports] = await Promise.all([
    getAdminUserAnalytics(user),
    listAllTicketsForAdmin(user),
    listAllDataRemovalRequestsForAdmin(user),
    getSystemMailboxPoolStats(),
    listAccountApprovalsAction().catch((err) => {
      console.error("[AdminPage] Failed to load account approvals:", err);
      return { pending: [], recentlyApproved: [], emailOnApprove: false };
    }),
    listAllBugReportsForAdmin(user).catch((err) => {
      console.error("[AdminPage] Failed to load bug reports:", err);
      return null;
    }),
  ]);

  const directoryStats = getDirectoryStats();

  return (
    <Page width="wide">
      <PageHeader
        title="Admin"
        description="Approve new accounts, run the shared mailbox pool and lead directory, and answer support and data requests."
        meta={<span className="text-xs text-subtle-foreground">Signed in as {user.email}</span>}
      />

      <AdminConsoleView
        initialTab={parseAdminTab(Array.isArray(tab) ? tab[0] : tab)}
        initialApprovals={approvals}
        initialAnalytics={analytics}
        initialSupportTickets={supportTickets}
        initialBugReports={bugReports}
        initialDataRemovals={removalRequests}
        initialPoolStats={poolStats}
        initialDirectoryStats={directoryStats}
      />
    </Page>
  );
}
