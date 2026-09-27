"use client";

import * as React from "react";
import { Button, Badge, Input } from "@smartreach/ui";
import { STRIPE_PAYMENT_LINK, getCheckoutUrl } from "@/lib/donation";
import {
  Heart,
  Sparkles,
  Server,
  Zap,
  ShieldCheck,
  ArrowRight,
  Lock,
  CheckCircle2,
} from "lucide-react";

type Frequency = "monthly" | "one-time";
type Preset = 5 | 10 | 20 | "custom";

export function LandingDonationSection() {
  const [frequency, setFrequency] = React.useState<Frequency>("one-time");
  const [preset, setPreset] = React.useState<Preset>(20);
  const [customAmount, setCustomAmount] = React.useState<string>("");

  const getEffectiveAmount = (): number => {
    if (preset === "custom") {
      const parsed = parseFloat(customAmount);
      return isNaN(parsed) || parsed <= 0 ? 25 : parsed;
    }
    return preset;
  };

  const currentAmount = getEffectiveAmount();

  const handleDonate = () => {
    try {
      localStorage.setItem("smartreach_has_donated", "1");
    } catch {}

    try {
      const checkoutUrl = getCheckoutUrl(undefined, undefined, currentAmount, frequency);
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    } catch {
      window.open(STRIPE_PAYMENT_LINK, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section id="community-support" className="py-20 border-t border-border/40 relative overflow-hidden bg-gradient-to-b from-card/30 via-background to-card/20">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 size-96 rounded-full bg-rose-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-10 bottom-10 size-80 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3.5 py-1 text-xs font-semibold text-rose-400 backdrop-blur-md mb-4 shadow-xs">
            <Heart className="size-3.5 fill-rose-500 text-rose-500 animate-pulse" />
            <span>Community Supported & Independent</span>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            We Want to Keep SmartReach Free Forever
            <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 to-rose-400">
              — But We Cannot Do This Without Your Support
            </span>
          </h2>

          <p className="mt-4 text-muted-foreground text-sm sm:text-base leading-relaxed">
            Right now we pay for everything out of our own pockets — development, EU hosting, and maintenance. We want to keep SmartReach free forever with unlimited mailboxes, and we can’t do it without your help. Every dollar helps!
          </p>
        </div>

        {/* 2-Column Responsive Container */}
        <div className="mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Why We Need Your Help / Transparency */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              <div className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur-md">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                    <Server className="size-4.5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">100% Out of Our Own Pocket</h3>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  High-speed Frankfurt servers, NVMe database clusters, Redis queues, and deliverability monitoring are paid personally each month.
                </p>
              </div>

              <div className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur-md">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                    <Zap className="size-4.5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Unlimited Everything, Zero Paywalls</h3>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Other tools charge $99/mo to artificially throttle you to 3 inboxes. We believe cold outreach infrastructure should be unlimited and accessible to every builder.
                </p>
              </div>

              <div className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur-md">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                    <ShieldCheck className="size-4.5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">No VCs, No Hidden Monetization</h3>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  We don’t sell your data or lock features behind corporate upgrades. SmartReach is built with genuine love for the bootstrapping community.
                </p>
              </div>
            </div>

            {/* Founder Note */}
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-muted-foreground flex items-center gap-3">
              <span className="text-xl select-none">💌</span>
              <p className="leading-relaxed">
                <strong className="text-foreground">A small contribution goes a long way.</strong> Sponsoring a $5 coffee or $10 server helps us keep the lights on for everyone.
              </p>
            </div>
          </div>

          {/* Right Column: Interactive Donation Box */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border-2 border-rose-500/30 bg-card/90 p-6 sm:p-8 shadow-2xl backdrop-blur relative overflow-hidden flex flex-col justify-between h-full">
              <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-rose-500/10 blur-3xl" />

              <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-5">
                  <div>
                    <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                      <span>Support SmartReach</span>
                      <Heart className="size-4.5 text-rose-500 fill-rose-500" />
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Directly fund our open-source servers and development
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit border-rose-500/30 text-rose-400 bg-rose-500/10 text-[11px]">
                    100% Tax Deductible
                  </Badge>
                </div>

                {/* 1. Frequency Selector */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                    1. Choose Frequency
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/40 border border-border/60">
                    <button
                      type="button"
                      onClick={() => setFrequency("one-time")}
                      className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-all ${
                        frequency === "one-time"
                          ? "bg-card text-foreground shadow-xs border border-border/80"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Sparkles className="size-3.5 text-amber-400" />
                      <span>One-Time Gift</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrequency("monthly")}
                      className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-all ${
                        frequency === "monthly"
                          ? "bg-card text-foreground shadow-xs border border-border/80"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Heart className="size-3.5 text-rose-500 fill-rose-500" />
                      <span>Monthly Support</span>
                    </button>
                  </div>
                </div>

                {/* 2. Amount Selection Grid */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                    2. Select Amount
                  </label>
                  <div className="grid grid-cols-4 gap-2.5">
                    {([5, 10, 20] as const).map((amt) => {
                      const isSelected = preset === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setPreset(amt)}
                          className={`relative flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                            isSelected
                              ? "border-rose-500 bg-rose-500/10 text-rose-400 font-bold shadow-xs scale-[1.02]"
                              : "border-border/70 bg-card/60 text-foreground hover:border-border hover:bg-muted/30"
                          }`}
                        >
                          {amt === 20 && (
                            <span className="absolute -top-2 rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-extrabold text-white shadow-xs">
                              POPULAR
                            </span>
                          )}
                          <span className="text-lg font-extrabold tracking-tight">${amt}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 font-normal">
                            {amt === 5 ? "☕ Coffee" : amt === 10 ? "⚡ Server" : "🚀 Champion"}
                          </span>
                        </button>
                      );
                    })}

                    {/* Custom Button */}
                    <button
                      type="button"
                      onClick={() => setPreset("custom")}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                        preset === "custom"
                          ? "border-rose-500 bg-rose-500/10 text-rose-400 font-bold shadow-xs scale-[1.02]"
                          : "border-border/70 bg-card/60 text-foreground hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      <span className="text-sm font-bold">Custom</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5 font-normal">Any amount</span>
                    </button>
                  </div>

                  {/* Custom Input Field (No up/down arrows) */}
                  {preset === "custom" && (
                    <div className="mt-3 relative flex items-center">
                      <span className="absolute left-3.5 text-sm font-bold text-muted-foreground">$</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="25"
                        value={customAmount}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/[^0-9]/g, "");
                          setCustomAmount(digitsOnly);
                        }}
                        className="pl-8 pr-24 h-11 text-sm font-semibold rounded-xl bg-card border-border/80 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        autoFocus
                      />
                      <span className="absolute right-3.5 text-xs text-muted-foreground pointer-events-none select-none">
                        {frequency === "monthly" ? "/ month" : "one-time"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Impact Statement */}
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2.5">
                  <span className="text-base select-none mt-0.5">🌱</span>
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Our promise:</strong> SmartReach will always stay 100% free with unlimited mailboxes. Your ${currentAmount} {frequency === "monthly" ? "/ month" : "gift"} directly funds our server and maintenance bills.
                  </p>
                </div>
              </div>

              {/* Action Button & Security Assurance */}
              <div className="pt-6 mt-6 border-t border-border/60 space-y-3">
                <Button
                  onClick={handleDonate}
                  size="lg"
                  className="w-full h-12 text-sm font-bold shadow-xl shadow-rose-500/20 bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 hover:opacity-95 text-white gap-2 transition-transform active:scale-[0.99]"
                >
                  <Heart className="size-4.5 fill-white text-white" />
                  <span>
                    Support with ${currentAmount} {frequency === "monthly" ? "/ month" : "one-time"}
                  </span>
                  <ArrowRight className="size-4" />
                </Button>

                <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Lock className="size-3 text-emerald-400" />
                    <span>Secure Stripe Checkout</span>
                  </span>
                  <span>•</span>
                  <span>Cancel monthly support anytime</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
