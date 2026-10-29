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

  // 5. Technical DNS & Domain Provisioning
  const techSetupCost = Math.round(50 + inboxesNeeded * 7);

  // 6. Mailbox Fleet Maintenance, Campaign Dispatch & Reply Management (Agency / Operator Retainer)
  // Preserved constraint: Halved 5th mailbox maintenance cost
  const agencyManagementCost = Math.round((350 + inboxesNeeded * 45) / 2);

  let agencyPlanName = "Starter Agency / Operator Retainer";
  if (emailVolume <= 3000) {
    agencyPlanName = `Starter Operator (${inboxesNeeded} inboxes & reply triage)`;
  } else if (emailVolume <= 12000) {
    agencyPlanName = `Growth Agency Retainer (${inboxesNeeded} inboxes & unibox triage)`;
  } else if (emailVolume <= 25000) {
    agencyPlanName = `Scale Agency / Fractional SDR (${inboxesNeeded} inboxes)`;
  } else {
    agencyPlanName = `Dedicated SDR / Enterprise Agency (${inboxesNeeded} inboxes full ops)`;
  }

  // Combined DIY competitor stack (5 invoices: Leads + Sending Tool + Mailboxes + DNS + Agency Ops)
  const traditionalCost = apolloCost + instantlyCost + mailboxCost + techSetupCost + agencyManagementCost;

  // AutoGTM Pricing: Strictly 5¢ per email delivered
  const chadGtmCost = Math.round(emailVolume * 0.05);

  // Net Savings
  const monthlySavings = Math.max(0, traditionalCost - chadGtmCost);
  const annualSavings = monthlySavings * 12;
  const savingsPct = Math.round((monthlySavings / traditionalCost) * 100);

  const PRESETS = [3000, 6000, 12000, 25000, 50000];

  return (
    <section id="roi-calculator" className="relative py-24 sm:py-32 border-t border-zinc-800/80 bg-black font-sans overflow-hidden">
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Clean, Centered Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-950/20 px-3 py-1 text-xs font-mono text-emerald-400 mb-4">
            <TrendingUp className="size-3 text-emerald-400" />
            <span>Interactive ROI Calculator · Pure Utility Math</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Calculate your exact savings with AutoGTM.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 leading-relaxed max-w-xl mx-auto">
            Zero software subscription fees. Zero per-contact export paywalls. Drag the slider to your planned monthly volume to see your exact bill compared to a fragmented 5-vendor stack.
          </p>
        </div>

        {/* Unified Volume Controller Box */}
        <div className="border border-zinc-800 bg-zinc-950 p-6 sm:p-8 mb-6 shadow-2xl rounded-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-zinc-800">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 font-mono font-semibold">
                Planned Monthly Email Dispatch Volume
              </div>
              <div className="text-2xl sm:text-4xl font-extrabold text-white font-mono mt-1">
                {emailVolume.toLocaleString()}{" "}
                <span className="text-xs sm:text-sm text-zinc-400 font-sans font-normal">
                  emails / month
                </span>
              </div>
              <div className="text-xs text-zinc-400 mt-1 font-sans">
                Outreaches ~{leadsNeeded.toLocaleString()} verified decision-makers on a 3-touch cadence
              </div>
            </div>

            {/* Quick volume preset chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((vol) => (
                <button
                  key={vol}
                  type="button"
                  onClick={() => setEmailVolume(vol)}
                  className={`rounded-none px-2.5 py-1 text-xs font-mono transition-colors ${
                    emailVolume === vol
                      ? "border border-white bg-white text-black font-semibold"
                      : "border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700"
                  }`}
                >
                  {(vol / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          {/* Range Slider */}
          <div className="space-y-2">
            <input
              type="range"
              min="1000"
              max="50000"
              step="500"
              value={emailVolume}
              onChange={(e) => setEmailVolume(Number(e.target.value))}
              className="w-full h-2 bg-zinc-900 rounded-none appearance-none cursor-pointer accent-white"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>1,000 / mo</span>
              <span>12,000 / mo</span>
              <span>25,000 / mo</span>
              <span>50,000 / mo</span>
            </div>
          </div>
        </div>

        {/* Side-by-Side Financial Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Competitor Breakdown */}
          <div className="border border-rose-950/80 bg-zinc-950 p-6 sm:p-7 space-y-4 rounded-none">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <span className="text-xs uppercase tracking-wider font-semibold text-rose-400 font-mono">
                Fragmented DIY Stack (5 Invoices)
              </span>
              <span className="text-xs text-zinc-500 font-mono">Industry Standard</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-zinc-300">
                <span>Apollo B2B Lead Exports</span>
                <span className="font-mono text-rose-400 font-semibold">${apolloCost}/mo</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono pl-2">
                Plan: {apolloPlanName}
              </div>

              <div className="flex justify-between text-zinc-300 pt-1">
                <span>Instantly / Smartlead Sending Tool</span>
                <span className="font-mono text-rose-400 font-semibold">${instantlyCost}/mo</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono pl-2">
                Plan: {instantlyPlanName}
              </div>

              <div className="flex justify-between text-zinc-300 pt-1">
                <span>Mailbox Inboxes &amp; Domains</span>
                <span className="font-mono text-rose-400 font-semibold">${mailboxCost}/mo</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono pl-2">
                {inboxesNeeded} mailboxes ($5/ea) + {domainsNeeded} secondary domains ($2/ea)
              </div>

              <div className="flex justify-between text-zinc-300 pt-1">
                <span>DNS / SPF / DKIM / Tracking Setup</span>
                <span className="font-mono text-rose-400 font-semibold">${techSetupCost}/mo</span>
              </div>

              <div className="flex justify-between text-zinc-300 pt-1">
                <span>Mailbox Ops &amp; Reply Triage Retainer</span>
                <span className="font-mono text-rose-400 font-semibold">${agencyManagementCost}/mo</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono pl-2">
                {agencyPlanName} (Halved benchmark)
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-900 flex justify-between items-baseline">
              <span className="text-xs text-zinc-400 font-mono uppercase">Total Traditional Spend:</span>
              <span className="text-2xl font-bold text-rose-400 font-mono">${traditionalCost}/mo</span>
            </div>
          </div>

          {/* AutoGTM Cost Card */}
          <div className="border border-emerald-900/80 bg-zinc-950 p-6 sm:p-7 space-y-4 flex flex-col justify-between rounded-none shadow-xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400 font-mono flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> AutoGTM Autonomous Engine
                </span>
                <span className="border border-emerald-500/30 bg-emerald-950/30 text-emerald-400 text-[10px] px-2 py-0.5 font-mono rounded-none">
                  Save ~{savingsPct}%
                </span>
              </div>

              <div className="space-y-2.5 text-xs text-zinc-300">
                <div className="flex justify-between items-center py-1 border-b border-zinc-900">
                  <span>Software Platform Subscription</span>
                  <span className="font-mono text-emerald-400 font-semibold">FREE ($0/mo)</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-zinc-900">
                  <span>10.2M B2B Directory Lead Access</span>
                  <span className="font-mono text-emerald-400 font-semibold">INCLUDED ($0)</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-zinc-900">
                  <span>Pre-Warmed Sender Mailboxes</span>
                  <span className="font-mono text-emerald-400 font-semibold">INCLUDED ($0)</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-zinc-900">
                  <span>AI Personalization &amp; 3-Touch Cadence</span>
                  <span className="font-mono text-emerald-400 font-semibold">INCLUDED ($0)</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span>Utility Delivery ({emailVolume.toLocaleString()} @ 5¢/ea)</span>
                  <span className="font-mono text-white font-bold">${chadGtmCost}/mo</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-zinc-400 font-mono uppercase">Total AutoGTM Cost:</span>
                <span className="text-3xl font-extrabold text-white font-mono">${chadGtmCost}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-emerald-400 font-mono pt-1">
                <span>Net Savings:</span>
                <span className="font-bold">+${monthlySavings}/mo (${annualSavings.toLocaleString()} / year)</span>
              </div>
              <Button asChild size="lg" className="w-full mt-2 rounded-none bg-white text-black font-semibold text-xs border border-white hover:bg-zinc-200">
                <Link href="/signup">
                  Deploy at $0/Month <ArrowRight className="size-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
