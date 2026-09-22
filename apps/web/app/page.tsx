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
  title: "SmartReach · High-Deliverability Cold Email Platform",
  description:
    "The multi-million-dollar cold email engine. Unlimited sender rotation, RFC822 quoted threading, 25k CSV lead pipelines, and AI spintax. 100% Free Forever.",
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
              Live Engine
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
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur-md mb-6 animate-pulse">
              <Sparkles className="size-3.5" />
              <span>Cold Email Reimagined · 100% Free Forever</span>
            </div>

            {/* Main Headline */}
            <h1 className="mx-auto max-w-5xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl leading-[1.08]">
              Scale cold outreach without paying{" "}
              <span className="bg-gradient-to-r from-primary via-info to-cyan-400 bg-clip-text text-transparent">
                thousands a year
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg lg:text-xl">
              Unlimited mailbox rotation, authentic RFC822 quoted reply threading, humanized warm-up
              throttling, and 25k lead CSV ingest. Built for founders, agencies, and sales teams who
              refuse to compromise.
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
                    Claim Free Account <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
              <a
                href="#showcase"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-border/80 bg-card/60 px-6 text-sm font-medium text-foreground backdrop-blur-md transition-colors hover:bg-accent hover:border-border"
              >
                Explore Live Demo
              </a>
            </div>

            {/* Value Proof Badges */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>$0/month forever</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>Unlimited mailboxes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>Full RFC822 reply quoting</span>
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
                Engineered for High Deliverability
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                Everything required to land in the Primary inbox
              </p>
              <p className="mt-3 text-muted-foreground text-sm sm:text-base">
                No gimmicks. Every layer is built directly upon Internet email standards for maximum
                sender reputation and inbox placement.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Bento 1: Sender Rotation */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 mb-4">
                  <Mail className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Multi-Inbox Smart Rotation
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Connect dozens of Google Workspace, Office 365, and custom SMTP inboxes. The
                  scheduler intelligently cycles senders, respects daily rate limits, and randomizes
                  send pacing.
                </p>
              </div>

              {/* Bento 2: Full Quoted Threading */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-4">
                  <Inbox className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  RFC822 Quoted Email Replies
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Unlike basic chat boxes, SmartReach includes full recipient headers, sender
                  selection, and persistent quoted thread histories with proper In-Reply-To headers.
                </p>
              </div>

              {/* Bento 3: 25k Lead Import */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4">
                  <Users className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  25,000+ Lead Bulk Ingestion
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Upload massive CSV contact files in seconds. SmartReach chunks uploads into smooth
                  background batches with live progress indicators and automatic column mapping.
                </p>
              </div>

              {/* Bento 4: Sequence Wizard */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 mb-4">
                  <Rocket className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Multi-Stage Follow-Up Sequences
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Automate step 2, step 3, and step 4 with customized delay schedules. The engine
                  automatically freezes follow-ups the millisecond a lead replies.
                </p>
              </div>

              {/* Bento 5: Humanized Pacing */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-4">
                  <Flame className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Human Pacing & Jitter
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Spam algorithms flag robotic bursts. SmartReach introduces randomized inter-send
                  delays (120–300s) to mirror authentic human typing behavior.
                </p>
              </div>

              {/* Bento 6: Analytics Trajectory */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-border hover:bg-card/80">
                <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-4">
                  <BarChart3 className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Deduplicated Conversion Analytics
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Bézier spline delivery trajectories with accurate unique lead reply counts.
                  Discrepancy-free metrics you can present directly to stakeholders.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison Table Section */}
        <section id="comparison" className="py-20 border-t border-border/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
                Uncompromising Value
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                Why pay $100+/month for standard cold email?
              </p>
              <p className="mt-3 text-muted-foreground text-sm sm:text-base">
                See how SmartReach compares against legacy paid cold email tools.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40 backdrop-blur">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-card/80">
                    <th className="p-4 sm:p-5 font-semibold text-foreground">Feature</th>
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
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">$0 Forever</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">$97 / mo</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">$94 / mo</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">$119 / mo</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Mailboxes Allowed</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Unlimited</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Unlimited</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Unlimited</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">3 included</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Leads Upload Limit</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Unlimited (25k+ chunks)</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">25,000</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">30,000</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">10,000</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">RFC822 Quoted Email Replies</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Yes (Full History)</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Partial</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Partial</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">Yes</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-medium">Sender Rotation & Warmup Throttling</td>
                    <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-primary/5">Included</td>
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
                Transparent & Honest
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl text-foreground">
                $0 / month · Free Forever
              </p>
              <p className="mt-4 text-muted-foreground text-sm sm:text-base">
                Unlimited inboxes. Unlimited leads. Unlimited campaigns. Unlimited replies.
              </p>
            </div>

            {/* Single Giant Ultra-Tier Plan Card */}
            <div className="mx-auto max-w-3xl rounded-3xl border-2 border-primary/40 bg-card/80 p-8 sm:p-12 shadow-2xl backdrop-blur relative overflow-hidden">
              <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 border-b border-border/60 pb-8">
                <div>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 mb-2">
                    Open Access Edition
                  </Badge>
                  <h3 className="text-2xl font-bold text-foreground">Community Unlimited</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Everything you need to launch, scale, and close deals.
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-extrabold tracking-tight text-foreground">$0</span>
                    <span className="text-muted-foreground text-sm font-medium">/ month</span>
                  </div>
                  <p className="text-xs text-emerald-400 font-medium mt-1">Free forever · No credit card</p>
                </div>
              </div>

              {/* Feature Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-8">
                {[
                  "Unlimited email sender accounts",
                  "Unlimited lead contact storage",
                  "Unlimited automated follow-up sequences",
                  "Unlimited campaign launches",
                  "Full RFC822 quoted thread UniBox",
                  "Smart mailbox rotation & rate pacing",
                  "25,000+ CSV lead bulk ingestion",
                  "Real-time deliverability trajectory stats",
                  "Stop-on-reply automatic safeguards",
                  "Zero hidden usage fees or markups",
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
                  Instant activation in 60 seconds · Keep 100% of your sender data private
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
                  q: "Why is SmartReach completely $0 and free forever?",
                  a: "Most cold email tools charge high monthly subscription fees for basic SMTP relays and database rows. SmartReach is engineered on modern serverless architecture with ultra-efficient resource utilization, allowing us to offer the core engine for free without price gouging.",
                },
                {
                  q: "Can I connect my Google Workspace or Office 365 accounts?",
                  a: "Yes! You can connect standard SMTP/IMAP credentials from Google Workspace, Microsoft 365, Zoho Mail, Fastmail, or any custom email server. SmartReach rotates between them seamlessly.",
                },
                {
                  q: "How does the reply detection work?",
                  a: "Our engine checks your incoming IMAP mailboxes continuously. When a recipient replies to your outreach, the system marks the lead as 'Replied', halts all future sequence follow-ups instantly, and routes the full quoted thread into your UniBox.",
                },
                {
                  q: "What is the maximum number of leads I can import?",
                  a: "You can import CSV files with 25,000+ leads in a single go. Our chunking pipeline splits large CSVs into optimized background batches to guarantee your browser doesn't freeze or drop rows.",
                },
                {
                  q: "Do you insert open or click tracking pixels that hurt deliverability?",
                  a: "SmartReach is built for maximum deliverability. Pixel trackers and link redirects trigger modern spam filters (Google Spam Guard, Microsoft Defender). We prioritize text-clean deliverability so your emails land directly in the primary inbox.",
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

        {/* Final High-Converting CTA Banner */}
        <section className="py-20 border-t border-border/40 relative overflow-hidden bg-gradient-to-b from-card/40 to-background">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
              Ready to send cold emails that actually convert?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
              Join thousands of outreach specialists sending high-deliverability campaigns with zero monthly fees.
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
          <div className="flex items-center gap-3">
            <Logo compact />
            <span>© {new Date().getFullYear()} SmartReach Inc. All rights reserved.</span>
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
