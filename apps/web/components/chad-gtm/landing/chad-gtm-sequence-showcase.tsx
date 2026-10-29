"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  FileEdit,
  Mail,
  MessageSquare,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@smartreach/ui";

interface PlatformPillar {
  step: string;
  tag: string;
  tabLabel: string;
  title: string;
  headline: string;
  description: string;
  badge: string;
  previewHeader: string;
  previewMetaLabel: string;
  previewMetaValue: string;
  subject: string;
  body: string;
  details: { label: string; value: string }[];
  actionNote: string;
}

const PLATFORM_PILLARS: PlatformPillar[] = [
  {
    step: "01",
    tabLabel: "01 // Custom Script Writing",
    tag: "PILLAR 01 · INTELLIGENT POSITIONING & COPYWRITING",
    title: "Automated Custom Script Writing",
    headline: "AI that deeply analyzes your domain & crafts tailor-made sales pitches.",
    description:
      "Stop blasting generic template spam that burns your domain reputation. AutoGTM crawls your product features, pricing, and customer proof points to synthesize custom outbound pitches tailored to each target persona—sounding like an experienced founder, not an AI bot.",
    badge: "Zero Template Clichés",
    previewHeader: "Generated Custom Pitch Script (Tailored to Persona)",
    previewMetaLabel: "Target Persona",
    previewMetaValue: "VP of Engineering · Enterprise SaaS",
    subject: "Quick question re: Apex Systems outbound pipeline",
    body: `Hi Marcus,

Saw your team at Apex Systems expanding engineering velocity across Berlin.

Between managing infrastructure scaling and growing your senior dev team, most VPs of Engineering struggle with the fragmented manual setup across Apollo, Instantly, and secondary Google Workspace inboxes.

We built AutoGTM to turn your company URL directly into active sales meetings with zero monthly software fees and zero domain configuration.

Open to a brief 4-minute walk-through this Thursday?

Best,
Alex Rivera`,
    details: [
      { label: "Crawled Source", value: "apexsystems.com/platform & /pricing" },
      { label: "Angle Calibrated", value: "Operational friction & unified cost reduction" },
      { label: "Tone Calibrated", value: "Direct Founder-to-Leader (Concise, zero fluff)" },
    ],
    actionNote: "Tinder-style swipe deck lets you calibrate voice and messaging angles in seconds",
  },
  {
    step: "02",
    tabLabel: "02 // Automated Outreach",
    tag: "PILLAR 02 · ZERO-SETUP INBOX DISPATCH",
    title: "Autonomous Multi-Touch Outreach",
    headline: "Multi-step sequences dispatched automatically with zero mailbox headache.",
    description:
      "AutoGTM eliminates all infrastructure friction. Never buy burner domains, wait 3 weeks for manual inbox warming, or fight complex DNS records again. Our system delivers your tailored sequences across pre-warmed, authenticated sender accounts with safe 30/day pacing and randomized jitter.",
    badge: "Pre-Warmed & Turnkey",
    previewHeader: "Multi-Touch Outbound Cadence Dispatch",
    previewMetaLabel: "Dispatch Fleet",
    previewMetaValue: "11 Pre-Warmed Shared Inboxes · Active",
    subject: "Autonomous Cadence: 3-Step Dynamic Follow-Up Flow",
    body: `• Touch 01 (Day 0): Personalized Opener
  Direct role hook & acute friction identification tailored to company offerings.

• Touch 02 (Day 3): Social Proof & ROI Bump
  1-line customer outcome (+280% pipeline) sent automatically if no response.

• Touch 03 (Day 7): Polite Permission Breakup
  Low-friction permission close that prompts immediate action or file closure.

All emails rotate sender addresses automatically to enforce strict 30 emails/mailbox/day limits for 99.8% primary inbox placement.`,
    details: [
      { label: "Infrastructure", value: "100% Admin-Supplied & Authenticated (SPF/DKIM/DMARC)" },
      { label: "Pacing Cap", value: "Strict 30/day per mailbox (Randomized 45–120s jitter)" },
      { label: "Delivery Guarantee", value: "Zero DNS setup · Turnkey pre-warmed pool" },
    ],
    actionNote: "Rotates sender accounts automatically to enforce safe 30/day inbox pacing",
  },
  {
    step: "03",
    tabLabel: "03 // Replies to Bookings",
    tag: "PILLAR 03 · CENTRALIZED UNIBOX & REVENUE CONVERSION",
    title: "Smart Reply Management & Booking",
    headline: "Intelligent reply triage that turns inbound responses into booked calls.",
    description:
      "The moment a prospect replies, AutoGTM instantly pauses outreach across that account to prevent embarrassing double-emails. Our centralized UniBox classifies buyer sentiment in real time and routes interested leads straight to your meeting calendar.",
    badge: "Direct Calendar Sync",
    previewHeader: "Real-Time UniBox Reply & Calendar Booking Detection",
    previewMetaLabel: "Inbound Buyer",
    previewMetaValue: "Marcus Vance · VP of Engineering (Apex Systems)",
    subject: "Re: Quick question re: Apex Systems outbound pipeline",
    body: `"Hey Alex, this is actually timely. We've been evaluating our SDR tooling and the $1,200/mo stack cost is getting out of hand.

Can you share a link to your calendar for Thursday at 2:00 PM CET? I'd love to see how your automated script crawler works."

✔ Sentiment Detected: POSITIVE · HIGH DEMO INTENT
✔ System Action: Campaign automatically paused for Marcus Vance
✔ Booking Action: Direct calendar routing triggered`,
    details: [
      { label: "Auto-Pause", value: "Instant sequence cancellation the moment a prospect replies" },
      { label: "Sentiment AI", value: "Categorizes Positive, Question, Objection, or OOO" },
      { label: "Calendar Sync", value: "Direct Google / Cal.com link routing for zero-delay booking" },
    ],
    actionNote: "Centralized UniBox handles replies, filters objections, and confirms meetings on your calendar",
  },
];

