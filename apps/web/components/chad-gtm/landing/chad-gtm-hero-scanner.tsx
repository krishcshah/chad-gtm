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
import { Button } from "@smartreach/ui";

interface PresetTarget {
  name: string;
  url: string;
  category: string;
  tagline: string;
  icp: {
    titles: string[];
    industries: string[];
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
    category: "Fintech & Payments Infrastructure",
    tagline: "Financial Infrastructure for the Internet",
    icp: {
      titles: ["Head of Payments", "VP of Engineering", "Chief Revenue Officer"],
      industries: ["Financial Services", "Computer Software", "Internet"],
    },
    sampleEmail: {
      subject: "Quick question on cross-border routing?",
      body: "Hey {{first_name}},\n\nSaw {{company}}'s push into multi-currency expansion. Most growth teams find that international authorization drop-offs trace back to routing and retry logic, not the provider itself.\n\nWe put together a short routing diagnostic that maps where international payments lose conversion. Would you be open to seeing it?",
    },
  },
  {
    name: "Linear",
    url: "linear.app",
    category: "High-Performance Product & Issue Tracking",
    tagline: "The issue tracker built for high-performance teams",
    icp: {
      titles: ["VP of Product", "Head of Engineering", "Founding Engineer"],
      industries: ["Computer Software", "Information Technology", "Internet"],
    },
    sampleEmail: {
      subject: "Sprint bloat at {{company}}?",
      body: "Hi {{first_name}},\n\nNoticed {{company}}'s engineering team is growing. When squads get bigger, sprint meetings tend to get longer while cycle time slips.\n\nWe put together an async issue-triage framework modeled after high-velocity product teams. Worth a quick look?",
    },
  },
  {
    name: "Supabase",
    url: "supabase.com",
    category: "Developer Tools & Cloud Database",
    tagline: "The Open Source Firebase Alternative",
    icp: {
      titles: ["Chief Technology Officer", "Lead Architect", "Backend Lead"],
      industries: ["Computer Software", "Internet", "Telecommunications"],
    },
    sampleEmail: {
      subject: "Postgres scaling at {{company}}?",
      body: "Hey {{first_name}},\n\nAs data volume grows, managing auth, realtime triggers, and connection pooling usually turns into dedicated DevOps work that distracts from shipping product.\n\nWould it be useful if I sent over a short breakdown of how teams keep Postgres maintenance overhead low without lock-in?",
    },
  },
  {
    name: "Vapi.ai",
    url: "vapi.ai",
    category: "Conversational Voice AI Platform",
    tagline: "Voice AI Agents for Developers",
    icp: {
      titles: ["VP of Customer Experience", "Head of AI", "Product Director"],
      industries: ["Telecommunications", "Hospitality", "Computer Software"],
    },
    sampleEmail: {
      subject: "Voice agent latency at {{company}}?",
      body: "Hi {{first_name}},\n\nWith {{company}} handling inbound voice support, customer drop-offs climb whenever speech-to-speech latency rises.\n\nWe benchmarked voice pipeline orchestration across conversational engines. Can I share a short clip showing what lower latency sounds like?",
    },
  },
];

