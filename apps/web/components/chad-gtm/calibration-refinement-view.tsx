"use client";

import { useState, useEffect } from "react";
import {
  Check,
  X,
  Sparkles,
  Cpu,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  Mail,
  Eye,
  Sliders,
  Terminal,
  ChevronRight,
  User,
  Building2,
  Briefcase,
} from "lucide-react";
import { Button } from "@smartreach/ui";
import type { CalibrationProfile } from "@/lib/chad-gtm-actions";
import type { EmailCalibrationSample } from "@/components/chad-gtm/swipe-card";

interface CalibrationRefinementViewProps {
  isRefining: boolean;
  profile: CalibrationProfile | null;
  refinedSamples: EmailCalibrationSample[];
  approvedCount: number;
  rejectedCount: number;
  onProceedToLaunch: () => void;
  onRecalibrate: () => void;
}

const REFINEMENT_TICKER_MESSAGES = [
  "Analyzing tone contrast across approved vs rejected samples...",
  "Extracting winning hook patterns, length preferences, and cadence...",
  "Eliminating generic sales fluff, pleasantries, and aggressive CTAs...",
  "Synthesizing customized AI dispatch directives for each prospect...",
  "Locking calibrated voice profile into autonomous outbound engine...",
];

export function CalibrationRefinementView({
  isRefining,
  profile,
  refinedSamples,
  approvedCount,
  rejectedCount,
  onProceedToLaunch,
  onRecalibrate,
}: CalibrationRefinementViewProps) {
  const [tickerIndex, setTickerIndex] = useState(0);
  const [selectedPreviewTab, setSelectedPreviewTab] = useState<number>(0); // 0 = template, 1+ = sample index

  useEffect(() => {
    if (!isRefining) return;
    const interval = setInterval(() => {
      setTickerIndex((i) => (i + 1) % REFINEMENT_TICKER_MESSAGES.length);
    }, 1100);
    return () => clearInterval(interval);
  }, [isRefining]);

  // Loading Screen: "Adjusting copy to your preferences..."
  if (isRefining) {
    return (
      <div className="mx-auto max-w-2xl py-12 px-4 space-y-6 font-sans text-center">
        {/* Top Tag */}
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-1 text-xs font-medium text-zinc-300">
          <Cpu className="size-3.5 text-emerald-400 animate-pulse" />
          Calibration Engine // Refinement Pipeline
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Adjusting copy to your preferences...
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
            Our neural model is analyzing what you approved ({approvedCount}) and rejected ({rejectedCount}) to eliminate fluff and lock in your preferred tone.
          </p>
        </div>

        {/* Live Telemetry Progress Card */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-6 space-y-4 text-left card-shine shadow-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800/80 pb-3 font-medium">
            <div className="flex items-center gap-2">
              <span className="size-2 bg-emerald-400 rounded-full animate-pulse" />
              <span>Synthesizing Preference Matrix</span>
            </div>
            <span className="text-zinc-500">Stage 04B // Voice Lock</span>
          </div>

          {/* Current Operation Ticker */}
          <div className="flex items-start gap-3 py-2">
            <div className="size-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white shrink-0 mt-0.5">
              <Terminal className="size-4 text-zinc-300" />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Active Operation
              </span>
              <p className="text-xs sm:text-sm font-semibold text-white tracking-tight">
                {REFINEMENT_TICKER_MESSAGES[tickerIndex]}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 pt-2">
            <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{
                  width: `${((tickerIndex + 1) / REFINEMENT_TICKER_MESSAGES.length) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Approved Samples: {approvedCount}</span>
              <span>Discarded: {rejectedCount}</span>
              <span className="text-zinc-300 font-semibold">{Math.round(((tickerIndex + 1) / REFINEMENT_TICKER_MESSAGES.length) * 100)}% Complete</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Refined Results Review Screen
  const sampleList = refinedSamples.length > 0 ? refinedSamples : [];
  const currentPreviewSample =
    selectedPreviewTab > 0 && sampleList[selectedPreviewTab - 1]
      ? sampleList[selectedPreviewTab - 1]
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Voice Calibrated // Preferences Locked
            </span>
            <span className="text-xs text-zinc-500">
              {approvedCount} approved · {rejectedCount} filtered
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1">
            Copy Calibrated to Your Preferences
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5 max-w-2xl">
            The autonomous engine analyzed your swipe feedback and refined the outbound copy. All upcoming emails will follow these exact parameters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRecalibrate}
            className="rounded-lg text-xs font-medium border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white"
          >
            <RotateCcw className="size-3 mr-1.5" /> Re-swipe
          </Button>
          <Button
            type="button"
            onClick={onProceedToLaunch}
            className="rounded-lg text-xs font-semibold bg-white hover:bg-zinc-200 text-black shadow-xs transition-all active:scale-[0.98]"
          >
            Set Velocity & Launch <ChevronRight className="size-3.5 ml-1" />
          </Button>
        </div>
      </div>

      {/* Main Grid: 2 Columns (Learnings & Rules vs Refined Copy Preview) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: What AI Learned & Adjusted (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Calibrated Tone Profile Card */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-3.5 card-shine shadow-xs">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
              <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <Sliders className="size-3.5 text-zinc-300" /> Calibrated Voice
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5">
                Active
              </span>
            </div>

            <div>
              <span className="text-[11px] text-zinc-500 font-medium block">
                Target Tone
              </span>
              <p className="text-sm font-semibold text-white tracking-tight mt-0.5">
                {profile?.voiceTone || "Direct, Technical Peer-to-Peer"}
              </p>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/60 pt-2.5">
              "{profile?.analysisSummary || "Adjusted model to prioritize concise value hooks while eliminating fluffy greetings."}"
            </p>
          </div>

          {/* Key Adjustments Made */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-3 card-shine shadow-xs">
            <span className="text-xs font-semibold text-zinc-300 block border-b border-zinc-800/60 pb-2">
              Key Adjustments Applied
            </span>
            <ul className="space-y-2">
              {(profile?.keyAdjustments || [
                "Eliminated introductory pleasantries in favor of immediate value hooks",
                "Trimmed body word count for rapid mobile readability",
                "Replaced calendar links with low-pressure curiosity questions",
              ]).map((adj, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-zinc-300 leading-relaxed">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{adj}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Rules: Do's & Don'ts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Do's */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-2">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <Check className="size-3.5" /> Reinforced
              </span>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {(profile?.dos || [
                  "Lead with operational bottleneck",
                  "Reference recipient industry context",
                  "Keep under 65 words",
                ]).map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Don'ts */}
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 space-y-2">
              <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                <X className="size-3.5" /> Eliminated
              </span>
              <ul className="space-y-1.5 text-xs text-zinc-400">
                {(profile?.donts || [
                  "No 'Hope this email finds you well'",
                  "No aggressive 30-min meeting demands",
                  "No corporate jargon or fluff",
                ]).map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-rose-400 font-bold">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Calibrated Copy Preview (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-6 space-y-4 card-shine shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-zinc-300" />
              <h3 className="text-xs font-semibold text-white tracking-tight">
                Calibrated Outbound Copy
              </h3>
            </div>

            {/* Preview View Selector */}
            <div className="flex items-center gap-1.5 text-xs bg-zinc-900/60 p-1 rounded-lg border border-zinc-800/80">
              <button
                type="button"
                onClick={() => setSelectedPreviewTab(0)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedPreviewTab === 0
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Template
              </button>
              {sampleList.slice(0, 2).map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedPreviewTab(idx + 1)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    selectedPreviewTab === idx + 1
                      ? "bg-zinc-800 text-white shadow-xs"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Lead #{idx + 1}
                </button>
              ))}
            </div>
          </div>

          {/* If Sample Preview Tab Selected: Show Prospect Metadata */}
          {currentPreviewSample && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 text-xs text-zinc-300">
              <div className="flex items-center gap-2">
                <User className="size-3.5 text-zinc-400" />
                <span className="font-semibold text-white">{currentPreviewSample.recipientName}</span>
                <span className="text-zinc-500">({currentPreviewSample.recipientTitle})</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <Building2 className="size-3.5 text-zinc-500" />
                <span>{currentPreviewSample.recipientCompany}</span>
              </div>
            </div>
          )}

          {/* Subject Line Box */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
              Calibrated Subject Line
            </span>
            <p className="text-xs sm:text-sm font-semibold text-white tracking-tight">
              {currentPreviewSample
                ? currentPreviewSample.subject
                : profile?.calibratedSubjectTemplate || "Quick question re: {{company}} workflow"}
            </p>
          </div>

          {/* Body Box */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-2 min-h-[180px]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
              Personalized Email Body
            </span>
            <div className="whitespace-pre-line text-xs sm:text-sm font-sans text-zinc-300 leading-relaxed">
              {currentPreviewSample
                ? currentPreviewSample.bodyText
                : profile?.calibratedBodyTemplate ||
                  "Hi {{first_name}},\n\nSaw your team at {{company}} scaling operations.\n\nOpen to a brief 4-minute demo this Thursday?\n\nBest,\n{{sender_name}}"}
            </div>
          </div>

          {/* Dynamic AI Dispatch Notice */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5 text-xs text-zinc-300 space-y-1">
            <div className="flex items-center gap-1.5 text-white font-semibold">
              <Sparkles className="size-3.5 text-emerald-400" />
              Dynamic On-the-Fly Personalization Active
            </div>
            <p className="leading-relaxed text-zinc-400 text-xs">
              Every dispatched email will be dynamically customized to the prospect's company and industry using this calibrated prompt directive.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Launch Button Bar */}
      <div className="pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-zinc-500">
          Preferences saved to session · Ready for sending velocity configuration
        </span>
        <Button
          type="button"
          onClick={onProceedToLaunch}
          size="lg"
          className="rounded-lg h-11 px-8 bg-white hover:bg-zinc-200 text-black font-semibold text-xs tracking-tight shadow-sm gap-2 w-full sm:w-auto transition-all active:scale-[0.98]"
        >
          Proceed to Daily Velocity & Launch <ArrowRight className="size-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
