"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@smartreach/ui";

export function ChadGtmPricingCard({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  return (
    <section id="pricing" className="relative py-24 sm:py-32 overflow-hidden border-t border-zinc-800/80 bg-[#060606]">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-none border border-emerald-500/30 bg-emerald-950/20 px-3 py-1 font-mono text-xs text-emerald-400 mb-4">
            <Sparkles className="size-3 text-emerald-400" />
            <span>Radical Pricing Transparency</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            $0/month software platform.
            <br />
            <span className="text-zinc-400 font-sans text-2xl sm:text-4xl block mt-2 font-semibold">
              Pay strictly 5¢ per delivered email.
            </span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 font-sans leading-relaxed max-w-2xl mx-auto">
            Zero subscription fees for the entire platform. 10.2M verified B2B contacts, autonomous company research, AI copywriting, built-in email verification, and pre-warmed shared mailboxes. Pure pay-as-you-go utility billing.
          </p>
        </div>

        {/* Single Unified AutoGTM Engine Pricing Card */}
        <div className="max-w-4xl mx-auto rounded-none border border-zinc-700 bg-zinc-950 p-6 sm:p-10 relative overflow-hidden font-sans shadow-2xl">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-zinc-800 pb-8">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 border border-white bg-white text-black text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-none">
                <Sparkles className="size-3 text-black" />
                The All-In-One Autonomous Engine
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                AutoGTM Complete Suite
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-xl">
                One unified platform with zero seat licenses. Unlimited leads, pre-warmed mailboxes, and automated 3-touch outreach with human reply detection.
              </p>
            </div>

            <div className="text-left sm:text-right border sm:border-0 border-zinc-800 p-4 sm:p-0 bg-black/60 sm:bg-transparent">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight">$0</span>
                <span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">/ mo software</span>
              </div>
              <div className="text-xs sm:text-sm text-emerald-400 font-bold mt-1 font-mono uppercase tracking-wider">
                + 5¢ / email delivered
              </div>
              <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">
                Zero Monthly Minimums · Cancel Anytime
              </div>
            </div>
          </div>

          {/* Core Feature Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8 border-b border-zinc-800 text-xs">
            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-mono font-bold border-b border-zinc-900 pb-2">
                PLATFORM &amp; INTELLIGENCE — $0/MO
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white text-xs">10.2M Verified B2B Directory</div>
                  <div className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Unrestricted query access to 10,227,232 verified decision-makers with zero export credit charges.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white text-xs">Autonomous Multi-Tier Crawling</div>
                  <div className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Crawls your homepage, pricing, and product documentation to extract core positioning and customer pain points.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white text-xs">Adaptive Tone Calibration</div>
                  <div className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Tinder-style swipe deck that learns your stylistic preferences and fine-tunes email angles in real time.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white text-xs">High-Converting 3-Touch Cadence</div>
                  <div className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Every prospect receives an initial personalized opener + Touch 2 value bump (+3d) + Touch 3 permission breakup (+4d).
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-mono font-bold border-b border-zinc-900 pb-2">
                INFRASTRUCTURE &amp; DISPATCH — 5¢ / EMAIL
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white text-xs">Pre-Warmed Shared Mailbox Fleet</div>
                  <div className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Zero secondary domain purchases or DNS record headache. The platform supplies and warms 100% of sending mailboxes.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white text-xs">Real-Time Email Validation</div>
                  <div className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Pre-dispatch syntax and MX verification to keep bounce rates under 1.5%.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white text-xs">Safe 30/Day Pacing &amp; Delay Jitter</div>
                  <div className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Strict caps and randomized 45–120s delays for 99.8% primary inbox placement.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white text-xs">Unified UniBox &amp; Auto-Stop on Reply</div>
                  <div className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Real-time IMAP synchronization with automated sentiment classification (Interested, Objection, OOO) and instant sequence pausing.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <ShieldCheck className="size-3.5 text-emerald-400" /> $0/mo software fee forever
              </span>
              <span className="flex items-center gap-1.5 text-zinc-300">
                <ShieldCheck className="size-3.5 text-emerald-400" /> No credit card required
              </span>
              <span className="flex items-center gap-1.5 text-zinc-300">
                <ShieldCheck className="size-3.5 text-emerald-400" /> Pause or cancel anytime
              </span>
            </div>

            <Button
              asChild
              size="lg"
              className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs border border-white h-12 px-8 shadow-xl w-full sm:w-auto"
            >
              <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                Launch Free GTM Engine <Rocket className="size-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
