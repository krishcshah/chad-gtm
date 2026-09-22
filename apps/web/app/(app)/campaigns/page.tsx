import Link from "next/link";
import { Plus, Rocket } from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { listCampaigns } from "@/lib/queries";
import { Badge, Button, EmptyState, PageHeader, Progress, statusVariant } from "@smartreach/ui";
import { formatDate } from "@smartreach/shared";
import { CampaignActions } from "./campaign-actions";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { user, workspace } = await requireWorkspace();
  const campaigns = await listCampaigns(user.id, workspace.id, workspace.isDefault);

  return (
    <div className="page-stack">
      <PageHeader
        title="Campaigns"
        description={`Outreach campaigns for ${workspace.name}. Senders rotate automatically.`}
        actions={
          <Button size="sm" asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" /> New campaign
            </Link>
          </Button>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No campaigns yet"
          description="Pick a lead list, some senders, and a template — then hit Start."
          action={
            <Button size="sm" asChild>
              <Link href="/campaigns/new">
                <Plus className="h-4 w-4" /> Create campaign
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium text-right">Replies</th>
                <th className="px-4 py-3 font-medium text-right">Failed</th>
                <th className="px-4 py-3 font-medium text-right">Bounced</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={c.status === "draft" ? `/campaigns/new?draft=${c.id}` : `/campaigns/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.sent}/{c.total} sent
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(c.status)} dot={c.status === "running"}>
                        {c.status === "draft" ? "Draft" : c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex w-32 items-center gap-2">
                        <Progress value={pct} className="h-1.5" />
                        <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.replied}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.failed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.bounced}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {c.status === "draft" ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/campaigns/new?draft=${c.id}`}>Resume</Link>
                          </Button>
                        ) : null}
                        <CampaignActions id={c.id} status={c.status} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
