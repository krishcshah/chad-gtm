import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Rocket,
  Sparkles,
  Star,
  Terminal,
  Activity,
  ShieldCheck,
  Zap,
  TrendingUp,
  DollarSign,
  Layers,
  Lock,
  Mail,
  Check,
  X,
} from "lucide-react";
import { Button } from "@smartreach/ui";
import { ChadGtmLogo } from "@/components/chad-gtm-logo";
import { getSession } from "@/lib/session";
import { LandingHeader } from "@/components/chad-gtm/landing/landing-header";
import { ChadGtmHeroScanner } from "@/components/chad-gtm/landing/chad-gtm-hero-scanner";
import { ChadGtmHeroTelemetry } from "@/components/chad-gtm/landing/chad-gtm-hero-telemetry";
import { ChadGtmSequenceShowcase } from "@/components/chad-gtm/landing/chad-gtm-sequence-showcase";
import { ChadGtmArchitectureBlueprint } from "@/components/chad-gtm/landing/chad-gtm-architecture-blueprint";
import { ChadGtmWorkflowSimulator } from "@/components/chad-gtm/landing/chad-gtm-workflow-simulator";
import { ChadGtmPricingCard } from "@/components/chad-gtm/landing/chad-gtm-pricing-card";
import { ChadGtmComparisonTable } from "@/components/chad-gtm/landing/chad-gtm-comparison-table";
import { ChadGtmLeadsPreview } from "@/components/chad-gtm/landing/chad-gtm-leads-preview";
import { ChadGtmCalculator } from "@/components/chad-gtm/landing/chad-gtm-calculator";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ChadGTM · Turn Your Website URL Into A Booked Sales Pipeline · $0/mo Platform",
  description:
    "Stop paying $450/mo for Apollo and Instantly. Enter your URL—ChadGTM discovers verified decision-makers, crafts hyper-personalized copy, and runs an autonomous 3-touch sequence for just 5¢ per email. $0/month forever.",
};

