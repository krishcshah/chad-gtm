"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  Flame,
  Globe,
  Heart,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
} from "lucide-react";
import { Badge, Button, cn } from "@smartreach/ui";

interface PresetTarget {
  name: string;
  url: string;
  category: string;
  tagline: string;
  icp: {
    titles: string[];
    industries: string[];
    leadsMatched: number;
  };
  sampleEmail: {
    subject: string;
    body: string;
  };
}

const PRESETS: PresetTarget[] = [
  {
    name: "Stripe",
    url: "stripe.com",
    category: "FinTech / Payments",
    tagline: "Financial Infrastructure for the Internet",
    icp: {
      titles: ["Head of Payments", "VP of Engineering", "Chief Revenue Officer"],
      industries: ["Financial Services", "Computer Software", "Internet"],
      leadsMatched: 14820,
    },
    sampleEmail: {
      subject: "Quick question on cross-border interchange rates?",
      body: "Hey {{firstName}},\n\nSaw {{companyName}}'s recent push into multi-currency expansion. Most growth engineering teams we speak with find that 12-18% of global transactions face elevated authorization drop-offs due to legacy card routing.\n\nWe built an automated payment routing benchmark that identifies sub-optimal interchange paths without changing your core provider. Would you be open to seeing a 3-minute diagnostic run against your top international corridors?",
    },
  },
  {
    name: "Linear",
    url: "linear.app",
    category: "DevTools / SaaS",
    tagline: "The issue tracker built for high-performance teams",
    icp: {
      titles: ["VP of Product", "Head of Engineering", "Founding Engineer"],
      industries: ["Computer Software", "Information Technology", "Internet"],
      leadsMatched: 9430,
    },
    sampleEmail: {
      subject: "Fixing sprint bloat for {{companyName}}'s dev team",
      body: "Hi {{firstName}},\n\nNoticed {{companyName}}'s rapid engineering team growth. When engineering squads cross 20+ devs, sprint meetings often double in length while cycle velocity drops by 30% due to cluttered Jira overhead.\n\nWe put together a streamlined async issue-triage framework modeled after high-velocity teams like Ramp and Vercel. Worth a quick 5-minute glance?",
    },
  },
  {
    name: "Supabase",
    url: "supabase.com",
    category: "Cloud Database",
    tagline: "The Open Source Firebase Alternative",
    icp: {
      titles: ["CTO", "Lead Architect", "Backend Lead"],
      industries: ["Computer Software", "Internet", "Telecommunications"],
      leadsMatched: 11250,
    },
    sampleEmail: {
      subject: "Postgres scaling bottleneck at {{companyName}}?",
      body: "Hey {{firstName}},\n\nLoved {{companyName}}'s recent feature rollout. As data volume scales past 50M rows, managing standalone auth, real-time edge triggers, and connection pooling usually requires dedicated DevOps hours that distract from shipping product.\n\nWould it be useful if I sent over a breakdown of how teams cut Postgres maintenance overhead by 60% with zero lock-in?",
    },
  },
  {
    name: "Vapi.ai",
    url: "vapi.ai",
    category: "Voice AI / API",
    tagline: "Voice AI Agents for Developers",
    icp: {
      titles: ["VP of Customer Experience", "Head of AI", "Product Director"],
      industries: ["Telecommunications", "Hospitality", "Computer Software"],
      leadsMatched: 6840,
    },
    sampleEmail: {
      subject: "Sub-500ms voice agent latency test",
      body: "Hi {{firstName}},\n\nWith {{companyName}} handling inbound voice support, customer drop-offs surge whenever speech-to-speech latency creeps above 800ms.\n\nWe benchmarked voice pipeline orchestration across top conversational engines. Can I share a 60-second audio clip showing sub-450ms human-like conversational responsiveness?",
    },
  },
];

