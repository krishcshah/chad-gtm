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
    <div className="mx-auto max-w-xl space-y-6 font-mono">
      <div className="text-center space-y-2">
        <span className="inline-flex items-center gap-1 rounded-none border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-white">
          STAGE 05 // VELOCITY
        </span>
        <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-white">
          Outreach Velocity & Pacing
        </h2>
        <p className="text-xs text-zinc-400 font-sans max-w-md mx-auto">
          Specify daily volume. Traffic is automatically load-balanced across our shared sender mailbox pool.
        </p>
      </div>

      <div className="rounded-none border border-zinc-800 bg-zinc-950 p-6 space-y-6">
        {/* Slider Controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 text-[11px]">
              <Gauge className="size-3.5 text-white" /> Sending Velocity
            </span>
            <span className="rounded-none border border-zinc-700 bg-black px-2.5 py-1 text-xs font-bold text-white">
              {dailyLimit} EMAILS / DAY
            </span>
          </div>

          <input
            type="range"
            min={30}
            max={500}
            step={10}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Number(e.target.value))}
            className="w-full accent-white h-1.5 bg-zinc-800 rounded-none cursor-pointer"
          />

          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
            <span>30/D (GENTLE)</span>
            <span>150/D (RECOMMENDED)</span>
            <span>500/D (MAX POOL)</span>
          </div>
        </div>

        {/* Real-Time Impact Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="rounded-none border border-zinc-800 bg-black p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1">
              <Calendar className="size-3 text-white" /> Weekly Volume
            </span>
            <div className="text-lg font-bold text-white">
              ~{weeklyVolume.toLocaleString()}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Prospects contacted weekly</p>
          </div>

          <div className="rounded-none border border-zinc-800 bg-black p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1">
              <Mail className="size-3 text-white" /> Required Mailboxes
            </span>
            <div className="text-lg font-bold text-white">
              {mailboxesRequired} {mailboxesRequired === 1 ? "Mailbox" : "Mailboxes"}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Paced strictly at 30/day cap</p>
          </div>
        </div>

        {/* Deliverability Guarantee Note */}
        <div className="rounded-none bg-black border border-zinc-800 p-3.5 flex items-start gap-2.5 text-xs text-zinc-300">
          <ShieldCheck className="size-4 text-white shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-white uppercase tracking-wider text-[11px]">Deliverability Guardrail:</span>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              No mailbox exceeds 30 emails/day. Jobs are rotated with random 60–180s human-like delays to maintain IP & domain sender reputation.
            </p>
          </div>
        </div>

        {/* Final Launch CTA Button */}
        <Button
          type="button"
          disabled={isLaunching}
          onClick={() => onLaunch(dailyLimit)}
          className="w-full h-11 text-xs font-mono uppercase tracking-wider font-semibold bg-white hover:bg-zinc-200 text-black border border-white"
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
