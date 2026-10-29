import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
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
  Target,
  Globe,
  Database,
  Server,
} from "lucide-react";
import { Button } from "@smartreach/ui";
import { getSession } from "@/lib/session";
import { LandingHeader } from "@/components/chad-gtm/landing/landing-header";
import { ChadGtmHeroScanner } from "@/components/chad-gtm/landing/chad-gtm-hero-scanner";
import { ChadGtmSequenceShowcase } from "@/components/chad-gtm/landing/chad-gtm-sequence-showcase";
import { ChadGtmPricingCard } from "@/components/chad-gtm/landing/chad-gtm-pricing-card";
import { ChadGtmComparisonTable } from "@/components/chad-gtm/landing/chad-gtm-comparison-table";
import { ChadGtmLeadsPreview } from "@/components/chad-gtm/landing/chad-gtm-leads-preview";
import { ChadGtmCalculator } from "@/components/chad-gtm/landing/chad-gtm-calculator";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AutoGTM · Turn Your Website URL Into Booked Sales Meetings · $0/mo Platform",
  description:
    "The autonomous outbound engine with $0/month software fees. Drop in your domain—our AI extracts your offer, matches 10.2M verified decision-makers, and sends personalized sequences from pre-warmed mailboxes. Pay strictly 5¢ per email.",
};

