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
import { ActivityFeed } from "./activity-feed";
import { PerformanceBreakdown } from "./performance-breakdown";

export const dynamic = "force-dynamic";

export const metadata = { title: "Overview · Autonomous Outbound Command · ChadGTM" };

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

  const db = getDb();
  await ensureChadGtmTables(db);

  const [stats, activity, activeCampaigns, recentReplies, gtmRuns, [opensRow]] = await Promise.all([
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
    <div className="page-stack space-y-8 max-w-7xl mx-auto font-mono">
      {/* ─────────────────────────────────────────────────────────────────────────
          1. TOP: Statistics & Outbound Delivery Graphs
      ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Executive Command Banner */}
        <div className="relative overflow-hidden rounded-none border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-none border border-zinc-700 bg-black px-2 py-0.5 text-[9px] uppercase tracking-widest text-white">
                  ChadGTM Engine // Autonomous Outbound
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-400">
                  <span className="size-1 rounded-none bg-white animate-pulse" />
                  Gemini 3.8 Active
                </span>
                <span className="rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-400">
                  Managed 3¢ Pool
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-white">
                Executive Overview
              </h1>
              <p className="text-xs text-zinc-400 font-sans max-w-2xl leading-relaxed">
                Autonomous Go-To-Market pipeline. Outreach is paced through a managed platform pool of
                pre-warmed mailboxes with Apollo-verified B2B leads.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                asChild
                size="lg"
                className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider border border-white gap-2 w-full sm:w-auto h-10 px-5"
              >
                <Link href="/chad-gtm">
                  <Sparkles className="size-3.5" />
                  Launch New GTM Run
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* 4 Core Monochromatic KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              <span>Emails Dispatched</span>
              <Mail className="size-3.5 text-white" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-white">
                {stats.totalSent.toLocaleString()}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Managed @ 3¢/email pool
            </p>
          </div>

          <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              <span>Verified Open Rate</span>
              <Zap className="size-3.5 text-white" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-white">
                {openRate}%
              </span>
              <span className="text-xs text-zinc-400 font-normal">
                ({openCount} tracked)
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Real-time pixel tracking
            </p>
          </div>

          <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              <span>Incoming Replies</span>
              <Inbox className="size-3.5 text-white" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-white">
                {stats.replyCount.toLocaleString()}
              </span>
              <span className="text-xs font-normal text-zinc-400">
                {stats.replyRate}% rate
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
              AI Classified in Unibox
            </p>
          </div>

          <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              <span>Target Leads Selected</span>
              <Target className="size-3.5 text-white" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-white">
                {stats.totalLeads.toLocaleString()}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
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
          2. MIDDLE: Recent Replies (Live Unibox Feed)
      ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-white" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Recent Prospect Replies
            </h2>
            <span className="rounded-none border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px] text-zinc-400">
              {recentReplies.length} Inbound
            </span>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white"
          >
            <Link href="/unibox">
              Open Full Unibox <ArrowRight className="size-3 ml-1" />
            </Link>
          </Button>
        </div>

        {recentReplies.length === 0 ? (
          <div className="rounded-none border border-dashed border-zinc-800 bg-black p-8 text-center space-y-3">
            <div className="mx-auto flex size-10 items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-white">
              <MessageSquare className="size-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                No Inbound Replies Yet
              </h3>
              <p className="text-xs text-zinc-500 font-sans max-w-md mx-auto mt-0.5 leading-relaxed">
                The autonomous engine is pacing outreach across the platform's pre-warmed mailbox pool.
                Incoming prospect responses will stream into this feed live with AI sentiment classification.
              </p>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-none border-zinc-800 bg-black text-zinc-300 hover:bg-zinc-900 hover:text-white text-xs font-mono uppercase tracking-wider"
            >
              <Link href="/campaigns">View Active Campaigns</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentReplies.map((reply: any) => {
              const isPositive =
                reply.tag === "interested" || reply.tag === "meeting" || reply.tag === "positive";

              return (
                <div
                  key={reply.id}
                  className="rounded-none border border-zinc-800 bg-zinc-950 p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-xs uppercase tracking-wider text-white truncate">
                        {reply.fromName || reply.fromEmail}
                      </div>
                      <span
                        className={`rounded-none border px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-bold ${
                          isPositive
                            ? "bg-white text-black border-white"
                            : "border-zinc-800 bg-black text-zinc-400"
                        }`}
                      >
                        {reply.tag ? reply.tag.toUpperCase() : "INBOUND"}
                      </span>
                    </div>

                    <div className="text-[11px] font-bold text-zinc-200 truncate">
                      {reply.subject || "(No subject)"}
                    </div>

                    <div className="text-xs text-zinc-400 font-sans line-clamp-3 leading-relaxed">
                      {reply.snippet || reply.bodyText || "Click to view incoming response..."}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      {formatRelativeTime(reply.receivedAt)}
                    </span>
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs font-mono uppercase tracking-wider text-white hover:bg-zinc-900 gap-1 px-2"
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
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-white" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Current GTM Strategy & Preset Profile
            </h2>
            {activeRun && (
              <span className="rounded-none border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px] text-zinc-400 uppercase">
                {activeRun.companyName || "Synthesized"}
              </span>
            )}
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white"
          >
            <Link href="/chad-gtm">
              Re-Calibrate Strategy <ArrowRight className="size-3 ml-1" />
            </Link>
          </Button>
        </div>

        {!activeRun ? (
          <div className="rounded-none border border-dashed border-zinc-800 bg-black p-8 text-center space-y-3">
            <div className="mx-auto flex size-10 items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-white">
              <Rocket className="size-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                No GTM Strategy Configured Yet
              </h3>
              <p className="text-xs text-zinc-500 font-sans max-w-sm mx-auto mt-0.5 leading-relaxed">
                Enter your company website to let Gemini 3.8 Flash synthesize your ICP, calibrate
                high-converting cold email angles, and launch verified B2B outreach in 60 seconds.
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="rounded-none bg-white text-black font-semibold text-xs font-mono uppercase tracking-wider hover:bg-zinc-200 border border-white gap-1.5"
            >
              <Link href="/chad-gtm">
                <Sparkles className="size-3" /> Launch First GTM Run (60s)
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bento 1: Company Profile & Value Propositions */}
            <div className="rounded-none border border-zinc-800 bg-zinc-950 p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
                  Company Identity
                </span>
                {activeRun.url && (
                  <a
                    href={activeRun.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-white uppercase"
                  >
                    Visit Site <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  {activeRun.companyName || "Your Company"}
                </h3>
                <p className="text-xs text-zinc-400 font-sans mt-1 leading-relaxed">
                  {overview.summary ||
                    "Autonomous Go-To-Market outreach synthesized from deep company analysis."}
                </p>
              </div>

              {overview.valuePropositions && overview.valuePropositions.length > 0 && (
                <div className="pt-2 border-t border-zinc-900 space-y-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block">
                    Core Value Drivers:
                  </span>
                  <ul className="space-y-1">
                    {overview.valuePropositions.slice(0, 3).map((vp: string, idx: number) => (
                      <li key={idx} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
                        <span className="text-zinc-600 font-mono mt-0.5">•</span>
                        <span>{vp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Bento 2: Ideal Customer Profile & Matched Industries */}
            <div className="rounded-none border border-zinc-800 bg-zinc-950 p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
                  Ideal Customer Profile (ICP)
                </span>
                <span className="rounded-none border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px] text-zinc-400">
                  Apollo Matched
                </span>
              </div>

              {icp.targetJobTitles && icp.targetJobTitles.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block">
                    Target Personas:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {icp.targetJobTitles.slice(0, 4).map((title: string, idx: number) => (
                      <span
                        key={idx}
                        className="rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-[10px] text-zinc-300 uppercase tracking-wider"
                      >
                        {title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedIndustries.length > 0 && (
                <div className="pt-2 border-t border-zinc-900 space-y-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block">
                    Targeted B2B Industries:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {selectedIndustries.slice(0, 4).map((ind: string, idx: number) => (
                      <span
                        key={idx}
                        className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-white uppercase tracking-wider"
                      >
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {icp.companySizes && icp.companySizes.length > 0 && (
                <div className="pt-2 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-500">
                  <span className="uppercase tracking-widest">Company Size:</span>
                  <span className="text-zinc-300 font-mono">
                    {icp.companySizes.join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* Bento 3: Calibrated Value Angles & Sending Velocity */}
            <div className="rounded-none border border-zinc-800 bg-zinc-950 p-5 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
                    Calibrated Angle & Infrastructure
                  </span>
                  <span className="rounded-none border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] text-white uppercase font-bold">
                    {activeRun.status.toUpperCase()}
                  </span>
                </div>

                {offers.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block">
                      Primary Value Hook:
                    </span>
                    <p className="text-xs font-bold text-white uppercase tracking-wider">
                      {offers[0]?.title || "Direct ROI Proposition"}
                    </p>
                    <p className="text-[11px] text-zinc-400 font-sans line-clamp-2 leading-relaxed">
                      {offers[0]?.hook || offers[0]?.valueProp || "Calibrated during AI onboarding session."}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-900 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 uppercase tracking-widest text-[10px]">
                      Daily Velocity:
                    </span>
                    <span className="font-bold text-white">
                      {activeRun.dailyEmailLimit || 30} emails / day
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 uppercase tracking-widest text-[10px]">
                      Mailbox Tier:
                    </span>
                    <span className="text-zinc-300">
                      Managed Shared Pool (3¢/email)
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800">
                <Button
                  asChild
                  size="sm"
                  className="w-full rounded-none bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 text-xs font-mono uppercase tracking-wider justify-between"
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
