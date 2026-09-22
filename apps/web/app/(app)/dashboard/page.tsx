import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Inbox,
  Mail,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Progress, statusVariant } from "@smartreach/ui";
import { requireUser } from "@/lib/session";
import { getActiveCampaigns, getDashboardStats, getRecentActivity } from "@/lib/queries";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";
import { ActivityFeed } from "./activity-feed";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard · SmartReach" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [stats, activity, activeCampaigns] = await Promise.all([
    getDashboardStats(user.id),
    getRecentActivity(user.id, 50),
    getActiveCampaigns(user.id),
  ]);

  const firstName = user.name?.split(" ")[0] ?? "there";
  const replyRate =
    stats.emailsSentToday > 0
      ? ((stats.replyCount / stats.emailsSentToday) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="page-stack space-y-6">
      {/* Top Executive Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Good to see you, {firstName}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Engine Online
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            System overview across your campaigns, connected mailboxes, and incoming lead replies.
          </p>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/leads/import" className="gap-1.5 text-xs">
              <Upload className="size-3.5 text-muted-foreground" /> Import Leads
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/senders/new" className="gap-1.5 text-xs">
              <Mail className="size-3.5 text-muted-foreground" /> Connect Mailbox
            </Link>
          </Button>
          <Button size="sm" asChild className="shadow-sm">
            <Link href="/campaigns/new" className="gap-1.5 text-xs font-semibold">
              <Rocket className="size-3.5" /> New Campaign
            </Link>
          </Button>
        </div>
      </div>

      {/* 4 Hero KPI Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Pipeline Leads */}
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Total Pipeline Leads</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Users className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {stats.totalLeads.toLocaleString()}
              </p>
              <Badge variant="outline" className="text-[11px] font-normal border-border/60">
                Ready to contact
              </Badge>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-blue-400" />
              Deduplicated across all lists
            </p>
          </CardContent>
        </Card>

        {/* Outreach Velocity */}
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Sent Today</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                <Zap className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {stats.emailsSentToday.toLocaleString()}
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {stats.emailsQueuedToday} queued
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <Progress
                value={
                  stats.emailsSentToday + stats.emailsQueuedToday > 0
                    ? Math.round(
                        (stats.emailsSentToday /
                          (stats.emailsSentToday + stats.emailsQueuedToday)) *
                          100
                      )
                    : 100
                }
                className="h-1.5"
              />
            </div>
          </CardContent>
        </Card>

        {/* Unique Lead Replies */}
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Unique Replies</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Inbox className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {stats.replyCount.toLocaleString()}
              </p>
              <Badge variant="success" className="text-[11px] font-medium">
                {replyRate}% rate
              </Badge>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-400" />
              Distinct lead conversions
            </p>
          </CardContent>
        </Card>

        {/* Mailbox Deliverability */}
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Mailbox Health</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <ShieldCheck className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {stats.senderActive}
                <span className="text-sm font-normal text-muted-foreground">/{stats.senderTotal}</span>
              </p>
              <Badge
                variant={stats.bouncedToday === 0 ? "outline" : "destructive"}
                className="text-[11px] font-normal"
              >
                {stats.bouncedToday === 0 ? "100% clean" : `${stats.bouncedToday} bounced`}
              </Badge>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
              <Mail className="size-3 text-cyan-400" />
              Automatic sender rotation active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Status Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/30 px-3.5 py-2.5 backdrop-blur">
          <TrendingUp className="size-4 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Active Campaigns</p>
            <p className="text-sm font-semibold tabular-nums">{stats.activeCampaigns}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/30 px-3.5 py-2.5 backdrop-blur">
          <Rocket className="size-4 text-violet-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Scheduled Launches</p>
            <p className="text-sm font-semibold tabular-nums">{stats.scheduledCampaigns}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/30 px-3.5 py-2.5 backdrop-blur">
          <AlertCircle
            className={`size-4 shrink-0 ${
              stats.failedToday > 0 ? "text-destructive" : "text-emerald-400"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Failed Today</p>
            <p className="text-sm font-semibold tabular-nums">
              {stats.failedToday > 0 ? `${stats.failedToday} errors` : "0 (All clear)"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/30 px-3.5 py-2.5 backdrop-blur">
          <Ban
            className={`size-4 shrink-0 ${
              stats.bouncedToday > 0 ? "text-amber-400" : "text-muted-foreground"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Permanent Bounces</p>
            <p className="text-sm font-semibold tabular-nums">
              {stats.bouncedToday > 0 ? `${stats.bouncedToday} blocked` : "0"}
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Chart Section */}
      <AnalyticsSectionLoader
        from={sp.from}
        to={sp.to}
        heading="Campaign Outreach & Delivery Trajectory"
        description="Leads contacted, unique replies, and deliverability performance over time."
      />

      {/* Main Grid: Active Campaigns + Revamped Intelligent Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-12 items-stretch">
        {/* Active Campaigns Column (7 cols) */}
        <Card className="lg:col-span-7 flex flex-col h-[560px] border-border/60 bg-card/50 backdrop-blur shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4 shrink-0">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight">
                Active Campaigns
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Multi-step sequence execution and outreach velocity.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs text-primary gap-1">
              <Link href="/campaigns">
                View all <ArrowRight className="size-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4 flex-1 min-h-0 overflow-y-auto space-y-3 pr-2 focus-visible:outline-none">
            {activeCampaigns.length === 0 ? (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                <EmptyState
                  icon={Rocket}
                  title="No active campaigns"
                  description="Launch your first multi-stage sequence in under 60 seconds."
                  className="border-0 bg-transparent py-0"
                  action={
                    <Button size="sm" asChild>
                      <Link href="/campaigns/new">Create campaign</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              activeCampaigns.map((c) => {
                const total = Number(c.total || 0);
                const sent = Number(c.sent || 0);
                const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
                return (
                  <Link
                    key={c.id}
                    href={`/campaigns/${c.id}`}
                    className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-4 transition-all hover:bg-accent/40 hover:border-border focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <p className="truncate text-sm font-semibold group-hover:text-primary transition-colors">
                          {c.name}
                        </p>
                        <Badge variant={statusVariant(c.status)} className="capitalize text-[10px]">
                          {c.status}
                        </Badge>
                      </div>
                      {Number(c.replied) > 0 && (
                        <Badge variant="success" className="text-xs font-semibold shrink-0">
                          {Number(c.replied)} {Number(c.replied) === 1 ? "reply" : "replies"}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="h-2 flex-1" />
                      <span className="text-xs tabular-nums text-muted-foreground font-medium shrink-0">
                        {sent.toLocaleString()} / {total.toLocaleString()} ({pct}%)
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Revamped Recent Activity Hub (5 cols) */}
        <Card className="lg:col-span-5 flex flex-col h-[560px] border-border/60 bg-card/50 backdrop-blur shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4 shrink-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
                <Activity className="size-4 text-primary" aria-hidden /> Live Activity Feed
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time aggregated timeline of system and outreach events.
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex-1 min-h-0 flex flex-col">
            <ActivityFeed initialActivities={activity} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
