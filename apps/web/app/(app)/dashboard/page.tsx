import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Database,
  Inbox,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { Badge, Button, Card, CardContent } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { getActiveCampaigns, getDashboardStats, getRecentActivity, listSenders } from "@/lib/queries";
import { getDb, ensureChadGtmTables } from "@/lib/db";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";
import { ActivityFeed } from "./activity-feed";
import { PerformanceBreakdown } from "./performance-breakdown";

export const dynamic = "force-dynamic";

export const metadata = { title: "Executive Command Center · ChadGTM" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const sp = await searchParams;

  const db = getDb();
  await ensureChadGtmTables(db);

  const [stats, activity, activeCampaigns, senders, gtmRuns] = await Promise.all([
    getDashboardStats(user.id, workspace.id, workspace.isDefault),
    getRecentActivity(user.id, 50),
    getActiveCampaigns(user.id, workspace.id, workspace.isDefault),
    listSenders(user.id, workspace.id, workspace.isDefault),
    db
      .select()
      .from(schema.chadGtmRuns)
      .where(eq(schema.chadGtmRuns.userId, user.id))
      .orderBy(desc(schema.chadGtmRuns.createdAt))
      .limit(6),
  ]);

  const firstName = user.name?.split(" ")[0] ?? "there";
  const systemPoolSenders = senders.filter((s: any) => s.isSystemPool);

  return (
    <div className="page-stack space-y-6 max-w-7xl mx-auto font-mono">
      {/* Top GTM Command Banner */}
      <div className="relative overflow-hidden rounded-none border border-zinc-800 bg-zinc-950 p-5 sm:p-7">
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-none border border-zinc-700 bg-black px-2 py-0.5 text-[9px] uppercase tracking-widest text-white font-mono">
                ChadGTM Engine // v2.0
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-zinc-400">
                <span className="size-1 rounded-none bg-white animate-pulse" />
                Gemini 3.8 Active
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-white">
              Executive Command Center
            </h1>
            <p className="text-xs text-zinc-400 font-sans max-w-xl">
              Turn any website into a qualified B2B outbound campaign in 60 seconds.
              Powered by 329,563 verified Apollo prospects and managed 30/day mailbox pacing.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <Button asChild size="lg" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider border border-white gap-2 w-full sm:w-auto h-10 px-5">
              <Link href="/chad-gtm">
                <Sparkles className="size-3.5" />
                Launch New Campaign
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-none border-zinc-800 bg-black text-zinc-300 hover:bg-zinc-900 hover:text-white hover:border-zinc-700 text-xs font-mono uppercase tracking-wider w-full sm:w-auto h-10 px-4">
              <Link href="/b2b-database">
                <Database className="size-3.5 mr-1.5 text-zinc-400" />
                Browse 329k Leads
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Primary GTM Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            <span>Verified Prospects</span>
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
            Classified in UniBox
          </p>
        </div>

        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            <span>Mailbox Health & Pool</span>
            <ShieldCheck className="size-3.5 text-white" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-white">
              {senders.length} Active
            </span>
            {systemPoolSenders.length > 0 && (
              <span className="text-xs text-zinc-400">
                ({systemPoolSenders.length} Shared)
              </span>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Strict 30/day delivery pacing
          </p>
        </div>
      </div>

      {/* Active Autonomous GTM Runs Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">Active GTM Campaigns</h2>
            <span className="rounded-none border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px] text-zinc-400">
              {gtmRuns.length}
            </span>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white">
            <Link href="/chad-gtm">
              Launch Run <ArrowRight className="size-3 ml-1" />
            </Link>
          </Button>
        </div>

        {gtmRuns.length === 0 ? (
          <div className="rounded-none border border-dashed border-zinc-800 bg-black p-8 text-center space-y-3">
            <div className="mx-auto flex size-10 items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-white">
              <Rocket className="size-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">No Active Campaigns</h3>
              <p className="text-xs text-zinc-500 font-sans max-w-sm mx-auto mt-0.5">
                Enter your company website to let Gemini 3.8 Flash synthesize your ICP and launch your first autonomous campaign.
              </p>
            </div>
            <Button asChild size="sm" className="rounded-none bg-white text-black font-semibold text-xs font-mono uppercase tracking-wider hover:bg-zinc-200 border border-white gap-1.5">
              <Link href="/chad-gtm">
                <Sparkles className="size-3" /> Start First GTM Run (60s)
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {gtmRuns.map((run: any) => {
              const overview = run.businessOverview as any;
              return (
                <div
                  key={run.id}
                  className="rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5 flex flex-col justify-between hover:border-zinc-700 transition-colors group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-xs uppercase tracking-wider text-white truncate">
                        {run.companyName || run.url}
                      </div>
                      <span
                        className={`rounded-none border px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-bold ${
                          run.status === "active"
                            ? "border-zinc-700 bg-zinc-900 text-white"
                            : "border-zinc-800 bg-black text-zinc-500"
                        }`}
                      >
                        {run.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-400 font-sans line-clamp-2 leading-relaxed">
                      {overview?.summary || "Autonomous B2B campaign synthesized from live site crawl."}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-zinc-500 uppercase tracking-wider pt-1">
                      <span>{run.dailyEmailLimit || 30} EMAILS/DAY</span>
                      <span>•</span>
                      <span>{(run.selectedIndustries as any[])?.length || 0} INDUSTRIES</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-600">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs font-mono uppercase tracking-wider text-white hover:bg-zinc-900 gap-1 px-2">
                      <Link href={`/chad-gtm/${run.id}`}>
                        Mission Control <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live System Performance & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
        <div className="lg:col-span-2 space-y-3">
          <PerformanceBreakdown
            campaigns={activeCampaigns}
            senders={senders}
          />
        </div>
        <div>
          <ActivityFeed initialActivities={activity} />
        </div>
      </div>
    </div>
  );
}
