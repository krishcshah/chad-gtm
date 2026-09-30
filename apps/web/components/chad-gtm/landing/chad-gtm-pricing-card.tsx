"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  DollarSign,
  HelpCircle,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
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
    <section id="pricing" className="relative py-24 sm:py-32 overflow-hidden border-t border-white/10 bg-zinc-950">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[650px] rounded-full bg-violet-600/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 size-[450px] rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300 backdrop-blur-md mb-4">
            <Sparkles className="size-3.5 text-cyan-400" />
            Radically Transparent Economics
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            $0 / month Platform Fee.
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
              Pay Just 3 Cents Per Email.
            </span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 leading-relaxed">
            Never pay $97/month for cold email software or $100s for SDR seat licenses.
            ChadGTM platform is $0/mo forever. When using our autonomous shared mailbox pool, you pay just 3¢ per email.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
          {/* Card 1: Core Platform ($0/mo Forever) */}
          <div className="relative rounded-3xl border border-white/10 bg-zinc-900/60 p-8 sm:p-10 shadow-2xl backdrop-blur-xl flex flex-col justify-between transition-all hover:border-white/20">
            <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs py-1">
                  Free Forever Edition
                </Badge>
                <span className="text-xs text-zinc-400">Bring Your Own Mailboxes</span>
              </div>

              <h3 className="text-2xl font-bold text-white">Full Platform Access</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Complete outbound operating system with zero artificial restrictions. Connect unlimited SMTP/IMAP inboxes.
              </p>

              <div className="mt-6 flex items-baseline gap-2 border-y border-white/5 py-4">
                <span className="text-5xl font-extrabold tracking-tight text-white font-mono">$0</span>
                <span className="text-sm font-medium text-zinc-400">/ month forever</span>
              </div>

              {/* Features List */}
              <div className="mt-6 space-y-3">
                {[
                  "Unlimited campaigns & automated sequences",
                  "Unlimited email sender mailbox connections",
                  "Unlimited lead & contact storage with CSV imports",
                  "329,563 verified Apollo B2B leads directory access",
                  "AI email personalization with Gemini 3.8 Flash",
                  "Unified UniBox (two-way multi-account sync)",
                  "Smart rotation & rate pacing protection",
                  "Automated stop-on-reply tracking",
                  "Zero credit card required to start",
                ].map((feat) => (
                  <div key={feat} className="flex items-center gap-2.5 text-xs text-zinc-300">
                    <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      <Check className="size-2.5 stroke-[3]" />
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
              <Button asChild size="lg" className="w-full rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/10">
                <Link href="/signup">
                  Get Started Free ($0/mo) <ArrowRight className="size-4 ml-1.5" />
                </Link>
              </Button>
              <p className="mt-2.5 text-center text-[11px] text-zinc-500">
                Full source-available engine · Zero hidden costs
              </p>
            </div>
          </div>

          {/* Card 2: Autonomous ChadGTM Managed Dispatch (Highlighted) */}
          <div className="relative rounded-3xl border-2 border-violet-500/50 bg-gradient-to-b from-violet-950/40 via-zinc-900/90 to-zinc-950 p-8 sm:p-10 shadow-2xl shadow-violet-950/50 backdrop-blur-xl flex flex-col justify-between transition-all hover:border-violet-400/80">
            {/* Top highlight glow */}
            <div className="pointer-events-none absolute -top-12 -right-12 size-40 rounded-full bg-cyan-400/20 blur-2xl" />

            <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 px-3 py-1 text-xs font-bold text-white shadow-md shadow-violet-500/30">
                  <Sparkles className="size-3 text-cyan-200 fill-cyan-200" />
                  Most Popular · Fully Autonomous
                </div>
                <span className="text-xs font-semibold text-cyan-400">Zero Technical Setup</span>
              </div>

              <h3 className="text-2xl font-bold text-white">Autonomous ChadGTM Pool</h3>
              <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                No DNS configuration, no warmup periods, and no buying secondary domains. Dispatched from our pre-warmed enterprise mailboxes.
              </p>

              <div className="mt-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-y border-white/10 py-4">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-5xl font-extrabold tracking-tight text-white font-mono">3¢</span>
                  <span className="text-sm font-semibold text-cyan-300">per email delivered</span>
                </div>
                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                  $0 Platform Fee
                </span>
              </div>

              {/* Features List */}
              <div className="mt-6 space-y-3">
                {[
                  "Pay just 3 cents per email — strictly pay for what you send",
                  "Zero domain purchase, DNS setup, or warmup hassle",
                  "Sent from pre-warmed shared enterprise mailboxes",
                  "Strict 30 emails/day per mailbox pacing for 99%+ deliverability",
                  "Full SPF, DKIM, DMARC, and MX verification on all routes",
                  "Tinder-Style Voice Calibration Deck before launch",
                  "Autonomous lead matching against 329k+ verified Apollo directory",
                  "Automatic spam score checks and bounce suppression",
                  "Stop anytime — zero recurring monthly commitment",
                ].map((feat) => (
                  <div key={feat} className="flex items-center gap-2.5 text-xs text-white">
                    <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300">
                      <Check className="size-2.5 stroke-[3]" />
                    </div>
                    <span className="font-medium">{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10">
              <Button asChild size="lg" className="w-full rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-bold text-sm shadow-xl shadow-indigo-600/30">
                <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                  Launch Autonomous GTM Engine <Rocket className="size-4 ml-1.5" />
                </Link>
              </Button>
              <p className="mt-2.5 text-center text-[11px] text-zinc-400">
                Start with as little as 100 emails · Live in under 60 seconds
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Volume & Cost Savings Calculator */}
        <div className="mt-16 max-w-4xl mx-auto rounded-3xl border border-white/10 bg-zinc-950/80 p-6 sm:p-10 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
                <TrendingUp className="size-4" />
                Live ROI & Stack Comparison Calculator
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white">
                How Much Will You Save With ChadGTM?
              </h3>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-right">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                Estimated Annual Savings
              </span>
              <div className="text-xl sm:text-2xl font-extrabold text-white font-mono">
                ${annualSavings.toLocaleString()} / year
              </div>
            </div>
          </div>

          {/* Volume Slider */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">
                Monthly Outbound Volume:
              </span>
              <span className="text-lg font-bold font-mono text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-lg border border-cyan-500/30">
                {emailVolume.toLocaleString()} emails / month
              </span>
            </div>

            <input
              type="range"
              min={500}
              max={15000}
              step={500}
              value={emailVolume}
              onChange={(e) => setEmailVolume(Number(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />

            <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
              <span>500 emails/mo</span>
              <span>5,000 emails/mo</span>
              <span>10,000 emails/mo</span>
              <span>15,000 emails/mo</span>
            </div>
          </div>

          {/* Side by Side Cost Breakdown */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ChadGTM Cost */}
            <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-cyan-950/20 to-black/60 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                  ChadGTM (All-in-One)
                </span>
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 bg-cyan-500/10 text-[10px]">
                  Pay Just 3¢ / email
                </Badge>
              </div>
              <div className="flex items-baseline gap-1.5 pt-2">
                <span className="text-4xl font-extrabold text-white font-mono">
                  ${chadGtmManagedCost}
                </span>
                <span className="text-xs text-zinc-400">/ month total</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Includes software ($0), 329k lead directory ($0), and {emailVolume.toLocaleString()} pre-warmed emails dispatched ($0.03/ea).
              </p>
            </div>

            {/* Traditional Stack Cost */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Fragmented Legacy Stack
                </span>
                <span className="text-[10px] text-rose-400 font-semibold">
                  3+ Subscriptions
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 pt-2">
                <span className="text-4xl font-extrabold text-zinc-400 font-mono line-through opacity-70">
                  ${traditionalCost}
                </span>
                <span className="text-xs text-zinc-500">/ month total</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Apollo leads ($99/mo) + Instantly software ($97/mo) + 5 Google Workspace accounts ($36/mo) + warmup tools.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
