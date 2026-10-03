"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@smartreach/ui";

export function ChadGtmCalculator() {
  const [emailVolume, setEmailVolume] = useState<number>(3000);

  // Dynamic cost calculation
  const chadGtmCost = Math.round(emailVolume * 0.03); // 3 cents per email
  // Traditional stack: Apollo ($99) + Instantly ($97) + 5 inboxes ($36) = $232 base + lead volume scaling
  const baseCompetitorStack = 232;
  const competitorLeadScale = emailVolume > 2000 ? Math.round(((emailVolume - 2000) / 1000) * 35) : 0;
  const traditionalCost = baseCompetitorStack + competitorLeadScale;

  const monthlySavings = Math.max(0, traditionalCost - chadGtmCost);
  const annualSavings = monthlySavings * 12;
  const savingsPct = Math.round((monthlySavings / traditionalCost) * 100);

  return (
    <section id="roi-calculator" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black font-mono overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Header with Title and Savings Badge */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-zinc-800 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
              <TrendingUp className="size-3 text-white" />
              LIVE ROI & STACK COMPARISON CALCULATOR
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white uppercase tracking-tight">
              How Much Will You Save With ChadGTM?
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400 font-sans max-w-xl leading-relaxed">
              Calculate the exact capital you keep in your business compared to paying monthly SaaS seat taxes across Apollo, Instantly, and burner domains.
            </p>
          </div>

          <div className="border border-emerald-500/40 bg-zinc-950 p-4 sm:p-5 text-left md:text-right shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold block">
              Estimated Annual Savings
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-0.5">
              ${annualSavings.toLocaleString()} <span className="text-xs text-zinc-500 font-normal">/ year</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-1 font-sans">
              Keep <strong>{savingsPct}%</strong> more pipeline capital
            </div>
          </div>
        </div>

        {/* Calculator Main Box */}
        <div className="border border-zinc-800 bg-zinc-950 p-6 sm:p-10 space-y-8">
          {/* Slider Header & Controller */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs text-zinc-300 uppercase tracking-wider font-bold">
                Planned Monthly Outbound Volume:
              </span>
              <span className="text-sm font-bold text-white border border-zinc-700 bg-black px-3 py-1.5 self-start sm:self-auto">
                {emailVolume.toLocaleString()} EMAILS / MONTH
              </span>
            </div>

            <input
              type="range"
              min={500}
              max={25000}
              step={500}
              value={emailVolume}
              onChange={(e) => setEmailVolume(Number(e.target.value))}
              className="w-full h-2 bg-zinc-800 rounded-none appearance-none cursor-pointer accent-white"
            />

            <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
              <span>500 / mo</span>
              <span>5,000 / mo</span>
              <span>10,000 / mo</span>
              <span>15,000 / mo</span>
              <span>25,000 / mo</span>
            </div>
          </div>

          {/* Side by Side Cost Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4">
            {/* ChadGTM Cost Card (Highlighted) */}
            <div className="border border-white bg-black p-6 space-y-3 relative">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-white" /> ChadGTM (All-in-One Engine)
                </span>
                <span className="border border-white bg-white text-black text-[9px] font-bold px-2 py-0.5 uppercase tracking-widest">
                  Pay Just 3¢ / Email
                </span>
              </div>

              <div className="flex items-baseline gap-2 pt-2 border-y border-zinc-800 py-3">
                <span className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                  ${chadGtmCost}
                </span>
                <span className="text-xs text-zinc-400 uppercase tracking-widest">/ month total</span>
              </div>

              <div className="space-y-1.5 text-xs text-zinc-300 font-sans pt-1">
                <div className="flex items-center gap-2">
                  <Check className="size-3 text-emerald-400 shrink-0" />
                  <span>Core Platform Software: <strong className="text-white font-mono">$0 / month</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="size-3 text-emerald-400 shrink-0" />
                  <span>100M+ Global Leads Directory: <strong className="text-white font-mono">$0 Included</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="size-3 text-emerald-400 shrink-0" />
                  <span>Turnkey Admin-Supplied Mailboxes: <strong className="text-white font-mono">Zero Setup ($0)</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="size-3 text-emerald-400 shrink-0" />
                  <span>Dispatched: <strong className="text-white font-mono">{emailVolume.toLocaleString()} emails × $0.03</strong></span>
                </div>
              </div>
            </div>

            {/* Traditional Fragmented Stack Card */}
            <div className="border border-zinc-800 bg-zinc-900/50 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Fragmented Legacy Stack
                </span>
                <span className="border border-zinc-800 bg-black text-zinc-500 text-[9px] uppercase tracking-widest px-2 py-0.5">
                  3+ Subscriptions
                </span>
              </div>

              <div className="flex items-baseline gap-2 pt-2 border-y border-zinc-800 py-3">
                <span className="text-4xl sm:text-5xl font-bold text-zinc-500 line-through tracking-tight">
                  ${traditionalCost}
                </span>
                <span className="text-xs text-zinc-500 uppercase tracking-widest">/ month total</span>
              </div>

              <div className="space-y-1.5 text-xs text-zinc-500 font-sans pt-1">
                <div>• Apollo Leads Subscription: $99 / mo</div>
                <div>• Instantly Outreach Software: $97 / mo</div>
                <div>• Google Workspace Accounts & Domains: $36–$96 / mo</div>
                <div>• Warmup & Verification Add-ons: Extra fees</div>
              </div>
            </div>
          </div>

          {/* Bottom Action Footer */}
          <div className="pt-6 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-zinc-400 font-sans">
              No contracts. No monthly seat fees. Send what you need and pause anytime for <strong className="text-white font-mono">$0/mo</strong>.
            </div>

            <Button asChild size="lg" className="rounded-none bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-wider text-xs border border-white h-11 px-8 w-full sm:w-auto shadow-lg">
              <Link href="/signup">
                Deploy Free GTM Engine <ArrowRight className="size-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
