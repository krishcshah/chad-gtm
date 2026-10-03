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
} from "lucide-react";
import { Button } from "@smartreach/ui";
import { ChadGtmLogo } from "@/components/chad-gtm-logo";
import { getSession } from "@/lib/session";
import { LandingHeader } from "@/components/chad-gtm/landing/landing-header";
import { ChadGtmHeroScanner } from "@/components/chad-gtm/landing/chad-gtm-hero-scanner";
import { ChadGtmHeroTelemetry } from "@/components/chad-gtm/landing/chad-gtm-hero-telemetry";
import { ChadGtmArchitectureBlueprint } from "@/components/chad-gtm/landing/chad-gtm-architecture-blueprint";
import { ChadGtmWorkflowSimulator } from "@/components/chad-gtm/landing/chad-gtm-workflow-simulator";
import { ChadGtmPricingCard } from "@/components/chad-gtm/landing/chad-gtm-pricing-card";
import { ChadGtmComparisonTable } from "@/components/chad-gtm/landing/chad-gtm-comparison-table";
import { ChadGtmLeadsPreview } from "@/components/chad-gtm/landing/chad-gtm-leads-preview";
import { ChadGtmCalculator } from "@/components/chad-gtm/landing/chad-gtm-calculator";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ChadGTM · Autonomous Go-To-Market & Cold Outreach Engine · $0/mo Platform",
  description:
    "Turn any company website URL into an autonomous B2B outbound engine in 60 seconds. Powered by Gemini 3.8 Flash, 329,000+ verified Apollo leads, and pre-warmed shared mailboxes at just 3¢ per email.",
};

