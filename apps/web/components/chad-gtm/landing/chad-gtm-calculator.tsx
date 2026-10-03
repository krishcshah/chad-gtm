"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles, TrendingUp, Mail, Users, Server, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@smartreach/ui";

export function ChadGtmCalculator() {
  const [emailVolume, setEmailVolume] = useState<number>(6000);

  // 1. Cadence Model: 3-touch sequence (1 Opener + 2 Follow-Ups) = up to 3 emails per verified lead
  const leadsNeeded = Math.ceil(emailVolume / 3);

  // 2. Mailbox Infrastructure: Safe cold outreach cap is 30 emails/mailbox/day (20 sending days = 600 emails/mo)
  const inboxesNeeded = Math.max(3, Math.ceil(emailVolume / 600));
  // Secondary domains: 3 mailboxes per domain to isolate reputation
  const domainsNeeded = Math.max(1, Math.ceil(inboxesNeeded / 3));
  // Infrastructure cost: $5/mailbox/mo (Google Workspace / MS 365) + $2/domain/mo
  const mailboxCost = inboxesNeeded * 5 + domainsNeeded * 2;

  // 3. Apollo.io Real Pricing & Strict Lead Export Caps:
  // - Basic ($59/mo): 1,000 export credits/mo
  // - Professional ($99/mo): 2,000 export credits/mo
  // - Organization ($447/mo min 3 seats): 4,000 export credits/mo
  // - Extra export credits cost ~$0.10/lead (Basic/Pro) or $0.08/lead (Org)
  let apolloCost = 59;
  let apolloPlanName = "Basic ($59/mo)";
  let apolloDetails = "1,000 export credits included";

  if (leadsNeeded <= 1000) {
    apolloCost = 59;
    apolloPlanName = "Basic Plan ($59/mo)";
    apolloDetails = "Includes up to 1,000 exported leads/mo";
  } else if (leadsNeeded <= 2000) {
    apolloCost = 99;
    apolloPlanName = "Professional Plan ($99/mo)";
    apolloDetails = "Includes up to 2,000 exported leads/mo";
  } else if (leadsNeeded <= 4000) {
    const extraCredits = leadsNeeded - 2000;
    const extraCreditCost = Math.round(extraCredits * 0.10);
    apolloCost = 99 + extraCreditCost;
    apolloPlanName = `Professional ($99) + ${extraCredits.toLocaleString()} Extra Exports`;
    apolloDetails = `$99 base + $${extraCreditCost} for extra export credits (@ $0.10/lead)`;
  } else {
    const extraCredits = leadsNeeded - 4000;
    const extraCreditCost = Math.round(extraCredits * 0.08);
    apolloCost = 447 + extraCreditCost;
    apolloPlanName = `Organization ($447) + ${extraCredits.toLocaleString()} Extra Exports`;
    apolloDetails = `$447 base (3 seats min) + $${extraCreditCost} for extra export credits (@ $0.08/lead)`;
  }

  // 4. Instantly.ai Real Outreach Pricing Tiers:
  // - Growth ($47/mo): 5,000 emails & 1,000 contacts max
  // - Hypergrowth ($97/mo): 100,000 emails & 25,000 active contacts
  // - Scale Bundle ($194/mo): Extended contacts, multi-campaign CRM & deliverability fleet
  let instantlyCost = 47;
  let instantlyPlanName = "Growth ($47/mo)";
  let instantlyDetails = "Capped at 5,000 emails & 1,000 contacts/mo";

  if (emailVolume <= 5000 && leadsNeeded <= 1000) {
    instantlyCost = 47;
    instantlyPlanName = "Growth Plan ($47/mo)";
    instantlyDetails = "Capped at 5,000 emails & 1,000 contacts/mo";
  } else if (emailVolume <= 25000 && leadsNeeded <= 25000) {
    instantlyCost = 97;
    instantlyPlanName = "Hypergrowth Plan ($97/mo)";
    instantlyDetails = "Up to 100k emails & 25k contacts/mo";
  } else {
    instantlyCost = 194;
    instantlyPlanName = "Scale Bundle ($194/mo)";
    instantlyDetails = "High-volume fleet with extended contact limits";
  }

  // 5. Technical Deliverability & Setup Labor:
  // DNS records (SPF, DKIM, DMARC, MX), 2-3 week warmup monitoring, spam audit & burned domain rotation.
  // 2 hours base + 0.25h (15 min) per active mailbox/month @ $30/hr deliverability specialist rate
  const laborHours = Math.round(2 + inboxesNeeded * 0.25);
  const laborCost = laborHours * 30;

  // Total Fragmented DIY Competitor Stack:
  const traditionalCost = apolloCost + instantlyCost + mailboxCost + laborCost;

  // ChadGTM Pricing:
  // $0/mo software + $0 lead export fees + $0 inbox setup fees + 3¢/email delivered
  const chadGtmCost = Math.round(emailVolume * 0.03);

  const monthlySavings = Math.max(0, traditionalCost - chadGtmCost);
  const annualSavings = monthlySavings * 12;
  const savingsPct = Math.round((monthlySavings / traditionalCost) * 100);

  const PRESETS = [3000, 6000, 12000, 25000, 50000];

  return (
    <section id="roi-calculator" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black font-mono overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Header with Title and Savings Badge */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-zinc-800 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
              <TrendingUp className="size-3 text-white" />
              REAL-WORLD ROI & STACK COST COMPARISON
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white uppercase tracking-tight">
              How Much Will You Save With ChadGTM?
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400 font-sans max-w-xl leading-relaxed">
              Real cold outbound requires lead export credits, mailbox infrastructure, and continuous DNS upkeep. Compare ChadGTM’s 3¢ utility billing against the true cost of assembling a fragmented DIY stack.
            </p>
          </div>

          <div className="border border-emerald-500/40 bg-zinc-950 p-4 sm:p-5 text-left md:text-right shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold block">
              Estimated Annual Savings
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-0.5">
              ${annualSavings.toLocaleString()} <span className="text-xs text-zinc-500 font-normal">/ year</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-1 font-sans">
              Keep <strong>${monthlySavings.toLocaleString()} / mo</strong> ({savingsPct}% savings) in your business
            </div>
          </div>
        </div>

        {/* Calculator Main Box */}
        <div className="border border-zinc-800 bg-zinc-950 p-6 sm:p-10 space-y-8">
          {/* Live Telemetry Data Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border border-zinc-800 bg-black p-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 border border-zinc-800 bg-zinc-900 text-zinc-300">
                <Mail className="size-4 text-white" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Planned Volume</div>
                <div className="font-bold text-white text-sm">{emailVolume.toLocaleString()} Emails / mo</div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-zinc-800 pt-3 sm:pt-0 sm:pl-3">
              <div className="p-2 border border-zinc-800 bg-zinc-900 text-zinc-300">
                <Users className="size-4 text-white" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Leads Needed (3-Touch)</div>
                <div className="font-bold text-white text-sm">{leadsNeeded.toLocaleString()} Verified Leads</div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-zinc-800 pt-3 sm:pt-0 sm:pl-3">
              <div className="p-2 border border-zinc-800 bg-zinc-900 text-zinc-300">
                <Server className="size-4 text-white" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Mailbox Fleet Required</div>
                <div className="font-bold text-white text-sm">{inboxesNeeded} Inboxes ({domainsNeeded} Domains)</div>
              </div>
            </div>
          </div>

          {/* Slider & Presets Controller */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-zinc-300 uppercase tracking-wider font-bold">
                Adjust Monthly Outbound Email Volume:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest mr-1">Presets:</span>
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setEmailVolume(preset)}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-colors ${
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

            <input
              type="range"
              min={1000}
              max={50000}
              step={1000}
              value={emailVolume}
              onChange={(e) => setEmailVolume(Number(e.target.value))}
              className="w-full h-2 bg-zinc-800 rounded-none appearance-none cursor-pointer accent-white"
            />

            <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
              <span>1,000 / mo</span>
              <span>10,000 / mo</span>
              <span>25,000 / mo</span>
              <span>50,000 / mo</span>
            </div>
          </div>

          {/* Side by Side Cost Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* ChadGTM Cost Card (Highlighted) */}
            <div className="border border-white bg-black p-6 space-y-4 relative">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-white" /> ChadGTM (All-in-One Engine)
                </span>
                <span className="border border-white bg-white text-black text-[9px] font-bold px-2 py-0.5 uppercase tracking-widest">
                  Pay Just 3¢ / Email
                </span>
              </div>

              <div className="border-y border-zinc-800 py-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                    ${chadGtmCost.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-400 uppercase tracking-widest">/ month total</span>
                </div>
                <div className="text-[11px] text-zinc-400 font-sans mt-1">
                  Formula: {emailVolume.toLocaleString()} emails dispatched × $0.03 per email delivered
                </div>
              </div>

              <div className="space-y-2.5 text-xs text-zinc-300 font-sans">
                <div className="flex items-start gap-2.5">
                  <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">Platform Software Fee: $0 / mo</span>
                    <p className="text-[11px] text-zinc-400">Zero seat taxes, zero subscription lock-in, pause anytime.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">100M+ Global Leads Directory: Included ($0)</span>
                    <p className="text-[11px] text-zinc-400">Zero export fees. Access all {leadsNeeded.toLocaleString()} required leads with zero paywalls.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">Turnkey Admin-Supplied Mailboxes: Included ($0)</span>
                    <p className="text-[11px] text-zinc-400">All {inboxesNeeded} mailboxes and {domainsNeeded} secondary domains pre-warmed & supplied by admin.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">3-Touch Autonomous Cadence: Included</span>
                    <p className="text-[11px] text-zinc-400">Opener + Touch #2 value bump (+3d) + Touch #3 breakup (+4d) sent automatically.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white font-mono">DNS & Deliverability Maintenance: $0</span>
                    <p className="text-[11px] text-zinc-400">No technical hours spent debugging SPF/DKIM/DMARC or burned sender inboxes.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Traditional Fragmented Stack Card */}
            <div className="border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Fragmented DIY Competitor Stack
                </span>
                <span className="border border-zinc-800 bg-black text-zinc-400 text-[9px] uppercase tracking-widest px-2 py-0.5">
                  4 Separate Recurring Bills
                </span>
              </div>

              <div className="border-y border-zinc-800 py-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-bold text-zinc-500 line-through tracking-tight">
                    ${traditionalCost.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-500 uppercase tracking-widest">/ month total</span>
                </div>
                <div className="text-[11px] text-zinc-400 font-sans mt-1">
                  Monthly costs explode as lead export caps and mailbox infrastructure scale
                </div>
              </div>

              <div className="space-y-3 text-xs text-zinc-400 font-sans">
                {/* Apollo Breakdown */}
                <div className="border-b border-zinc-800/80 pb-2.5">
                  <div className="flex justify-between items-center text-zinc-200">
                    <span className="font-bold font-mono">1. Apollo.io Leads & Export Credits:</span>
                    <span className="font-bold font-mono text-white">${apolloCost.toLocaleString()} / mo</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {apolloPlanName} · {apolloDetails}
                  </div>
                </div>

                {/* Instantly Breakdown */}
                <div className="border-b border-zinc-800/80 pb-2.5">
                  <div className="flex justify-between items-center text-zinc-200">
                    <span className="font-bold font-mono">2. Instantly.ai Sending Tool:</span>
                    <span className="font-bold font-mono text-white">${instantlyCost.toLocaleString()} / mo</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {instantlyPlanName} · {instantlyDetails}
                  </div>
                </div>

                {/* Mailboxes Breakdown */}
                <div className="border-b border-zinc-800/80 pb-2.5">
                  <div className="flex justify-between items-center text-zinc-200">
                    <span className="font-bold font-mono">3. Mailbox Fleet & Domains:</span>
                    <span className="font-bold font-mono text-white">${mailboxCost.toLocaleString()} / mo</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {inboxesNeeded} inboxes (@ $5/mo Workspace/MS 365) + {domainsNeeded} secondary domains (@ $2/mo)
                  </div>
                </div>

                {/* Deliverability Labor Breakdown */}
                <div>
                  <div className="flex justify-between items-center text-zinc-200">
                    <span className="font-bold font-mono">4. Technical Setup & DNS Maintenance:</span>
                    <span className="font-bold font-mono text-white">${laborCost.toLocaleString()} / mo</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    ~{laborHours} hrs/mo DNS records, warmup pacing & blacklist recovery (@ $30/hr technician rate)
                  </div>
                </div>
              </div>

              {/* Agency Alternative Callout */}
              <div className="border border-zinc-800 bg-black p-3 text-[11px] text-zinc-400 font-sans flex items-start gap-2">
                <Clock className="size-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-300 font-mono">Outsourced Agency Alternative:</strong> Traditional outbound SDR agencies charge <strong className="text-zinc-200">$3,500 – $5,000 / month retainer</strong> + commission for this same volume.
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Footer */}
          <div className="pt-6 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-zinc-400 font-sans max-w-xl">
              Zero platform subscription. Zero export credit fees. Zero mailbox setup or domain maintenance. Dispatched across verified decision-makers at strictly <strong className="text-white font-mono">3¢ per email sent</strong>.
            </div>

            <Button asChild size="lg" className="rounded-none bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-wider text-xs border border-white h-11 px-8 w-full sm:w-auto shadow-lg shrink-0">
              <Link href="/signup">
                Deploy Free GTM Engine <ArrowRight className="size-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
