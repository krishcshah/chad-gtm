"use client";

import Link from "next/link";
import { ArrowUpRight, Rocket } from "lucide-react";
import { Badge, Progress, cn } from "@smartreach/ui";

interface CampaignItem {
  id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  replied: number;
}

interface PerformanceBreakdownProps {
  campaigns: CampaignItem[];
}

export function PerformanceBreakdown({ campaigns = [] }: PerformanceBreakdownProps) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 overflow-hidden font-sans shadow-xs card-shine shrink-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Rocket className="size-3.5 text-white" />
          <span className="text-xs font-semibold text-white tracking-tight">
            Campaign Delivery Pacing ({campaigns.length})
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-white transition-colors"
          >
            All Campaigns & Leads <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="overflow-x-auto min-h-[140px]">
        {campaigns.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 shadow-2xs">
              <Rocket className="size-4" />
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-white text-xs">No active campaigns running</p>
              <p className="text-zinc-400 text-xs font-normal">
                Autonomous GTM runs will report real-time email delivery and pacing here.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-900/30 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                <th className="px-4 py-2.5">Campaign & Leads</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Pacing</th>
                <th className="px-4 py-2.5 text-right">Dispatched</th>
                <th className="px-4 py-2.5 text-right">Replies</th>
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
                    <td className="px-4 py-3">
                      <div>
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="font-medium text-white hover:underline text-xs"
                        >
                          {c.name}
                        </Link>
                        <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                          {total.toLocaleString()} System-Selected Leads
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider border",
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
                    <td className="px-4 py-3">
                      <div className="w-28 space-y-1">
                        <Progress value={pct} className="h-1.5 rounded-full bg-zinc-900 [&>div]:bg-white" />
                        <div className="flex justify-between text-[10px] text-zinc-500 font-mono tabular-nums">
                          <span>{pct}% Paced</span>
                          <span>30/day</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white font-medium font-mono">
                      {sent.toLocaleString()} / {total.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-semibold text-white font-mono">{replied}</span>
                      {sent > 0 && (
                        <span className="text-[10px] text-zinc-400 font-mono ml-1.5">
                          ({((replied / sent) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
