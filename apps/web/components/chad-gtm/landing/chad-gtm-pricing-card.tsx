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
              [JUST 5 CENTS PER EMAIL]
            </span>
          </h2>
          <p className="mt-4 text-xs sm:text-sm text-zinc-400 font-mono leading-relaxed max-w-2xl mx-auto">
            $0 software fee for the entire platform. 100M+ lead database access, autonomous ICP extraction, AI copywriting, built-in email verification, and unlimited admin-supplied mailboxes. Pay strictly 5¢ per email delivered.
          </p>
        </div>

        {/* Single Unified ChadGTM Engine Pricing Card */}
        <div className="max-w-4xl mx-auto rounded-none border border-zinc-700 bg-zinc-950 p-6 sm:p-10 relative overflow-hidden font-mono shadow-2xl">
          {/* Subtle Corner Badge */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 border border-white bg-white text-black text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5">
                <Sparkles className="size-3 text-black" />
                THE ALL-IN-ONE AUTONOMOUS ENGINE
              </div>
              <h3 className="text-2xl sm:text-4xl font-extrabold text-white uppercase tracking-wider">
                ChadGTM Complete Suite
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed max-w-xl">
                One unified platform. Everything unlocked with $0 platform subscription fees. Unlimited leads, unlimited mailboxes, and automated 3-touch outreach.
              </p>
            </div>

            <div className="text-left sm:text-right border sm:border-0 border-zinc-800 p-3 sm:p-0 bg-black sm:bg-transparent">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight">$0</span>
                <span className="text-xs text-zinc-400 uppercase tracking-widest">/ mo software</span>
              </div>
              <div className="text-xs sm:text-sm text-emerald-400 font-bold mt-1 uppercase tracking-wider">
                + 5¢ / email delivered
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                Zero Monthly Minimums · Utility Billing
              </div>
            </div>
          </div>

          {/* Core Feature Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-8 border-b border-zinc-800 text-xs">
            <div className="space-y-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold border-b border-zinc-900 pb-1">
                [PLATFORM & INTELLIGENCE — $0/MO]
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white uppercase tracking-wide text-[11px]">100M+ Global Leads Database</div>
                  <div className="text-zinc-400 font-sans text-xs mt-0.5">
                    Unrestricted access to 100M+ verified global decision-makers across 190+ countries with $0 export fees.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white uppercase tracking-wide text-[11px]">Autonomous ICP Extraction</div>
                  <div className="text-zinc-400 font-sans text-xs mt-0.5">
                    Our proprietary Chad Neural Core™ crawls your domain to extract core value propositions, pain points, and buyer personas in 60s.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white uppercase tracking-wide text-[11px]">Calibrated AI Copywriting</div>
                  <div className="text-zinc-400 font-sans text-xs mt-0.5">
                    Tinder-style calibration swipe deck that fine-tunes tone, hook angles, and copy to your preferences.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white uppercase tracking-wide text-[11px]">Autonomous 3-Touch Cadence</div>
                  <div className="text-zinc-400 font-sans text-xs mt-0.5">
                    Every prospect receives an opener + Touch #2 value bump (+3d) + Touch #3 permission breakup (+4d).
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold border-b border-zinc-900 pb-1">
                [INFRASTRUCTURE & DELIVERY — 5¢ / EMAIL]
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white uppercase tracking-wide text-[11px]">Unlimited Admin-Supplied Mailboxes</div>
                  <div className="text-zinc-400 font-sans text-xs mt-0.5">
                    Zero domain purchasing or DNS setup. Admin supplies, pre-warms, and maintains 100% of the sender fleet.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white uppercase tracking-wide text-[11px]">Built-In Email Verification</div>
                  <div className="text-zinc-400 font-sans text-xs mt-0.5">
                    Real-time MX and mailbox deliverability validation before dispatch to eliminate bounce rates.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white uppercase tracking-wide text-[11px]">Safe 30/Day Pacing & Human Jitter</div>
                  <div className="text-zinc-400 font-sans text-xs mt-0.5">
                    Enforces strict daily sending limits and randomized 45-120s delays for 99.8% primary inbox placement.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 text-zinc-200">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white uppercase tracking-wide text-[11px]">UniBox CRM & Stop-On-Reply</div>
                  <div className="text-zinc-400 font-sans text-xs mt-0.5">
                    Two-way multi-channel sync, instant reply notifications, sentiment analysis, and auto-pause on response.
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

            <Button asChild size="lg" className="rounded-none bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-wider border border-white h-12 px-8 shadow-xl w-full sm:w-auto">
              <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                Deploy Free GTM Engine <Rocket className="size-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
