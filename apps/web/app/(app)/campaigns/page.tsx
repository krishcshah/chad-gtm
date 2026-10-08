import Link from "next/link";
import { ArrowRight, Plus, Rocket, Sparkles, Target } from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { listCampaigns } from "@/lib/queries";
import { Badge, Button, Progress, cn } from "@smartreach/ui";
import { formatDate } from "@smartreach/shared";
import { CampaignActions } from "./campaign-actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Campaigns & Target Leads · ChadGTM" };

export default async function CampaignsPage() {
  const { user, workspace } = await requireWorkspace();
  const campaigns = await listCampaigns(user.id, workspace.id, workspace.isDefault);

  return (
    <div className="page-stack space-y-6 max-w-7xl mx-auto font-sans">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-0.5 text-[10px] font-medium text-zinc-300">
              Autonomous Outbound
            </span>
            <span className="rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-0.5 text-[10px] font-medium text-zinc-400">
              System-Matched Leads
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Campaigns & Target Leads
          </h1>
          <p className="text-xs text-zinc-400 font-normal mt-1">
            Active outbound campaigns and their system-selected verified B2B lead lists.
          </p>
        </div>

        <Button
          asChild
          className="rounded-md bg-white hover:bg-zinc-200 text-black font-semibold text-xs border border-white gap-2 h-10 px-4 shrink-0 shadow-sm"
        >
          <Link href="/chad-gtm">
            <Sparkles className="size-3.5" /> Launch Autonomous GTM
          </Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-12 text-center space-y-4 card-shine">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-2xs">
            <Rocket className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">
              No Outbound Campaigns Yet
            </h3>
            <p className="text-xs text-zinc-400 font-normal max-w-md mx-auto leading-relaxed">
              Enter your company website to let our proprietary Chad Neural Core extract your ICP, match verified decision-makers from our 100M+ global directory, and start autonomous outreach in under 60 seconds.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="rounded-md bg-white text-black font-semibold text-xs hover:bg-zinc-200 border border-white gap-2 shadow-sm"
          >
            <Link href="/chad-gtm">
              <Sparkles className="size-3.5" /> Launch First Autonomous Run
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 overflow-x-auto shadow-xs card-shine">
          <table className="w-full min-w-[700px] text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-900/30 text-zinc-400 uppercase tracking-wider text-[10px] font-semibold">
                <th className="px-4 py-3">Campaign & Leads</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Delivery Progress</th>
                <th className="px-4 py-3 text-right">Replies</th>
                <th className="px-4 py-3 text-right">Failed</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {campaigns.map((c) => {
                const total = Number(c.total || 0);
                const sent = Number(c.sent || 0);
                const replied = Number(c.replied || 0);
                const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

                return (
                  <tr key={c.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium text-white hover:underline text-xs"
                      >
                        {c.name}
                      </Link>
                      <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                        {total.toLocaleString()} System-Selected Leads
                      </p>
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border",
                          c.status === "running"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-zinc-900 text-zinc-400 border-zinc-800"
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            c.status === "running" ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
                          )}
                        />
                        {c.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="w-36 space-y-1">
                        <Progress value={pct} className="h-1.5 rounded-full bg-zinc-900 [&>div]:bg-white" />
                        <div className="flex justify-between text-[10px] text-zinc-500 font-mono tabular-nums">
                          <span>{sent}/{total} sent</span>
                          <span>{pct}%</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right tabular-nums">
                      <span className="font-semibold text-white font-mono">{replied}</span>
                      {sent > 0 && (
                        <span className="text-[10px] text-zinc-400 font-mono ml-1">
                          ({((replied / sent) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right tabular-nums text-zinc-500 font-mono">
                      {c.failed}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-400 text-[11px] font-mono">
                      {formatDate(c.createdAt)}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="rounded-md border-zinc-800 bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800 hover:text-white text-xs font-medium h-7 px-2.5 shadow-2xs"
                        >
                          <Link href={`/campaigns/${c.id}`}>View Leads</Link>
                        </Button>
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
