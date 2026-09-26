import Link from "next/link";
import { ArrowRight, FileSpreadsheet, Plus, Sparkles, Upload, Users } from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from "@smartreach/ui";
import { formatDate } from "@smartreach/shared";
import { LeadListCard } from "./lead-list-card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Leads · SmartReach" };

export default async function LeadsPage() {
  const { user, workspace } = await requireWorkspace();
  const lists = await listLeadLists(user.id, workspace.id, workspace.isDefault);
  const totalLeads = lists.reduce((acc, l) => acc + Number(l.leadCount || 0), 0);

  return (
    <div className="page-stack space-y-6">
      <PageHeader
        title="Leads & Contact Lists"
        description={`Manage audience lists and verified contacts for ${workspace.name}.`}
        actions={
          <Button size="sm" asChild className="gap-1.5 shadow-sm">
            <Link href="/leads/import">
              <Upload className="h-4 w-4" /> Import CSV List
            </Link>
          </Button>
        }
      />

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Stored Contacts</span>
            <Users className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
            {totalLeads.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-3 text-emerald-400" />
            Verified & ready for outreach campaigns
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Contact Lists</span>
            <FileSpreadsheet className="size-4 text-violet-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{lists.length}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Segmented campaign lists</p>
        </div>
      </div>

      {lists.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No lead lists yet"
          description="Upload a CSV with your prospect contacts. Auto-map custom columns, review data, and link to campaigns."
          action={
            <Button size="sm" asChild>
              <Link href="/leads/import" className="gap-1.5">
                <Upload className="h-4 w-4" /> Upload First List
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <LeadListCard
              key={list.id}
              id={list.id}
              name={list.name}
              leadCount={Number(list.leadCount || 0)}
              createdAt={list.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
