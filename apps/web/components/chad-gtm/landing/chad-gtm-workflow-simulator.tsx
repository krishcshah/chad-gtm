"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Database,
  Flame,
  Globe,
  Mail,
  Rocket,
  ShieldCheck,
  Target,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from "lucide-react";
import { Badge, Button, cn } from "@smartreach/ui";

export function ChadGtmWorkflowSimulator() {
  const [activeStep, setActiveStep] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      setIsClicked(false);
      setIsHovered(false);
    }, 30000);
  }, []);

  const handleTabClick = (idx: number) => {
    setActiveStep(idx);
    setIsClicked(true);
    resetInactivityTimer();
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    resetInactivityTimer();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleMouseMove = () => {
    if (isHovered || isClicked) {
      resetInactivityTimer();
    }
  };

  useEffect(() => {
    if (isHovered || isClicked) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 5);
    }, 4500);

    return () => clearInterval(interval);
  }, [isHovered, isClicked]);

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  const steps = [
    {
      id: "url",
      title: "01. URL CRAWL",
      subtitle: "Enter domain only",
      icon: Globe,
    },
    {
      id: "strategy",
      title: "02. STRATEGY BOARD",
      subtitle: "ICP & 3 cold angles",
      icon: Brain,
    },
    {
      id: "apollo",
      title: "03. 100M+ EXTRACTION",
      subtitle: "Verified prospect match",
      icon: Database,
    },
    {
      id: "swipe",
      title: "04. CALIBRATION DECK",
      subtitle: "Tinder-style approval",
      icon: Flame,
    },
    {
      id: "dispatch",
      title: "05. AUTO DISPATCH",
      subtitle: "Shared mailbox pool",
      icon: Rocket,
    },
  ];

  return (
    <section id="how-it-works" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-none border border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 mb-4">
            <Zap className="size-3 text-zinc-400" />
            AUTONOMOUS ARCHITECTURE // PIPELINE FLOW
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase">
            Replace Manual Outbound
            <br />
            <span className="text-zinc-500 font-mono text-2xl sm:text-4xl block mt-1">
              [WITH AN AUTONOMOUS ENGINE]
            </span>
          </h2>
          <p className="mt-4 text-xs sm:text-sm text-zinc-400 font-mono max-w-2xl mx-auto">
            Zero CSV cleansing. Zero manual SMTP warmup. Zero cold writer's block.
            ChadGTM drives meetings autonomously through a verified 5-stage architecture.
          </p>
        </div>

        {/* Interactive Simulator Wrapper */}
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
          className="relative max-w-5xl mx-auto"
        >
          {/* Step Navigation Tabs - Boxy Grid */}
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 sm:grid sm:grid-cols-5 mb-8 snap-x">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const isActive = activeStep === idx;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleTabClick(idx)}
                className={cn(
                  "shrink-0 w-44 sm:w-auto snap-start flex flex-col items-start p-3 sm:p-4 rounded-none border text-left transition-colors select-none font-mono",
                  isActive
                    ? "border-white bg-white text-black"
                    : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-white"
                )}
              >
                <div className={cn(
                  "flex size-7 items-center justify-center rounded-none mb-2 border",
                  isActive ? "border-black bg-black text-white" : "border-zinc-800 bg-black text-zinc-400"
                )}>
                  <Icon className="size-3.5" />
                </div>
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  isActive ? "text-black" : "text-white"
                )}>
                  {s.title}
                </span>
                <span className={cn(
                  "text-[10px] mt-0.5 uppercase tracking-wide truncate w-full",
                  isActive ? "text-zinc-700" : "text-zinc-500"
                )}>
                  {s.subtitle}
                </span>
              </button>
            );
          })}
        </div>

        {/* Interactive Visual Playground Screen */}
        <div className="relative rounded-none border border-zinc-800 bg-black p-4 sm:p-8">
          {activeStep === 0 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3 font-mono">
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                    Stage 01: Single URL Ingestion & Semantic Crawl
                  </h4>
                  <p className="text-xs text-zinc-400 font-sans mt-0.5">
                    Submit company domain. Scrapes OpenGraph tags, headings, and value propositions.
                  </p>
                </div>
                <span className="rounded-none border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
                  Autonomous Web Scraper
                </span>
              </div>

              <div className="rounded-none border border-zinc-800 bg-zinc-950 p-5 space-y-3 font-mono text-xs">
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="text-white">➜</span>
                  <span className="text-zinc-500">INPUT:</span>
                  <span className="text-white underline">https://yourcompany.com</span>
                </div>
                <div className="space-y-1.5 text-zinc-400 pt-2 border-t border-zinc-800">
                  <div className="text-zinc-200 flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-white" />
                    [DOM Parser]: Extracted meta title, OpenGraph tags, and H1/H2 hierarchy
                  </div>
                  <div className="text-zinc-300 flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-white" />
                    [Subpage Discovery]: Scraped /about, /pricing, and /solutions snippets
                  </div>
                  <div className="text-zinc-400 flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-white" />
                    [Chad Neural Core™]: Synthesizing brand thesis, target buyers, and pain vectors...
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setActiveStep(1)} size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider gap-1.5 border border-white">
                  Next: Strategy Board <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeStep === 1 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 font-mono">
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                    Stage 02: Collaborative Strategy Board
                  </h4>
                  <p className="text-xs text-zinc-400 font-sans mt-0.5">
                    AI generates Business Overview, ICP, and 3 distinct cold email angles with 1-click edits.
                  </p>
                </div>
                <span className="rounded-none border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
                  Human-in-the-Loop
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white uppercase tracking-wider">
                    <span>Business Overview</span>
                    <Check className="size-3.5 text-white" />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                    Synthesizes primary market problem, key customer differentiators, and core product capabilities.
                  </p>
                </div>

                <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white uppercase tracking-wider">
                    <span>Target ICP Personas</span>
                    <Check className="size-3.5 text-white" />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                    Identifies decision-maker job titles (VP Sales, CTO, Founder) mapped directly to lead directory facets.
                  </p>
                </div>

                <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white uppercase tracking-wider">
                    <span>3 Outreach Angles</span>
                    <Check className="size-3.5 text-white" />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                    Pain-Relief angle, Direct ROI calculation angle, and Risk-Free 10% volume trial hook.
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button onClick={() => setActiveStep(0)} variant="outline" size="sm" className="rounded-none text-xs font-mono uppercase">
                  Back
                </Button>
                <Button onClick={() => setActiveStep(2)} size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider gap-1.5 border border-white">
                  Next: 100M+ Leads Match <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 font-mono">
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                    Stage 03: 100M+ Global B2B Lead Extraction
                  </h4>
                  <p className="text-xs text-zinc-400 font-sans mt-0.5">
                    Cross-referenced against our 100M+ global verified prospect repository. Zero scraping fees.
                  </p>
                </div>
                <div className="rounded-none border border-zinc-800 bg-zinc-950 px-2.5 py-1 font-mono text-xs font-bold text-white">
                  14,820 VERIFIED MATCHES
                </div>
              </div>

              <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-3 font-mono">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Selected Target Industries:</div>
                <div className="flex flex-wrap gap-1.5">
                  {["Computer Software", "Information Technology", "Financial Services", "Internet"].map((ind) => (
                    <span key={ind} className="inline-flex items-center gap-1.5 rounded-none border border-zinc-800 bg-black px-2.5 py-1 text-xs text-zinc-300">
                      <Check className="size-3 text-white" />
                      {ind}
                    </span>
                  ))}
                </div>

                <div className="pt-3 border-t border-zinc-800 space-y-1.5">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
                    Sample Verified Decision-Makers:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-none bg-black border border-zinc-800 flex items-center justify-between font-mono">
                      <div>
                        <div className="font-semibold text-white">Alexander Wright</div>
                        <div className="text-[10px] text-zinc-400">VP of Engineering · FinScale</div>
                      </div>
                      <span className="text-[9px] uppercase tracking-widest text-zinc-300 border border-zinc-800 bg-zinc-950 px-1.5 py-0.5">Verified</span>
                    </div>
                    <div className="p-2.5 rounded-none bg-black border border-zinc-800 flex items-center justify-between font-mono">
                      <div>
                        <div className="font-semibold text-white">Sophia Miller</div>
                        <div className="text-[10px] text-zinc-400">Chief Technology Officer · CloudCore</div>
                      </div>
                      <span className="text-[9px] uppercase tracking-widest text-zinc-300 border border-zinc-800 bg-zinc-950 px-1.5 py-0.5">Verified</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button onClick={() => setActiveStep(1)} variant="outline" size="sm" className="rounded-none text-xs font-mono uppercase">
                  Back
                </Button>
                <Button onClick={() => setActiveStep(3)} size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider gap-1.5 border border-white">
                  Next: Calibration Deck <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 font-mono">
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                    Stage 04: Tinder-Style "Email Calibration" Deck
                  </h4>
                  <p className="text-xs text-zinc-400 font-sans mt-0.5">
                    Review generated email drafts. Swipe right to approve and lock in your voice. Swipe left to discard.
                  </p>
                </div>
                <span className="rounded-none border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
                  Voice Lock
                </span>
              </div>

              <div className="relative mx-auto max-w-xl rounded-none border border-zinc-800 bg-zinc-950 p-5 font-mono">
                <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-2 mb-3">
                  <span className="font-semibold text-white uppercase text-[11px]">Alexander Wright (VP Engineering)</span>
                  <span className="text-zinc-500 text-[10px]">DECK 01 / 10</span>
                </div>

                <div className="space-y-2 font-mono text-xs text-zinc-300 leading-relaxed">
                  <div className="font-semibold text-white border-b border-zinc-800 pb-2">
                    Subject: Quick question on cross-border payment routing?
                  </div>
                  <p className="font-sans text-xs text-zinc-400">
                    Hey Alexander,
                  </p>
                  <p className="font-sans text-xs text-zinc-400">
                    Saw FinScale's recent European launch. Most engineering teams find that 12-18% of global card transactions encounter unnecessary interchange fees due to legacy payment rails.
                  </p>
                  <p className="font-sans text-xs text-zinc-400">
                    We built an automated payment routing benchmark that identifies sub-optimal paths. Open to a 3-minute diagnostic run against your top international corridors?
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-center gap-4 pt-3 border-t border-zinc-800">
                  <button type="button" className="flex size-10 items-center justify-center rounded-none border border-zinc-800 bg-black text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                    <ThumbsDown className="size-4" />
                  </button>
                  <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">CALIBRATE</span>
                  <button type="button" className="flex size-10 items-center justify-center rounded-none border border-white bg-white text-black hover:bg-zinc-200 transition-colors">
                    <ThumbsUp className="size-4" />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button onClick={() => setActiveStep(2)} variant="outline" size="sm" className="rounded-none text-xs font-mono uppercase">
                  Back
                </Button>
                <Button onClick={() => setActiveStep(4)} size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider gap-1.5 border border-white">
                  Next: Autonomous Dispatch <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 font-mono">
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                    Stage 05: Autonomous Shared Mailbox Pool Dispatch
                  </h4>
                  <p className="text-xs text-zinc-400 font-sans mt-0.5">
                    Dispatched across our pre-warmed admin pool with strict 30/day mailbox pacing.
                  </p>
                </div>
                <div className="rounded-none border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-300">
                  99.2% DELIVERABILITY
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2 font-mono">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Daily Pacing Engine:</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">150</span>
                    <span className="text-xs text-zinc-400 uppercase">emails / day</span>
                  </div>
                  <p className="text-xs text-zinc-400 font-sans">
                    Rotated across 5 pre-warmed system mailboxes at an ultra-safe pace of 30 emails per mailbox per day.
                  </p>
                </div>

                <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-2 font-mono">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Autonomous Infrastructure:</div>
                  <div className="space-y-1.5 text-xs text-zinc-300">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-3.5 text-white" />
                      <span>Zero user SMTP configuration required</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-3.5 text-white" />
                      <span>Dedicated SPF/DKIM/DMARC routing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="size-3.5 text-white" />
                      <span>Instant reply detection & stop-on-reply</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button onClick={() => setActiveStep(3)} variant="outline" size="sm" className="rounded-none text-xs font-mono uppercase">
                  Back
                </Button>
                <Button asChild size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider gap-1.5 border border-white">
                  <Link href="/signup">
                    Launch Campaign Free ($0/mo) <Rocket className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </section>
  );
}