export default async function LandingPage() {
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div className="min-h-screen bg-black text-zinc-100 antialiased font-sans app-shell selection:bg-white selection:text-black">
      {/* Top Header Navigation */}
      <LandingHeader isLoggedIn={isLoggedIn} />

      <main className="relative">
        {/* Asymmetrical Industrial Hero Section */}
        <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24 border-b border-zinc-800 bg-black">
          {/* Subtle Grid Coordinate Guides */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#18181b15_1px,transparent_1px),linear-gradient(to_bottom,#18181b15_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Engineering Coordinate Header Strip */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-8 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <span className="size-1.5 bg-emerald-500 rounded-none animate-pulse" />
                <span>CHADGTM // PROTOCOL v2.4.0</span>
              </div>
              <div className="hidden sm:flex items-center gap-4">
                <span>INDEX: 329,563 B2B NODES</span>
                <span>LATENCY: &lt;400ms</span>
                <span className="text-zinc-400">CORE STATUS: ENGAGED</span>
              </div>
            </div>

            {/* Asymmetrical 12-Column Hero Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
              {/* Left Column: Command Console Copy (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Product Badge */}
                <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-white uppercase tracking-wider font-mono">
                  <img src="/chad-white-border.png" alt="Chad" className="size-4 object-contain" />
                  <span>AUTONOMOUS OUTBOUND ENGINE // GEMINI 3.8</span>
                </div>

                {/* Massive Raw Industrial Headline */}
                <h1 className="text-4xl font-bold tracking-tight sm:text-6xl xl:text-7xl text-white uppercase leading-[1.05]">
                  Autonomous Go-To-Market
                  <span className="text-zinc-500 font-mono text-2xl sm:text-4xl xl:text-5xl block mt-2 font-normal">
                    [URL TO PIPELINE IN 60s]
                  </span>
                </h1>

                {/* Technical Subtitle */}
                <p className="text-xs sm:text-sm text-zinc-400 font-mono leading-relaxed max-w-2xl">
                  Plug in your domain URL. ChadGTM extracts your value proposition, queries 329,563 verified Apollo prospects, calibrates tone via a Tinder-style swipe deck, and dispatches through pre-warmed shared mailboxes at 3¢ per email.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 font-mono">
                  <Button
                    asChild
                    size="lg"
                    className="rounded-none h-11 px-7 bg-white hover:bg-zinc-200 text-black font-semibold text-xs uppercase tracking-wider border border-white gap-2 w-full sm:w-auto"
                  >
                    <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                      <Sparkles className="size-3.5" />
                      Launch Free GTM Engine <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="rounded-none h-11 px-6 border-zinc-800 bg-black text-zinc-300 hover:bg-zinc-900 hover:text-white hover:border-zinc-700 text-xs font-mono uppercase tracking-wider w-full sm:w-auto"
                  >
                    <a href="#architecture">
                      System Architecture
                    </a>
                  </Button>
                </div>

                {/* Trust Metrics Coordinate Grid */}
                <div className="pt-6 border-t border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">[PROSPECTS]</div>
                    <div className="text-white font-bold text-base mt-1">329,563</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Apollo Verified</div>
                  </div>
                  <div className="border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">[DELIVERABILITY]</div>
                    <div className="text-white font-bold text-base mt-1">99.8%</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">DNS Hardened</div>
                  </div>
                  <div className="border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">[SOFTWARE]</div>
                    <div className="text-white font-bold text-base mt-1">$0/MO</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Zero Seat Fees</div>
                  </div>
                  <div className="border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">[MANAGED POOL]</div>
                    <div className="text-white font-bold text-base mt-1">3¢</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Per Email Sent</div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Telemetry Radar HUD (5 cols) */}
              <div className="lg:col-span-5 w-full">
                <ChadGtmHeroTelemetry />
              </div>
            </div>

            {/* Embedded Live URL Scanner Sandbox */}
            <div className="mt-14 pt-10 border-t border-zinc-800">
              <ChadGtmHeroScanner />
            </div>
          </div>
        </section>

        {/* Technical Architecture Blueprint Section */}
        <ChadGtmArchitectureBlueprint />

        {/* 5-Step Workflow Simulator Section */}
        <ChadGtmWorkflowSimulator />

        {/* Built-In 329k Apollo Lead Directory Section */}
        <ChadGtmLeadsPreview />

        {/* Outbound Economic Benchmark & Cost Calculator Section */}
        <ChadGtmCalculator />

        {/* Competitive Matrix Section */}
        <ChadGtmComparisonTable />

        {/* Pricing Section ($0/mo + Pay Just 3 Cents Per Email) */}
        <ChadGtmPricingCard isLoggedIn={isLoggedIn} />

        {/* Verified Operator Reviews with Engineering Spec Coordinates */}
        <section className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black overflow-hidden font-mono">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
                <Star className="size-3 text-white" />
                VERIFIED TELEMETRY // FIELD CASE STUDIES
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold text-white uppercase tracking-wider">
                Production Case Studies
              </h2>
              <p className="mt-2 text-xs text-zinc-400">
                Audited outcomes from active B2B operators running autonomous campaigns.
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
                    "The Tinder-style calibration is sheer genius. In 2 minutes, the AI adapted to our technical tone. We're hitting a 9.4% reply rate without managing secondary Google Workspace accounts.",
                  author: "Maya Lindqvist",
                  role: "Head of Growth, DevSync Labs",
                  metric: "9.4% REPLY RATE",
                  badge: "DEVTOOLS",
                },
                {
                  code: "[CASE_STUDY_03]",
                  quote:
                    "We used to pay Apollo $99/mo plus Instantly $97/mo. Paying $0 platform fee and just 3 cents per email on the managed pool saves our early-stage startup over $2,400 a year.",
                  author: "David Thorne",
                  role: "Co-Founder, PayFlow API",
                  metric: "$2,400+ SAVINGS",
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

        {/* System Documentation FAQ Section */}
        <section id="faq" className="py-20 sm:py-28 border-t border-zinc-800 bg-black font-mono">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
                <Terminal className="size-3 text-white" />
                SYSTEM DOCUMENTATION // SPECIFICATIONS
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold text-white uppercase tracking-wider">
                Technical FAQ
              </h2>
            </div>

            <div className="space-y-3">
              {[
                {
                  code: "[SPEC_01]",
                  q: "Why is the core platform $0/month?",
                  a: "We believe cold email software should not cost $97/month in recurring seat licenses. The core ChadGTM platform is 100% free ($0/mo) for unlimited campaigns, sequences, and lead storage. When using our autonomous shared mailbox pool, you pay strictly 3¢ per email.",
                },
                {
                  code: "[SPEC_02]",
                  q: "How does the 'Pay Just 3 Cents Per Email' model work?",
                  a: "If you don't want to buy secondary domains, configure DNS (SPF, DKIM, DMARC), or warm up mailboxes for 3 weeks, you can dispatch via our managed enterprise shared mailbox pool. You pay strictly $0.03 per email delivered. There are no recurring monthly minimums and no hidden markups.",
                },
                {
                  code: "[SPEC_03]",
                  q: "Can I bring my own email accounts for $0 sending?",
                  a: "Yes! You can connect unlimited Google Workspace, Microsoft 365, or custom SMTP/IMAP inboxes completely free. If you use your own mailboxes, sending costs you $0.",
                },
                {
                  code: "[SPEC_04]",
                  q: "How does ChadGTM maintain 99%+ deliverability?",
                  a: "We enforce a strict ceiling of 30 emails per mailbox per day, distributed across our shared sender infrastructure with intelligent randomized delays (45–120 seconds). Each sender domain is pre-authenticated with verified SPF, DKIM, and DMARC records.",
                },
                {
                  code: "[SPEC_05]",
                  q: "What AI model powers the deep research and email generation?",
                  a: "ChadGTM is powered by Google's latest Gemini 3.8 Flash model. It crawls your live website, extracts unique value propositions, matches ICP buyer personas, and drafts high-converting outreach angles in under a second.",
                },
                {
                  code: "[SPEC_06]",
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

        {/* Final Bottom Deployment CTA */}
        <section className="relative py-20 sm:py-28 border-t border-zinc-800 bg-zinc-950 overflow-hidden font-mono">
          <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight uppercase">
              Deploy Your Outbound Pipeline
              <br />
              <span className="text-zinc-500 text-2xl sm:text-4xl block mt-1">
                [LIVE IN UNDER 60 SECONDS]
              </span>
            </h2>
            <p className="mt-4 text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
              Join forward-thinking founders and revenue leaders generating qualified meetings autonomously.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-sm sm:max-w-none mx-auto">
              <Button
                asChild
                size="lg"
                className="rounded-none h-11 px-8 bg-white hover:bg-zinc-200 text-black font-semibold text-xs uppercase tracking-wider border border-white gap-2 w-full sm:w-auto"
              >
                <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                  Launch Free GTM Engine <Rocket className="size-3.5 ml-1" />
                </Link>
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-[10px] text-zinc-500 uppercase tracking-widest">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3 text-white" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3 text-white" />
                Live in 60 seconds
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3 text-white" />
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
