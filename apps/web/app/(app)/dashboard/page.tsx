import type { LucideIcon } from "lucide-react";
import { Activity, AlertCircle, CheckCircle2, Inbox, Mail, Rocket, Timer, TrendingUp, Users, Ban } from "lucide-react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Progress, statusVariant } from "@smartreach/ui";
import { requireUser } from "@/lib/session";
import { getActiveCampaigns, getDashboardStats, getRecentActivity } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

function Stat({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: LucideIcon; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted-foreground">{label}</p>
          <Icon className="size-4 text-muted-foreground/60" aria-hidden />
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, activity, activeCampaigns] = await Promise.all([
    getDashboardStats(user.id),
    getRecentActivity(user.id),
    getActiveCampaigns(user.id),
  ]);

  const firstName = user.name?.split(" ")[0] ?? "there";

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Good to see you, {firstName}</h1>
          <p className="text-[13px] text-muted-foreground">Here&apos;s what&apos;s happening across your campaigns.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/campaigns/new">
            <Rocket className="size-3.5" /> New campaign
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Active campaigns" value={stats.activeCampaigns} icon={TrendingUp} />
        <Stat label="Emails sent today" value={stats.emailsSentToday} icon={CheckCircle2} />
        <Stat label="Queued today" value={stats.emailsQueuedToday} icon={Timer} />
        <Stat label="Replies" value={stats.replyCount} icon={Inbox} />
        <Stat label="Scheduled" value={stats.scheduledCampaigns} icon={Rocket} />
        <Stat label="Senders" value={stats.senderActive} icon={Mail} hint={`${stats.senderTotal} total`} />
        <Stat label="Total leads" value={stats.totalLeads} icon={Users} />
        <Stat
          label="Failed today"
          value={stats.failedToday}
          icon={AlertCircle}
          hint={stats.failedToday > 0 ? "Needs attention" : "All clear"}
        />
        <Stat
          label="Bounced today"
          value={stats.bouncedToday}
          icon={Ban}
          hint={stats.bouncedToday > 0 ? "Permanent SMTP fails" : "None"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-[15px]">Active campaigns</CardTitle>
            <Link href="/campaigns" className="text-xs text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {activeCampaigns.length === 0 ? (
              <EmptyState
                icon={Rocket}
                title="No active campaigns"
                description="Launch your first campaign in under a minute."
                className="py-12"
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/campaigns/new">Create campaign</Link>
                  </Button>
                }
              />
            ) : (
              activeCampaigns.map((c) => {
                const total = Number(c.total || 0);
                const sent = Number(c.sent || 0);
                const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
                return (
                  <Link
                    key={c.id}
                    href={`/campaigns/${c.id}`}
                    className="flex items-center gap-4 rounded-xl border border-border/60 p-3.5 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13px] font-medium">{c.name}</p>
                        <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {sent}/{total} · {pct}%
                        </span>
                      </div>
                    </div>
                    {Number(c.replied) > 0 && (
                      <Badge variant="success">{Number(c.replied)} replies</Badge>
                    )}
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Activity className="size-4 text-primary" aria-hidden /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Sends, replies, and campaign changes will show up here."
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <div className="space-y-0">
                {activity.slice(0, 12).map((a) => (
                  <div key={a.id} className="flex gap-3 border-l-2 border-border/50 py-2 pl-3.5 first:border-primary/60">
                    <div className="min-w-0">
                      <p className="text-[13px] leading-snug">{a.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
