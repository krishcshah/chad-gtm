"use client";

import { Check, X, Sparkles, Minus } from "lucide-react";
import { Badge } from "@smartreach/ui";

export function ChadGtmComparisonTable() {
  const rows = [
    {
      feature: "Platform Software Fee",
      chadGtm: "$0 / month (Free Forever)",
      instantly: "$97 / month",
      apollo: "$99 / user / month",
      agency: "$4,500 / month retainer",
    },
    {
      feature: "Autonomous URL-to-Campaign",
      chadGtm: "Instant (60s Chad Neural Core™)",
      instantly: "Manual campaign setup",
      apollo: "Manual list building",
      agency: "2-3 weeks onboarding",
    },
    {
      feature: "Built-In B2B Lead Directory",
      chadGtm: "100M+ verified leads included ($0)",
      instantly: "Requires paid add-on ($$$)",
      apollo: "Strict export credit limits",
      agency: "Bundled in retainer",
    },
    {
      feature: "Mailbox Setup Requirement",
      chadGtm: "Zero Setup · 100% Admin Supplied & Maintained",
      instantly: "Must purchase domains & DNS",
      apollo: "Requires external SMTP",
      agency: "Agency managed domains",
    },
    {
      feature: "Autonomous Dispatch Cost",
      chadGtm: "Strictly 3¢ per email delivered",
      instantly: "Software + $6/inbox/mo",
      apollo: "User seat + export credits",
      agency: "High bundled retainers",
    },
    {
      feature: "Voice & Tone Calibration",
      chadGtm: "Tinder-Style Swipe Deck",
      instantly: "Manual copywriting",
      apollo: "Generic templates",
      agency: "Multiple client review calls",
    },
    {
      feature: "Safe Mailbox Pacing",
      chadGtm: "Strict 30/day per mailbox",
      instantly: "Manual configuration",
      apollo: "Manual configuration",
      agency: "Agency handled",
    },
    {
      feature: "Two-Way Unified Inbox",
      chadGtm: "Included (UniBox)",
      instantly: "Included",
      apollo: "Basic inbox",
      agency: "Slack forwarding",
    },
  ];

  return (
    <section id="comparison" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-none border border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 mb-4">
            <Sparkles className="size-3 text-zinc-400" />
            BENCHMARK // COMPETITIVE MATRIX
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase">
            Comparative Architecture
          </h2>
          <p className="mt-4 text-xs sm:text-sm text-zinc-400 font-mono">
            Direct capability matrix comparing ChadGTM against legacy cold email stacks and agencies.
          </p>
        </div>

        {/* Mobile Swipe Hint */}
        <div className="sm:hidden text-center text-[10px] text-zinc-500 mb-3 flex items-center justify-center gap-1.5 font-mono uppercase tracking-widest">
          <span>← Swipe horizontally to inspect matrix →</span>
        </div>

        <div className="mx-auto max-w-5xl rounded-none border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-black font-mono">
                  <th className="p-3.5 sm:p-4 text-zinc-400 uppercase tracking-wider text-[11px]">Feature Specification</th>
                  <th className="p-3.5 sm:p-4 text-white bg-zinc-900 border-x border-zinc-700">
                    <div className="flex items-center gap-2">
                      <span className="font-bold uppercase tracking-wider text-xs">CHADGTM</span>
                      <span className="border border-white bg-white text-black text-[9px] font-bold px-1 py-0.2 rounded-none">Active</span>
                    </div>
                  </th>
                  <th className="p-3.5 sm:p-4 text-zinc-400 uppercase tracking-wider text-[11px]">Instantly.ai</th>
                  <th className="p-3.5 sm:p-4 text-zinc-400 uppercase tracking-wider text-[11px]">Apollo.io</th>
                  <th className="p-3.5 sm:p-4 text-zinc-400 uppercase tracking-wider text-[11px]">SDR Agency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 font-mono text-xs">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-3.5 sm:p-4 font-sans font-medium text-zinc-200">
                      {r.feature}
                    </td>
                    <td className="p-3.5 sm:p-4 bg-zinc-900/70 border-x border-zinc-700 font-bold text-white">
                      {r.chadGtm}
                    </td>
                    <td className="p-3.5 sm:p-4 text-zinc-400">
                      {r.instantly}
                    </td>
                    <td className="p-3.5 sm:p-4 text-zinc-400">
                      {r.apollo}
                    </td>
                    <td className="p-3.5 sm:p-4 text-zinc-400">
                      {r.agency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
