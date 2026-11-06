import {
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  Flame,
  Globe,
  Inbox,
  Mail,
  MessageSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { Badge, Button } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { getActiveCampaigns, getDashboardStats, getRecentActivity } from "@/lib/queries";
import { getDb, ensureChadGtmTables } from "@/lib/db";
import { getPostalHold } from "@/lib/postal-hold";
import { PostalHoldNotice } from "../postal-hold-notice";
import { ActivityFeed } from "./activity-feed";
import { PerformanceBreakdown } from "./performance-breakdown";

export const dynamic = "force-dynamic";

export const metadata = { title: "Overview" };

function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Recently";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const { user, workspace } = await requireWorkspace();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const db = getDb();
  await ensureChadGtmTables(db);

  const [postalHold, stats, activity, activeCampaigns, recentReplies, gtmRuns, [opensRow]] = await Promise.all([
    getPostalHold(user.id),
    getDashboardStats(user.id, workspace.id, workspace.isDefault),
    getRecentActivity(user.id, 20),
    getActiveCampaigns(user.id, workspace.id, workspace.isDefault),
    db
      .select()
      .from(schema.replies)
      .where(eq(schema.replies.userId, user.id))
      .orderBy(desc(schema.replies.receivedAt))
      .limit(6),
    db
      .select()
      .from(schema.chadGtmRuns)
      .where(eq(schema.chadGtmRuns.userId, user.id))
      .orderBy(desc(schema.chadGtmRuns.createdAt))
      .limit(6),
    db
      .select({ count: count() })
      .from(schema.emailTrackingEvents)
      .where(
        and(
          eq(schema.emailTrackingEvents.userId, user.id),
          eq(schema.emailTrackingEvents.type, "open")
        )
      ),
  ]);

  const openCount = Number(opensRow?.count || 0);
  const openRate =
    stats.totalSent > 0 ? Math.min(100, Math.round((openCount / stats.totalSent) * 100)) : 0;

  // Identify active or latest GTM run for preset overview
  const activeRun = gtmRuns.find((r) => r.status === "active") || gtmRuns[0] || null;
  const overview = (activeRun?.businessOverview as any) || {};
  const icp = (activeRun?.icpProfile as any) || {};
  const offers = (activeRun?.offers as any[]) || [];
  const selectedIndustries = (activeRun?.selectedIndustries as string[]) || [];

  return (
    <div className="page-stack space-y-8 max-w-7xl mx-auto font-sans">
      {/* ─────────────────────────────────────────────────────────────────────────
          1. TOP: Statistics & Outbound Delivery Graphs
      ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-400/90">Overview</div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-[28px]">
              {greeting}, {(user.name || "there").split(" ")[0]}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Everything your outbound did, in one place. The agent handles replies; anything that needs you shows up under{" "}
              <Link href="/requests" className="text-zinc-200 underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-400">
                Needs you
              </Link>
              .
            </p>
          </div>
          <Button asChild variant="brand" size="lg" className="h-10 px-5">
            <Link href="/chad-gtm">
              <Sparkles className="size-3.5" />
              New autopilot campaign
            </Link>
          </Button>
        </div>

        <PostalHoldNotice hold={postalHold} />

        {/* 4 Core Modern KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-5 space-y-2 card-shine shadow-xs hover:border-zinc-700/80 transition-all">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
              <span>Emails Dispatched</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200">
                <Mail className="size-3.5" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums">
                {stats.totalSent.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-normal">
              Across all campaigns
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 space-y-2 card-shine shadow-xs hover:border-zinc-700/80 transition-all">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
              <span>Verified Open Rate</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200">
                <Zap className="size-3.5" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums">
                {openRate}%
              </span>
              <span className="text-xs text-zinc-400 font-normal">
                ({openCount} tracked)
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-normal">
              Real-time pixel tracking
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 space-y-2 card-shine shadow-xs hover:border-zinc-700/80 transition-all">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
              <span>Incoming Replies</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200">
                <Inbox className="size-3.5" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums">
                {stats.replyCount.toLocaleString()}
              </span>
              <span className="text-xs font-normal text-zinc-400">
                {stats.replyRate}% rate
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-normal">
              Triaged by the reply agent
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 space-y-2 card-shine shadow-xs hover:border-zinc-700/80 transition-all">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
              <span>Target Leads Selected</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200">
                <Target className="size-3.5" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums">
                {stats.totalLeads.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-normal">
              Across active campaigns
            </p>
          </div>
        </div>

        {/* Live Delivery Pacing Graph & Outbound Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <PerformanceBreakdown campaigns={activeCampaigns} />
          </div>
          <div>
            <ActivityFeed initialActivities={activity} />
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          2. MIDDLE: Recent Replies (Live UniBox Feed)
      ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
              <Inbox className="size-3.5" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight text-white">
              Recent Prospect Replies
            </h2>
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {recentReplies.length} Inbound
            </span>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-xs font-medium text-zinc-400 hover:text-white"
          >
            <Link href="/unibox">
              Open Full UniBox <ArrowRight className="size-3 ml-1" />
            </Link>
          </Button>
        </div>

        {recentReplies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-8 sm:p-10 text-center space-y-3 card-shine">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 shadow-2xs">
              <MessageSquare className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                No Inbound Replies Yet
              </h3>
              <p className="text-xs text-zinc-400 font-normal max-w-md mx-auto mt-1 leading-relaxed">
                Outreach is paced 45–120 seconds apart across the shared mailbox pool, 30 sends per mailbox per day.
                Incoming prospect responses will stream into this feed live with AI sentiment classification.
              </p>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-lg border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs font-medium"
            >
              <Link href="/campaigns">View Active Campaigns</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {recentReplies.map((reply: any) => {
              const isPositive =
                reply.tag === "interested" || reply.tag === "meeting" || reply.tag === "positive";

              return (
                <div
                  key={reply.id}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-4.5 flex flex-col justify-between hover:border-zinc-700/80 transition-all card-shine shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-xs text-white truncate">
                        {reply.fromName || reply.fromEmail}
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                          isPositive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400"
                        }`}
                      >
                        {reply.tag ? reply.tag.toUpperCase() : "INBOUND"}
                      </span>
                    </div>

                    <div className="text-xs font-medium text-zinc-200 truncate">
                      {reply.subject || "(No subject)"}
                    </div>

                    <div className="text-xs text-zinc-400 font-normal line-clamp-3 leading-relaxed">
                      {reply.snippet || reply.bodyText || "Click to view incoming response..."}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {formatRelativeTime(reply.receivedAt)}
                    </span>
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 gap-1 px-2.5 rounded-lg"
                    >
                      <Link href={`/unibox`}>
                        View Thread <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          3. BOTTOM: Current GTM Strategy & Preset Profile Overview
      ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
              <Sparkles className="size-3.5" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight text-white">
              Current GTM Strategy & Preset Profile
            </h2>
            {activeRun && (
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 font-medium">
                {activeRun.companyName || "Synthesized"}
              </span>
            )}
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-xs font-medium text-zinc-400 hover:text-white"
          >
            <Link href="/chad-gtm">
              Re-Calibrate Strategy <ArrowRight className="size-3 ml-1" />
            </Link>
          </Button>
        </div>

        {!activeRun ? (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-8 sm:p-10 text-center space-y-3 card-shine">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 shadow-2xs">
              <Rocket className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                No GTM Strategy Configured Yet
              </h3>
              <p className="text-xs text-zinc-400 font-normal max-w-sm mx-auto mt-1 leading-relaxed">
                Paste your website and AutoGTM researches your market, picks verified buyers, and starts sending from
                warmed mailboxes. The reply agent answers and sends leads to your calendar.
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 border border-white gap-1.5 shadow-sm"
            >
              <Link href="/chad-gtm">
                <Sparkles className="size-3" /> Start autopilot
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bento 1: Company Profile & Value Propositions */}
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-5 space-y-3 card-shine shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  Company Identity
                </span>
                {activeRun.url && (
                  <a
                    href={activeRun.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-colors"
                  >
                    Visit Site <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {activeRun.companyName || "Your Company"}
                </h3>
                <p className="text-xs text-zinc-400 font-normal mt-1 leading-relaxed">
                  {overview.summary ||
                    "Autonomous Go-To-Market outreach synthesized from deep company analysis."}
                </p>
              </div>

              {overview.valuePropositions && overview.valuePropositions.length > 0 && (
                <div className="pt-2.5 border-t border-zinc-800/60 space-y-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">
                    Core Value Drivers:
                  </span>
                  <ul className="space-y-1">
                    {overview.valuePropositions.slice(0, 3).map((vp: string, idx: number) => (
                      <li key={idx} className="text-xs text-zinc-300 flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold mt-0.5">•</span>
                        <span>{vp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Bento 2: Ideal Customer Profile & Matched Industries */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 space-y-3 card-shine shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  Ideal Customer Profile (ICP)
                </span>
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold text-sky-400">
                  Apollo Matched
                </span>
              </div>

              {icp.targetJobTitles && icp.targetJobTitles.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">
                    Target Personas:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {icp.targetJobTitles.slice(0, 4).map((title: string, idx: number) => (
                      <span
                        key={idx}
                        className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[10px] text-zinc-300 font-medium"
                      >
                        {title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedIndustries.length > 0 && (
                <div className="pt-2.5 border-t border-zinc-800/60 space-y-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">
                    Targeted B2B Industries:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {selectedIndustries.slice(0, 4).map((ind: string, idx: number) => (
                      <span
                        key={idx}
                        className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-[10px] text-zinc-200 font-medium"
                      >
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {icp.companySizes && icp.companySizes.length > 0 && (
                <div className="pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Company Size:</span>
                  <span className="text-zinc-200 font-medium">
                    {icp.companySizes.join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* Bento 3: Calibrated Value Angles & Sending Velocity */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 space-y-3 flex flex-col justify-between card-shine shadow-xs">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                    Calibrated Angle & Infrastructure
                  </span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-400 uppercase font-semibold">
                    {activeRun.status.toUpperCase()}
                  </span>
                </div>

                {offers.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">
                      Primary Value Hook:
                    </span>
                    <p className="text-xs font-semibold text-white">
                      {offers[0]?.title || "Direct ROI Proposition"}
                    </p>
                    <p className="text-[11px] text-zinc-400 font-normal line-clamp-2 leading-relaxed">
                      {offers[0]?.hook || offers[0]?.valueProp || "Calibrated during AI onboarding session."}
                    </p>
                  </div>
                )}

                <div className="pt-2.5 border-t border-zinc-800/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">
                      Daily Velocity:
                    </span>
                    <span className="font-semibold text-white">
                      {activeRun.dailyEmailLimit || 30} emails / day
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">
                      Mailbox Tier:
                    </span>
                    <span className="text-zinc-300 font-medium">
                      Managed shared pool
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800/80">
                <Button
                  asChild
                  size="sm"
                  className="w-full rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 text-xs font-medium justify-between shadow-xs"
                >
                  <Link href={`/chad-gtm/${activeRun.id}`}>
                    <span>Launch Mission Control</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
