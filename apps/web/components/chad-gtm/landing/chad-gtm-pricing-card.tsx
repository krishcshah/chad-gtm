"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge, Button, cn } from "@smartreach/ui";

export function ChadGtmPricingCard({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [emailVolume, setEmailVolume] = useState<number>(2000);

  // Dynamic cost calculation
  const chadGtmManagedCost = Math.round(emailVolume * 0.03); // 3 cents per email
  const traditionalCost = Math.round(99 + 97 + 36); // Apollo ($99) + Instantly ($97) + 5 inboxes ($36) = $232 base
  const monthlySavings = Math.max(0, traditionalCost - chadGtmManagedCost);
  const annualSavings = monthlySavings * 12;

  return (
    <section id="pricing" className="relative py-20 sm:py-28 overflow-hidden border-t border-zinc-800 bg-black">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-none border border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 mb-4">
            <Sparkles className="size-3 text-zinc-400" />
            RADICAL TRANSPARENCY // PRICING
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase">
            $0 / Month Platform.
            <br />
            <span className="text-zinc-500 font-mono text-2xl sm:text-4xl block mt-1">
              [JUST 3 CENTS PER EMAIL]
            </span>
          </h2>
          <p className="mt-4 text-xs sm:text-sm text-zinc-400 font-mono leading-relaxed max-w-2xl mx-auto">
            Zero recurring software subscription fees. Connect your own mailboxes for $0, or use our pre-warmed shared mailbox pool at 3¢ per email delivered.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl mx-auto items-stretch">
          {/* Card 1: Core Platform ($0/mo Forever) */}
          <div className="relative rounded-none border border-zinc-800 bg-zinc-950 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3 mb-4 font-mono">
                <span className="border border-zinc-700 bg-black text-zinc-300 text-[10px] uppercase tracking-widest px-2 py-0.5">
                  Free Forever
                </span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Bring Your Own SMTP</span>
              </div>

              <h3 className="text-xl font-bold text-white uppercase tracking-wider font-mono">Self-Managed Engine</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed font-sans">
                Full platform access with zero restrictions. Connect unlimited custom SMTP/IMAP inboxes.
              </p>

              <div className="mt-6 flex items-baseline gap-2 border-y border-zinc-800 py-4 font-mono">
                <span className="text-4xl sm:text-5xl font-bold text-white">$0</span>
                <span className="text-xs text-zinc-500 uppercase tracking-widest">/ month forever</span>
              </div>

              {/* Features List */}
              <div className="mt-6 space-y-2.5 font-mono text-xs">
                {[
                  "Unlimited campaigns & automated sequences",
                  "Unlimited sender mailbox connections",
                  "329,563 verified Apollo B2B leads directory access",
                  "AI email personalization with Gemini 3.8 Flash",
                  "Unified UniBox (two-way multi-account sync)",
                  "Smart rotation & rate pacing protection",
                  "Automated stop-on-reply tracking",
                  "Zero credit card required to start",
                ].map((feat) => (
                  <div key={feat} className="flex items-center gap-2 text-zinc-300 text-[11px]">
                    <Check className="size-3 text-white shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-800">
              <Button asChild size="lg" className="w-full rounded-none bg-black hover:bg-zinc-900 text-white font-mono uppercase tracking-wider text-xs border border-zinc-800">
                <Link href="/signup">
                  Get Started Free ($0/mo) <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
              <p className="mt-2 text-center text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                Open Access Architecture
              </p>
            </div>
          </div>

          {/* Card 2: Autonomous ChadGTM Managed Dispatch (Highlighted) */}
          <div className="relative rounded-none border border-white bg-black p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3 mb-4 font-mono">
                <span className="border border-white bg-white text-black text-[10px] font-bold uppercase tracking-widest px-2 py-0.5">
                  Autonomous Pool
                </span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-400">Zero DNS Setup</span>
              </div>

              <h3 className="text-xl font-bold text-white uppercase tracking-wider font-mono">Managed Sender Pool</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed font-sans">
                No DNS configuration, warmup periods, or secondary domain expenses. Dispatched from our pre-warmed pool.
              </p>

              <div className="mt-6 flex items-baseline justify-between border-y border-zinc-800 py-4 font-mono">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl sm:text-5xl font-bold text-white">3¢</span>
                  <span className="text-xs text-zinc-400 uppercase tracking-widest">per email delivered</span>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 border border-zinc-800 bg-zinc-950 px-2 py-0.5">
                  $0 Base Fee
                </span>
              </div>

              {/* Features List */}
              <div className="mt-6 space-y-2.5 font-mono text-xs">
                {[
                  "Pay just 3 cents per email — strictly pay for volume sent",
                  "Zero domain purchase, DNS setup, or warmup hassle",
                  "Sent from pre-warmed shared enterprise mailboxes",
                  "Strict 30 emails/day per mailbox pacing for 99%+ deliverability",
                  "Full SPF, DKIM, DMARC, and MX verification on all routes",
                  "Tinder-Style Voice Calibration Deck before launch",
                  "Autonomous lead matching against 329k+ Apollo directory",
                  "Stop anytime — zero recurring monthly commitment",
                ].map((feat) => (
                  <div key={feat} className="flex items-center gap-2 text-zinc-200 text-[11px]">
                    <Check className="size-3 text-white shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-800">
              <Button asChild size="lg" className="w-full rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider border border-white">
                <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                  Launch Autonomous Engine <Rocket className="size-3.5 ml-1.5" />
                </Link>
              </Button>
              <p className="mt-2 text-center text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Deploy in under 60 seconds
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Volume & Cost Savings Calculator */}
        <div className="mt-12 max-w-4xl mx-auto rounded-none border border-zinc-800 bg-zinc-950 p-5 sm:p-8 font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-400 mb-1">
                <TrendingUp className="size-3.5 text-white" />
                Cost Savings Calculator
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">
                Volume Pacing & Unit Economics
              </h3>
            </div>
            <div className="rounded-none border border-zinc-800 bg-black px-3.5 py-1.5 text-right">
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 block">
                Estimated Annual Savings
              </span>
              <div className="text-lg sm:text-xl font-bold text-white">
                ${annualSavings.toLocaleString()} / YEAR
              </div>
            </div>
          </div>

          {/* Volume Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 uppercase tracking-wider">
                Monthly Target Volume:
              </span>
              <span className="text-xs font-bold text-white border border-zinc-800 bg-black px-2.5 py-1">
                {emailVolume.toLocaleString()} EMAILS / MONTH
              </span>
            </div>

            <input
              type="range"
              min={500}
              max={15000}
              step={500}
              value={emailVolume}
              onChange={(e) => setEmailVolume(Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-none appearance-none cursor-pointer accent-white"
            />

            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>500/MO</span>
              <span>5,000/MO</span>
              <span>10,000/MO</span>
              <span>15,000/MO</span>
            </div>
          </div>

          {/* Side by Side Cost Breakdown */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* ChadGTM Cost */}
            <div className="rounded-none border border-zinc-700 bg-black p-4 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                <span className="text-white font-semibold">
                  ChadGTM Pool
                </span>
                <span className="text-zinc-400 border border-zinc-800 bg-zinc-950 px-1.5 py-0.5">
                  3¢ / email
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1">
                <span className="text-3xl font-bold text-white">
                  ${chadGtmManagedCost}
                </span>
                <span className="text-[10px] text-zinc-500 uppercase">/ month</span>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Includes software ($0), 329k lead directory ($0), and {emailVolume.toLocaleString()} emails dispatched via pre-warmed pool.
              </p>
            </div>

            {/* Traditional Stack Cost */}
            <div className="rounded-none border border-zinc-800 bg-black p-4 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                <span className="text-zinc-500">
                  Legacy Software Stack
                </span>
                <span className="text-zinc-500">
                  Multiple Tools
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1">
                <span className="text-3xl font-bold text-zinc-600 line-through">
                  ${traditionalCost}
                </span>
                <span className="text-[10px] text-zinc-600 uppercase">/ month</span>
              </div>
              <p className="text-[11px] text-zinc-500 font-sans leading-relaxed">
                Apollo leads ($99/mo) + Instantly subscription ($97/mo) + 5 Google inboxes ($36/mo) + separate warmup tools.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
