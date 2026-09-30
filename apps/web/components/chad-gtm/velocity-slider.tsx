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
  // Based on target 30 emails/mailbox pace
  const mailboxesRequired = Math.max(1, Math.ceil(dailyLimit / 30));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="text-center space-y-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" /> Step 5 of 5
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Outreach Velocity & Daily Budget
        </h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Set how many personalized emails the autonomous engine should deliver each day. Volume is automatically distributed across the shared mailbox pool.
        </p>
      </div>

      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xl space-y-6">
        {/* Slider Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Gauge className="size-3.5 text-primary" /> Daily Sending Pace
            </span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-extrabold text-primary">
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
            className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
          />

          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
            <span>30 / day (Gentle start)</span>
            <span>150 / day (Recommended)</span>
            <span>500 / day (High Scale)</span>
          </div>
        </div>

        {/* Real-Time Impact Metric Cards */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3 text-emerald-400" /> Weekly Reach
            </span>
            <div className="text-lg font-bold text-foreground">
              ~{weeklyVolume.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground">Prospects contacted per week</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
              <Mail className="size-3 text-primary" /> Managed Mailboxes
            </span>
            <div className="text-lg font-bold text-foreground">
              {mailboxesRequired} {mailboxesRequired === 1 ? "Mailbox" : "Mailboxes"}
            </div>
            <p className="text-[11px] text-muted-foreground">Paced strictly at 30/day cap</p>
          </div>
        </div>

        {/* Deliverability Guarantee Note */}
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex items-start gap-2.5 text-xs text-emerald-400">
          <ShieldCheck className="size-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Autonomous Deliverability Guardrail:</span>
            <p className="text-[11px] text-emerald-400/90 leading-relaxed">
              No mailbox will exceed 30 emails/day. Jobs are rotated with random 60–180s human-like delays to safeguard domain reputation.
            </p>
          </div>
        </div>

        {/* Final Launch CTA Button */}
        <Button
          type="button"
          disabled={isLaunching}
          onClick={() => onLaunch(dailyLimit)}
          className="w-full h-12 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl transition-all hover:scale-[1.01]"
        >
          {isLaunching ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Spinning up autonomous campaign & dispatching...
            </>
          ) : (
            <>
              Start Autonomous Outreach <Rocket className="size-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
