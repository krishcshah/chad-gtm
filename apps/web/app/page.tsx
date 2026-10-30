import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileSearch,
  Gauge,
  Globe2,
  Inbox,
  Lock,
  Mail,
  MousePointerClick,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@smartreach/ui";
import { getSession } from "@/lib/session";
import { LandingHeader } from "@/components/chad-gtm/landing/landing-header";
import { ChadGtmHeroScanner } from "@/components/chad-gtm/landing/chad-gtm-hero-scanner";
import { ChadGtmCalculator } from "@/components/chad-gtm/landing/chad-gtm-calculator";
import { getDirectoryFacets, getDirectoryStats } from "@/lib/leads-directory";
import { getDb } from "@/lib/db";
import { schema } from "@smartreach/database";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AutoGTM — Turn One URL Into a Calibrated Outbound Engine",
  description:
    "AutoGTM studies your website, builds the ICP, finds verified buyers, writes the angles, and runs the sequence. $0/month platform, 5¢ per delivered email, 10.2M+ contacts.",
};

const FALLBACK_TOTAL_LEADS = 10_227_232;

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
      <span className="size-1.5 bg-emerald-400" />
      {children}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={
        align === "center"
          ? "mx-auto max-w-3xl text-center space-y-4"
          : "max-w-3xl space-y-4"
      }
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="text-sm leading-relaxed text-zinc-400 sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function Stat({
  value,
  label,
  detail,
}: {
  value: React.ReactNode;
  label: string;
  detail?: string;
}) {
  return (
    <div className="border border-zinc-800/80 bg-zinc-950/80 p-5">
      <div className="font-mono text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      {detail ? <p className="mt-2 text-xs text-zinc-400">{detail}</p> : null}
    </div>
  );
}

function FeatureCard({
  step,
  title,
  description,
  icon: Icon,
}: {
  step: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="group relative border border-zinc-800/80 bg-zinc-950/70 p-6 transition-colors hover:border-zinc-600">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {step}
        </span>
        <Icon className="size-4 text-zinc-500 transition-colors group-hover:text-emerald-400" />
      </div>
      <h3 className="mt-6 text-base font-semibold tracking-tight text-white">
        {title}
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">
        {description}
      </p>
    </div>
  );
}