export function ChadGtmHeroScanner({
  directoryTotal = 10_227_232,
  isLoggedIn = false,
}: {
  directoryTotal?: number;
  isLoggedIn?: boolean;
}) {
  const [targetUrl, setTargetUrl] = useState("stripe.com");
  const [selectedPreset, setSelectedPreset] = useState<PresetTarget>(PRESETS[0]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [swipeLiked, setSwipeLiked] = useState<boolean | null>(null);

  const steps = [
    "Crawling homepage, pricing, and product positioning...",
    "Extracting core value propositions and differentiators...",
    `Querying ${directoryTotal.toLocaleString("en-US")} local B2B directory contacts...`,
    "Synthesizing bespoke cold email angles...",
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
    <div className="relative mx-auto w-full max-w-4xl select-none">
      {/* Sleek Series A Product Stage Window */}
      <div className="relative rounded-none border border-zinc-800 bg-[#080808] p-5 sm:p-7 shadow-2xl">
        {/* Stage Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-none bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-white tracking-tight">
              Sample Campaign Preview
            </span>
            <span className="text-zinc-600 hidden sm:inline">·</span>
            <span className="text-xs text-zinc-400 hidden sm:inline">
              See the shape of a run before you connect your domain
            </span>
          </div>
          <span className="rounded-none border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-emerald-400">
            {directoryTotal.toLocaleString("en-US")} Directory Contacts
          </span>
        </div>

        {/* Input Bar & Preset Quick-Select */}
        <div className="mt-5 space-y-4">
          <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="Enter a domain to preview (e.g. stripe.com)"
                className="w-full rounded-none border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 font-sans text-xs text-white placeholder-zinc-500 outline-none transition-colors focus:border-white"
              />
            </div>
            <Button
              type="button"
              onClick={() => handleRunScan()}
              disabled={isScanning}
              className="h-11 px-6 rounded-none bg-white text-black font-semibold text-xs hover:bg-zinc-200 border border-white transition-colors gap-2 shrink-0 active:scale-[0.99]"
            >
              {isScanning ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Preview sample campaign
                </>
              )}
            </Button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-zinc-400">
            <span className="text-[11px] text-zinc-500">Try a sample company:</span>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => handleRunScan(p)}
                className={`rounded-none border px-2.5 py-1 text-xs transition-colors ${
                  selectedPreset.name === p.name && !isScanning
                    ? "border-white bg-white text-black font-semibold"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600 hover:text-white"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Scan In-Progress State */}
        {isScanning ? (
          <div className="mt-6 border border-zinc-800 bg-zinc-950 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="size-4 animate-spin text-emerald-400" />
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white">
                  Sample analysis in progress
                </span>
                <p className="text-[11px] font-mono text-zinc-400">{steps[scanStep]}</p>
              </div>
            </div>

            <div className="h-1 w-full bg-zinc-900 border border-zinc-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${((scanStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          /* Scan Results Stage (3-Step Pipeline Card) */
          <div className="mt-6 space-y-4">
            {/* Step 1: Strategy & Offer Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="border border-zinc-800 bg-zinc-950 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                  <span>01 // Position</span>
                  <Sparkles className="size-3 text-emerald-400" />
                </div>
                <div className="text-xs font-bold text-white tracking-tight">
                  {selectedPreset.name}
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {selectedPreset.tagline}
                </p>
                <div className="text-[10px] text-zinc-500 font-mono pt-1">
                  Category: {selectedPreset.category}
                </div>
              </div>

              <div className="border border-zinc-800 bg-zinc-950 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                  <span>02 // Target Buyers</span>
                  <Target className="size-3 text-emerald-400" />
                </div>
                <div className="text-xs font-bold text-white tracking-tight">
                  ICP title + industry match
                </div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {selectedPreset.icp.titles.slice(0, 2).map((title) => (
                    <span
                      key={title}
                      className="rounded-none border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300 font-mono"
                    >
                      {title}
                    </span>
                  ))}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono pt-1">
                  Directory: {directoryTotal.toLocaleString("en-US")} contacts
                </div>
              </div>

              <div className="border border-zinc-800 bg-zinc-950 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                  <span>03 // Delivery</span>
                  <Zap className="size-3 text-emerald-400" />
                </div>
                <div className="text-xs font-bold text-emerald-400 tracking-tight">
                  3-Touch Autonomous Flow
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Admin-managed shared mailboxes. 30/day cap, 45–120s jitter.
                </p>
                <div className="text-[10px] text-zinc-500 font-mono pt-1">
                  Cost: 5¢ per delivered email
                </div>
              </div>
            </div>

            {/* Step 2: Calibrated Email Preview */}
            <div className="border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-zinc-400" />
                  <span className="text-xs font-semibold text-white">
                    Sample Outbound Angle: Touch 1 (Day 0)
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  Sample copy · tone calibration deck
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-white">
                  <span className="text-zinc-500 font-normal">Subject:</span>{" "}
                  {selectedPreset.sampleEmail.subject}
                </div>
                <div className="whitespace-pre-line text-xs leading-relaxed text-zinc-300 font-sans bg-black/40 border border-zinc-800/80 p-3.5">
                  {selectedPreset.sampleEmail.body}
                </div>
              </div>

              {/* Call-to-action & Feedback */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>Swipe Calibration Tone:</span>
                  <button
                    type="button"
                    onClick={() => setSwipeLiked(true)}
                    className={`flex items-center gap-1 border px-2.5 py-1 text-xs transition-colors ${
                      swipeLiked === true
                        ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                        : "border-zinc-800 hover:border-zinc-700 text-zinc-400"
                    }`}
                  >
                    <ThumbsUp className="size-3" /> Approve Tone
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwipeLiked(false)}
                    className={`flex items-center gap-1 border px-2.5 py-1 text-xs transition-colors ${
                      swipeLiked === false
                        ? "border-red-500 bg-red-950/40 text-red-300"
                        : "border-zinc-800 hover:border-zinc-700 text-zinc-400"
                    }`}
                  >
                    <ThumbsDown className="size-3" /> Adjust
                  </button>
                </div>

                <Button
                  asChild
                  size="sm"
                  className="rounded-none bg-white text-black font-semibold text-xs hover:bg-zinc-200 border border-white"
                >
                  <Link
                    href={
                      isLoggedIn
                        ? "/chad-gtm"
                        : `/signup?url=${encodeURIComponent(targetUrl)}`
                    }
                  >
                    Analyze My Website Free <ArrowRight className="size-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
              <p className="text-[10px] font-mono text-zinc-500">
                Product preview only. Your real crawl, ICP, and calibration run on your
                domain after signup.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
