"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, Check, DollarSign, Sparkles, TrendingUp, Zap } from "lucide-react";
import { Button } from "@smartreach/ui";

export function ChadGtmCalculator() {
  const [volume, setVolume] = useState<number>(5000);

  // Math
  const chadGtmCost = Math.round(volume * 0.03); // $0.03 per email
  // Traditional stack: Apollo Professional ($99) + Instantly Growth ($97) + 5 secondary domains ($60) + Google Workspace seats ($36) = $292 base + extra credits
  const baseCompetitorStack = 292;
  const competitorLeadScale = volume > 2500 ? Math.round(((volume - 2500) / 1000) * 45) : 0;
  const totalCompetitorCost = baseCompetitorStack + competitorLeadScale;

  const monthlySavings = Math.max(0, totalCompetitorCost - chadGtmCost);
  const annualSavings = monthlySavings * 12;
  const savingsPct = Math.round((monthlySavings / totalCompetitorCost) * 100);

  return (
    <section id="roi-calculator" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-zinc-950 font-mono">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 border border-zinc-800 bg-black px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-4">
            <Calculator className="size-3 text-white" />
            ECONOMIC BENCHMARK // COST AUDIT
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase">
            Outbound Cost Matrix
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
            Drag the slider to calculate the exact cash differential between fragmented SaaS seat licenses and ChadGTM's 3¢ pay-per-email managed pool.
          </p>
        </div>

        {/* Calculator Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Interactive Volume Controls (7 cols) */}
          <div className="lg:col-span-7 border border-zinc-800 bg-black p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              {/* Target Volume Display */}
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-zinc-800 pb-4">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold block">
                    Planned Monthly Outbound Volume
                  </span>
                  <span className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
                    {volume.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-400 ml-2 uppercase tracking-widest">
                    Emails / Month
                  </span>
                </div>

                <div className="text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 uppercase tracking-wider self-start sm:self-auto">
                  Safe Rotation: ~{Math.ceil(volume / (30 * 20))} Mailboxes
                </div>
              </div>

              {/* Slider Control */}
              <div className="space-y-3">
                <input
                  type="range"
                  min={1000}
                  max={25000}
                  step={500}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-none appearance-none cursor-pointer accent-white"
                />
                <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  <span>1,000 / mo</span>
                  <span>5,000 / mo</span>
                  <span>10,000 / mo</span>
                  <span>25,000 / mo</span>
                </div>
              </div>

              {/* Cost Breakdown Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-1.5">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                    Fragmented Competitor Stack
                  </span>
                  <div className="text-2xl font-bold text-zinc-300">
                    ${totalCompetitorCost} <span className="text-xs text-zinc-600 font-normal">/ mo</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 space-y-0.5 pt-1">
                    <div>• Apollo Seat: $99</div>
                    <div>• Instantly Sub: $97</div>
                    <div>• Domains & Inboxes: $96+</div>
                  </div>
                </div>

                <div className="border border-white bg-zinc-950 p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white uppercase tracking-widest font-bold">
                      ChadGTM Managed Pool
                    </span>
                    <span className="text-[9px] bg-white text-black font-bold px-1 py-0.2">
                      3¢ FLAT
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    ${chadGtmCost} <span className="text-xs text-zinc-400 font-normal">/ mo</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 space-y-0.5 pt-1">
                    <div>• Core Platform: $0</div>
                    <div>• 100M+ Leads Directory: Included ($0)</div>
                    <div>• 3¢ per delivered email</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Note */}
            <p className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/80">
              * Turnkey Infrastructure: All mailboxes are pre-warmed, authenticated, and managed directly by our admin fleet. Zero DNS or domain setup required.
            </p>
          </div>

          {/* Right Column: ROI Impact Board (5 cols) */}
          <div className="lg:col-span-5 border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-emerald-400 border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5">
                <TrendingUp className="size-3" />
                <span>Verified ROI Optimization</span>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-widest block font-bold">
                  Annual Capital Saved
                </span>
                <div className="text-4xl sm:text-5xl font-bold text-white tracking-tight mt-1">
                  ${annualSavings.toLocaleString()}
                </div>
                <div className="text-xs text-emerald-400 mt-1 font-bold">
                  {savingsPct}% reduction in customer acquisition cost
                </div>
              </div>

              {/* What This Capital Covers */}
              <div className="border-t border-zinc-800 pt-4 space-y-2 text-xs">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block">
                  Capital Efficiency Impact
                </span>
                <div className="space-y-1.5 text-zinc-300 text-[11px] font-sans">
                  <div className="flex items-center gap-2">
                    <Check className="size-3 text-white shrink-0" />
                    <span>Eliminates $2,400+ annual software tax</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="size-3 text-white shrink-0" />
                    <span>Zero upfront domain or DNS infrastructure overhead</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="size-3 text-white shrink-0" />
                    <span>Pay only for outbound you actually trigger</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800">
              <Button asChild size="lg" className="w-full rounded-none bg-white text-black font-bold uppercase tracking-wider text-xs hover:bg-zinc-200 border border-white h-11">
                <Link href="/signup">
                  Deploy at $0 Platform Fee <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
