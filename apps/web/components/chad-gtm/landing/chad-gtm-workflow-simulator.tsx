"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  Database,
  Flame,
  Globe,
  Heart,
  Layers,
  Mail,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Users,
  Zap,
} from "lucide-react";
import { Badge, Button, cn } from "@smartreach/ui";

export function ChadGtmWorkflowSimulator() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      id: "url",
      title: "1. Instant URL Crawl",
      subtitle: "Enter domain, nothing else",
      icon: Globe,
    },
    {
      id: "strategy",
      title: "2. Strategy Board",
      subtitle: "Review ICP & 3 angles",
      icon: Brain,
    },
    {
      id: "apollo",
      title: "3. 329k Lead Extraction",
      subtitle: "Instant verified prospects",
      icon: Database,
    },
    {
      id: "swipe",
      title: "4. Tinder-Style Swipe",
      subtitle: "Calibrate voice & copy",
      icon: Flame,
    },
    {
      id: "dispatch",
      title: "5. Autonomous Dispatch",
      subtitle: "30/day mailbox pacing",
      icon: Rocket,
    },
  ];

  return (
    <section id="how-it-works" className="relative py-24 sm:py-32 border-t border-white/10 bg-black/60 overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 size-[500px] rounded-full bg-violet-600/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 size-[500px] rounded-full bg-cyan-600/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-300 backdrop-blur-md mb-4">
            <Zap className="size-3.5 text-cyan-400" />
            The Autonomous Architecture
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Replace An Entire 5-Person SDR Team
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
              With One Simple Collaborative Workflow
            </span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            No CSV formatting nightmares. No SMTP configuration errors. No manual drafting.
            Here is how ChadGTM drives closed pipeline from start to finish.
          </p>
        </div>

        {/* Step Navigation Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 max-w-5xl mx-auto mb-10">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const isActive = activeStep === idx;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={cn(
                  "flex flex-col items-start p-3 sm:p-4 rounded-2xl border text-left transition-all duration-200 select-none",
                  isActive
                    ? "border-violet-500/60 bg-violet-500/15 shadow-lg shadow-violet-500/20"
                    : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]"
                )}
              >
                <div className={cn(
                  "flex size-8 items-center justify-center rounded-xl mb-2.5 transition-colors",
                  isActive ? "bg-violet-500 text-white" : "bg-white/10 text-zinc-400"
                )}>
                  <Icon className="size-4" />
                </div>
                <span className={cn(
                  "text-xs sm:text-sm font-bold tracking-tight",
                  isActive ? "text-white" : "text-zinc-300"
                )}>
                  {s.title}
                </span>
                <span className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">
                  {s.subtitle}
                </span>
              </button>
            );
          })}
        </div>

        {/* Interactive Visual Playground Screen */}
        <div className="relative max-w-5xl mx-auto rounded-3xl border border-white/10 bg-zinc-950/90 p-6 sm:p-10 shadow-2xl backdrop-blur-2xl">
          {activeStep === 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h4 className="text-lg font-bold text-white">Step 1: Single Entry Point & Deep Neural Crawl</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Simply provide your website URL. No manual prompt engineering required.</p>
                </div>
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 bg-cyan-500/10 text-xs">
                  Autonomous Web Scraper
                </Badge>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/60 p-6 space-y-4 font-mono text-xs">
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="text-emerald-400">➜</span>
                  <span>input:</span>
                  <span className="text-white underline">https://yourcompany.com</span>
                </div>
                <div className="space-y-1.5 text-zinc-400 pt-2 border-t border-white/5">
                  <div className="text-cyan-400 flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    [DOM Parser]: Extracted meta title, OpenGraph tags, and H1/H2 hierarchy
                  </div>
                  <div className="text-zinc-300 flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    [Subpage Discovery]: Scraped /about, /pricing, and /solutions snippets
                  </div>
                  <div className="text-violet-400 flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    [Gemini 3.8 Flash]: Synthesizing brand thesis, target buyers, and pain vectors...
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setActiveStep(1)} size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs gap-1.5">
                  Next: See Strategy Board <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h4 className="text-lg font-bold text-white">Step 2: Collaborative Strategy Board</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">AI auto-generates Business Overview, ICP, and 3 distinct Cold Angles with 1-click edits.</p>
                </div>
                <Badge variant="outline" className="border-violet-500/30 text-violet-300 bg-violet-500/10 text-xs">
                  Human-in-the-Loop AI
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                    <span>Business Overview</span>
                    <Check className="size-3.5 text-emerald-400" />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    AI accurately synthesizes what core problem your product solves, top 3 value drivers, and your market differentiator.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                    <span>Target ICP Personas</span>
                    <Check className="size-3.5 text-emerald-400" />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Discovers decision-maker job titles (VP Sales, CTO, Founder) and maps them to real directory industries.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                    <span>3 Cold Outreach Angles</span>
                    <Check className="size-3.5 text-emerald-400" />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Pain-Relief hook, Direct ROI calculation hook, and Risk-Free 10% volume trial hook.
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button onClick={() => setActiveStep(0)} variant="ghost" size="sm" className="text-zinc-400 text-xs">
                  Back
                </Button>
                <Button onClick={() => setActiveStep(2)} size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs gap-1.5">
                  Next: Apollo Lead Extraction <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h4 className="text-lg font-bold text-white">Step 3: Instant Apollo B2B Lead Extraction</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Cross-referenced against our built-in 329,563 SQLite verified prospects. Zero scrapers to manage.</p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs font-bold text-emerald-400">
                  🎯 14,820 Verified Leads Matched
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/60 p-4 space-y-3">
                <div className="text-xs font-medium text-zinc-300">Selected Target Industries:</div>
                <div className="flex flex-wrap gap-2">
                  {["Computer Software", "Information Technology & Services", "Financial Services", "Internet"].map((ind) => (
                    <span key={ind} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                      <Check className="size-3 text-cyan-400" />
                      {ind}
                    </span>
                  ))}
                </div>

                <div className="pt-3 border-t border-white/5 space-y-1.5">
                  <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">
                    Sample Extracted Decision-Makers:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">Alexander Wright</div>
                        <div className="text-[11px] text-zinc-400">VP of Engineering · FinScale Tech</div>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">Verified Work Email</Badge>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">Sophia Miller</div>
                        <div className="text-[11px] text-zinc-400">Chief Technology Officer · CloudCore</div>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">Verified Work Email</Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button onClick={() => setActiveStep(1)} variant="ghost" size="sm" className="text-zinc-400 text-xs">
                  Back
                </Button>
                <Button onClick={() => setActiveStep(3)} size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs gap-1.5">
                  Next: Tinder-Style Swipe Deck <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h4 className="text-lg font-bold text-white">Step 4: Tinder-Style "Email Calibration" Deck</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Review ~10 generated emails. Swipe right to approve style and lock in your voice. Swipe left to discard.</p>
                </div>
                <Badge variant="outline" className="border-rose-500/30 text-rose-300 bg-rose-500/10 text-xs">
                  Tone Alignment
                </Badge>
              </div>

              <div className="relative mx-auto max-w-xl rounded-2xl border-2 border-violet-500/50 bg-gradient-to-b from-violet-950/30 to-black p-6 shadow-2xl">
                <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-white/10 pb-3 mb-4">
                  <span className="font-semibold text-white">To: Alexander Wright (VP Engineering)</span>
                  <span className="font-mono text-cyan-400">Calibration 1/10</span>
                </div>

                <div className="space-y-3 font-sans text-xs sm:text-sm text-zinc-200 leading-relaxed">
                  <div className="font-semibold text-white border-b border-white/5 pb-2">
                    Subject: Quick question on cross-border payment routing?
                  </div>
                  <p>
                    Hey Alexander,
                  </p>
                  <p>
                    Saw FinScale's recent European launch. Most engineering teams we speak with find that 12-18% of global card transactions encounter unnecessary interchange fees due to legacy payment rails.
                  </p>
                  <p>
                    We built an automated payment routing benchmark that identifies sub-optimal interchange paths without changing your core provider. Would you be open to a 3-minute diagnostic run against your top international corridors?
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-center gap-4 pt-4 border-t border-white/10">
                  <button type="button" className="flex size-12 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:scale-110 transition-all">
                    <ThumbsDown className="size-5" />
                  </button>
                  <span className="text-xs font-semibold text-zinc-400">Swipe to Calibrate</span>
                  <button type="button" className="flex size-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:scale-110 transition-all">
                    <ThumbsUp className="size-5" />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button onClick={() => setActiveStep(2)} variant="ghost" size="sm" className="text-zinc-400 text-xs">
                  Back
                </Button>
                <Button onClick={() => setActiveStep(4)} size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs gap-1.5">
                  Next: Autonomous Dispatch <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h4 className="text-lg font-bold text-white">Step 5: Velocity & Shared Mailbox Pool Dispatch</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Scale email volume dynamically. Dispatched across our managed admin pool with strict 30/day mailbox pacing.</p>
                </div>
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs font-bold text-cyan-300">
                  99.2% Deliverability
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
                  <div className="text-xs font-semibold text-zinc-300">Daily Pacing Engine:</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white font-mono">150</span>
                    <span className="text-xs text-zinc-400">emails dispatched / day</span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Rotated across 5 pre-warmed system mailboxes at an ultra-safe pace of 30 emails per mailbox per day.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
                  <div className="text-xs font-semibold text-zinc-300">Autonomous Infrastructure:</div>
                  <div className="space-y-2 text-xs text-zinc-300">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-emerald-400" />
                      <span>Zero user SMTP configuration needed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-400" />
                      <span>Dedicated SPF/DKIM/DMARC routing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="size-4 text-emerald-400" />
                      <span>Instant reply detection & stop-on-reply</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button onClick={() => setActiveStep(3)} variant="ghost" size="sm" className="text-zinc-400 text-xs">
                  Back
                </Button>
                <Button asChild size="sm" className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:opacity-95 text-white font-bold text-xs gap-1.5 shadow-lg shadow-indigo-500/25">
                  <Link href="/signup">
                    Launch Autonomous Campaign Free ($0/mo) <Rocket className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
