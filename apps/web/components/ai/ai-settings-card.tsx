"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "@smartreach/ui";
import { Sparkles, CheckCircle2, ShieldCheck, Cpu, Zap } from "lucide-react";

interface AiSettingsCardProps {
  initialProvider?: string;
  initialModel?: string;
  hasApiKey?: boolean;
}

export function AiSettingsCard({}: AiSettingsCardProps) {
  return (
    <Card className="rounded-none border border-zinc-800 bg-zinc-950 font-mono shadow-none text-zinc-100">
      <CardHeader className="p-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-none border border-zinc-700 bg-black text-white">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                  Chad Neural Core™
                </CardTitle>
                <span className="rounded-none border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono tracking-widest text-zinc-300 uppercase">
                  Proprietary GTM System
                </span>
              </div>
              <CardDescription className="text-xs text-zinc-400 font-sans mt-0.5">
                Specialized outbound intelligence trained on 7+ years of cold campaign conversion data and 50M+ sales touchpoints.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-none border border-zinc-700 bg-black px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-white">
              <span className="size-1.5 rounded-none bg-white animate-pulse" />
              Neural Engine Active
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-6 pt-0">
        <Separator className="bg-zinc-800" />

        {/* Architectural Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="rounded-none border border-zinc-800 bg-black p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
              <Cpu className="size-3.5 text-zinc-400" />
              <span>Proprietary GTM Intelligence</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Chad Neural Core™ v2</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              Sub-second web reasoning &amp; multi-modal semantic synthesis calibrated specifically for B2B cold outreach conversion.
            </p>
          </div>

          <div className="rounded-none border border-zinc-800 bg-black p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
              <ShieldCheck className="size-3.5 text-zinc-400" />
              <span>Zero-Config Turnkey</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Pre-Trained &amp; Ready</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              No external API keys or configuration needed. High-throughput dedicated inference infrastructure included natively.
            </p>
          </div>

          <div className="rounded-none border border-zinc-800 bg-black p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
              <Zap className="size-3.5 text-zinc-400" />
              <span>Pipeline Workflows</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Autonomous Orchestration</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              Autonomous URL extraction, ICP buyer persona generation, voice calibration, and real-time reply sentiment classification.
            </p>
          </div>
        </div>

        {/* Status Callout Banner */}
        <div className="flex items-start gap-3 rounded-none border border-zinc-800 bg-black/60 p-3.5">
          <CheckCircle2 className="size-4 text-white shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-white uppercase tracking-wider">
              Dedicated Outbound Cluster Active
            </p>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              Your ChadGTM workspace is pre-connected to the production Chad Neural Core™ cluster. All autonomous campaign research, ICP synthesis, tone calibration, and email sequencing dispatch automatically through our proprietary high-availability pipeline.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