export default async function LandingPage() {
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);

  let totalLeads = FALLBACK_TOTAL_LEADS;
  let distinctIndustries = 200;
  let distinctCountries = 716;
  let topIndustries: Array<{ value: string; label: string; count: number }> = [];
  let activeMailboxes = 11;

  try {
    const facets = getDirectoryFacets();
    const stats = getDirectoryStats();
    totalLeads = facets.totalLeads || stats.totalLeads || FALLBACK_TOTAL_LEADS;
    distinctIndustries = stats.distinctIndustries || distinctIndustries;
    distinctCountries = stats.distinctCountries || distinctCountries;
    topIndustries = facets.industries.slice(0, 12);
  } catch {
    // The landing page must render even if the directory is temporarily locked.
  }

  try {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.senderAccounts)
      .where(
        and(
          eq(schema.senderAccounts.isSystemPool, true),
          eq(schema.senderAccounts.status, "active"),
          isNull(schema.senderAccounts.deletedAt)
        )
      );
    activeMailboxes = Number(row?.count ?? activeMailboxes);
  } catch {
    // Keep the known production fallback; this is display-only.
  }

  const primaryHref = isLoggedIn ? "/chad-gtm" : "/signup";

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 antialiased selection:bg-white selection:text-black">
      <LandingHeader isLoggedIn={isLoggedIn} />

      <main>
        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-zinc-800/80">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-[size:64px_64px] opacity-[0.18]" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 bg-gradient-to-b from-emerald-500/[0.08] via-cyan-500/[0.03] to-transparent blur-3xl" />

          <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 sm:pb-28 sm:pt-14 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <span className="flex items-center gap-2">
                <span className="size-1.5 animate-pulse bg-emerald-400" />
                <span className="text-zinc-300">Human-calibrated · machine-executed</span>
              </span>
              <span className="hidden sm:inline">
                $0/mo platform · 5¢ per delivered email
              </span>
            </div>

            <div className="mx-auto mt-14 max-w-4xl space-y-6 text-center sm:mt-20">
              <div className="inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-950/20 px-3.5 py-1 font-mono text-[11px] text-emerald-400">
                <Sparkles className="size-3" />
                <span className="font-semibold text-white">AutoGTM</span>
                <span className="text-zinc-600">/</span>
                <span>The outbound engine for one-person GTM teams</span>
              </div>

              <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Your website is the brief.
                <br />
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                  We run the outbound.
                </span>
              </h1>

              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-lg">
                AutoGTM studies your site, builds the ICP, finds real buyers, writes
                the angles, and runs the sequence. You approve the voice. It handles
                the rest.
              </p>

              <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="h-12 w-full gap-2 rounded-none border border-white bg-white px-7 text-xs font-semibold text-black shadow-none transition-all hover:bg-zinc-200 active:translate-y-[1px] sm:w-auto"
                >
                  <Link href={primaryHref}>
                    Analyze my website <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-12 w-full rounded-none border-zinc-800 bg-zinc-950 px-7 text-xs font-semibold text-zinc-300 shadow-none transition-colors hover:border-zinc-600 hover:bg-zinc-900 hover:text-white sm:w-auto"
                >
                  <Link href="#how-it-works">See how it works</Link>
                </Button>
              </div>

              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {formatNumber(totalLeads)} contacts · {activeMailboxes} shared mailboxes
                · 30/day cap · 45–120s jitter
              </p>
            </div>

            <div className="mt-12 sm:mt-16">
              <ChadGtmHeroScanner
                directoryTotal={totalLeads}
                isLoggedIn={isLoggedIn}
              />
            </div>
          </div>
        </section>

        {/* ── LIVE SYSTEM STRIP ────────────────────────────────────────── */}
        <section className="border-b border-zinc-800/80 bg-zinc-950/60">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-zinc-800/80 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            {[
              {
                value: formatNumber(totalLeads),
                label: "directory contacts",
              },
              {
                value: formatNumber(distinctIndustries),
                label: "curated industry facets",
              },
              {
                value: String(activeMailboxes),
                label: "admin-managed mailboxes",
              },
              {
                value: "30/day",
                label: "hard cap per mailbox",
              },
            ].map((item) => (
              <div key={item.label} className="px-4 py-5 sm:px-6">
                <div className="font-mono text-lg font-bold text-white sm:text-xl">
                  {item.value}
                </div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500 sm:text-[10px]">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── THE SHIFT ────────────────────────────────────────────────── */}
        <section className="border-b border-zinc-800/80 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <SectionHeading
                eyebrow="The shift"
                title={
                  <>
                    Outbound is not a
                    <br />
                    five-tool job anymore.
                  </>
                }
                description="Most early-stage teams stitch together a data vendor, a sending tool, a warmup service, an enrichment tool, and an agency retainer. The stack costs more than the first hire and still needs an operator."
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border border-rose-950/80 bg-zinc-950 p-5">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-rose-400">
                    The fragmented stack
                  </div>
                  <ul className="mt-4 space-y-3 text-xs text-zinc-400">
                    {[
                      "Lead data + export credits",
                      "Sending seats + inbox rental",
                      "DNS, domains, warmup",
                      "Enrichment credits",
                      "Agency / SDR retainer",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <X className="size-3.5 shrink-0 text-rose-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 border-t border-zinc-900 pt-3 font-mono text-[11px] text-rose-400">
                    Often $1,200+/mo before the first meeting
                  </div>
                </div>

                <div className="border border-emerald-900/70 bg-zinc-950 p-5">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                    The AutoGTM path
                  </div>
                  <ul className="mt-4 space-y-3 text-xs text-zinc-300">
                    {[
                      "One URL intake",
                      `Built-in ${formatNumber(totalLeads)} directory`,
                      "Agent-run research + copy",
                      "Shared mailbox dispatch",
                      "UniBox reply triage",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <Check className="size-3.5 shrink-0 text-emerald-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 border-t border-zinc-800 pt-3 font-mono text-[11px] text-emerald-400">
                    $0/mo + 5¢ per delivered email
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
        <section id="how-it-works" className="border-b border-zinc-800/80 bg-zinc-950/40 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="How it works"
              title="Four steps. One operator."
              description="You are not learning a campaign editor. You are approving a strategy and a voice, then watching the machine work."
            />

            <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                step="01 / Intake"
                title="Drop the URL"
                description="AutoGTM crawls your homepage, pricing, product pages, and proof. Static fetch first; headless Chromium when the site is client-rendered."
                icon={Globe2}
              />
              <FeatureCard
                step="02 / Strategy"
                title="Review the brief"
                description="You get a company summary, multi-persona ICP, three outbound angles, pricing intelligence, and proof points. Edit anything."
                icon={FileSearch}
              />
              <FeatureCard
                step="03 / Calibration"
                title="Swipe the voice"
                description="Approve or reject sample emails with reasons like too generic, too salesy, or wrong persona. The next cards adapt to your taste."
                icon={MousePointerClick}
              />
              <FeatureCard
                step="04 / Launch"
                title="Run and triage"
                description="Three touches, 30 emails per mailbox per day, 45–120s jitter, automatic stop on reply, and a UniBox for every response."
                icon={Send}
              />
            </div>
          </div>
        </section>

        {/* ── AGENT TRACE ──────────────────────────────────────────────── */}
        <section className="border-b border-zinc-800/80 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
              <SectionHeading
                eyebrow="No black box"
                title="You can see the work."
                description="Every run is a durable trace: each tool call, artifact, error, and timing. If the crawler misses a page or the model fails, you see exactly where. No mystery pipeline."
              />

              <div className="border border-zinc-800 bg-[#080808]">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    <Terminal className="size-3.5 text-emerald-400" />
                    Agent trace / gtm_analysis
                  </div>
                  <span className="border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                    completed
                  </span>
                </div>
                <div className="space-y-0 divide-y divide-zinc-900 font-mono text-[11px]">
                  {[
                    { seq: "01", tool: "crawl_company", time: "4.7s", note: "homepage + pricing + proof" },
                    { seq: "02", tool: "synthesize_strategy", time: "10.9s", note: "3 personas · 3 offers" },
                    { seq: "03", tool: "persist_gtm_run", time: "15ms", note: "strategy saved" },
                    { seq: "04", tool: "complete", time: "—", note: "ready for review" },
                  ].map((row) => (
                    <div key={row.seq} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-zinc-600">{row.seq}</span>
                      <span className="w-40 shrink-0 text-zinc-200">{row.tool}</span>
                      <span className="w-14 shrink-0 text-zinc-500">{row.time}</span>
                      <span className="truncate text-zinc-500">{row.note}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zinc-800 px-4 py-3 font-mono text-[10px] text-zinc-500">
                  Measured on a production analysis run. Timings vary by site.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── DIRECTORY ────────────────────────────────────────────────── */}
        <section id="directory" className="border-b border-zinc-800/80 bg-zinc-950/40 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
              <SectionHeading
                eyebrow="The directory"
                title={
                  <>
                    {formatNumber(totalLeads)} contacts.
                    <br />
                    Not a round number we invented.
                  </>
                }
                description="A local, indexed B2B directory. Search by industry, title, company, and location. No export credits, no per-seat data tax."
              />
              <Button
                asChild
                variant="outline"
                className="h-11 shrink-0 rounded-none border-zinc-700 bg-zinc-950 px-5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
              >
                <Link href="/b2b-database">
                  Browse the directory <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <Stat value={formatNumber(totalLeads)} label="contacts" detail="Indexed and searchable" />
              <Stat value={formatNumber(distinctIndustries)} label="industry facets" detail="Curated directory facets" />
              <Stat value={formatNumber(distinctCountries)} label="countries" detail="Location-aware filters" />
            </div>

            <div className="mt-8 border border-zinc-800/80 bg-zinc-950/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Top industries by count
                </span>
                <span className="font-mono text-[10px] text-zinc-600">
                  live from directory_facets_cache
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(topIndustries.length > 0
                  ? topIndustries
                  : [
                      { value: "Financial Services", label: "Financial Services", count: 13197 },
                      { value: "Computer Software", label: "Computer Software", count: 7054 },
                      { value: "Information Technology", label: "Information Technology", count: 5459 },
                    ]
                ).map((industry) => (
                  <span
                    key={industry.value}
                    className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-300"
                  >
                    {industry.label}
                    <span className="font-mono text-[10px] text-zinc-500">
                      {formatNumber(industry.count)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── DELIVERABILITY ──────────────────────────────────────────── */}
        <section id="deliverability" className="border-b border-zinc-800/80 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Deliverability"
              title="The boring parts are the product."
              description="Outbound dies on volume. AutoGTM is built around caps, jitter, suppression, and reply detection — not a bigger send button."
            />

            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Gauge,
                  title: "30/day hard cap",
                  body: "Per-mailbox daily ceiling enforced atomically at send time. Backlogs cannot breach it.",
                },
                {
                  icon: Workflow,
                  title: "45–120s jitter",
                  body: "Randomized spacing between sends. No machine-gun bursts, no duplicate content hashes.",
                },
                {
                  icon: ShieldCheck,
                  title: "RFC 8058 unsubscribe",
                  body: "One-click List-Unsubscribe headers on every send. Suppression is checked again at send time.",
                },
                {
                  icon: Inbox,
                  title: "Auto-stop on reply",
                  body: "IMAP sync pauses the sequence the moment a prospect replies. Quoted history is stripped.",
                },
                {
                  icon: Mail,
                  title: "Threaded follow-ups",
                  body: "In-Reply-To and References headers keep the three touches in one clean thread.",
                },
                {
                  icon: Lock,
                  title: "Workspace isolation",
                  body: "Leads, campaigns, mailboxes, and replies are scoped to the active workspace.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="border border-zinc-800/80 bg-zinc-950/70 p-5"
                >
                  <item.icon className="size-4 text-emerald-400" />
                  <h3 className="mt-4 text-sm font-semibold text-white">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{item.body}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              Admin-managed shared mailboxes · your root domain stays untouched · no DNS setup
            </p>
          </div>
        </section>

        {/* ── PRICING ─────────────────────────────────────────────────── */}
        <section id="pricing" className="border-b border-zinc-800/80 bg-zinc-950/50 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Pricing"
              title="$0/month. 5¢ per delivered email."
              description="No seats, no minimums, no annual contract. Pay for what you actually send, and pause whenever you want."
              align="center"
            />

            <div className="mx-auto mt-12 grid max-w-5xl gap-3 lg:grid-cols-2">
              <div className="border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
                <div className="flex items-baseline justify-between border-b border-zinc-800 pb-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                      Platform
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">Everything above the wire</div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold tracking-tight text-white">$0</div>
                    <div className="font-mono text-[10px] text-zinc-500">/ month</div>
                  </div>
                </div>
                <ul className="mt-5 space-y-3 text-xs text-zinc-300">
                  {[
                    "Company crawl + positioning brief",
                    "Multi-persona ICP and 3 angles",
                    `${formatNumber(totalLeads)} contact directory access`,
                    "Swipe voice calibration",
                    "Mission Control + UniBox",
                    "Workspace isolation",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border border-emerald-900/60 bg-zinc-950 p-6 sm:p-8">
                <div className="flex items-baseline justify-between border-b border-zinc-800 pb-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                      Delivery
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">Only when it leaves the wire</div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold tracking-tight text-white">5¢</div>
                    <div className="font-mono text-[10px] text-zinc-500">/ delivered email</div>
                  </div>
                </div>
                <ul className="mt-5 space-y-3 text-xs text-zinc-300">
                  {[
                    "Admin-managed shared mailboxes",
                    "30/day per-mailbox cap",
                    "45–120s randomized jitter",
                    "One-click unsubscribe + suppression",
                    "In-Reply-To threading",
                    "IMAP reply sync + auto-stop",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-6 h-11 w-full rounded-none border border-white bg-white text-xs font-semibold text-black hover:bg-zinc-200"
                >
                  <Link href={primaryHref}>
                    Start free <ArrowRight className="ml-1.5 size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>

            <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              Send 1,000 emails = $50 · send nothing = $0 · no card required to explore
            </p>
          </div>
        </section>

        {/* ── ROI CALCULATOR ──────────────────────────────────────────── */}
        <ChadGtmCalculator directoryTotal={totalLeads} />

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section id="faq" className="border-t border-zinc-800/80 bg-zinc-950/40 py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="FAQ"
              title="The questions a technical buyer asks."
              align="center"
            />

            <div className="mt-10 divide-y divide-zinc-800 border border-zinc-800 bg-zinc-950">
              {[
                {
                  q: "Is it really $0/month?",
                  a: "Yes. The platform, directory access, research, calibration, Mission Control, and UniBox are $0. You pay 5¢ per delivered email. No seat licenses, no minimums, no annual contract.",
                },
                {
                  q: "Do I need to buy domains or configure DNS?",
                  a: "No. AutoGTM dispatches through admin-managed shared mailboxes. Your root domain stays untouched. You do not buy burner domains or wait for inbox warmup to start.",
                },
                {
                  q: "Where do the leads come from?",
                  a: `A local, indexed B2B directory currently holding ${formatNumber(totalLeads)} contacts across ${formatNumber(distinctIndustries)} industries and ${formatNumber(distinctCountries)} countries. It is searchable by industry, title, company, and location without export credits.`,
                },
                {
                  q: "How do you avoid spamming the same person?",
                  a: "Today: per-workspace suppression, one-click unsubscribe, a 30/day mailbox cap, randomized jitter, and automatic stop on reply. A global cross-workspace contact ledger is the next safety release.",
                },
                {
                  q: "Can I use my Calendly or Cal.com link?",
                  a: "Scheduling handoff is the next release. Today, interested replies land in UniBox for manual booking. The next release adds a bring-your-own Calendly/Cal.com link mode and a zero-setup ICS confirmation mode, so you never need to create a new scheduling account.",
                },
                {
                  q: "What happens if the AI writes something wrong?",
                  a: "You review every angle and sample before launch, and every agent run is traceable step by step. Claim-level evidence checks and a copy critic are the next quality release; until then, human approval is the safety rail.",
                },
                {
                  q: "Is my workspace isolated?",
                  a: "Yes. Leads, campaigns, mailboxes, replies, and run state are scoped to the active workspace. The shared sender pool is admin-managed, not shared between tenants at the data layer.",
                },
              ].map((item) => (
                <details key={item.q} className="group px-5 py-4 sm:px-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-white">
                    {item.q}
                    <span className="font-mono text-zinc-500 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-3xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ───────────────────────────────────────────────── */}
        <section className="border-t border-zinc-800/80 bg-black py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mx-auto flex size-10 items-center justify-center border border-emerald-500/30 bg-emerald-500/10">
              <Target className="size-5 text-emerald-400" />
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Your next 100 emails
              <br />
              should be worth sending.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Start with your URL. Approve the strategy and the voice. Let the machine
              handle the pacing, the follow-ups, and the reply triage.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 w-full gap-2 rounded-none border border-white bg-white px-8 text-xs font-semibold text-black shadow-none hover:bg-zinc-200 sm:w-auto"
              >
                <Link href={primaryHref}>
                  Analyze my website <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 w-full rounded-none border-zinc-800 bg-zinc-950 px-7 text-xs font-semibold text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900 hover:text-white sm:w-auto"
              >
                <Link href="/login">Sign in to Mission Control</Link>
              </Button>
            </div>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              $0 platform · 5¢ per delivered email · {formatNumber(totalLeads)} contacts
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800 bg-[#030303] py-10 text-xs text-zinc-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-300">AutoGTM</span>
            <span>·</span>
            <span>The outbound engine for one-person GTM teams</span>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/impressum" className="hover:text-white">
              Impressum
            </Link>
            <Link href="/remove-my-info" className="hover:text-white">
              Opt-Out / Remove Info
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
