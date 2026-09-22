import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
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
  Users,
  X,
  Zap,
} from "lucide-react";
import { Badge, Button } from "@smartreach/ui";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/session";
import { InteractiveShowcase } from "@/components/landing/interactive-showcase";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SmartReach · 100% Free & Open Source Cold Email Platform",
  description:
    "Cold email with zero limits. Unlimited mailboxes, automated multi-step sequences, unified two-way inbox, and deliverability protection. 100% Free Forever & Open Source.",
};

export default async function LandingPage() {
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* Dynamic Ambient Background Glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[300px] left-1/2 -translate-x-1/2 size-[800px] rounded-full bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-3xl" />
        <div className="absolute top-[800px] -left-[200px] size-[600px] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-[1600px] -right-[200px] size-[700px] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      {/* Top Header Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-muted-foreground">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#showcase" className="transition-colors hover:text-foreground">
              Interactive Demo
            </a>
            <a href="#comparison" className="transition-colors hover:text-foreground">
              Compare
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing ($0)
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Button asChild size="sm" className="shadow-md shadow-primary/20 gap-1.5 font-semibold">
                <Link href="/dashboard">
                  Open App <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/40"
                >
                  Sign in
                </Link>
                <Button asChild size="sm" className="shadow-md shadow-primary/25 gap-1.5 font-semibold">
                  <Link href="/signup">
                    Start Free Forever <ArrowRight className="size-3.5" />
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
            {/* Pill Banner */}
            <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold text-foreground backdrop-blur-md mb-6 shadow-xs">
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="text-sm">🇩🇪</span> Made in Germany
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-primary font-medium">100% EU Hosted</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-emerald-400 font-medium">100% Free Forever & Open Source</span>
            </div>

            {/* Main Headline */}
            <h1 className="mx-auto max-w-5xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl leading-[1.08]">
              Cold Email Software That’s Completely Free.{" "}
              <span className="bg-gradient-to-r from-primary via-info to-cyan-400 bg-clip-text text-transparent">
                Unlimited Mailboxes. Zero Limits.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mt-6 max-w-3xl text-pretty text-base text-muted-foreground sm:text-lg lg:text-xl">
              Connect unlimited sender inboxes, automate high-converting multi-step sequences, manage all prospect replies in one unified inbox, and scale outbound pipeline without expensive monthly subscriptions.
            </p>

            {/* Call to Actions */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              {isLoggedIn ? (
                <Button asChild size="lg" className="h-12 px-8 text-sm font-semibold shadow-xl shadow-primary/30 gap-2">
                  <Link href="/dashboard">
                    Go to Your Dashboard <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" className="h-12 px-8 text-sm font-semibold shadow-xl shadow-primary/30 gap-2">
                  <Link href="/signup">
                    Get Started Free in 60 Seconds <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
              <a
                href="#showcase"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-border/80 bg-card/60 px-6 text-sm font-medium text-foreground backdrop-blur-md transition-colors hover:bg-accent hover:border-border"
              >
                Explore Interactive Demo
              </a>
            </div>

            {/* Value Proof Badges */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="text-sm">🇩🇪</span>
                <span>Made in Germany · EU Hosted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>$0/month forever</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>100% Open source</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>Unlimited mailboxes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>GDPR compliant by design</span>
              </div>
            </div>

            {/* Interactive Live Engine Showcase */}
            <div id="showcase" className="pt-10">
              <InteractiveShowcase />
            </div>
          </div>
        </section>

        {/* Feature Bento Grid */}
        <section id="features" className="py-20 border-t border-border/40 bg-card/20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
                Built for High Deliverability & Conversions
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                Everything required to land directly in the Primary inbox
              </p>
              <p className="mt-3 text-muted-foreground text-sm sm:text-base">
                Professional cold email infrastructure designed to protect your sender reputation, maximize open rates, and book meetings.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Bento 1: Sender Rotation */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 mb-4">
                  <Mail className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Unlimited Mailbox Smart Rotation
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Connect Google Workspace, Microsoft 365, or any custom mailboxes. SmartReach automatically cycles through accounts to spread sending volume safely and protect inbox health.
                </p>
              </div>

              {/* Bento 2: Unified Two-Way Inbox */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-4">
                  <Inbox className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Unified Two-Way Inbox (UniBox)
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Manage prospect conversations across all your inboxes in one central place. Reply with preserved email threads, add tags (Interested, Booked, Out of Office), and never miss a lead.
                </p>
              </div>

              {/* Bento 3: Lead Lists */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4">
                  <Users className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Unlimited Lead Lists & Contacts
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Upload your target audience with instant CSV importing, automatic column mapping, and automatic duplicate detection. No contact caps or paywalls.
                </p>
              </div>

              {/* Bento 4: Multi-Step Sequences */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 mb-4">
                  <Rocket className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Automated Multi-Stage Follow-Ups
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Schedule multi-touch follow-up campaigns with customizable day delays and A/B test variations. Automatically stops follow-ups the moment a prospect replies.
                </p>
              </div>

              {/* Bento 5: Human Rhythm & Pacing */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-4">
                  <Flame className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Natural Humanized Pacing
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Spam filters penalize robotic blast spikes. SmartReach uses randomized intervals, daily mailbox sending caps, and custom business hours to ensure your outreach mimics real human activity.
                </p>
              </div>

              {/* Bento 6: Real-Time Analytics */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-4">
                  <BarChart3 className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Actionable Conversion Analytics
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Interactive trajectory charts, delivery velocity tracking, and genuine lead reply rates give you full transparency into what messaging generates pipeline.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Made in Germany & EU Hosted Highlight Section */}
        <section className="py-16 border-t border-border/40 bg-gradient-to-r from-amber-500/5 via-card/50 to-primary/5">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border/80 bg-card/70 p-8 sm:p-12 shadow-xl backdrop-blur relative overflow-hidden">
              <div className="pointer-events-none absolute -right-16 -bottom-16 size-72 rounded-full bg-amber-500/10 blur-3xl" />
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-400 mb-3 shadow-xs">
                    <span className="text-sm">🇩🇪</span>
                    <span>MADE IN GERMANY · EU HOSTED & SECURE</span>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                    Engineered with German Precision.{" "}
                    <span className="bg-gradient-to-r from-amber-400 via-primary to-cyan-400 bg-clip-text text-transparent">
                      100% EU Hosted.
                    </span>
                  </h2>
                  <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">
                    Forget US-based cold email tools subject to foreign surveillance and data resale. SmartReach is proudly engineered with German standards and hosted entirely on sovereign European cloud infrastructure. Complete GDPR compliance, native privacy protection, zero third-party telemetry, and absolute security for your company and lead data.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full lg:w-auto shrink-0">
                  <div className="rounded-xl border border-border/60 bg-background/60 p-4 min-w-[200px]">
                    <div className="text-xs text-muted-foreground font-medium">Server Jurisdiction</div>
                    <div className="mt-1 text-sm font-bold text-foreground flex items-center gap-1.5">
                      <span>🇩🇪 Frankfurt, Germany</span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-400">100% EU cloud infrastructure</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/60 p-4 min-w-[200px]">
                    <div className="text-xs text-muted-foreground font-medium">Privacy Protection</div>
                    <div className="mt-1 text-sm font-bold text-foreground flex items-center gap-1.5">
                      <span>🛡️ Strict EU GDPR</span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-400">Zero data selling or profiling</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/60 p-4 min-w-[200px]">
                    <div className="text-xs text-muted-foreground font-medium">Credential Security</div>
                    <div className="mt-1 text-sm font-bold text-foreground flex items-center gap-1.5">
                      <span>🔒 AES-256 GCM</span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-400">Encrypted at rest in the EU</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/60 p-4 min-w-[200px]">
                    <div className="text-xs text-muted-foreground font-medium">Code Transparency</div>
                    <div className="mt-1 text-sm font-bold text-foreground flex items-center gap-1.5">
                      <span>⚡ Open Source</span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-400">100% auditable codebase</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison Table Section */}
        <section id="comparison" className="py-20 border-t border-border/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
                Unbeatable Freedom
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                Why pay $100+ every month for cold email?
              </p>
              <p className="mt-3 text-muted-foreground text-sm sm:text-base">
                Compare SmartReach against typical closed, proprietary cold outreach subscriptions.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40 backdrop-blur">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-card/80">
                    <th className="p-4 sm:p-5 font-semibold text-foreground">Outreach Capability</th>
                    <th className="p-4 sm:p-5 font-bold text-primary bg-primary/10">
                      SmartReach
                    </th>
                    <th className="p-4 sm:p-5 font-semibold text-muted-foreground">Instantly</th>
                    <th className="p-4 sm:p-5 font-semibold text-muted-foreground">Smartlead</th>
                    <th className="p-4 sm:p-5 font-semibold text-muted-foreground">Lemlist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Monthly Cost</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">$0 Free Forever</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">$97 / mo</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">$94 / mo</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">$119 / mo</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Hosting & Jurisdiction</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">🇩🇪 Made in Germany · EU Hosted</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">US Cloud</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">US Cloud</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Proprietary Cloud</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Mailboxes & Senders Allowed</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Unlimited</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Unlimited</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Unlimited</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">3 included</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Lead & Contact Storage</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Unlimited (No paywalls)</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">25,000 max</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">30,000 max</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">10,000 max</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Unified Inbox (UniBox)</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Included Standard</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Limited</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Limited</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Included</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Multi-Step Follow-Up Sequences</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Included Standard</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Included</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Included</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Included</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Automatic Stop on Reply</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Instant</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Yes</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Yes</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Yes</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Platform Architecture</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">100% Open Source</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Closed SaaS</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Closed SaaS</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Closed SaaS</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Pricing Section ($0 Free Forever Unlimited) */}
        <section id="pricing" className="py-20 border-t border-border/40 bg-gradient-to-b from-card/30 via-background to-card/20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Simple & Honest Pricing
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl text-foreground">
                $0 / month · Free Forever
              </p>
              <p className="mt-4 text-muted-foreground text-sm sm:text-base">
                Unlimited inboxes. Unlimited leads. Unlimited sequences. Zero artificial restrictions.
              </p>
            </div>

            {/* Single Giant Plan Card */}
            <div className="mx-auto max-w-3xl rounded-3xl border-2 border-primary/40 bg-card/80 p-8 sm:p-12 shadow-2xl backdrop-blur relative overflow-hidden">
              <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 border-b border-border/60 pb-8">
                <div>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 mb-2">
                    Open Source Edition
                  </Badge>
                  <h3 className="text-2xl font-bold text-foreground">Unlimited Access</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Everything you need to launch, scale outbound sales, and close deals.
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-extrabold tracking-tight text-foreground">$0</span>
                    <span className="text-muted-foreground text-sm font-medium">/ month</span>
                  </div>
                  <p className="text-xs text-emerald-400 font-medium mt-1">Free forever · No credit card required</p>
                </div>
              </div>

              {/* Feature Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-8">
                {[
                  "Unlimited email sender inboxes",
                  "Unlimited lead & contact storage",
                  "Unlimited automated follow-up sequences",
                  "Unlimited campaign launches & scheduling",
                  "Unified two-way inbox (UniBox)",
                  "Smart mailbox rotation & rate pacing",
                  "Automatic stop-on-reply protection",
                  "Real-time deliverability & reply stats",
                  "100% Open source with zero lock-in",
                  "Zero hidden subscription fees or markups",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2.5 text-xs text-foreground">
                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      <Check className="size-3 stroke-[2.5]" />
                    </div>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-border/60">
                {isLoggedIn ? (
                  <Button asChild size="lg" className="w-full h-12 text-sm font-semibold shadow-xl shadow-primary/25">
                    <Link href="/dashboard">
                      Access Your Dashboard <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" className="w-full h-12 text-sm font-semibold shadow-xl shadow-primary/25">
                    <Link href="/signup">
                      Get Started Free Today <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )}
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Instant activation in 60 seconds · You retain 100% control of your data and credentials
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-20 border-t border-border/40">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
                Got Questions?
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                Frequently Asked Questions
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: "Is SmartReach really 100% free forever?",
                  a: "Yes, absolutely. SmartReach is an open source platform built to give founders and sales teams access to professional cold outreach without paying exorbitant monthly fees. You connect your own mailboxes, and the entire engine is yours to use with zero cost.",
                },
                {
                  q: "Can I connect Google Workspace and Microsoft 365 inboxes?",
                  a: "Yes! You can connect standard SMTP and IMAP credentials from Google Workspace, Microsoft 365, Zoho Mail, Fastmail, or any custom mail server. SmartReach smoothly rotates sending across all of them.",
                },
                {
                  q: "How does the reply detection work?",
                  a: "SmartReach checks your incoming mailboxes automatically. As soon as a prospect replies, their campaign status is updated to 'Replied', future follow-ups are frozen immediately, and the full thread appears in your UniBox for you to respond.",
                },
                {
                  q: "Is there a limit on how many leads I can upload?",
                  a: "No! There are no artificial paywalls or lead caps. You can import extensive CSV lists with your prospect contacts, map custom attributes, and launch targeted outreach seamlessly.",
                },
                {
                  q: "How does SmartReach protect email deliverability?",
                  a: "By distributing outreach across multiple sender accounts, randomizing intervals between sends, respecting human working hours, and maintaining clean deliverability standards so your emails land right in the primary inbox.",
                },
              ].map((faq, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/60 bg-card/40 p-5 backdrop-blur"
                >
                  <p className="text-sm font-semibold text-foreground">{faq.q}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Banner */}
        <section className="py-20 border-t border-border/40 relative overflow-hidden bg-gradient-to-b from-card/40 to-background">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
              Ready to send cold emails that actually convert?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
              Join founders and growth teams scaling their outbound pipeline with zero monthly subscription fees.
            </p>
            <div className="mt-8 flex justify-center">
              {isLoggedIn ? (
                <Button asChild size="lg" className="h-12 px-8 text-sm font-semibold shadow-2xl shadow-primary/30 gap-2">
                  <Link href="/dashboard">
                    Go to Dashboard <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" className="h-12 px-8 text-sm font-semibold shadow-2xl shadow-primary/30 gap-2">
                  <Link href="/signup">
                    Start Sending Free Forever <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10 bg-card/20">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Logo compact />
            <span>© {new Date().getFullYear()} SmartReach.</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-foreground shadow-xs">
              <span className="text-xs">🇩🇪</span> Made in Germany · 100% EU Hosted
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#comparison" className="hover:text-foreground transition-colors">
              Compare
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing ($0)
            </a>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
