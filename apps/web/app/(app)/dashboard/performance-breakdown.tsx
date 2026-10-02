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
    <div className="rounded-none border border-zinc-800 bg-zinc-950 overflow-hidden font-mono shadow-none shrink-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 bg-black px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Rocket className="size-3.5 text-white" />
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            Campaign Delivery Pacing ({campaigns.length})
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white"
          >
            All Campaigns & Leads <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="overflow-x-auto min-h-[140px]">
        {campaigns.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-none border border-zinc-800 bg-black text-white">
              <Rocket className="size-4" />
            </div>
            <div className="space-y-0.5">
              <p className="font-bold text-white uppercase tracking-wider text-xs">No active campaigns running</p>
              <p className="text-zinc-500 text-[11px] font-sans">
                Autonomous GTM runs will report real-time email delivery and pacing here.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 bg-black/60 text-zinc-400 uppercase tracking-widest text-[10px]">
                <th className="px-4 py-2.5 font-bold">Campaign & Leads</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Pacing</th>
                <th className="px-4 py-2.5 text-right font-bold">Dispatched</th>
                <th className="px-4 py-2.5 text-right font-bold">Replies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
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
                          className="font-bold text-white uppercase tracking-wider hover:underline text-xs"
                        >
                          {c.name}
                        </Link>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {total.toLocaleString()} System-Selected Leads
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-none px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest border",
                          c.status === "running"
                            ? "bg-zinc-900 text-white border-zinc-700"
                            : "bg-black text-zinc-500 border-zinc-800"
                        )}
                      >
                        <span
                          className={cn(
                            "size-1 rounded-none",
                            c.status === "running" ? "bg-white animate-pulse" : "bg-zinc-600"
                          )}
                        />
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-28 space-y-1">
                        <Progress value={pct} className="h-1 rounded-none bg-zinc-900 [&>div]:bg-white" />
                        <div className="flex justify-between text-[9px] text-zinc-500 tabular-nums">
                          <span>{pct}% Paced</span>
                          <span>30/day</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white font-bold">
                      {sent.toLocaleString()} / {total.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-bold text-white">{replied}</span>
                      {sent > 0 && (
                        <span className="text-[10px] text-zinc-500 ml-1.5">
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
