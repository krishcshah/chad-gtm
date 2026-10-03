"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Reply,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@smartreach/ui";

interface SequenceTouch {
  step: number;
  timing: string;
  tag: string;
  title: string;
  objective: string;
  subject: string;
  body: string;
  replyRate: string;
  badge: string;
}

const SEQUENCE_TOUCHES: SequenceTouch[] = [
  {
    step: 1,
    timing: "DAY 0 · INSTANT",
    tag: "TOUCH_01 // THE CALIBRATED HOOK",
    title: "Initial Personalized Opener",
    objective: "Direct, zero-fluff introduction matching the buyer's exact role and acute operational pain.",
    subject: "Quick question re: Apex Systems outbound",
    body: `Hi Marcus,

Saw your team at Apex Systems scaling engineering operations across Berlin.

Between managing cloud infrastructure and expanding headcount, most VPs of Eng we talk with struggle with manual outbound setup across Apollo and Instantly.

We built an autonomous system that turns your domain URL into active meetings in 60 seconds with zero seat fees.

Open to a brief 4-minute benchmark walk-through this Thursday?

Best,
Alex Rivera`,
    replyRate: "4.2% Reply Rate",
    badge: "DELIVERED TO PRIMARY INBOX",
  },
  {
    step: 2,
    timing: "DAY 3 · 72 HOURS LATER",
    tag: "TOUCH_02 // THE VALUE & PROOF BUMP",
    title: "Social Proof & ROI Bump",
    objective: "Light-touch follow-up sharing a 1-line case study and tangible outcome. No aggressive meeting demands.",
    subject: "Re: Quick question re: Apex Systems outbound",
    body: `Hi Marcus,

Wanted to quickly follow up on my previous note.

Julian Richter (Founder at CloudScale) recently used our autonomous engine to book 19 enterprise demos in their first 10 days—with zero SDR hires and zero secondary Google Workspace seat fees.

Did you have 4 minutes this week to compare notes on pipeline velocity?

Best,
Alex Rivera`,
    replyRate: "6.8% Cumulative Replies",
    badge: "AUTOMATIC BUMP IF NO REPLY",
  },
  {
    step: 3,
    timing: "DAY 7 · 96 HOURS LATER",
    tag: "TOUCH_03 // THE PERMISSION BREAKUP",
    title: "Polite Permission Breakup",
    objective: "The highest-converting email in B2B sales. Respectfully offers to close their file, prompting immediate action.",
    subject: "Re: Quick question re: Apex Systems outbound",
    body: `Hi Marcus,

Assuming you're heads-down scaling Apex Systems right now and outbound automation isn't top of mind.

Should I close your file for now, or check back with you next quarter?

Best,
Alex Rivera`,
    replyRate: "9.4% Final Conversion",
    badge: "HIGHEST-CONVERTING HOOK",
  },
];

export function ChadGtmSequenceShowcase() {
  const [activeTouchIndex, setActiveTouchIndex] = useState(0);
  const activeTouch = SEQUENCE_TOUCHES[activeTouchIndex];

  return (
    <section id="sequence" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black overflow-hidden font-mono">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-300 mb-4">
            <Sparkles className="size-3 text-white" />
            AUTONOMOUS MULTI-TOUCH CADENCE // 3-TOUCH PIPELINE
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase">
            1 Opener + 2 Intelligent Follow-Ups
            <br />
            <span className="text-zinc-500 font-mono text-2xl sm:text-4xl block mt-1">
              [80% OF REPLIES HAPPEN ON TOUCH 2 & 3]
            </span>
          </h2>
          <p className="mt-4 text-xs sm:text-sm text-zinc-400 font-sans max-w-2xl mx-auto leading-relaxed">
            Sending a single cold email is a waste of time. ChadGTM automatically executes a proven 3-touch cadence for every single prospect, dynamically tailored by AI, and pauses instantly the second a buyer replies.
          </p>
        </div>

        {/* Step Selector Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto mb-8">
          {SEQUENCE_TOUCHES.map((touch, idx) => {
            const isSelected = activeTouchIndex === idx;
            return (
              <button
                key={touch.step}
                type="button"
                onClick={() => setActiveTouchIndex(idx)}
                className={`p-4 border text-left transition-colors flex flex-col justify-between space-y-2 select-none ${
                  isSelected
                    ? "border-white bg-zinc-900 text-white"
                    : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                  <span className={isSelected ? "font-bold text-white" : "text-zinc-500"}>
                    STEP 0{touch.step}
                  </span>
                  <span className="border border-zinc-800 bg-black px-1.5 py-0.5 text-zinc-400 text-[9px]">
                    {touch.timing}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    {touch.title}
                  </h4>
                  <p className="text-[11px] text-zinc-500 font-sans mt-0.5 line-clamp-1">
                    {touch.objective}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Email Preview Simulator Card */}
        <div className="max-w-4xl mx-auto border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl">
          {/* Email Top Bar */}
          <div className="border-b border-zinc-800 bg-black px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-white shrink-0" />
              <span className="font-bold text-white uppercase tracking-wider text-xs">
                {activeTouch.tag}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="size-1.5 bg-emerald-500 rounded-none animate-pulse" />
              <span className="text-zinc-300 font-bold">{activeTouch.badge}</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">{activeTouch.replyRate}</span>
            </div>
          </div>

          {/* Email Metadata */}
          <div className="p-4 sm:p-6 space-y-4">
            <div className="border border-zinc-900 bg-black p-3 space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-zinc-500">
                <span className="uppercase text-[10px] tracking-widest text-zinc-600 w-16">To:</span>
                <span className="text-zinc-300 font-bold">Marcus Vance &lt;marcus@apexsystems.de&gt;</span>
                <span className="text-[10px] text-zinc-500">(VP of Engineering · Apex Systems)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-zinc-500">
                <span className="uppercase text-[10px] tracking-widest text-zinc-600 w-16">From:</span>
                <span className="text-zinc-400">Alex Rivera &lt;alex@managed-pool-04.chadgtm.io&gt;</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-zinc-500 pt-1 border-t border-zinc-900">
                <span className="uppercase text-[10px] tracking-widest text-zinc-600 w-16">Subject:</span>
                <span className="text-white font-bold">{activeTouch.subject}</span>
              </div>
            </div>

            {/* Email Body */}
            <div className="border border-zinc-900 bg-black p-5 sm:p-6 min-h-[200px]">
              <div className="whitespace-pre-line text-xs sm:text-sm text-zinc-300 font-mono leading-relaxed">
                {activeTouch.body}
              </div>
            </div>

            {/* Intelligent Automation Footnote */}
            <div className="border border-zinc-800/80 bg-zinc-900/40 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-zinc-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                <span className="font-sans">
                  <strong className="text-white font-mono">Zero-Spam Stop-On-Reply:</strong> If Marcus replies to Touch 1, Touches 2 & 3 are instantly cancelled.
                </span>
              </div>
              <Button asChild size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs uppercase tracking-wider shrink-0 h-8 px-4 border border-white">
                <Link href="/signup">
                  Launch 3-Touch Engine Free <ArrowRight className="size-3 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
