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
      highlight: true,
    },
    {
      feature: "Autonomous URL-to-Campaign",
      chadGtm: "✅ In 60s via Gemini 3.8 Flash",
      instantly: "❌ Manual campaign setup",
      apollo: "❌ Manual list building",
      agency: "⚠️ 2-3 weeks onboarding",
      highlight: true,
    },
    {
      feature: "Built-In B2B Lead Directory",
      chadGtm: "✅ 329,563 verified leads included free",
      instantly: "❌ Extra paid add-on ($$$)",
      apollo: "⚠️ Strict export limit credits",
      agency: "⚠️ Included in high retainer",
      highlight: true,
    },
    {
      feature: "Mailbox Setup Requirement",
      chadGtm: "✅ Zero setup (Pre-warmed pool) OR BYO",
      instantly: "❌ Must buy domains & setup DNS",
      apollo: "❌ Requires external SMTP",
      agency: "⚠️ Agency manages domains",
      highlight: true,
    },
    {
      feature: "Autonomous Dispatch Cost",
      chadGtm: "Pay just 3¢ per email (or $0 BYO)",
      instantly: "Pay software + $6/inbox/mo",
      apollo: "Pay user license + export credits",
      agency: "Expensive bundled fee",
      highlight: true,
    },
    {
      feature: "Voice & Tone Calibration",
      chadGtm: "✅ Tinder-Style Swipe Deck",
      instantly: "❌ Manual text editing",
      apollo: "❌ Generic AI templates",
      agency: "⚠️ Multiple review calls",
      highlight: false,
    },
    {
      feature: "Safe Mailbox Pacing",
      chadGtm: "✅ Strict 30/day per box",
      instantly: "⚠️ Manual user configuration",
      apollo: "⚠️ Manual user configuration",
      agency: "✅ Agency handled",
      highlight: false,
    },
    {
      feature: "Two-Way Unified Inbox",
      chadGtm: "✅ Unified UniBox included free",
      instantly: "✅ Included",
      apollo: "⚠️ Basic inbox",
      agency: "❌ Forwarded via Slack",
      highlight: false,
    },
  ];

  return (
    <section id="comparison" className="relative py-24 sm:py-32 border-t border-white/10 bg-zinc-950 overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-md mb-4">
            <Sparkles className="size-3.5 text-indigo-400" />
            Competitive Matrix
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Why High-Growth Teams Are
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
              Replacing Their Legacy Outbound Stack
            </span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            Compare ChadGTM against legacy software subscriptions and traditional agencies.
          </p>
        </div>

        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-zinc-900/50 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="p-4 sm:p-5 font-bold text-zinc-400">Feature & Capabilities</th>
                  <th className="p-4 sm:p-5 font-bold text-white bg-violet-600/15 border-x border-violet-500/30">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white">ChadGTM</span>
                      <Badge className="bg-cyan-500 text-black text-[9px] font-bold py-0">You Are Here</Badge>
                    </div>
                  </th>
                  <th className="p-4 sm:p-5 font-semibold text-zinc-400">Instantly.ai</th>
                  <th className="p-4 sm:p-5 font-semibold text-zinc-400">Apollo.io</th>
                  <th className="p-4 sm:p-5 font-semibold text-zinc-400">SDR Agency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-xs">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 sm:p-5 font-sans font-medium text-zinc-200">
                      {r.feature}
                    </td>
                    <td className="p-4 sm:p-5 bg-violet-600/10 border-x border-violet-500/20 font-bold text-emerald-400">
                      {r.chadGtm}
                    </td>
                    <td className="p-4 sm:p-5 text-zinc-400">
                      {r.instantly}
                    </td>
                    <td className="p-4 sm:p-5 text-zinc-400">
                      {r.apollo}
                    </td>
                    <td className="p-4 sm:p-5 text-zinc-400">
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