export default async function LandingPage() {
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 antialiased font-sans selection:bg-white selection:text-black">
      {/* Top Header Navigation */}
      <LandingHeader isLoggedIn={isLoggedIn} />

      <main className="relative">
        {/* Subtle Ambient Radial Backlight */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-to-b from-emerald-500/[0.07] via-cyan-500/[0.03] to-transparent blur-3xl pointer-events-none" />

        {/* ========================================================================= */}
        {/* HERO SECTION: Centered Series A Product Stage */}
        {/* ========================================================================= */}
        <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24 sm:pb-32 border-b border-zinc-800/80">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Top Market Positioning Banner */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-12 text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <span className="size-2 bg-emerald-400 rounded-none animate-pulse shrink-0" />
                <span className="font-bold text-white">THE $0/MO OUTBOUND ENGINE</span>
                <span className="text-zinc-600 hidden sm:inline">·</span>
                <span className="text-zinc-400 hidden sm:inline">5¢ PER DELIVERED EMAIL</span>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-zinc-500 text-[10px]">
                <span className="text-emerald-400 font-semibold">99.8% INBOX PLACEMENT</span>
              </div>
            </div>

            {/* Centered Hero Header */}
            <div className="text-center max-w-4xl mx-auto space-y-6">
              {/* Eyebrow Badge */}
              <div className="inline-flex items-center gap-2 rounded-none border border-emerald-500/30 bg-emerald-950/20 px-3.5 py-1 text-xs text-emerald-400 font-mono">
                <span className="size-2 rounded-none bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-white">AutoGTM 2.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-300">The Autonomous Sales Pipeline</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.06]">
                Turn your website URL into{" "}
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                  booked sales meetings.
                </span>
              </h1>

              {/* Subhead */}
              <p className="text-base sm:text-lg text-zinc-300 font-sans leading-relaxed max-w-2xl mx-auto">
                Drop in your domain. AutoGTM extracts your value proposition, matches verified decision-makers from our 10.2M B2B directory, and launches personalized 3-touch sequences from pre-warmed mailboxes straight into primary inboxes.
              </p>

              {/* Preserved Bracket Tagline */}
              <div className="text-xs sm:text-sm font-mono text-emerald-400/90 uppercase tracking-wider">
                [Live in 60 seconds · $0 per month software forever · 5¢ per email]
              </div>
            </div>

            {/* Center-Stage Interactive URL Scanner */}
            <div className="mt-12">
              <ChadGtmHeroScanner />
            </div>

            {/* Infrastructure Status Strip Below Scanner */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-2 text-zinc-300">
                <span className="size-2 rounded-none bg-emerald-400 animate-pulse" />
                <span>11 System Mailboxes Pre-warmed</span>
              </span>
              <span>·</span>
              <span className="text-zinc-300">10,227,232 Verified Contacts</span>
              <span>·</span>
              <span className="text-zinc-300">Safe 30/Day Inbox Pacing</span>
              <span>·</span>
              <span className="text-zinc-300">Oracle OCI Frankfurt (130.61.146.177)</span>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* THE SAAS SUBSCRIPTION TRAP VS AUTOGTM (THE ANCHOR COMPARISON) */}
        {/* ========================================================================= */}
        <section className="py-24 sm:py-32 border-b border-zinc-800/80 bg-zinc-950/80">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 border border-zinc-800 bg-black px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-4">
                <DollarSign className="size-3 text-emerald-400" />
                The Cold Outbound Reckoning
              </div>
              <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
                The $1,200/month cold outreach trap is dead.
              </h2>
              <p className="mt-3 text-sm sm:text-base text-zinc-400 font-sans max-w-2xl mx-auto leading-relaxed">
                Why pay 5 separate software vendor invoices plus an agency retainer ($1,200+/mo) before booking a single sales call? Here is the exact math legacy outbound vendors don't want you to see.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch font-sans">
              {/* The Old Fragmented Way */}
              <div className="rounded-none border border-rose-950/80 bg-zinc-950 p-6 sm:p-8 space-y-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                    <span className="text-xs uppercase tracking-wider font-semibold text-rose-400">
                      The Fragmented SaaS &amp; Agency Trap
                    </span>
                    <span className="rounded-none border border-rose-900/60 bg-rose-950/40 text-rose-400 text-[10px] px-2.5 py-0.5 font-mono">
                      ~$1,291/mo Total Tax
                    </span>
                  </div>

                  <ul className="space-y-3.5 text-xs text-zinc-400">
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900/80 pb-2.5">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-rose-500 shrink-0" /> Apollo Lead Export Credits
                      </span>
                      <span className="text-rose-400 font-semibold font-mono">$99/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900/80 pb-2.5">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-rose-500 shrink-0" /> Instantly / Smartlead Seat
                      </span>
                      <span className="text-rose-400 font-semibold font-mono">$97/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900/80 pb-2.5">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-rose-500 shrink-0" /> 5 Secondary Domains &amp; DNS
                      </span>
                      <span className="text-rose-400 font-semibold font-mono">$60/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900/80 pb-2.5">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-rose-500 shrink-0" /> Google Workspace Inboxes
                      </span>
                      <span className="text-rose-400 font-semibold font-mono">$36/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900/80 pb-2.5">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-rose-500 shrink-0" /> Clay Enrichment Credits
                      </span>
                      <span className="text-rose-400 font-semibold font-mono">$149/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-900/80 pb-2.5">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <X className="size-3.5 text-rose-500 shrink-0" /> Mailbox Ops &amp; Reply Retainer
                      </span>
                      <span className="text-rose-400 font-semibold font-mono">$850/mo</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 pt-1 text-zinc-500 text-[11px]">
                      <span>3 Weeks Wasted Warming Inboxes</span>
                      <span className="text-zinc-400 font-mono">21 Days Lost</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-zinc-900">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">Total Fixed Cost:</span>
                    <span className="text-2xl font-bold text-rose-400 font-mono">$15,492 / year</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    You pay this recurring burn whether you send 10 emails or zero.
                  </p>
                </div>
              </div>

              {/* The AutoGTM Model */}
              <div className="rounded-none border border-emerald-900/80 bg-zinc-950 p-6 sm:p-8 space-y-6 flex flex-col justify-between relative shadow-xl">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <span className="text-xs uppercase tracking-wider font-semibold text-white flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-emerald-400" /> AutoGTM Autonomous Engine
                    </span>
                    <span className="rounded-none border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 text-[10px] px-2.5 py-0.5 font-mono font-semibold">
                      $0/mo Platform Fee
                    </span>
                  </div>

                  <ul className="space-y-3.5 text-xs text-zinc-300">
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> 10.2M Global Lead Directory
                      </span>
                      <span className="text-emerald-400 font-semibold font-mono">INCLUDED ($0)</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> Pre-Warmed Shared Mailbox Pool
                      </span>
                      <span className="text-emerald-400 font-semibold font-mono">INCLUDED ($0)</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> Autonomous 3-Touch Follow-Up Engine
                      </span>
                      <span className="text-emerald-400 font-semibold font-mono">INCLUDED ($0)</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> AutoGTM Neural Voice Calibration
                      </span>
                      <span className="text-emerald-400 font-semibold font-mono">INCLUDED ($0)</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                      <span className="flex items-center gap-2 text-white">
                        <Check className="size-3.5 text-emerald-400 shrink-0" /> Turnkey Admin-Supplied Mailbox Fleet
                      </span>
                      <span className="text-emerald-400 font-semibold font-mono">ZERO SETUP</span>
                    </li>
                    <li className="flex items-start justify-between gap-2 pt-1 text-zinc-400 text-[11px]">
                      <span>Managed Mesh Delivery (Zero Setup)</span>
                      <span className="text-white font-semibold font-mono">5¢ / email</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wider text-zinc-400 font-medium">Base Monthly Cost:</span>
                    <span className="text-2xl font-bold text-white font-mono">$0 / month forever</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Send 1,000 emails = $50. Pause for summer = $0. Pure utility billing.
                  </p>
                  <Button asChild size="lg" className="w-full mt-4 rounded-none bg-white text-black font-semibold text-xs border border-white hover:bg-zinc-200 shadow-none active:translate-y-[1px]">
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
        {/* 10.2M GLOBAL VERIFIED LEADS DIRECTORY PREVIEW */}
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
        <section className="py-24 sm:py-32 border-t border-zinc-800/80 bg-zinc-950 font-sans">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-none border border-zinc-800 bg-black p-8 sm:p-12 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-emerald-400" />
                  <span className="text-xs uppercase font-semibold tracking-wider text-white font-mono">
                    Founder Note // Why We Charge $0/Month Forever
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-none">
                  Transparency Manifesto
                </span>
              </div>

              <div className="space-y-4 text-sm sm:text-base text-zinc-300 leading-relaxed">
                <p className="font-semibold text-white text-base sm:text-lg">
                  "Why does every cold email platform charge you $97/month just for a login screen?"
                </p>
                <p>
                  Think about it: AWS doesn't charge you $99/month just to create a database. Stripe doesn't charge you $99/month just to open a payment gateway. They charge you a fraction of a cent when you actually consume compute or process money.
                </p>
                <p>
                  Yet in outbound sales, legacy vendors force early-stage founders and growth teams to pay <strong className="text-white">$400–$800 every single month</strong> in recurring seat taxes. If you take a week off to close deals, you still pay $400. If you are testing a new angle, you still pay $400.
                </p>
                <p>
                  We built AutoGTM to treat outbound infrastructure as a utility. Our entire core software—campaign builder, 10.2M verified B2B directory, UniBox, and CRM—is <strong className="text-white">$0/month forever</strong>. All mailboxes are pre-warmed, authenticated, and supplied directly by our admin fleet, so you pay strictly <strong className="text-white">$0.05 per email delivered</strong> with zero domain or DNS setup.
                </p>
                <p className="text-zinc-400 text-xs pt-2 font-mono">
                  Zero seat taxes · Zero monthly minimums · Pure pay-for-what-you-use growth.
                </p>
              </div>

              <div className="pt-6 border-t border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-white">The AutoGTM Core Team</div>
                  <div className="text-[11px] text-zinc-400">Built for founders who hate paying recurring SaaS seat taxes</div>
                </div>
                <Button asChild size="sm" className="rounded-none bg-white text-black font-semibold text-xs border border-white hover:bg-zinc-200 shadow-none active:translate-y-[1px]">
                  <Link href="/signup">Start Free ($0/mo)</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* OPERATOR CASE STUDIES */}
        {/* ========================================================================= */}
        <section className="relative py-24 sm:py-32 border-t border-zinc-800/80 bg-[#050505] overflow-hidden font-sans">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-none border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-400 mb-3">
                <Star className="size-3 text-emerald-400" />
                <span>Verified Outcomes · Founder Case Studies</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
                Real Pipeline. Real Meetings.
              </h2>
              <p className="mt-3 text-xs sm:text-sm text-zinc-400">
                Audited outcomes from B2B founders running autonomous outreach.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  code: "Case Study 01",
                  quote:
                    "AutoGTM completely replaced our $4,500/month SDR agency. We plugged in our URL, approved 3 email angles on the swipe deck, and booked 19 enterprise demos in our first 10 days.",
                  author: "Julian Richter",
                  role: "Founder & CEO, CloudScale IO",
                  metric: "+280% Pipeline",
                  badge: "Enterprise SaaS",
                },
                {
                  code: "Case Study 02",
                  quote:
                    "The 3-touch follow-up cadence is ruthless. Our 9.4% conversion rate came almost entirely from Touch 2 and Touch 3. We didn't have to touch a single DNS record or buy a burner domain.",
                  author: "Maya Lindqvist",
                  role: "Head of Growth, DevSync Labs",
                  metric: "9.4% Conversion",
                  badge: "DevTools",
                },
                {
                  code: "Case Study 03",
                  quote:
                    "We used to pay Apollo $99/mo plus Instantly $97/mo. Paying $0 platform fee and just 5 cents per email on the managed pool saves our early-stage startup over $2,100 a year.",
                  author: "David Thorne",
                  role: "Co-Founder, PayFlow API",
                  metric: "$2,100+ Savings",
                  badge: "Fintech API",
                },
              ].map((t, i) => (
                <div
                  key={i}
                  className="rounded-none border border-zinc-800 bg-zinc-950 p-7 flex flex-col justify-between relative group hover:border-zinc-700 transition-colors"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-3">
                      <span className="font-mono text-zinc-400">{t.code}</span>
                      <span className="rounded-none border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 font-mono">
                        {t.badge}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">
                      "{t.quote}"
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">{t.author}</div>
                      <div className="text-[11px] text-zinc-400">{t.role}</div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400 font-mono border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-0.5 rounded-none">
                      {t.metric}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* FINAL HIGH-CONVERTING CTA BANNER */}
        {/* ========================================================================= */}
        <section className="py-20 sm:py-28 border-t border-zinc-800 bg-black font-sans">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
              Ready to turn your domain into qualified meetings?
            </h2>
            <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
              Join founders scaling predictable outbound pipeline with zero monthly subscription fees and zero technical setup.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-none h-12 px-8 bg-white hover:bg-zinc-200 text-black font-semibold text-xs border border-white gap-2 w-full sm:w-auto shadow-none"
              >
                <Link href="/signup">
                  Launch Free GTM Engine <ArrowRight className="size-4 ml-1" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-none h-12 px-7 border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white hover:border-zinc-700 text-xs font-semibold w-full sm:w-auto shadow-none"
              >
                <Link href="/login">
                  Sign In to Mission Control
                </Link>
              </Button>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono pt-2">
              $0 platform fee · 10.2M verified leads · 5¢ per sent email
            </p>
          </div>
        </section>
      </main>

      {/* Modern Minimalist Footer */}
      <footer className="border-t border-zinc-800 bg-[#030303] py-10 font-sans text-xs text-zinc-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-300">AutoGTM</span>
            <span>·</span>
            <span>The $0/Month Autonomous Outbound Engine</span>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/impressum" className="hover:text-white transition-colors">Impressum</Link>
            <Link href="/remove-my-info" className="hover:text-white transition-colors">Opt-Out / Remove Info</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
