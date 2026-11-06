import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { ArrowRight, ArrowUpRight, Bot, ExternalLink, Inbox, Plus } from "lucide-react";
import { schema } from "@smartreach/database";
import { timeAgo } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Stat,
  statusVariant,
} from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { getActiveCampaigns, getDashboardStats, getRecentActivity } from "@/lib/queries";
import { ensureChadGtmTables, getDb } from "@/lib/db";
import { getPostalHold } from "@/lib/postal-hold";
import { Page } from "@/components/layout/page";
import { PostalHoldNotice } from "../postal-hold-notice";
import { ActivityFeed } from "./activity-feed";
import { PerformanceBreakdown } from "./performance-breakdown";

export const dynamic = "force-dynamic";

export const metadata = { title: "Overview" };

function iso(d: string | Date | null | undefined) {
  if (!d) return null;
  return typeof d === "string" ? d : d.toISOString();
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
      .where(and(eq(schema.emailTrackingEvents.userId, user.id), eq(schema.emailTrackingEvents.type, "open"))),
  ]);

  const openCount = Number(opensRow?.count || 0);
  const openRate = stats.totalSent > 0 ? Math.min(100, Math.round((openCount / stats.totalSent) * 100)) : 0;

  const activeRun = gtmRuns.find((r) => r.status === "active") || gtmRuns[0] || null;
  const overview = (activeRun?.businessOverview as { summary?: string; valuePropositions?: string[] }) || {};
  const icp = (activeRun?.icpProfile as { targetJobTitles?: string[]; companySizes?: string[] }) || {};
  const offers = (activeRun?.offers as { title?: string; hook?: string; valueProp?: string }[]) || [];
  const industries = (activeRun?.selectedIndustries as string[]) || [];
  const firstName = (user.name || "there").split(" ")[0];

  return (
    <Page>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={
          <>
            Here is what your outbound did. The agent answers replies; anything that needs a decision lands in{" "}
            <Link href="/requests" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
              Needs you
            </Link>
            .
          </>
        }
        actions={
          <Button asChild>
            <Link href="/chad-gtm">
              <Plus />
              New autopilot run
            </Link>
          </Button>
        }
      />

      <PostalHoldNotice hold={postalHold} />

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
        <Stat bare label="Emails sent" value={stats.totalSent.toLocaleString()} hint="Across all campaigns" />
        <Stat
          bare
          label="Open rate"
          value={`${openRate}%`}
          hint={`${openCount.toLocaleString()} tracked opens`}
        />
        <Stat
          bare
          label="Replies"
          value={stats.replyCount.toLocaleString()}
          delta={{ value: `${stats.replyRate}%`, tone: Number(stats.replyRate) > 0 ? "success" : "neutral" }}
          hint="Reply rate on sent email"
        />
        <Stat bare label="Leads in play" value={stats.totalLeads.toLocaleString()} hint="Across your lead lists" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <PerformanceBreakdown campaigns={activeCampaigns} />

          <Card>
            <CardHeader
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/unibox">
                    Open inbox <ArrowUpRight />
                  </Link>
                </Button>
              }
            >
              <CardTitle>Latest replies</CardTitle>
              <CardDescription>Newest responses from your leads.</CardDescription>
            </CardHeader>
            {recentReplies.length === 0 ? (
              <EmptyState
                compact
                icon={Inbox}
                title="No replies yet"
                description="When leads answer, their replies show up here and in your inbox."
              />
            ) : (
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {recentReplies.map((reply) => (
                  <li key={reply.id}>
                    <Link
                      href="/unibox"
                      className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {(reply.fromName || reply.fromEmail || "?").slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{reply.fromName || reply.fromEmail}</span>
                          {reply.tag ? (
                            <Badge variant={statusVariant(reply.tag)} className="capitalize">
                              {reply.tag.replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                          <span className="ml-auto shrink-0 text-xs text-subtle-foreground">
                            {timeAgo(iso(reply.receivedAt))}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-foreground">
                          {reply.subject || "(no subject)"}
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">
                          {reply.snippet || reply.bodyText || ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader
              actions={
                activeRun ? (
                  <Badge variant={statusVariant(activeRun.status)} dot className="capitalize">
                    {activeRun.status}
                  </Badge>
                ) : null
              }
            >
              <CardTitle>Autopilot</CardTitle>
              <CardDescription>What the agent is working from.</CardDescription>
            </CardHeader>
            {!activeRun ? (
              <EmptyState
                compact
                icon={Bot}
                title="No autopilot run yet"
                description="Paste your website and AutoGTM builds the ICP, finds buyers and writes the sequence."
                action={
                  <Button asChild size="sm">
                    <Link href="/chad-gtm">Start a run</Link>
                  </Button>
                }
              />
            ) : (
              <CardContent className="flex flex-col gap-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-semibold">{activeRun.companyName || "Your company"}</h4>
                    {activeRun.url && (
                      <a
                        href={activeRun.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-subtle-foreground hover:text-foreground"
                        aria-label="Open website"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  {overview.summary && (
                    <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed text-muted-foreground">
                      {overview.summary}
                    </p>
                  )}
                </div>

                {!!icp.targetJobTitles?.length && (
                  <ChipGroup label="Target roles" items={icp.targetJobTitles.slice(0, 5)} />
                )}
                {industries.length > 0 && <ChipGroup label="Industries" items={industries.slice(0, 5)} />}

                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3 text-[13px]">
                  <div>
                    <dt className="text-xs text-muted-foreground">Daily volume</dt>
                    <dd className="tabular mt-0.5 font-medium">{activeRun.dailyEmailLimit || 30} emails</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Company size</dt>
                    <dd className="mt-0.5 truncate font-medium">{icp.companySizes?.join(", ") || "Any"}</dd>
                  </div>
                </dl>

                {offers[0] && (
                  <div>
                    <div className="text-xs text-muted-foreground">Lead offer</div>
                    <p className="mt-1 text-[13px] font-medium">{offers[0].title}</p>
                    {(offers[0].hook || offers[0].valueProp) && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                        {offers[0].hook || offers[0].valueProp}
                      </p>
                    )}
                  </div>
                )}

                <Button asChild variant="outline" className="w-full">
                  <Link href={`/chad-gtm/${activeRun.id}`}>
                    Open mission control <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            )}
          </Card>

          <ActivityFeed initialActivities={activity} />
        </div>
      </div>
    </Page>
  );
}

function ChipGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <Badge key={t} variant="neutral">
            {t}
          </Badge>
        ))}
      </div>
    </div>
  );
}
