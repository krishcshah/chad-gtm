"use client";

import { useState } from "react";
import { Rocket, Gauge, ShieldCheck, Mail, Calendar, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@smartreach/ui";

export function VelocitySlider({
  initialLimit = 60,
  onLaunch,
  isLaunching = false,
}: {
  initialLimit?: number;
  onLaunch: (dailyLimit: number) => void;
  isLaunching?: boolean;
}) {
  const [dailyLimit, setDailyLimit] = useState(initialLimit);

  const weeklyVolume = dailyLimit * 7;
  const mailboxesRequired = Math.max(1, Math.ceil(dailyLimit / 30));

  return (
    <div className="mx-auto max-w-xl space-y-6 font-sans">
      <div className="text-center space-y-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300">
          Stage 05 // Velocity
        </span>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          Outreach Velocity & Pacing
        </h2>
        <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
          Specify daily volume. Traffic is automatically load-balanced across our shared sender mailbox pool.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-6 sm:p-7 space-y-6 card-shine shadow-xl">
        {/* Slider Controls */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 flex items-center gap-1.5 text-xs font-medium">
              <Gauge className="size-4 text-zinc-300" /> Sending Velocity
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              {dailyLimit} emails / day
            </span>
          </div>

          <input
            type="range"
            min={30}
            max={500}
            step={10}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Number(e.target.value))}
            className="w-full accent-white h-2 bg-zinc-800 rounded-full cursor-pointer"
          />

          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium">
            <span>30/day (Gentle)</span>
            <span>150/day (Recommended)</span>
            <span>500/day (Max Pool)</span>
          </div>
        </div>

        {/* Real-Time Impact Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-1">
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Calendar className="size-3.5 text-zinc-400" /> Weekly Volume
            </span>
            <div className="text-xl font-bold text-white tracking-tight">
              ~{weeklyVolume.toLocaleString()}
            </div>
            <p className="text-[11px] text-zinc-500">Prospects contacted weekly</p>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-1">
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Mail className="size-3.5 text-zinc-400" /> Required Mailboxes
            </span>
            <div className="text-xl font-bold text-white tracking-tight">
              {mailboxesRequired} {mailboxesRequired === 1 ? "Mailbox" : "Mailboxes"}
            </div>
            <p className="text-[11px] text-zinc-500">Paced strictly at 30/day cap</p>
          </div>
        </div>

        {/* Deliverability Guarantee Note */}
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 p-4 flex items-start gap-3 text-xs text-zinc-300">
          <ShieldCheck className="size-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-white text-xs">Deliverability Guardrail:</span>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No mailbox exceeds 30 emails/day. Jobs are rotated with random 60–180s human-like delays to maintain IP & domain sender reputation.
            </p>
          </div>
        </div>

        {/* Final Launch CTA Button */}
        <Button
          type="button"
          disabled={isLaunching}
          onClick={() => onLaunch(dailyLimit)}
          className="w-full h-11 text-xs font-semibold tracking-tight bg-white hover:bg-zinc-200 text-black rounded-lg shadow-sm transition-all active:scale-[0.98] cursor-pointer"
        >
          {isLaunching ? (
            <>
              <Loader2 className="size-3.5 animate-spin mr-2" />
              Spinning up autonomous campaign & dispatching...
            </>
          ) : (
            <>
              Start Autonomous Outreach <Rocket className="size-3.5 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
