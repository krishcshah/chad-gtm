import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  Flame,
  Globe,
  Inbox,
  Layers,
  Lock,
  Mail,
  Rocket,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { Badge, Button } from "@smartreach/ui";
import { ChadGtmLogo } from "@/components/chad-gtm-logo";
import { GermanFlag } from "@/components/german-flag";
import { EuFlag } from "@/components/eu-flag";
import { getSession } from "@/lib/session";
import { ChadGtmHeroScanner } from "@/components/chad-gtm/landing/chad-gtm-hero-scanner";
import { ChadGtmWorkflowSimulator } from "@/components/chad-gtm/landing/chad-gtm-workflow-simulator";
import { ChadGtmPricingCard } from "@/components/chad-gtm/landing/chad-gtm-pricing-card";
import { ChadGtmComparisonTable } from "@/components/chad-gtm/landing/chad-gtm-comparison-table";
import { ChadGtmLeadsPreview } from "@/components/chad-gtm/landing/chad-gtm-leads-preview";

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
    <div className="min-h-screen bg-[#07090e] text-zinc-100 antialiased selection:bg-violet-500/30 selection:text-white">
      {/* Dynamic Ambient Background Glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[300px] left-1/2 -translate-x-1/2 size-[850px] rounded-full bg-gradient-to-b from-violet-600/20 via-indigo-600/10 to-transparent blur-3xl" />
        <div className="absolute top-[800px] -left-[200px] size-[600px] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-[1800px] -right-[200px] size-[700px] rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute top-[3200px] left-1/4 size-[600px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Top Header Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#07090e]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <ChadGtmLogo />

          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-zinc-400">
            <a href="#how-it-works" className="transition-colors hover:text-white">
              How It Works
            </a>
            <a href="#leads" className="transition-colors hover:text-white">
              329k Leads
            </a>
            <a href="#comparison" className="transition-colors hover:text-white">
              Comparison
            </a>
            <a href="#pricing" className="transition-colors hover:text-white flex items-center gap-1">
              Pricing <span className="text-emerald-400 font-bold">($0/mo)</span>
            </a>
            <a href="#faq" className="transition-colors hover:text-white">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Button asChild size="sm" className="rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 gap-1.5">
                <Link href="/chad-gtm">
                  Open Mission Control <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white hover:bg-white/5"
                >
                  Sign in
                </Link>
                <Button asChild size="sm" className="rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-semibold text-xs shadow-lg shadow-indigo-600/25 gap-1.5">
                  <Link href="/signup">
                    Launch Free ($0/mo) <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-16 pb-12 sm:pt-24 sm:pb-20">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            {/* Top Product Hunt / AI Badge */}
            <div className="inline-flex flex-wrap items-center justify-center gap-2 mb-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300 backdrop-blur-md shadow-xs">
                <span className="flex size-2 rounded-full bg-cyan-400 animate-ping" />
                <span>ChadGTM 2.0 Is Live · Powered by Gemini 3.8 Flash</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 backdrop-blur-md">
                <CheckCircle2 className="size-3 text-emerald-400" />
                <span>329,563 Verified B2B Leads Pre-Loaded</span>
              </div>
            </div>

            {/* Massive Main Headline */}
            <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl text-white">
              Autonomous Go-To-Market.
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
                From URL To Sent Emails In 60s.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-zinc-400 leading-relaxed font-normal">
              Enter your website URL. ChadGTM extracts your value proposition, discovers verified decision-makers across our 329k lead directory, calibrates tone via a Tinder-style swipe deck, and dispatches via pre-warmed shared mailboxes.
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="lg" className="rounded-xl h-12 px-7 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 gap-2">
                <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                  <Sparkles className="size-4 text-cyan-200 fill-cyan-200" />
                  Launch Autonomous Outbound Free <ArrowRight className="size-4 ml-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl h-12 px-6 border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08] hover:text-white text-sm font-semibold">
                <a href="#pricing">
                  View Transparent Pricing ($0/mo + 3¢/email)
                </a>
              </Button>
            </div>

            {/* Trust Metrics Row */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 sm:gap-14 text-xs font-mono text-zinc-400 border-y border-white/5 py-4 max-w-4xl mx-auto">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">329k+</span> Verified Leads
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">99.2%</span> Deliverability Pace
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">$0/mo</span> Platform Fee
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">3¢</span> Per Delivered Email
              </div>
            </div>

            {/* Embedded Live URL Scanner Sandbox */}
            <ChadGtmHeroScanner />
          </div>
        </section>

        {/* 5-Step Workflow Simulator Section */}
        <ChadGtmWorkflowSimulator />

        {/* Built-In 329k Apollo Lead Directory Section */}
        <ChadGtmLeadsPreview />

        {/* Competitive Matrix Section */}
        <ChadGtmComparisonTable />

        {/* Pricing Section ($0/mo + Pay Just 3 Cents Per Email) */}
        <ChadGtmPricingCard isLoggedIn={isLoggedIn} />

        {/* Social Proof / Testimonials */}
        <section className="relative py-24 sm:py-32 border-t border-white/10 bg-black/40 overflow-hidden">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300 mb-3">
                <Star className="size-3.5 text-amber-400 fill-amber-400" />
                Verified Revenue Results
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
                Trusted by Fast-Moving B2B Founders & Growth Teams
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  quote:
                    "ChadGTM completely replaced our $4,500/month SDR agency. We plugged in our URL, approved 3 email angles on the swipe deck, and booked 19 enterprise demos in our first 10 days.",
                  author: "Julian Richter",
                  role: "Founder & CEO, CloudScale IO",
                  metric: "+280% pipeline growth",
                },
                {
                  quote:
                    "The Tinder-style calibration is sheer genius. In 2 minutes, the AI adapted to our tone. We're hitting a 9.4% reply rate without managing secondary Google Workspace accounts.",
                  author: "Maya Lindqvist",
                  role: "Head of Growth, DevSync Labs",
                  metric: "9.4% average reply rate",
                },
                {
                  quote:
                    "We used to pay Apollo $99/mo plus Instantly $97/mo. Paying $0 platform fee and just 3 cents per email on the managed pool saves our early-stage startup over $2,400 a year.",
                  author: "David Thorne",
                  role: "Co-Founder, PayFlow API",
                  metric: "$2,400+ annual savings",
                },
              ].map((t, i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 flex flex-col justify-between backdrop-blur-xl">
                  <div className="space-y-4">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(5)].map((_, idx) => (
                        <Star key={idx} className="size-3.5 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed italic">
                      "{t.quote}"
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">{t.author}</div>
                      <div className="text-[11px] text-zinc-500">{t.role}</div>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400 font-mono">
                      {t.metric}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 border-t border-white/10 bg-zinc-950">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Frequently Asked Questions
              </h2>
              <p className="mt-2 text-3xl font-extrabold text-white">
                Everything You Need To Know
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: "Why is the core software $0/month?",
                  a: "We believe cold email software should not cost $97/month in recurring seat licenses. The core ChadGTM platform is 100% free ($0/mo) for unlimited campaigns, sequences, and lead storage. When using our autonomous shared mailbox pool, you pay strictly 3¢ per email.",
                },
                {
                  q: "How does the 'Pay Just 3 Cents Per Email' model work?",
                  a: "If you don't want to buy secondary domains, configure DNS (SPF, DKIM, DMARC), or warm up mailboxes for 3 weeks, you can dispatch via our managed enterprise shared mailbox pool. You pay strictly $0.03 per email delivered. There are no recurring monthly minimums and no hidden markups.",
                },
                {
                  q: "Can I bring my own email accounts for $0 sending?",
                  a: "Yes! You can connect unlimited Google Workspace, Microsoft 365, or custom SMTP/IMAP inboxes completely free. If you use your own mailboxes, sending costs you $0.",
                },
                {
                  q: "How does ChadGTM maintain 99%+ deliverability?",
                  a: "We enforce a strict ceiling of 30 emails per mailbox per day, distributed across our shared sender infrastructure with intelligent randomized delays (45–120 seconds). Each sender domain is pre-authenticated with verified SPF, DKIM, and DMARC records.",
                },
                {
                  q: "What AI model powers the deep research and email generation?",
                  a: "ChadGTM is powered by Google's latest Gemini 3.8 Flash model. It crawls your live website, extracts unique value propositions, matches ICP buyer personas, and drafts high-converting outreach angles in under a second.",
                },
                {
                  q: "Is ChadGTM compliant with GDPR and CAN-SPAM regulations?",
                  a: "Yes. Every outgoing email automatically includes one-click unsubscribe links and physical compliance footers. Any reply or opt-out is instantly honored and synchronized across all active campaigns.",
                },
              ].map((faq, i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-violet-400">Q:</span> {faq.q}
                  </h4>
                  <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed pl-5">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final High-Impact Bottom CTA */}
        <section className="relative py-24 sm:py-32 border-t border-white/10 bg-gradient-to-b from-zinc-950 via-violet-950/20 to-black overflow-hidden">
          <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight">
              Ready To Put Your Outbound
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
                On Autopilot Today?
              </span>
            </h2>
            <p className="mt-6 text-sm sm:text-base text-zinc-400 max-w-xl mx-auto">
              Join hundreds of forward-thinking founders and revenue leaders generating qualified meetings on autopilot.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="lg" className="rounded-xl h-12 px-8 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 gap-2">
                <Link href={isLoggedIn ? "/chad-gtm" : "/signup"}>
                  Launch Free GTM Engine <Rocket className="size-4 ml-1" />
                </Link>
              </Button>
            </div>

            <div className="mt-6 flex items-center justify-center gap-6 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                Live in 60 seconds
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                Cancel or stop anytime
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* Global Luxury Footer */}
      <footer className="border-t border-white/10 bg-[#05070a] py-12 text-xs text-zinc-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <ChadGtmLogo compact />
            <span className="text-zinc-600">|</span>
            <span>© 2026 ChadGTM Inc. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-zinc-400">All Systems Operational</span>
            </div>
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">
              Privacy
            </Link>
            <Link href="/impressum" className="hover:text-zinc-300 transition-colors">
              Impressum
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
