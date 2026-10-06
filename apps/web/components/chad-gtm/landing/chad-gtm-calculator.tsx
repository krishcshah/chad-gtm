"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles, TrendingUp, PiggyBank, ArrowDownRight } from "lucide-react";
import { Button } from "@smartreach/ui";

export function ChadGtmCalculator() {
  const [emailVolume, setEmailVolume] = useState<number>(6000);

  // 1. Cadence Model: 3-touch sequence (1 Opener + 2 Follow-Ups) = up to 3 emails per verified lead
  const leadsNeeded = Math.ceil(emailVolume / 3);

  // 2. Mailbox Infrastructure: Safe cold outreach cap is 30 emails/mailbox/day (20 sending days = 600 emails/mo)
  const inboxesNeeded = Math.max(3, Math.ceil(emailVolume / 600));
  const domainsNeeded = Math.max(1, Math.ceil(inboxesNeeded / 3));
  // $5/inbox/mo + $2/domain/mo
  const mailboxCost = inboxesNeeded * 5 + domainsNeeded * 2;

  // 3. Apollo.io Real Pricing & Strict Lead Export Caps
  let apolloCost = 59;
  let apolloPlanName = "Basic ($59/mo)";
  if (leadsNeeded <= 1000) {
    apolloCost = 59;
    apolloPlanName = "Basic ($59/mo · 1k exports)";
  } else if (leadsNeeded <= 2000) {
    apolloCost = 99;
    apolloPlanName = "Professional ($99/mo · 2k exports)";
  } else if (leadsNeeded <= 4000) {
    const extraCredits = leadsNeeded - 2000;
    apolloCost = 99 + Math.round(extraCredits * 0.10);
    apolloPlanName = `Pro ($99) + ${extraCredits.toLocaleString()} extra exports`;
  } else {
    const extraCredits = leadsNeeded - 4000;
    apolloCost = 447 + Math.round(extraCredits * 0.08);
    apolloPlanName = `Org ($447) + ${extraCredits.toLocaleString()} extra exports`;
  }

  // 4. Instantly.ai Real Outreach Pricing Tiers
  let instantlyCost = 47;
  let instantlyPlanName = "Growth ($47/mo · 5k emails)";
  if (emailVolume <= 5000 && leadsNeeded <= 1000) {
    instantlyCost = 47;
    instantlyPlanName = "Growth ($47/mo · 5k emails)";
  } else if (emailVolume <= 25000 && leadsNeeded <= 25000) {
    instantlyCost = 97;
    instantlyPlanName = "Hypergrowth ($97/mo · 100k emails)";
  } else {
    instantlyCost = 194;
    instantlyPlanName = "Scale Bundle ($194/mo)";
  }

  // 5. Technical Deliverability & Setup Labor
  // DNS setup, warmup monitoring, and burned domain rotation (~15m/mailbox + 2h base @ $30/hr)
  const laborHours = Math.round(2 + inboxesNeeded * 0.25);
  const laborCost = laborHours * 30;

  // Combined DIY competitor stack
  const traditionalCost = apolloCost + instantlyCost + mailboxCost + laborCost;

  // ChadGTM Pricing: Strictly 5¢ per email delivered
  const chadGtmCost = Math.round(emailVolume * 0.05);

  // Net Savings
  const monthlySavings = Math.max(0, traditionalCost - chadGtmCost);
  const annualSavings = monthlySavings * 12;
  const savingsPct = Math.round((monthlySavings / traditionalCost) * 100);

  const PRESETS = [3000, 6000, 12000, 25000, 50000];

  return (
    <section id="roi-calculator" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black font-mono overflow-hidden">
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Clean, Centered Header (No confusing price-tag on the top right) */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-4">
            <TrendingUp className="size-3 text-emerald-400" />
            TRANSPARENT ROI // 5¢ UTILITY VS. 4 SEPARATE SAAS INVOICES
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white uppercase tracking-tight">
            How Much Will ChadGTM Cost You?
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed max-w-xl mx-auto">
            Zero software subscription fees. Zero lead export paywalls. Drag the slider to your planned monthly volume to see your exact bill compared to paying for a fragmented DIY stack.
          </p>
        </div>

        {/* Unified Volume Controller Box */}
        <div className="border border-zinc-800 bg-zinc-950 p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-zinc-850">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                Target Monthly Outbound Volume
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl sm:text-4xl font-extrabold text-white">
                  {emailVolume.toLocaleString()}
                </span>
                <span className="text-xs text-zinc-400 uppercase tracking-wider">
                  emails / month
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest mr-1">Quick Select:</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setEmailVolume(preset)}
                  className={`px-3 py-1.5 text-xs font-bold border transition-colors ${
                    emailVolume === preset
                      ? "border-white bg-white text-black"
                      : "border-zinc-800 bg-black text-zinc-400 hover:text-white hover:border-zinc-700"
                  }`}
                >
                  {preset >= 1000 ? `${preset / 1000}k` : preset}
                </button>
              ))}
            </div>
          </div>

          {/* Smooth Slider */}
          <div className="space-y-2">
            <input
              type="range"
              min={1000}
              max={50000}
              step={1000}
              value={emailVolume}
              onChange={(e) => setEmailVolume(Number(e.target.value))}
              className="w-full h-2 bg-zinc-800 rounded-none appearance-none cursor-pointer accent-white"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-widest pt-1">
              <span>1,000 / mo</span>
              <span>10,000 / mo</span>
              <span>25,000 / mo</span>
              <span>50,000 / mo</span>
            </div>
          </div>

          {/* Quiet Technical Context Line */}
          <div className="mt-4 pt-4 border-t border-zinc-900 text-xs text-zinc-400 font-sans flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              • Required Leads: <strong className="text-zinc-200 font-mono">{leadsNeeded.toLocaleString()} verified contacts</strong> (3-touch cadence)
            </span>
            <span>
              • Mailbox Fleet: <strong className="text-zinc-200 font-mono">{inboxesNeeded} inboxes across {domainsNeeded} domains</strong> (safe 30/day cap)
            </span>
          </div>
        </div>

        {/* 2-Column Side-by-Side Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          {/* Column 1: ChadGTM (What You Actually Pay) */}
          <div className="border-2 border-white bg-black p-6 sm:p-7 space-y-5 relative">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-white" /> What You Pay With ChadGTM
              </span>
              <span className="border border-emerald-500/50 bg-emerald-950/40 text-emerald-400 text-[10px] font-bold px-2 py-0.5 uppercase tracking-widest">
                Pay As You Send
              </span>
            </div>

            <div className="border-y border-zinc-800 py-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                  ${chadGtmCost.toLocaleString()}
                </span>
                <span className="text-xs text-zinc-400 uppercase tracking-widest">/ month</span>
              </div>
              <div className="text-[11px] text-zinc-400 font-sans mt-1">
                Exactly 5¢ per email delivered ({emailVolume.toLocaleString()} × $0.05). Nothing else.
              </div>
            </div>

            <div className="space-y-3 text-xs text-zinc-300 font-sans">
              <div className="flex items-start gap-2.5">
                <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white font-mono">$0 Platform Software</span>
                  <p className="text-[11px] text-zinc-400">Zero seat taxes, no recurring monthly base fees.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white font-mono">$0 Lead Export Fees</span>
                  <p className="text-[11px] text-zinc-400">100M+ global leads directory included with zero paywalls.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white font-mono">$0 Mailbox Fleet & Domains</span>
                  <p className="text-[11px] text-zinc-400">All {inboxesNeeded} inboxes pre-warmed & supplied by admin.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white font-mono">Automated 3-Touch Cadence</span>
                  <p className="text-[11px] text-zinc-400">Opener + Touch #2 value bump + Touch #3 breakup sent on autopilot.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white font-mono">Zero DNS / Technical Labor</span>
                  <p className="text-[11px] text-zinc-400">SPF, DKIM, DMARC, and deliverability managed automatically.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Fragmented DIY Stack (What Others Charge) */}
          <div className="border border-zinc-800 bg-zinc-950/70 p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                What You Pay With Apollo + Instantly DIY
              </span>
              <span className="border border-zinc-800 bg-black text-zinc-500 text-[10px] uppercase tracking-widest px-2 py-0.5">
                4 Separate Bills
              </span>
            </div>

            <div className="border-y border-zinc-800 py-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-bold text-zinc-500 tracking-tight">
                  ${traditionalCost.toLocaleString()}
                </span>
                <span className="text-xs text-zinc-500 uppercase tracking-widest">/ month combined</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-sans mt-1">
                Sum of 4 recurring vendor invoices every month
              </div>
            </div>

            <div className="space-y-3 text-xs text-zinc-400 font-sans">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <div>
                  <div className="text-zinc-200 font-mono font-bold">1. Apollo.io Leads & Exports</div>
                  <div className="text-[11px] text-zinc-500">{apolloPlanName}</div>
                </div>
                <span className="font-mono font-bold text-white">${apolloCost.toLocaleString()}/mo</span>
              </div>

              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <div>
                  <div className="text-zinc-200 font-mono font-bold">2. Instantly.ai Sending Tool</div>
                  <div className="text-[11px] text-zinc-500">{instantlyPlanName}</div>
                </div>
                <span className="font-mono font-bold text-white">${instantlyCost.toLocaleString()}/mo</span>
              </div>

              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <div>
                  <div className="text-zinc-200 font-mono font-bold">3. Mailboxes & Secondary Domains</div>
                  <div className="text-[11px] text-zinc-500">{inboxesNeeded} inboxes ($5/mo) + {domainsNeeded} domains ($2/mo)</div>
                </div>
                <span className="font-mono font-bold text-white">${mailboxCost.toLocaleString()}/mo</span>
              </div>

              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <div>
                  <div className="text-zinc-200 font-mono font-bold">4. Technical Setup & Maintenance</div>
                  <div className="text-[11px] text-zinc-500">~{laborHours}h/mo DNS & deliverability technician upkeep</div>
                </div>
                <span className="font-mono font-bold text-white">${laborCost.toLocaleString()}/mo</span>
              </div>

              <div className="pt-1 text-[11px] text-zinc-500">
                *(Note: Outsourced SDR agencies charge $3,500–$5,000/mo retainer for this output)*
              </div>
            </div>
          </div>
        </div>

        {/* Clear "You Pocket The Difference" Savings Banner (Unmistakably NOT a cost) */}
        <div className="border border-emerald-500/40 bg-zinc-950 p-6 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 border border-emerald-500/30 bg-emerald-950/30 text-emerald-400 shrink-0 hidden sm:block">
              <PiggyBank className="size-6" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-1.5">
                <ArrowDownRight className="size-3" />
                YOU KEEP IN YOUR BANK ACCOUNT:
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
                Save ${monthlySavings.toLocaleString()} <span className="text-xs text-zinc-400 font-normal">/ month</span>
                <span className="text-emerald-400 text-lg sm:text-xl font-bold ml-2">
                  (${annualSavings.toLocaleString()} / year)
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-sans mt-1">
                You retain <strong className="text-white font-mono">{savingsPct}%</strong> more pipeline capital compared to paying SaaS subscriptions and mailbox invoices.
              </p>
            </div>
          </div>

          <Button asChild size="lg" className="rounded-none bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-wider text-xs border border-white h-11 px-8 w-full md:w-auto shadow-lg shrink-0">
            <Link href="/signup">
              Start at 5¢ / Email <ArrowRight className="size-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