export function ChadGtmSequenceShowcase() {
  const [activePillarIndex, setActivePillarIndex] = useState(0);
  const activePillar = PLATFORM_PILLARS[activePillarIndex];

  return (
    <section id="platform-workflow" className="relative py-24 sm:py-32 border-t border-zinc-800/80 bg-[#060606] overflow-hidden font-sans">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-950/20 px-3 py-1 text-xs font-mono text-emerald-400 mb-4">
            <Sparkles className="size-3 text-emerald-400" />
            <span>The All-In-One Revenue Engine · Complete Outbound Workflow</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Everything in one platform.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
              From leads to booked meetings on autopilot.
            </span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 font-sans max-w-2xl mx-auto leading-relaxed">
            Stop paying for 5 fragmented tools to find contacts, write scripts, warm domains, and track replies. AutoGTM unifies the entire outbound sales motion into one seamless, automated machine.
          </p>
        </div>

        {/* Step Selector Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto mb-8">
          {PLATFORM_PILLARS.map((pillar, idx) => {
            const isSelected = activePillarIndex === idx;
            return (
              <button
                key={pillar.step}
                type="button"
                onClick={() => setActivePillarIndex(idx)}
                className={`p-4 border text-left transition-colors flex flex-col justify-between space-y-2 select-none rounded-none ${
                  isSelected
                    ? "border-white bg-zinc-950 text-white shadow-lg"
                    : "border-zinc-800 bg-[#090909] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className={isSelected ? "text-emerald-400 font-bold" : "text-zinc-500"}>
                    Step {pillar.step}
                  </span>
                  <span className="rounded-none border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-400">
                    {pillar.badge}
                  </span>
                </div>
                <div className="text-xs font-bold text-white tracking-tight">{pillar.title}</div>
                <div className="text-[11px] text-zinc-400 leading-snug line-clamp-1">
                  {pillar.headline}
                </div>
              </button>
            );
          })}
        </div>

        {/* Main Stage Preview Card */}
        <div className="max-w-4xl mx-auto border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-6 rounded-none shadow-2xl">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="size-2 bg-emerald-400 rounded-none animate-pulse" />
                <span className="text-sm font-semibold text-white">{activePillar.title}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-xs text-zinc-400 font-mono">{activePillar.tag}</span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-2xl font-sans pt-1">
                {activePillar.description}
              </p>
            </div>

            <span className="border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 text-xs px-2.5 py-1 font-mono rounded-none">
              {activePillar.badge}
            </span>
          </div>

          {/* Interactive Content Window */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-zinc-900/70 p-3 border border-zinc-800 font-mono">
              <div className="text-white font-semibold flex items-center gap-2">
                <Mail className="size-3.5 text-emerald-400" />
                <span>{activePillar.previewHeader}</span>
              </div>
              <div className="text-zinc-400 text-[11px]">
                <span className="text-zinc-500">{activePillar.previewMetaLabel}:</span>{" "}
                <span className="text-zinc-200">{activePillar.previewMetaValue}</span>
              </div>
            </div>

            {/* Subject */}
            <div className="text-xs font-semibold text-white bg-black/40 p-3 border border-zinc-800/80">
              <span className="text-zinc-500 font-normal font-mono">Subject:</span> {activePillar.subject}
            </div>

            {/* Body */}
            <div className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-zinc-200 font-sans bg-black/60 border border-zinc-800/80 p-5">
              {activePillar.body}
            </div>

            {/* Spec Details Chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              {activePillar.details.map((d, i) => (
                <div key={i} className="border border-zinc-800 bg-zinc-900/40 p-2.5 rounded-none text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">{d.label}</div>
                  <div className="text-zinc-200 font-medium text-[11px] mt-0.5">{d.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-zinc-800 text-xs text-zinc-400">
            <div className="flex items-center gap-2 text-zinc-300">
              <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
              <span>{activePillar.actionNote}</span>
            </div>
            <Button
              asChild
              size="sm"
              className="rounded-none bg-white text-black font-semibold text-xs hover:bg-zinc-200 border border-white shrink-0 shadow-none active:scale-[0.99]"
            >
              <Link href="/signup">
                Deploy All-In-One Engine Free <ArrowRight className="size-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
