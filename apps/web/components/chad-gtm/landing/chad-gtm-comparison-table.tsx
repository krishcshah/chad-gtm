"use client";

import { Check, X, Sparkles, Minus } from "lucide-react";

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
      chadGtm: "Instant (60s Autonomous Crawler)",
      instantly: "Manual campaign setup",
      apollo: "Manual list building",
      agency: "2-3 weeks onboarding",
    },
    {
      feature: "Built-In B2B Lead Directory",
      chadGtm: "10.2M verified leads included ($0)",
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
      chadGtm: "Strictly 5¢ per email delivered",
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
    {
      feature: "Mailbox Ops & Reply Management",
      chadGtm: "Autonomous Agent Included ($0)",
      instantly: "Manual DIY labor (20+ hrs/mo)",
      apollo: "Manual DIY labor (20+ hrs/mo)",
      agency: "$1,500 – $4,500 / mo retainer",
    },
  ];

  return (
    <section id="comparison" className="relative py-24 sm:py-32 border-t border-zinc-800/80 bg-[#050505] overflow-hidden font-sans">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-none border border-emerald-500/30 bg-emerald-950/20 px-3 py-1 font-mono text-xs text-emerald-400 mb-4">
            <Sparkles className="size-3 text-emerald-400" />
            <span>Feature &amp; Economics Benchmark</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            How AutoGTM compares to the legacy stack.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            See why high-velocity founders are abandoning fragmented $1,200/mo toolchains for our autonomous $0/mo utility platform.
          </p>
        </div>

        {/* Mobile Swipe Hint */}
        <div className="sm:hidden text-center text-[11px] text-zinc-500 font-mono mb-3">
          ← Scroll horizontally to view full matrix →
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto rounded-none border border-zinc-800 bg-zinc-950 shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="py-4 px-5 text-zinc-400 font-mono uppercase tracking-wider text-[11px]">
                  Capability / Feature
                </th>
                <th className="py-4 px-5 font-bold text-white bg-emerald-950/30 border-x border-emerald-900/50">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-none bg-emerald-400 animate-pulse" />
                    <span>AutoGTM ($0/mo)</span>
                  </div>
                </th>
                <th className="py-4 px-5 text-zinc-400 font-mono uppercase tracking-wider text-[11px]">
                  Instantly.ai
                </th>
                <th className="py-4 px-5 text-zinc-400 font-mono uppercase tracking-wider text-[11px]">
                  Apollo.io
                </th>
                <th className="py-4 px-5 text-zinc-400 font-mono uppercase tracking-wider text-[11px]">
                  Cold Email Agency
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-4 px-5 font-medium text-zinc-300">{row.feature}</td>
                  <td className="py-4 px-5 font-semibold text-emerald-400 bg-emerald-950/20 border-x border-emerald-900/30">
                    {row.chadGtm}
                  </td>
                  <td className="py-4 px-5 text-zinc-400 font-mono">{row.instantly}</td>
                  <td className="py-4 px-5 text-zinc-400 font-mono">{row.apollo}</td>
                  <td className="py-4 px-5 text-zinc-400 font-mono">{row.agency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
