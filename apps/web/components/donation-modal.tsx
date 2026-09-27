"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
  Input,
} from "@smartreach/ui";
import { STRIPE_PAYMENT_LINK, getCheckoutUrl } from "@/lib/donation";
import { Heart, Sparkles, Coffee, Zap, Rocket, Check, ArrowRight, PartyPopper } from "lucide-react";

interface DonationModalProps {
  userEmail?: string;
  userId?: string;
  userName?: string;
}

type Frequency = "monthly" | "one-time";
type Preset = 5 | 10 | 20 | "custom";

export function DonationModal({ userEmail, userId, userName }: DonationModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [frequency, setFrequency] = React.useState<Frequency>("monthly");
  const [preset, setPreset] = React.useState<Preset>(10);
  const [customAmount, setCustomAmount] = React.useState<string>("");
  const [isSubmitted, setIsSubmitted] = React.useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const firstName = userName ? userName.split(" ")[0] : "friend";

  React.useEffect(() => {
    // 1. Listen for global open event
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("open-donation-modal", handleOpen);

    // 2. Detect first login after signup
    const isNewSignupParam = searchParams.get("new_signup") === "1" || searchParams.get("welcome") === "1";
    let isNewSignupStorage = false;
    let isDismissed = false;

    try {
      isNewSignupStorage =
        sessionStorage.getItem("smartreach_just_signed_up") === "1" ||
        localStorage.getItem("smartreach_just_signed_up") === "1";
      isDismissed = localStorage.getItem("smartreach_donation_dismissed") === "1";
    } catch {}

    if ((isNewSignupParam || isNewSignupStorage) && !isDismissed) {
      const timer = setTimeout(() => {
        setIsOpen(true);
        try {
          sessionStorage.removeItem("smartreach_just_signed_up");
          localStorage.removeItem("smartreach_just_signed_up");
        } catch {}
      }, 700);

      return () => {
        clearTimeout(timer);
        window.removeEventListener("open-donation-modal", handleOpen);
      };
    }

    return () => window.removeEventListener("open-donation-modal", handleOpen);
  }, [searchParams]);

  const handleDismiss = () => {
    try {
      localStorage.setItem("smartreach_donation_dismissed", "1");
    } catch {}
    setIsOpen(false);

    // Clean up query param if present
    if (searchParams.get("new_signup")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new_signup");
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    }
  };

  const getEffectiveAmount = (): number => {
    if (preset === "custom") {
      const parsed = parseFloat(customAmount);
      return isNaN(parsed) || parsed <= 0 ? 15 : parsed;
    }
    return preset;
  };

  const currentAmount = getEffectiveAmount();

  const handleDonate = () => {
    try {
      localStorage.setItem("smartreach_donation_dismissed", "1");
      localStorage.setItem("smartreach_has_donated", "1");
    } catch {}

    // Open Stripe / Donation Checkout link if configured
    try {
      const checkoutUrl = getCheckoutUrl(userEmail, userId);
      const url = new URL(checkoutUrl);
      url.searchParams.set("amount", String(currentAmount));
      url.searchParams.set("frequency", frequency);
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch {
      window.open(STRIPE_PAYMENT_LINK, "_blank", "noopener,noreferrer");
    }

    setIsSubmitted(true);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? handleDismiss() : setIsOpen(true))}>
      <DialogContent className="max-w-md p-0 overflow-hidden border border-border/80 bg-card shadow-2xl rounded-2xl">
        {/* Soft Ambient Header Glow */}
        <div className="relative bg-gradient-to-br from-rose-500/15 via-amber-500/10 to-primary/10 px-6 pt-7 pb-5 border-b border-border/40">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400 backdrop-blur-md shadow-xs">
              <Heart className="size-3.5 fill-rose-500 text-rose-500 animate-pulse" />
              <span>Independent & Free Forever</span>
            </span>
            <Badge variant="outline" className="border-border/60 text-[11px] font-normal text-muted-foreground bg-background/50">
              Zero Paywalls
            </Badge>
          </div>

          <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            {isSubmitted ? "You’re an absolute legend! ❤️" : `Welcome, ${firstName}! A quick note.`}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-xs sm:text-[13px] leading-relaxed text-muted-foreground">
            {isSubmitted
              ? "Your support keeps our servers running and this platform completely free for the entire community."
              : "Right now we pay for everything out of our own pockets — development, hosting, and maintenance. We want to keep SmartReach free forever, and we can’t do it without your help. Every dollar helps!"}
          </DialogDescription>
        </div>

        {/* Content Body */}
        {isSubmitted ? (
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 shadow-md">
              <PartyPopper className="size-7" />
            </div>
            <div>
              <h4 className="text-base font-bold text-foreground">Thank you from the bottom of our hearts</h4>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                A checkout tab has been opened. Every dollar helps keep SmartReach online, fast, and 100% source-available.
              </p>
            </div>
            <div className="pt-2">
              <Button onClick={handleDismiss} className="w-full gap-2 font-semibold shadow-md">
                Jump into Your Dashboard <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Frequency Selector: One-Time vs Monthly */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                Choose Donation Frequency
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/40 border border-border/60">
                <button
                  type="button"
                  onClick={() => setFrequency("monthly")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                    frequency === "monthly"
                      ? "bg-card text-foreground shadow-xs border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Heart className="size-3 text-rose-500 fill-rose-500" />
                  <span>Monthly Support</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFrequency("one-time")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                    frequency === "one-time"
                      ? "bg-card text-foreground shadow-xs border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="size-3 text-amber-400" />
                  <span>One-Time Gift</span>
                </button>
              </div>
            </div>

            {/* Amount Selection Grid */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                Select Amount
              </label>
              <div className="grid grid-cols-4 gap-2">
                {([5, 10, 20] as const).map((amt) => {
                  const isSelected = preset === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPreset(amt)}
                      className={`relative flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-xs scale-[1.02]"
                          : "border-border/70 bg-card/60 text-foreground hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      {amt === 10 && (
                        <span className="absolute -top-2 rounded-full bg-primary px-1.5 py-0.2 text-[9px] font-extrabold text-primary-foreground shadow-xs">
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

                {/* Custom Option */}
                <button
                  type="button"
                  onClick={() => setPreset("custom")}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                    preset === "custom"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs scale-[1.02]"
                      : "border-border/70 bg-card/60 text-foreground hover:border-border hover:bg-muted/30"
                  }`}
                >
                  <span className="text-sm font-bold">Custom</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5 font-normal">Any amount</span>
                </button>
              </div>

              {/* Custom Input Field */}
              {preset === "custom" && (
                <div className="mt-3 relative flex items-center">
                  <span className="absolute left-3.5 text-sm font-bold text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="15"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="pl-8 h-10 text-sm font-semibold rounded-xl bg-card border-border/80"
                    autoFocus
                  />
                  <span className="absolute right-3 text-xs text-muted-foreground">
                    {frequency === "monthly" ? "/ month" : "one-time"}
                  </span>
                </div>
              )}
            </div>

            {/* Impact Text */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2.5">
              <span className="text-base select-none mt-0.5">🌱</span>
              <p className="leading-relaxed">
                <strong className="text-foreground">Our promise:</strong> SmartReach will always stay 100% free with unlimited mailboxes. Your ${currentAmount} {frequency === "monthly" ? "/ month" : "gift"} directly funds our hosting and maintenance bills.
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <Button
                onClick={handleDonate}
                className="w-full h-11 text-sm font-semibold gap-2 shadow-lg shadow-primary/25 bg-gradient-to-r from-primary to-primary/90 hover:opacity-95"
              >
                <Heart className="size-4 fill-primary-foreground text-primary-foreground" />
                <span>
                  Support with ${currentAmount} {frequency === "monthly" ? "/ month" : "one-time"}
                </span>
                <ArrowRight className="size-4" />
              </Button>

              <button
                type="button"
                onClick={handleDismiss}
                className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors text-center"
              >
                I can’t right now, take me to dashboard
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
