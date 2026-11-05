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
    <Card className="rounded-lg border border-zinc-800 bg-zinc-950 shadow-none text-zinc-100">
      <CardHeader className="p-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border border-zinc-700 bg-black text-white">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                  Managed AI
                </CardTitle>
                <span className="rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono tracking-widest text-zinc-300 uppercase">
                  Platform model
                </span>
              </div>
              <CardDescription className="text-xs text-zinc-400 font-sans mt-0.5">
                Research, copywriting, and reply triage run on the platform-managed model. Every reply the agent sends is limited to your booking link and your knowledge base.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-black px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-white">
              <span className="size-1.5 rounded-full bg-brand-400" />
              Managed
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-6 pt-0">
        <Separator className="bg-zinc-800" />

        {/* Architectural Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
              <Cpu className="size-3.5 text-zinc-400" />
              <span>Model</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Managed AI (platform key)</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              Used for website research, per-lead copy, and classifying replies.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
              <ShieldCheck className="size-3.5 text-zinc-400" />
              <span>Zero-Config Turnkey</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Nothing to configure</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              No API keys needed. The platform supplies and manages the model key.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
              <Zap className="size-3.5 text-zinc-400" />
              <span>Pipeline Workflows</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Autonomous Orchestration</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              Website research, ICP and persona generation, voice calibration, and reply triage for the reply agent.
            </p>
          </div>
        </div>

        {/* Status Callout Banner */}
        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
          <CheckCircle2 className="size-4 text-white shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-white uppercase tracking-wider">
              Connected
            </p>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              Your workspace uses the platform-managed AI model for research, copy, and replies. If the model is unavailable, campaigns fall back to your approved baseline copy instead of guessing.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
