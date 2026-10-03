"use client";

import React, { useState, useTransition } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@smartreach/ui";
import {
  Check,
  CheckCircle2,
  Database,
  ExternalLink,
  Flame,
  Globe,
  Heart,
  HelpCircle,
  Layers,
  Loader2,
  Lock,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { getB2BCheckoutUrl } from "@/lib/b2b-constants";
import { unlockB2bAccessAction } from "@/lib/b2b-access-actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface B2bPaywallProps {
  userEmail?: string;
  userId?: string;
  totalLeadsCount?: number;
}

export function B2bPaywall({
  userEmail,
  userId,
  totalLeadsCount = 100000000,
}: B2bPaywallProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [sessionRef, setSessionRef] = useState("");

  const checkoutUrl = getB2BCheckoutUrl(userEmail, userId);

  const handleOpenStripeCheckout = () => {
    window.open(checkoutUrl, "_blank", "noopener,noreferrer");
  };

  const handleClaimUnlock = () => {
    startTransition(async () => {
      const res = await unlockB2bAccessAction(sessionRef.trim() || undefined);
      if (res.success) {
        toast.success(res.message);
        setIsClaimModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Verification failed");
      }
    });
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto py-4 px-2 sm:px-4">
      {/* Background Decorative Blur & Faux Table Preview */}
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-25 filter blur-sm pointer-events-none select-none">
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <div className="h-6 w-48 bg-muted rounded animate-pulse" />
            <div className="h-8 w-28 bg-primary/20 rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-xl border border-border/30 bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-full bg-primary/20" />
                  <div className="space-y-1">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-3 w-20 bg-muted/60 rounded" />
                  </div>
                </div>
                <div className="h-4 w-40 bg-muted/40 rounded" />
                <div className="h-4 w-28 bg-muted/30 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main High-Converting Glass Paywall Container */}
      <div className="relative rounded-3xl border border-primary/30 bg-card/95 p-6 sm:p-10 shadow-2xl backdrop-blur-2xl space-y-8">
        {/* Top Header Badge & Price Pill */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-inner">
              <Database className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Premium Data Intelligence
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                  <Lock className="size-3" /> Paywalled
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-0.5">
                300K+ B2B Prospect Database
              </h1>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-foreground">$99</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                / One-Time
              </span>
            </div>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 mt-1">
              ✓ Lifetime Access · Zero Monthly Subscriptions
            </span>
          </div>
        </div>

        {/* Narrative & Vision Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Our Vision for Free Outreach vs. Proprietary Leads */}
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-3">
            <div className="flex items-center gap-2 text-foreground font-bold text-sm">
              <Sparkles className="size-4 text-primary" />
              <span>SmartReach Vision & The Outreach Engine</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Our core mission has always been to give a complete, end-to-end B2B cold outreach engine —
              unlimited mailboxes, automated warmups, multi-step sequences, unified inbox, and delivery analytics —
              to everyone on the planet completely free.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              However, <strong>this proprietary leads directory is not part of that free core</strong>. In cold outreach,
              lead sourcing is something businesses are responsible for. Sourcing, continuously verifying SMTP mailboxes,
              and indexing hundreds of thousands of decision-makers costs real computational infrastructure that cannot be given away for free.
            </p>
          </div>

          {/* Card 2: Anti-Spam & Preventing Abuse */}
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-3">
            <div className="flex items-center gap-2 text-foreground font-bold text-sm">
              <ShieldAlert className="size-4 text-amber-400" />
              <span>Anti-Spam & Responsible Data Protection</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Providing unrestricted free access to <strong>330,000+ verified corporate emails</strong> invites mass scrapers,
              indiscriminate spamming, and reputation burn across shared mail providers.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The <strong>$99 one-time barrier</strong> acts as an essential quality threshold. It ensures that only serious,
              responsible operators access the database, preventing abusive data farming and safeguarding email deliverability
              for all users across the network.
            </p>
          </div>
        </div>

        {/* What You Get Breakdown */}
        <div className="rounded-2xl border border-border/60 bg-muted/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-400" />
              <span>Everything Included in Your $99 Lifetime Access</span>
            </h3>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {totalLeadsCount.toLocaleString()} Verified Records
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/60">
              <div className="size-5 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="size-3" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">330,000+ Verified Leads</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">CEOs, founders, VPs & directors</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/60">
              <div className="size-5 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="size-3" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">100% Unmasked Emails</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">Direct work & verified contacts</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/60">
              <div className="size-5 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="size-3" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">1-Click Campaign Import</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">Send directly into outreach lists</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/60">
              <div className="size-5 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="size-3" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">Sub-15ms Index Filters</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">14 industries, 50+ countries</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/60">
              <div className="size-5 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="size-3" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">Direct CSV Exports</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">Full metadata & LinkedIn profiles</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/60">
              <div className="size-5 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="size-3" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">Ever-Growing Updates</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">All future lead additions included</p>
              </div>
            </div>
          </div>
        </div>

        {/* Primary CTA & Stripe Checkout Action Bar */}
        <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card/80 to-primary/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <span className="text-sm font-bold text-foreground">
                Support the Project & Unlock Lifetime Access
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Secure checkout via Stripe. Access is permanently bound to your account ({userEmail || "your email"}).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <Button
              type="button"
              size="lg"
              onClick={handleOpenStripeCheckout}
              className="gap-2 text-sm font-bold px-6 py-2.5 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all cursor-pointer"
            >
              <span>Unlock for $99 via Stripe</span>
              <ExternalLink className="size-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setIsClaimModalOpen(true)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground border-border/80 cursor-pointer"
            >
              Already Paid? Unlock
            </Button>
          </div>
        </div>
      </div>

      {/* Modal: Claim / Instant Unlock for Users Who Already Paid */}
      <Dialog open={isClaimModalOpen} onOpenChange={setIsClaimModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 border-border/70 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="size-5 text-emerald-400" />
              <span>Unlock B2B Database Access</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              If you have already completed the $99 Stripe checkout for ({userEmail || "your account"}),
              confirm below to immediately activate lifetime access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Stripe Session ID or Receipt Email (Optional)
              </label>
              <Input
                type="text"
                placeholder="cs_test_... or leave empty to confirm with account email"
                value={sessionRef}
                onChange={(e) => setSessionRef(e.target.value)}
                className="text-xs h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Account email: <strong className="text-foreground">{userEmail}</strong>
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsClaimModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleClaimUnlock}
              disabled={isPending}
              className="gap-2"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              <span>Confirm & Unlock Lifetime Access</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
