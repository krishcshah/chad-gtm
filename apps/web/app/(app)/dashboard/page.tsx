import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Database,
  Eye,
  Flame,
  Globe,
  Inbox,
  Mail,
  MousePointerClick,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Users,
  Zap,
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
    <div className="page-stack space-y-8 max-w-7xl mx-auto">
      {/* Top GTM Command Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-r from-violet-950/40 via-zinc-950 to-zinc-950 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 size-72 rounded-full bg-violet-600/15 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-violet-500/40 text-violet-300 bg-violet-500/10 text-xs py-0.5">
                <Sparkles className="size-3 text-cyan-300 mr-1.5" />
                ChadGTM Autonomous Outbound Engine
              </Badge>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Gemini 3.8 Flash Active
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Autonomous Go-To-Market Hub
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-xl">
              Turn any website into a qualified B2B outbound campaign in 60 seconds.
              Powered by 329,563 verified Apollo prospects and managed 30/day mailbox pacing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-600/30 gap-2">
              <Link href="/chad-gtm">
                <Sparkles className="size-4 text-cyan-200 fill-cyan-200" />
                Launch New Autonomous Campaign
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08] hover:text-white text-xs sm:text-sm font-semibold">
              <Link href="/b2b-database">
                <Database className="size-4 mr-1.5 text-emerald-400" />
                Browse 329k Leads
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Primary GTM Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 sm:p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Verified Prospects</span>
            <Target className="size-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {stats.totalLeads.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Across active outbound campaigns
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 sm:p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Emails Dispatched</span>
            <Mail className="size-4 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {stats.totalSent.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Managed @ 3¢/email pool
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 sm:p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Incoming Replies</span>
            <Inbox className="size-4 text-violet-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {stats.replyCount.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-emerald-400 font-mono">
              {stats.replyRate}% rate
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            AI-classified in UniBox
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 sm:p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Mailbox Health & Pool</span>
            <ShieldCheck className="size-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
              {senders.length} Active
            </span>
            {systemPoolSenders.length > 0 && (
              <span className="text-xs text-cyan-300 font-mono">
                ({systemPoolSenders.length} Shared)
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Safe 30/day delivery pacing
          </p>
        </div>
      </div>

      {/* Active Autonomous GTM Runs Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-violet-400" />
            <h2 className="text-lg font-bold text-white">Autonomous GTM Campaigns</h2>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-mono text-zinc-400">
              {gtmRuns.length}
            </span>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs text-zinc-400 hover:text-white">
            <Link href="/chad-gtm">
              Launch Another Run <ArrowRight className="size-3.5 ml-1" />
            </Link>
          </Button>
        </div>

        {gtmRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-10 text-center space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-violet-600/10 border border-violet-500/20 text-violet-400">
              <Globe className="size-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">No Autonomous Campaigns Yet</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                Enter your company website to let Gemini 3.8 Flash extract your brand and build your first cold outreach engine.
              </p>
            </div>
            <Button asChild size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs gap-1.5">
              <Link href="/chad-gtm">
                <Sparkles className="size-3.5" /> Start First GTM Run (60s)
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gtmRuns.map((run: any) => {
              const overview = run.businessOverview as any;
              const icp = run.icpProfile as any;
              return (
                <div
                  key={run.id}
                  className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 shadow-lg backdrop-blur-xl flex flex-col justify-between hover:border-violet-500/40 transition-all group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm text-white group-hover:text-cyan-300 transition-colors truncate">
                        {run.companyName || run.url}
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          run.status === "active"
                            ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]"
                            : run.status === "ready" || run.status === "reviewing"
                            ? "border-violet-500/30 text-violet-300 bg-violet-500/10 text-[10px]"
                            : "border-zinc-500/30 text-zinc-400 bg-zinc-500/10 text-[10px]"
                        }
                      >
                        {run.status.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {overview?.summary || "Autonomous B2B campaign synthesized from live site crawl."}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono pt-1">
                      <span>⚡ {run.dailyEmailLimit || 30} emails/day</span>
                      <span>•</span>
                      <span>🎯 {(run.selectedIndustries as any[])?.length || 0} Industries</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 gap-1 px-2.5">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        <div className="lg:col-span-2 space-y-4">
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
