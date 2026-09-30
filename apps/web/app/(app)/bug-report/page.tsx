import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { listUserBugReports } from "@/lib/bug-reports";
import { BugReportForm } from "./bug-report-form";
import { Bug, Clock, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@smartreach/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bug Report · ChadGTM",
  description: "Report an issue or bug directly to the engineering team.",
};

function formatStatus(status: string) {
  switch (status) {
    case "resolved":
      return {
        label: "Resolved",
        classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        icon: CheckCircle2,
      };
    case "investigating":
      return {
        label: "Investigating",
        classes: "bg-sky-500/15 text-sky-400 border-sky-500/30",
        icon: Clock,
      };
    case "closed":
      return {
        label: "Closed",
        classes: "bg-muted text-muted-foreground border-border/40",
        icon: HelpCircle,
      };
    case "open":
    default:
      return {
        label: "Open / Under Review",
        classes: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        icon: AlertCircle,
      };
  }
}

export default async function BugReportPage() {
  const user = await requireUser();

  // If admin visits /bug-report, they can still view/use it, or redirect to /admin
  const userReports = await listUserBugReports(user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Bug className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Bug Report</h1>
            <p className="text-sm text-muted-foreground">
              Report an issue or unexpected behavior directly to the developers.
            </p>
          </div>
        </div>
      </div>

      {/* Main submission card */}
      <Card className="border-border/60 bg-card/60 backdrop-blur-xl shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Submit a New Bug Report</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Provide a heading and a short description. We review and resolve bugs continuously.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BugReportForm />
        </CardContent>
      </Card>

      {/* User's past reports */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
            Your Submitted Reports ({userReports.length})
          </h2>
          <span className="text-xs text-muted-foreground">
            Status updates reflect live developer investigation.
          </span>
        </div>

        {userReports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center bg-card/30">
            <Bug className="mx-auto size-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">No bug reports submitted yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm mx-auto">
              If you experience any issues with email delivery, lead filtering, or campaign schedules, let us know above!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {userReports.map((report) => {
              const statusInfo = formatStatus(report.status);
              const StatusIcon = statusInfo.icon;
              const formattedDate = new Date(report.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              });

              return (
                <div
                  key={report.id}
                  className="rounded-xl border border-border/50 bg-card/40 p-4 transition-all hover:border-border"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusInfo.classes}`}
                        >
                          <StatusIcon className="size-3" />
                          {statusInfo.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{formattedDate}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground pt-1">{report.heading}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {report.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
