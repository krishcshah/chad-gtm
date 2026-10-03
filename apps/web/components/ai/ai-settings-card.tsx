"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Badge,
} from "@smartreach/ui";
import { Sparkles, CheckCircle2, ShieldCheck, Cpu, Zap, Globe, Users } from "lucide-react";

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
                  Autonomous AI Engine
                </CardTitle>
                <span className="rounded-none border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono tracking-widest text-zinc-300 uppercase">
                  v2.0
                </span>
              </div>
              <CardDescription className="text-xs text-zinc-400 font-sans mt-0.5">
                Powered by Google Gemini 3.8 Flash · Integrated &amp; managed as part of your platform subscription.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-none border border-zinc-700 bg-black px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-white">
              <span className="size-1.5 rounded-none bg-white animate-pulse" />
              Engine Deployed &amp; Active
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
              <span>Frontier Model</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Gemini 3.8 Flash</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              Sub-second web reasoning &amp; multi-modal semantic synthesis provided natively by ChadGTM.
            </p>
          </div>

          <div className="rounded-none border border-zinc-800 bg-black p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
              <ShieldCheck className="size-3.5 text-zinc-400" />
              <span>Zero-Config Auth</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Fully Managed Subscription</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              No personal Google or OpenAI API keys needed. All quotas and tokens are managed directly by us.
            </p>
          </div>

          <div className="rounded-none border border-zinc-800 bg-black p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
              <Zap className="size-3.5 text-zinc-400" />
              <span>Pipeline Workflows</span>
            </div>
            <p className="text-zinc-300 font-mono text-xs">Autonomous Orchestration</p>
            <p className="text-[10px] text-zinc-500 font-sans leading-normal">
              URL extraction, ICP buyer generation, tone calibration, and reply sentiment classification.
            </p>
          </div>
        </div>

        {/* Status Callout Banner */}
        <div className="flex items-start gap-3 rounded-none border border-zinc-800 bg-black/60 p-3.5">
          <CheckCircle2 className="size-4 text-white shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-white uppercase tracking-wider">
              No API Key Configuration Required
            </p>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              Your ChadGTM workspace is pre-connected to the production Gemini 3.8 Flash cluster. Whenever you run autonomous GTM campaigns or rewrite emails, the system dispatches via our pre-warmed developer credentials.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
