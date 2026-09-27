import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { listAllBugReportsForAdmin } from "@/lib/bug-reports";
import { listAllDataRemovalRequestsForAdmin } from "@/lib/data-removal";
import { AdminConsoleView } from "./admin-console-view";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { PermissionDenied } from "@smartreach/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Console · Bug Reports & Data Erasure · SmartReach",
  description: "Administrative oversight of bug reports, system feedback, and GDPR data removal requests.",
};

export default async function AdminPage() {
  const user = await requireUser();

  if (!isAdmin(user)) {
    return (
      <div className="mx-auto max-w-2xl py-16 px-4">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center space-y-3">
          <ShieldAlert className="mx-auto size-10 text-rose-400" />
          <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            This administration console is only accessible to authorized system administrators. 
            If you need help or found a bug, please use the Bug Report page.
          </p>
        </div>
      </div>
    );
  }

  const [reports, removalRequests] = await Promise.all([
    listAllBugReportsForAdmin(user),
    listAllDataRemovalRequestsForAdmin(user),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Admin Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
            <ShieldCheck className="size-3" />
            System Admin
          </span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">{user.email}</span>
        </div>

        <div className="mt-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Admin Console
          </h1>
          <p className="text-sm text-muted-foreground">
            Review user bug submissions, manage GDPR data removal requests, investigate errors, update resolution status, and download records as CSV.
          </p>
        </div>
      </div>

      {/* Tabbed Interactive Views (Bug Reports & Data Removals) */}
      <AdminConsoleView
        initialBugReports={reports}
        initialDataRemovals={removalRequests}
      />
    </div>
  );
}
