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
    timing: "Day 0 · Immediate Send",
    tag: "TOUCH 01 // THE CALIBRATED HOOK",
    title: "Initial Personalized Opener",
    objective: "Direct, zero-fluff introduction matching the buyer's exact role and acute operational friction.",
    subject: "Quick question re: Apex Systems outbound",
    body: `Hi Marcus,

Saw your team at Apex Systems scaling engineering operations across Berlin.

Between managing cloud infrastructure and expanding headcount, most VPs of Engineering we talk with struggle with manual outbound setup across fragmented vendors like Apollo and Instantly.

We built an autonomous system that turns your domain URL into active sales meetings in 60 seconds with zero seat taxes.

Open to a brief 4-minute benchmark walk-through this Thursday?

Best,
Alex Rivera`,
    replyRate: "4.2% Reply Rate",
    badge: "Delivered to Primary Inbox",
  },
  {
    step: 2,
    timing: "Day 3 · 72 Hours Later",
    tag: "TOUCH 02 // THE SOCIAL PROOF BUMP",
    title: "Social Proof & ROI Bump",
    objective: "Light-touch follow-up sharing a 1-line case study and concrete outcome. Zero pushy meeting demands.",
    subject: "Re: Quick question re: Apex Systems outbound",
    body: `Hi Marcus,

Wanted to quickly follow up on my previous note.

Julian Richter (Founder at CloudScale) recently used our autonomous engine to book 19 enterprise demos in their first 10 days—with zero SDR hires and zero secondary Google Workspace seat fees.

Did you have 4 minutes this week to compare notes on pipeline velocity?

Best,
Alex Rivera`,
    replyRate: "6.8% Cumulative Replies",
    badge: "Auto-Sent If No Reply",
  },
  {
    step: 3,
    timing: "Day 7 · 96 Hours Later",
    tag: "TOUCH 03 // THE PERMISSION BREAKUP",
    title: "Polite Permission Breakup",
    objective: "The highest-converting email in B2B sales. Respectfully offers to close their file, prompting immediate action.",
    subject: "Re: Quick question re: Apex Systems outbound",
    body: `Hi Marcus,

Assuming you're heads-down scaling Apex Systems right now and outbound automation isn't top of mind.

Should I close your file for now, or check back with you next quarter?

Best,
Alex Rivera`,
    replyRate: "9.4% Final Conversion",
    badge: "Highest-Converting Hook",
  },
];

export function ChadGtmSequenceShowcase() {
  const [activeTouchIndex, setActiveTouchIndex] = useState(0);
  const activeTouch = SEQUENCE_TOUCHES[activeTouchIndex];

  return (
    <section id="sequence" className="relative py-24 sm:py-32 border-t border-zinc-800/80 bg-[#060606] overflow-hidden font-sans">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-950/20 px-3 py-1 text-xs font-mono text-emerald-400 mb-4">
            <Sparkles className="size-3 text-emerald-400" />
            <span>Autonomous Outbound Cadence · The 3-Touch Framework</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Why 72% of positive replies happen on Touch 2 &amp; 3.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 font-sans max-w-2xl mx-auto leading-relaxed">
            Sending a single cold email is a waste of time. AutoGTM automatically executes a proven 3-touch sequence for every single prospect, dynamically tailored by AI, and pauses instantly the second a buyer replies.
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
                className={`p-4 border text-left transition-colors flex flex-col justify-between space-y-2 select-none rounded-none ${
                  isSelected
                    ? "border-white bg-zinc-950 text-white"
                    : "border-zinc-800 bg-[#090909] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className={isSelected ? "text-emerald-400 font-bold" : "text-zinc-500"}>
                    Step 0{touch.step}
                  </span>
                  <span className="text-zinc-500">{touch.timing}</span>
                </div>
                <div className="text-xs font-bold text-white tracking-tight">{touch.title}</div>
                <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1.5 pt-1">
                  <span
                    className={`size-1.5 rounded-none ${
                      isSelected ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                  {touch.replyRate}
                </div>
              </button>
            );
          })}
        </div>

        {/* Email Preview Card */}
        <div className="max-w-4xl mx-auto border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-5 rounded-none shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-emerald-400" />
                <span className="text-sm font-semibold text-white">{activeTouch.title}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-xs text-zinc-400 font-mono">{activeTouch.timing}</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                {activeTouch.objective}
              </p>
            </div>

            <span className="border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 text-xs px-2.5 py-1 font-mono rounded-none">
              {activeTouch.badge}
            </span>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-white bg-zinc-900/60 p-3 border border-zinc-800">
              <span className="text-zinc-500 font-normal">Subject:</span> {activeTouch.subject}
            </div>

            <div className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-zinc-300 font-sans bg-black/60 border border-zinc-800/80 p-5">
              {activeTouch.body}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-zinc-800 text-xs text-zinc-400">
            <div className="flex items-center gap-2 text-zinc-300">
              <ShieldCheck className="size-4 text-emerald-400" />
              <span>Rotates sender accounts automatically to enforce safe 30/day inbox pacing</span>
            </div>
            <Button
              asChild
              size="sm"
              className="rounded-none bg-white text-black font-semibold text-xs hover:bg-zinc-200 border border-white"
            >
              <Link href="/signup">
                Launch This Cadence Free <ArrowRight className="size-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