export default async function LandingPage() {
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div className="min-h-screen bg-black text-zinc-100 antialiased font-sans app-shell selection:bg-white selection:text-black">
      {/* Top Header Navigation */}
      <LandingHeader isLoggedIn={isLoggedIn} />

      <main className="relative">
        {/* ========================================================================= */}
        {/* HERO SECTION: High-Converting Marketing Hook */}
        {/* ========================================================================= */}
        <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24 border-b border-zinc-800 bg-black">
          {/* Subtle Grid Coordinate Guides */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#18181b15_1px,transparent_1px),linear-gradient(to_bottom,#18181b15_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Top Market Positioning Banner */}
            <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-3 mb-8 text-[11px] font-mono text-zinc-400 uppercase tracking-widest gap-2">
              <div className="flex items-center gap-2">
                <span className="size-2 bg-emerald-500 rounded-none animate-pulse" />
                <span className="font-bold text-white">THE $0/MONTH OUTBOUND ENGINE</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">PAY STRICTLY 5¢ PER EMAIL DELIVERED</span>
              </div>
              <div className="hidden md:flex items-center gap-4 text-zinc-500">
                <span>100M+ GLOBAL VERIFIED BUYERS</span>
                <span>·</span>
                <span>AUTONOMOUS 3-TOUCH CADENCE</span>
                <span>·</span>
                <span className="text-emerald-400">99.8% INBOX RATE</span>
              </div>
            </div>

            {/* Asymmetrical 12-Column Hero Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
              {/* Left Column: Core Marketing Pitch (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Visual Eyebrow Badge */}
                <div className="inline-flex items-center gap-2 border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-white uppercase tracking-wider font-mono shadow-sm">
                  <img src="/chad-white-border.png" alt="Chad" className="size-4 object-contain" />
                  <span className="font-bold">CHADGTM 2.0 // AUTONOMOUS PIPELINE REVOLUTION</span>
                </div>

                {/* Main Killer Headline */}
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl xl:text-7xl text-white uppercase leading-[1.05]">
                  Turn Any Website URL Into Booked Sales Meetings.
                  <span className="text-zinc-400 font-mono text-2xl sm:text-4xl xl:text-5xl block mt-2 font-normal">
                    [Live in 60s. $0/mo software. Pay strictly 5¢ an email.]
                  </span>
                </h1>

                {/* Direct-Response Subtitle */}
                <p className="text-sm sm:text-base text-zinc-300 font-sans leading-relaxed max-w-2xl">
                  Stop bleeding <strong className="text-white font-mono">$450/month</strong> on Apollo seat licenses, Instantly subscriptions, and burner domains. Enter your company URL—ChadGTM automatically extracts your value prop, discovers verified decision-makers across our 100M+ global B2B directory (rolling out 100M+ contacts worldwide), and executes an autonomous 3-touch follow-up sequence that lands straight in primary inboxes.
                </p>

                {/* Primary Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 font-mono">
                  <Button
                    asChild
                    size="lg"
                    className="rounded-none h-12 px-8 bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-wider border border-white gap-2 w-full sm:w-auto shadow-lg"
                  >
                    <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                      <Sparkles className="size-4" />
                      Launch Free GTM Engine <ArrowRight className="size-4 ml-1" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="rounded-none h-12 px-6 border-zinc-800 bg-black text-zinc-300 hover:bg-zinc-900 hover:text-white hover:border-zinc-700 text-xs font-mono uppercase tracking-wider w-full sm:w-auto"
                  >
                    <a href="#roi-calculator">
                      Calculate Your Savings (Save $3,200+)
                    </a>
                  </Button>
                </div>

                {/* Trust Guarantees */}
                <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400">
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <CheckCircle2 className="size-3.5 text-emerald-400" /> $0/mo Platform Fee Forever
                  </span>
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <CheckCircle2 className="size-3.5 text-emerald-400" /> No Credit Card Required
                  </span>
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <CheckCircle2 className="size-3.5 text-emerald-400" /> Cancel or Pause Anytime
                  </span>
                </div>

                {/* High-Impact Proof Metric Strip */}
                <div className="pt-6 border-t border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">[PLATFORM FEE]</div>
                    <div className="text-white font-bold text-lg mt-0.5">$0/MO</div>
                    <div className="text-[10px] text-zinc-400">Zero Seat Taxes</div>
                  </div>
                  <div className="border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">[LEAD DIRECTORY]</div>
                    <div className="text-white font-bold text-lg mt-0.5">100M+</div>
                    <div className="text-[10px] text-zinc-400">Global Verified Buyers</div>
                  </div>
                  <div className="border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">[SEQUENCE CADENCE]</div>
                    <div className="text-white font-bold text-lg mt-0.5">3-TOUCH</div>
                    <div className="text-[10px] text-zinc-400">Opener + 2 Follow-Ups</div>
                  </div>
                  <div className="border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">[MANAGED POOL]</div>
                    <div className="text-white font-bold text-lg mt-0.5">5¢</div>
                    <div className="text-[10px] text-zinc-400">Per Delivered Email</div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Telemetry Radar HUD (5 cols) */}
              <div className="lg:col-span-5 w-full">
                <ChadGtmHeroTelemetry />
              </div>
            </div>

            {/* Embedded Live URL Scanner Sandbox */}
            <div id="scanner" className="mt-14 pt-10 border-t border-zinc-800">
              <ChadGtmHeroScanner />
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* THE SAAS SUBSCRIPTION TRAP VS CHADGTM (THE ANCHOR COMPARISON) */}
        {/* ========================================================================= */}
        <section className="py-20 sm:py-24 border-b border-zinc-800 bg-zinc-950 font-mono">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <div className="inline-flex items-center gap-2 border border-zinc-800 bg-black px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
                <DollarSign className="size-3 text-white" />
                THE COLD OUTBOUND RECKONING // UNFAIR ADVANTAGE
              </div>
              <h2 className="text-3xl sm:text-5xl font-bold text-white uppercase tracking-wider">
                The $1,200+/Month Outbound Trap Is Dead.
              </h2>
              <p className="mt-3 text-xs sm:text-sm text-zinc-400 font-sans max-w-2xl mx-auto leading-relaxed">
                Why pay 5 separate software vendor invoices plus an agency retainer ($1,200+/mo) before booking a single sales call? Here is the exact math traditional cold email vendors don't want you to see.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto items-stretch">
              {/* The Old Fragmented Way */}
              <div className="border border-red-900/40 bg-black p-6 sm:p-8 space-y-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                    <span className="text-xs uppercase tracking-widest font-bold text-red-400">
                      The Fragmented SaaS & Agency Trap
                    </span>
                    <span className="border border-red-900/60 bg-red-950/30 text-red-400 text-[10px] px-2 py-0.5 uppercase">
                      ~$1,291/mo Total Tax
                    </span>
                  </div>

                  <ul className="space-y-3 text-xs font-mono text-zinc-400">
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900 pb-2">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-red-500 shrink-0" /> Apollo Lead Export Credits
                      </span>
                      <span className="text-red-400 font-bold">$99/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900 pb-2">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-red-500 shrink-0" /> Instantly / Smartlead Seat
                      </span>
                      <span className="text-red-400 font-bold">$97/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900 pb-2">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-red-500 shrink-0" /> 5 Secondary Domains & DNS
                      </span>
                      <span className="text-red-400 font-bold">$60/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900 pb-2">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-red-500 shrink-0" /> Google Workspace Inboxes
                      </span>
                      <span className="text-red-400 font-bold">$36/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900 pb-2">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-red-500 shrink-0" /> Clay Enrichment Credits
                      </span>
                      <span className="text-red-400 font-bold">$149/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900 pb-2">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-red-500 shrink-0" /> Mailbox Ops & Reply Retainer
                      </span>
                      <span className="text-red-400 font-bold">$850/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 pt-1 text-zinc-500 text-[11px]">
                      <span>3 Weeks Wasted Warming Inboxes</span>
                      <span className="text-zinc-400">21 Days Lost</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-zinc-900">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Total Fixed Cost:</span>
                    <span className="text-2xl font-bold text-red-400 font-mono">$15,492 / year</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 font-sans">
                    You pay this recurring burn whether you send 10 emails or zero.
                  </p>
                </div>
              </div>

              {/* The ChadGTM Model */}
              <div className="border border-white bg-black p-6 sm:p-8 space-y-6 flex flex-col justify-between relative shadow-2xl">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <span className="text-xs uppercase tracking-widest font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-emerald-400" /> ChadGTM Autonomous Engine
                    </span>
                    <span className="border border-emerald-500/40 bg-emerald-950/20 text-emerald-400 text-[10px] px-2 py-0.5 uppercase font-bold">
                      $0/mo Platform Fee
                    </span>
                  </div>

                  <ul className="space-y-3 text-xs font-mono text-zinc-300">
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> 100M+ Global Lead Directory
                      </span>
                      <span className="text-emerald-400 font-bold">INCLUDED ($0)</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> Pre-Warmed Shared Mailbox Pool
                      </span>
                      <span className="text-emerald-400 font-bold">INCLUDED ($0)</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> Autonomous 3-Touch Follow-Up Engine
                      </span>
                      <span className="text-emerald-400 font-bold">INCLUDED ($0)</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> Chad Neural Voice Calibration (Proprietary Engine)
                      </span>
                      <span className="text-emerald-400 font-bold">INCLUDED ($0)</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> Turnkey Admin-Supplied Mailbox Fleet
                      </span>
                      <span className="text-emerald-400 font-bold">ZERO SETUP</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 pt-1 text-zinc-400 text-[11px]">
                      <span>Managed Mesh Delivery (Zero Setup)</span>
                      <span className="text-white font-bold">5¢ / email</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Base Monthly Cost:</span>
                    <span className="text-2xl font-bold text-white font-mono">$0 / month forever</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1 font-sans">
                    Send 1,000 emails = $50. Pause for summer = $0. Pure utility billing.
                  </p>
                  <Button asChild size="lg" className="w-full mt-4 rounded-none bg-white text-black font-bold uppercase tracking-wider text-xs border border-white hover:bg-zinc-200">
                    <Link href="/signup">
                      Deploy Your $0/Mo Pipeline <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3-TOUCH AUTONOMOUS SEQUENCE SHOWCASE (THE SECRET TO 9.4% REPLIES) */}
        {/* ========================================================================= */}
        <ChadGtmSequenceShowcase />

        {/* ========================================================================= */}
        {/* 5-STEP WORKFLOW SIMULATOR (HOW IT WORKS IN 60 SECONDS) */}
        {/* ========================================================================= */}
        <ChadGtmWorkflowSimulator />

        {/* ========================================================================= */}
        {/* 100M+ GLOBAL VERIFIED LEADS DIRECTORY PREVIEW */}
        {/* ========================================================================= */}
        <ChadGtmLeadsPreview />

        {/* ========================================================================= */}
        {/* OUTBOUND ECONOMIC BENCHMARK & ROI SAVINGS CALCULATOR */}
        {/* ========================================================================= */}
        <ChadGtmCalculator />

        {/* ========================================================================= */}
        {/* SIDE-BY-SIDE COMPETITIVE COMPARISON MATRIX */}
        {/* ========================================================================= */}
        <ChadGtmComparisonTable />

        {/* ========================================================================= */}
        {/* PRICING SECTION ($0/MO + PAY JUST 5 CENTS PER EMAIL) */}
        {/* ========================================================================= */}
        <ChadGtmPricingCard isLoggedIn={isLoggedIn} />

        {/* ========================================================================= */}
        {/* FOUNDER MANIFESTO: WHY WE CHARGE $0/MONTH */}
        {/* ========================================================================= */}
        <section className="py-20 sm:py-24 border-t border-zinc-800 bg-zinc-950 font-mono">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="border border-zinc-800 bg-black p-8 sm:p-10 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-white" />
                  <span className="text-xs uppercase font-bold tracking-widest text-white">
                    FOUNDER NOTE // WHY WE CHARGE $0/MONTH
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">TRANSPARENCY MANIFESTO</span>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-zinc-300 font-sans leading-relaxed">
                <p className="font-bold text-white font-mono text-sm sm:text-base">
                  "Why does every cold email platform charge you $97/month for a login screen?"
                </p>
                <p>
                  Think about it: AWS doesn't charge you $99/month just to create a database. Stripe doesn't charge you $99/month just to open a payment gateway. They charge you a tiny fraction of a cent when you actually consume compute or process money.
                </p>
                <p>
                  Yet in outbound sales, legacy tools force early-stage founders and growth teams to pay <strong className="text-white">$400–$800 every single month</strong> in recurring seat licenses. If you take a week off to close deals, you still pay $400. If you are testing a new product angle, you still pay $400.
                </p>
                <p>
                  We built ChadGTM to treat cold email infrastructure as a utility. Our entire core software—campaign builder, lead directory scaling to 100M+ verified global contacts, UniBox, and CRM—is <strong className="text-white">$0/month forever</strong>. All mailboxes are pre-warmed, authenticated, and supplied directly by our admin fleet, so you pay strictly <strong className="text-white">$0.05 per email delivered</strong> with zero domain or DNS setup.
                </p>
                <p className="text-zinc-400 font-mono text-xs pt-2">
                  Zero seat taxes. Zero monthly minimums. Pure pay-for-what-you-use growth.
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white font-mono">The ChadGTM Core Team</div>
                  <div className="text-[10px] text-zinc-500 uppercase font-mono">Built for founders who hate paying SaaS seat taxes</div>
                </div>
                <Button asChild size="sm" className="rounded-none bg-white text-black font-semibold uppercase tracking-wider text-xs border border-white hover:bg-zinc-200">
                  <Link href="/signup">Start Free ($0/mo)</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* PRODUCTION CASE STUDIES & OPERATOR TELEMETRY */}
        {/* ========================================================================= */}
        <section className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black overflow-hidden font-mono">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
                <Star className="size-3 text-white" />
                VERIFIED OUTCOMES // OPERATOR CASE STUDIES
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold text-white uppercase tracking-wider">
                Real Pipeline. Real Meetings.
              </h2>
              <p className="mt-2 text-xs text-zinc-400 font-sans">
                Audited results from B2B founders and revenue leaders running autonomous outreach.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
              {[
                {
                  code: "[CASE_STUDY_01]",
                  quote:
                    "ChadGTM completely replaced our $4,500/month SDR agency. We plugged in our URL, approved 3 email angles on the swipe deck, and booked 19 enterprise demos in our first 10 days.",
                  author: "Julian Richter",
                  role: "Founder & CEO, CloudScale IO",
                  metric: "+280% PIPELINE",
                  badge: "ENTERPRISE SAAS",
                },
                {
                  code: "[CASE_STUDY_02]",
                  quote:
                    "The 3-touch follow-up cadence is ruthless. Our 9.4% conversion rate came almost entirely from Touch 2 and Touch 3. We didn't have to touch a single DNS record or buy a burner domain.",
                  author: "Maya Lindqvist",
                  role: "Head of Growth, DevSync Labs",
                  metric: "9.4% CONVERSION",
                  badge: "DEVTOOLS",
                },
                {
                  code: "[CASE_STUDY_03]",
                  quote:
                    "We used to pay Apollo $99/mo plus Instantly $97/mo. Paying $0 platform fee and just 5 cents per email on the managed pool saves our early-stage startup over $2,100 a year.",
                  author: "David Thorne",
                  role: "Co-Founder, PayFlow API",
                  metric: "$2,100+ SAVINGS",
                  badge: "FINTECH API",
                },
              ].map((t, i) => (
                <div key={i} className="border border-zinc-800 bg-zinc-950 p-6 flex flex-col justify-between relative group hover:border-zinc-700 transition-colors">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest border-b border-zinc-900 pb-2">
                      <span className="font-bold text-zinc-400">{t.code}</span>
                      <span className="border border-zinc-800 bg-black px-1.5 py-0.5 text-zinc-400">{t.badge}</span>
                    </div>
                    <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                      "{t.quote}"
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-zinc-900 flex items-center justify-between text-xs font-mono">
                    <div>
                      <div className="font-bold text-white">{t.author}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t.role}</div>
                    </div>
                    <span className="text-[10px] font-bold text-white border border-zinc-700 bg-black px-2 py-0.5">
                      {t.metric}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SYSTEM DOCUMENTATION & OBJECTION-HANDLING FAQ */}
        {/* ========================================================================= */}
        <section id="faq" className="py-20 sm:py-28 border-t border-zinc-800 bg-black font-mono">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
                <Terminal className="size-3 text-white" />
                SYSTEM DOCUMENTATION // OBJECTIONS ANSWERED
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold text-white uppercase tracking-wider">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-3">
              {[
                {
                  code: "[SPEC_01]",
                  q: "Why is the core ChadGTM platform $0/month?",
                  a: "We believe cold email software should not cost $97/month in recurring seat licenses. The core ChadGTM platform is 100% free ($0/mo) for unlimited campaigns, sequences, and lead storage. When using our autonomous shared mailbox pool, you pay strictly 5¢ per email.",
                },
                {
                  code: "[SPEC_02]",
                  q: "How does the 'Pay Just 5 Cents Per Email' model work?",
                  a: "If you don't want to buy secondary domains, configure DNS (SPF, DKIM, DMARC), or warm up mailboxes for 3 weeks, you can dispatch via our managed enterprise shared mailbox pool. You pay strictly $0.05 per email delivered. There are no recurring monthly minimums and no hidden markups.",
                },
                {
                  code: "[SPEC_03]",
                  q: "How does the 3-touch follow-up cadence work?",
                  a: "Every prospect automatically receives an initial personalized opener, followed by Touch #2 (Value & Proof Bump, 3 days later), and Touch #3 (Polite Permission Breakup, 4 days after that). The instant a prospect replies or books a meeting, all remaining follow-ups are cancelled automatically.",
                },
                {
                  code: "[SPEC_04]",
                  q: "Do I need to buy secondary domains or configure DNS records?",
                  a: "No. ChadGTM is 100% turnkey zero setup. Our admin fleet supplies, warms, and maintains all sender infrastructure with pre-configured SPF, DKIM, and DMARC authentication. You never have to buy domains or configure DNS.",
                },
                {
                  code: "[SPEC_05]",
                  q: "How does ChadGTM maintain 99%+ deliverability?",
                  a: "We enforce a strict ceiling of 30 emails per mailbox per day, distributed across our shared sender infrastructure with intelligent randomized delays (45–120 seconds). Each sender domain is pre-authenticated with verified SPF, DKIM, and DMARC records.",
                },
                {
                  code: "[SPEC_06]",
                  q: "What powers the autonomous company research and email generation?",
                  a: "ChadGTM is powered by our proprietary Chad Neural Core™—a dedicated outbound intelligence model trained on 7+ years of cold campaign conversion data and over 50M+ sales touchpoints. It crawls your live website, extracts unique value propositions, matches high-intent buyer personas, and drafts high-converting outreach angles in seconds.",
                },
                {
                  code: "[SPEC_07]",
                  q: "Is ChadGTM compliant with GDPR and CAN-SPAM regulations?",
                  a: "Yes. Every outgoing email automatically includes one-click unsubscribe links and physical compliance footers. Any reply or opt-out is instantly honored and synchronized across all active campaigns.",
                },
              ].map((faq, i) => (
                <div key={i} className="border border-zinc-800 bg-zinc-950 p-5 hover:border-zinc-700 transition-colors">
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-zinc-500 font-mono">{faq.code}</span> {faq.q}
                  </h4>
                  <p className="mt-2.5 text-xs text-zinc-400 font-sans leading-relaxed pl-6">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* FINAL BOTTOM HIGH-CONVERTING CTA BANNER */}
        {/* ========================================================================= */}
        <section className="relative py-20 sm:py-28 border-t border-zinc-800 bg-zinc-950 overflow-hidden font-mono">
          <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 border border-zinc-800 bg-black px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-4">
              <Rocket className="size-3 text-white" />
              DEPLOY IN 60 SECONDS // $0 PLATFORM FEE
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight uppercase">
              Ready To Replace Your Fragmented $450/Month Outbound Stack?
              <br />
              <span className="text-zinc-500 text-2xl sm:text-4xl block mt-2 font-normal">
                [LIVE IN UNDER 60 SECONDS · 5¢ / EMAIL]
              </span>
            </h2>
            <p className="mt-4 text-xs sm:text-sm text-zinc-400 font-sans max-w-xl mx-auto leading-relaxed">
              Join forward-thinking founders and revenue leaders generating qualified meetings autonomously. No secondary domains to buy. No seat licenses to manage.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-sm sm:max-w-none mx-auto">
              <Button
                asChild
                size="lg"
                className="rounded-none h-12 px-8 bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-wider border border-white gap-2 w-full sm:w-auto shadow-2xl"
              >
                <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                  Launch Free GTM Engine <ArrowRight className="size-4 ml-1" />
                </Link>
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-[10px] text-zinc-500 uppercase tracking-widest">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <CheckCircle2 className="size-3 text-emerald-400" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <CheckCircle2 className="size-3 text-emerald-400" />
                Live in 60 seconds
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <CheckCircle2 className="size-3 text-emerald-400" />
                $0/mo platform fee forever
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <CheckCircle2 className="size-3 text-emerald-400" />
                Cancel anytime
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* Global Architectural Footer */}
      <footer className="border-t border-zinc-800 bg-black py-8 text-xs font-mono text-zinc-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <ChadGtmLogo compact />
            <span className="text-zinc-700">|</span>
            <span className="text-[11px] uppercase tracking-wider">© 2026 ChadGTM Engine. All rights reserved.</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-none bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400">System Operational</span>
            </div>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/impressum" className="hover:text-white transition-colors">
              Impressum
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
