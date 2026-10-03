import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { listAllTicketsForAdmin } from "@/lib/support";
import { listAllDataRemovalRequestsForAdmin } from "@/lib/data-removal";
import { getAdminUserAnalytics } from "@/lib/admin-analytics";
import { getSystemMailboxPoolStats } from "@/lib/admin-gtm-actions";
import { getDirectoryStats } from "@/lib/leads-directory";
import { AdminConsoleView } from "./admin-console-view";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Console · Mailbox Pool & Lead Directory · ChadGTM",
  description:
    "Administrative oversight of shared mailbox infrastructure, Apollo B2B directory, registered users, page view analytics, support tickets, and GDPR data requests.",
};

export default async function AdminPage() {
  const user = await requireUser();

  if (!isAdmin(user)) {
    return (
      <div className="mx-auto max-w-2xl py-16 px-4 font-mono">
        <div className="rounded-none border border-red-900/60 bg-red-950/20 p-6 text-center space-y-3">
          <ShieldAlert className="mx-auto size-10 text-red-400" />
          <h2 className="text-lg font-bold text-white uppercase tracking-wider">Access Restricted</h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed font-sans">
            This administration console is only accessible to authorized system administrators.
            If you need help or have feedback, please visit the Support page.
          </p>
        </div>
      </div>
    );
  }

  const [analytics, supportTickets, removalRequests, poolStats] = await Promise.all([
    getAdminUserAnalytics(user),
    listAllTicketsForAdmin(user),
    listAllDataRemovalRequestsForAdmin(user),
    getSystemMailboxPoolStats(),
  ]);

  const directoryStats = getDirectoryStats();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 font-mono">
      {/* Admin Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-none bg-black border border-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            <ShieldCheck className="size-3" />
            System Administrator
          </span>
          <span className="text-xs text-zinc-600">•</span>
          <span className="text-xs text-zinc-400 font-mono">{user.email}</span>
        </div>

        <h1 className="mt-2 text-2xl font-bold uppercase tracking-wider text-white">
          Admin Command Center
        </h1>
        <p className="mt-1 text-xs text-zinc-500 font-sans max-w-2xl">
          Universal management of shared mailbox fleets, 100M+ lead directory, user analytics, support tickets, and GDPR compliance requests.
        </p>
      </div>

      <AdminConsoleView
        initialAnalytics={analytics}
        initialSupportTickets={supportTickets}
        initialDataRemovals={removalRequests}
        initialPoolStats={poolStats}
        initialDirectoryStats={directoryStats}
      />
    </div>
  );
}
