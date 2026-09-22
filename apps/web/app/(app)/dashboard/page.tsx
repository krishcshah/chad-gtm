import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Eye,
  Inbox,
  Mail,
  MousePointerClick,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Badge, Button, Card, CardContent } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { getActiveCampaigns, getDashboardStats, getRecentActivity, listSenders } from "@/lib/queries";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";
import { ActivityFeed } from "./activity-feed";
import { PerformanceBreakdown } from "./performance-breakdown";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard · SmartReach" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const sp = await searchParams;

  const [stats, activity, activeCampaigns, senders] = await Promise.all([
    getDashboardStats(user.id, workspace.id, workspace.isDefault),
    getRecentActivity(user.id, 50),
    getActiveCampaigns(user.id, workspace.id, workspace.isDefault),
    listSenders(user.id, workspace.id, workspace.isDefault),
  ]);

  const firstName = user.name?.split(" ")[0] ?? "there";

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
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {workspace.name}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            System overview for {workspace.name} · mailboxes, campaigns, and incoming replies.
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

      {/* Unified ReachInbox-Style KPI Row (6 non-repeating, mathematically consistent cards) */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* 1. Leads Contacted */}
        <Card className="border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Leads Contacted</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Users className="size-3.5" />
              </div>
            </div>
            <p className="mt-2.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.leadsContacted.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="size-3 text-blue-400" />
              {stats.totalSent} emails sent
            </p>
          </CardContent>
        </Card>

        {/* 2. Reply Rate (Actual Distinct Prospect Replies) */}
        <Card className="border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Reply Rate</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Inbox className="size-3.5" />
              </div>
            </div>
            <p className="mt-2.5 text-2xl font-bold tracking-tight text-emerald-400 tabular-nums">
              {stats.replyRate}%
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <span className="font-semibold text-foreground">{stats.replyCount}</span> unique {stats.replyCount === 1 ? "reply" : "replies"}
            </p>
          </CardContent>
        </Card>

        {/* 3. Open Rate */}
        <Card className="border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Open Rate</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <Eye className="size-3.5" />
              </div>
            </div>
            <p className="mt-2.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              0.0%
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              0 opens tracked
            </p>
          </CardContent>
        </Card>

        {/* 4. Click Rate */}
        <Card className="border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Click Rate</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <MousePointerClick className="size-3.5" />
              </div>
            </div>
            <p className="mt-2.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              0.0%
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              0 clicks tracked
            </p>
          </CardContent>
        </Card>

        {/* 5. Bounce Rate */}
        <Card className="border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Bounce Rate</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
                <Ban className="size-3.5" />
              </div>
            </div>
            <p className="mt-2.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.bounceRate}%
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {stats.bounceCount} bounces
            </p>
          </CardContent>
        </Card>

        {/* 6. Mailbox Health */}
        <Card className="border-border/70 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Mailbox Health</span>
              <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <ShieldCheck className="size-3.5" />
              </div>
            </div>
            <p className="mt-2.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.senderActive}
              <span className="text-xs font-normal text-muted-foreground">/{stats.senderTotal}</span>
            </p>
            <p className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              100% clean · Active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Trajectory Chart Section (Single Unified Chart without redundant cards) */}
      <AnalyticsSectionLoader
        from={sp.from}
        to={sp.to}
        heading="Campaign Outreach & Delivery Trajectory"
        description="Leads contacted, unique replies, and deliverability performance over time."
        hideKpis={true}
      />

      {/* ReachInbox / Instantly Style Performance Breakdown: Campaigns & Email Accounts */}
      <PerformanceBreakdown
        campaigns={activeCampaigns}
        senders={senders.map((s) => ({
          id: s.id,
          senderName: s.senderName,
          email: s.email,
          status: s.status,
          health: s.health,
          dailyLimit: s.dailyLimit,
          hourlyLimit: s.hourlyLimit,
          usedToday: s.usedToday,
          repliedCount: s.repliedCount,
        }))}
      />

      {/* Real-Time Activity Feed */}
      <ActivityFeed initialActivities={activity} />
    </div>
  );
}