export function ChadGtmHeroScanner() {
  const [targetUrl, setTargetUrl] = useState("stripe.com");
  const [selectedPreset, setSelectedPreset] = useState<PresetTarget>(PRESETS[0]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [swipeLiked, setSwipeLiked] = useState<boolean | null>(null);

  const steps = [
    "Crawling root DOM & heuristic subpages...",
    "Extracting core value prop & differentiators (Gemini 3.8 Flash)...",
    "Cross-referencing 329,563 Apollo verified leads...",
    "Synthesizing 3 high-converting cold email angles...",
  ];

  const handleRunScan = (preset?: PresetTarget) => {
    const target = preset || selectedPreset;
    setSelectedPreset(target);
    setTargetUrl(target.url);
    setIsScanning(true);
    setScanStep(0);
    setSwipeLiked(null);

    const interval = setInterval(() => {
      setScanStep((prev) => {
        if (prev < steps.length - 1) return prev + 1;
        clearInterval(interval);
        setIsScanning(false);
        return prev;
      });
    }, 450);
  };

  return (
    <div className="relative mx-auto mt-10 w-full max-w-4xl select-none">
      {/* Outer ambient aura */}
      <div className="pointer-events-none absolute -inset-2 rounded-3xl bg-gradient-to-r from-violet-600/30 via-indigo-600/20 to-cyan-500/30 opacity-70 blur-2xl transition-all duration-500" />

      {/* Main glass frame */}
      <div className="relative rounded-2xl border border-white/10 bg-zinc-950/80 p-4 sm:p-6 shadow-2xl backdrop-blur-2xl">
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-rose-500/80" />
              <span className="size-3 rounded-full bg-amber-500/80" />
              <span className="size-3 rounded-full bg-emerald-500/80" />
            </div>
            <span className="ml-2 text-xs font-mono font-medium text-zinc-400">
              chadgtm://autonomous-scanner/v2.0
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Lead Engine (329k+ Active)
            </span>
          </div>
        </div>

        {/* Input Bar & Preset Quick-Select */}
        <div className="mt-5 space-y-3">
          <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="Enter any domain (e.g. stripe.com, yourcompany.io)"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-violet-500/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <Button
              type="button"
              onClick={() => handleRunScan()}
              disabled={isScanning}
              className="h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 hover:opacity-95 transition-all gap-2"
            >
              {isScanning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Analyzing Site...
                </>
              ) : (
                <>
                  <Sparkles className="size-4 text-cyan-300" />
                  Simulate GTM Scan
                </>
              )}
            </Button>
          </div>

          {/* Instant Demo Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Zap className="size-3 text-amber-400" />
              Test live presets:
            </span>
            {PRESETS.map((p) => {
              const active = selectedPreset.name === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleRunScan(p)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-all border",
                    active
                      ? "border-violet-500/50 bg-violet-500/20 text-white shadow-xs"
                      : "border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
                  )}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Scanning State or Result Surface */}
        <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4 sm:p-5">
          {isScanning ? (
            <div className="py-10 text-center space-y-4">
              <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 border border-violet-500/40">
                <Loader2 className="size-7 text-cyan-400 animate-spin" />
                <span className="absolute -inset-1 rounded-2xl bg-cyan-400/20 blur-md animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white font-mono">
                  {steps[scanStep]}
                </p>
                <p className="text-xs text-zinc-400">
                  Step {scanStep + 1} of {steps.length} · Autonomous Neural Synthesis
                </p>
              </div>
              <div className="w-full max-w-xs mx-auto bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${((scanStep + 1) / steps.length) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Top Synthesis Overview */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white font-mono">
                      {selectedPreset.name}
                    </span>
                    <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 bg-indigo-500/10 text-[10px]">
                      {selectedPreset.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    "{selectedPreset.tagline}"
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-right">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-400">
                      Verified Leads
                    </div>
                    <div className="text-sm font-bold text-white font-mono flex items-center justify-end gap-1">
                      <Target className="size-3.5 text-emerald-400" />
                      {selectedPreset.icp.leadsMatched.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Matched ICP Badges */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1.5">
                  <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                    <Target className="size-3 text-indigo-400" />
                    Target Buyer Personas:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPreset.icp.titles.map((t) => (
                      <span key={t} className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] text-zinc-200">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1.5">
                  <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                    <Database className="size-3 text-cyan-400" />
                    Extracted B2B Industries:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPreset.icp.industries.map((ind) => (
                      <span key={ind} className="rounded-md bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[11px] text-cyan-300">
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tinder-Style Email Calibration Card Preview */}
              <div className="relative rounded-xl border border-violet-500/30 bg-gradient-to-b from-violet-950/20 to-black/60 p-4 shadow-lg">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5 text-violet-400" />
                    <span className="text-xs font-semibold text-white">
                      Tinder-Style Voice Calibration Deck (Sample 1 of 10)
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    AI Cold Angle: Direct ROI / Friction Reduction
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="rounded-md bg-black/60 px-3 py-1.5 font-mono text-[11px] text-zinc-300 border border-white/5">
                    <span className="text-zinc-500">Subject: </span>
                    {selectedPreset.sampleEmail.subject}
                  </div>
                  <div className="rounded-md bg-black/40 p-3 font-sans text-xs text-zinc-300 leading-relaxed border border-white/5 whitespace-pre-line max-h-36 overflow-y-auto">
                    {selectedPreset.sampleEmail.body}
                  </div>
                </div>

                {/* Swipe Action Controls */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSwipeLiked(false)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                        swipeLiked === false
                          ? "border-rose-500 bg-rose-500/20 text-rose-300"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:text-rose-400 hover:border-rose-500/40"
                      )}
                    >
                      <ThumbsDown className="size-3.5" />
                      Discard Angle
                    </button>
                    <button
                      type="button"
                      onClick={() => setSwipeLiked(true)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                        swipeLiked === true
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40"
                      )}
                    >
                      <ThumbsUp className="size-3.5" />
                      Approve Voice & Tone
                    </button>
                  </div>

                  {swipeLiked !== null && (
                    <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      Calibrated! Ready for Autonomous Dispatch
                    </span>
                  )}

                  <Button asChild size="sm" className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs gap-1.5 ml-auto">
                    <Link href="/signup">
                      Launch With This Strategy ($0/mo) <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
