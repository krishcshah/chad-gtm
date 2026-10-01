"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Database,
  Globe,
  Loader2,
  Mail,
  Search,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
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
    category: "FinTech / Infrastructure",
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
    "CRAWLING ROOT DOM & SUBPAGES...",
    "EXTRACTING CORE VALUE PROPOSITIONS & DIFFERENTIATORS...",
    "CROSS-REFERENCING 329,563 APOLLO VERIFIED LEADS...",
    "SYNTHESIZING COLD EMAIL ANGLES & ICP...",
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
    }, 400);
  };

  return (
    <div className="relative mx-auto mt-10 w-full max-w-4xl select-none">
      {/* Boxy Architectural Terminal Frame */}
      <div className="relative rounded-none border border-zinc-800 bg-black p-4 sm:p-6 shadow-none">
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-none bg-white" />
            <span className="text-zinc-400 uppercase tracking-widest text-[11px]">
              ENGINE // AUTONOMOUS_GTM_SCANNER.SYS
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-none border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
              329K+ B2B LEADS SYNCED
            </span>
          </div>
        </div>

        {/* Input Bar & Preset Quick-Select */}
        <div className="mt-4 space-y-3">
          <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="Enter company website (e.g. stripe.com)"
                className="w-full rounded-none border border-zinc-800 bg-zinc-950 py-2.5 pl-10 pr-4 font-mono text-xs text-white placeholder-zinc-600 outline-none transition-colors focus:border-white"
              />
            </div>
            <Button
              type="button"
              onClick={() => handleRunScan()}
              disabled={isScanning}
              className="h-10 px-5 rounded-none bg-white text-black font-semibold text-xs font-mono uppercase tracking-wider hover:bg-zinc-200 border border-white transition-colors gap-2"
            >
              {isScanning ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Analyzing Site...
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Simulate GTM Scan
                </>
              )}
            </Button>
          </div>

          {/* Instant Demo Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Select Preset:
            </span>
            {PRESETS.map((p) => {
              const active = selectedPreset.name === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleRunScan(p)}
                  className={cn(
                    "rounded-none px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors border",
                    active
                      ? "border-white bg-white text-black font-semibold"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-white"
                  )}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Scanning State or Result Surface */}
        <div className="mt-5 rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
          {isScanning ? (
            <div className="py-8 text-center space-y-4 font-mono">
              <div className="mx-auto flex size-10 items-center justify-center border border-white bg-black">
                <Loader2 className="size-5 text-white animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-white uppercase tracking-wider">
                  {steps[scanStep]}
                </p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  [STAGE {scanStep + 1} OF {steps.length}]
                </p>
              </div>
              <div className="w-full max-w-xs mx-auto bg-zinc-900 h-1 rounded-none overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-white transition-all duration-200"
                  style={{ width: `${((scanStep + 1) / steps.length) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top Synthesis Overview */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3 font-mono">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">
                      {selectedPreset.name}
                    </span>
                    <span className="rounded-none border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-zinc-400">
                      {selectedPreset.category}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 font-sans mt-0.5">
                    "{selectedPreset.tagline}"
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-none border border-zinc-800 bg-black px-3 py-1.5 text-right font-mono">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                      Matched Leads
                    </div>
                    <div className="text-xs font-bold text-white flex items-center justify-end gap-1">
                      <Target className="size-3 text-zinc-400" />
                      {selectedPreset.icp.leadsMatched.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Matched ICP Badges */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="rounded-none border border-zinc-800 bg-black p-3 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                    <Target className="size-3 text-zinc-400" />
                    Target Buyer Personas:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPreset.icp.titles.map((t) => (
                      <span key={t} className="rounded-none bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-none border border-zinc-800 bg-black p-3 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                    <Database className="size-3 text-zinc-400" />
                    B2B Lead Facets:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPreset.icp.industries.map((ind) => (
                      <span key={ind} className="rounded-none bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tinder-Style Email Calibration Card Preview */}
              <div className="relative rounded-none border border-zinc-800 bg-black p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-zinc-800 pb-2 mb-3 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5 text-zinc-400 shrink-0" />
                    <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                      Voice Calibration Deck [Sample 1 of 10]
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                    Angle: Direct ROI / Friction Reduction
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="rounded-none bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-300 border border-zinc-800 break-words">
                    <span className="text-zinc-500">Subject: </span>
                    {selectedPreset.sampleEmail.subject}
                  </div>
                  <div className="rounded-none bg-zinc-950 p-3 font-sans text-xs text-zinc-300 leading-relaxed border border-zinc-800 whitespace-pre-line max-h-36 overflow-y-auto">
                    {selectedPreset.sampleEmail.body}
                  </div>
                </div>

                {/* Swipe Action Controls */}
                <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSwipeLiked(false)}
                      className={cn(
                        "flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors",
                        swipeLiked === false
                          ? "border-zinc-500 bg-zinc-800 text-white"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700"
                      )}
                    >
                      <ThumbsDown className="size-3.5" />
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => setSwipeLiked(true)}
                      className={cn(
                        "flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors",
                        swipeLiked === true
                          ? "border-white bg-white text-black font-semibold"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700"
                      )}
                    >
                      <ThumbsUp className="size-3.5" />
                      Approve Tone
                    </button>
                  </div>

                  {swipeLiked !== null && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-300 flex items-center justify-center sm:justify-start gap-1 py-1">
                      <CheckCircle2 className="size-3.5 text-white" />
                      Voice Locked In
                    </span>
                  )}

                  <Button asChild size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider gap-1.5 w-full sm:w-auto sm:ml-auto">
                    <Link href="/signup">
                      Launch Campaign <ArrowRight className="size-3.5" />
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
