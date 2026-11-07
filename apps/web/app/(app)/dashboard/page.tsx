import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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
import {
  getActiveCampaigns,
  getDashboardStats,
  getRecentActivity,
  replyWorkspaceCondition,
  wsCondition,
} from "@/lib/queries";
import { ensureChadGtmTables, getDb } from "@/lib/db";
import { getTargetTitles } from "@/lib/gtm-launch";
import { deriveRunPhase, type RunPhase } from "@/lib/autopilot-policy";
import { getPostalHold } from "@/lib/postal-hold";
import { Page } from "@/components/layout/page";
import { PostalHoldNotice } from "../postal-hold-notice";
import { ActivityFeed } from "./activity-feed";
import { PerformanceBreakdown } from "./performance-breakdown";
import { PhaseBadge } from "../chad-gtm/launch-setup";
import { guidedSetupHref } from "@/lib/autopilot-policy";

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

  // Everything here is for the active workspace (the Inbox's rule for replies).
  const [postalHold, stats, activity, activeCampaigns, recentReplyRows, gtmRuns] = await Promise.all([
    getPostalHold(user.id),
    getDashboardStats(user.id, workspace.id, workspace.isDefault),
    getRecentActivity(user.id, 20, { workspaceId: workspace.id, isDefault: workspace.isDefault }),
    getActiveCampaigns(user.id, workspace.id, workspace.isDefault),
    db
      .select({ reply: schema.replies })
      .from(schema.replies)
      .leftJoin(schema.campaigns, eq(schema.replies.campaignId, schema.campaigns.id))
      .leftJoin(schema.senderAccounts, eq(schema.replies.senderId, schema.senderAccounts.id))
      .where(and(eq(schema.replies.userId, user.id), replyWorkspaceCondition(workspace.id, workspace.isDefault)))
      .orderBy(desc(schema.replies.receivedAt))
      .limit(6),
    db
      .select()
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.userId, user.id),
          wsCondition(schema.chadGtmRuns.workspaceId, workspace.id, workspace.isDefault),
          isNull(schema.chadGtmRuns.dismissedAt),
        ),
      )
      .orderBy(desc(schema.chadGtmRuns.createdAt))
      .limit(6),
  ]);
  const recentReplies = recentReplyRows.map((r) => r.reply);

  // Activity rows link to a campaign only while it still exists (a deleted one would 404).
  const activityCampaignIds = [...new Set(activity.map((a) => a.campaignId).filter((id): id is string => Boolean(id)))];
  const liveCampaignIds =
    activityCampaignIds.length === 0
      ? []
      : (
          await db
            .select({ id: schema.campaigns.id })
            .from(schema.campaigns)
            .where(
              and(
                inArray(schema.campaigns.id, activityCampaignIds),
                eq(schema.campaigns.userId, user.id),
                isNull(schema.campaigns.deletedAt),
              ),
            )
        ).map((c) => c.id);

  // The campaign owns on/off and completion: each run's phase and daily volume follow it.
  const runCampaignIds = [...new Set(gtmRuns.map((r) => r.campaignId).filter((id): id is string => Boolean(id)))];
  const runCampaigns =
    runCampaignIds.length === 0
      ? []
      : await db
          .select({
            id: schema.campaigns.id,
            status: schema.campaigns.status,
            deletedAt: schema.campaigns.deletedAt,
            dailyLimit: schema.campaigns.dailyLimit,
          })
          .from(schema.campaigns)
          .where(inArray(schema.campaigns.id, runCampaignIds));
  const runCampaignById = new Map(runCampaigns.map((c) => [c.id, c]));
  const runPhase = new Map<string, RunPhase>(
    gtmRuns.map((r) => {
      const c = r.campaignId ? runCampaignById.get(r.campaignId) : undefined;
      return [
        r.id,
        deriveRunPhase({
          status: r.status,
          campaignId: r.campaignId,
          autopilot: Boolean(r.autopilot),
          blockers: [],
          postalHeld: postalHold.held,
          campaignStatus: c?.status ?? null,
          campaignDeleted: Boolean(c?.deletedAt),
        }),
      ];
    }),
  );
  const activeRun =
    gtmRuns.find((r) => runPhase.get(r.id) === "live" || runPhase.get(r.id) === "held") ||
    gtmRuns.find((r) => runPhase.get(r.id) === "paused") ||
    gtmRuns[0] ||
    null;
  const activeRunCampaign = activeRun?.campaignId ? runCampaignById.get(activeRun.campaignId) : undefined;
  const overview = (activeRun?.businessOverview as { summary?: string; valuePropositions?: string[] }) || {};
  const icp = (activeRun?.icpProfile as { companySizes?: string[] }) || {};
  // Same roles Mission control shows: icp.targetTitles plus persona titles.
  const targetRoles = activeRun ? getTargetTitles(activeRun) : [];
  const offers = (activeRun?.offers as { title?: string; angle?: string; valueProp?: string }[]) || [];
  const industries = (activeRun?.selectedIndustries as string[]) || [];
  const firstName = (user.name || "there").split(" ")[0];

  return (
    <Page>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={
          <>
            Here is what your outbound did. In campaigns where the agent is on, it answers replies and sends anything that
            needs a decision to{" "}
            <Link href="/requests" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
              Needs you
            </Link>
            . Other replies wait in your{" "}
            <Link href="/unibox?view=awaiting" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
              Inbox
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
        <Stat bare label="Emails sent" value={stats.totalSent.toLocaleString()} hint="Including follow-ups" />
        <Stat
          bare
          label="Open rate"
          value={`${stats.openRate}%`}
          hint={`${stats.openedLeads.toLocaleString()} leads opened`}
        />
        <Stat
          bare
          label="Replies"
          value={stats.replyCount.toLocaleString()}
          delta={{ value: `${stats.replyRate}%`, tone: Number(stats.replyRate) > 0 ? "success" : "neutral" }}
          hint="Share of leads emailed who replied"
        />
        <Stat bare label="Leads in play" value={stats.totalLeads.toLocaleString()} hint="Across your lead lists" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <PerformanceBreakdown campaigns={activeCampaigns} postalHeld={postalHold.held} />

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
                      href={`/unibox?reply=${encodeURIComponent(reply.id)}`}
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
                activeRun ? <PhaseBadge phase={runPhase.get(activeRun.id) ?? "paused"} /> : null
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

                {targetRoles.length > 0 && <ChipGroup label="Target roles" items={targetRoles.slice(0, 5)} />}
                {industries.length > 0 && <ChipGroup label="Industries" items={industries.slice(0, 5)} />}

                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3 text-[13px]">
                  <div>
                    <dt className="text-xs text-muted-foreground">Daily volume</dt>
                    <dd className="tabular mt-0.5 font-medium">
                      {activeRunCampaign?.dailyLimit ?? activeRun.dailyEmailLimit} emails
                    </dd>
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
                    {(offers[0].angle || offers[0].valueProp) && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                        {offers[0].angle || offers[0].valueProp}
                      </p>
                    )}
                  </div>
                )}

                <Button asChild variant="outline" className="w-full">
                  {runPhase.get(activeRun.id) === "draft" ? (
                    <Link href={guidedSetupHref(activeRun.id)}>
                      Continue setup <ArrowRight />
                    </Link>
                  ) : (
                    <Link href={`/chad-gtm/${activeRun.id}`}>
                      Open mission control <ArrowRight />
                    </Link>
                  )}
                </Button>
              </CardContent>
            )}
          </Card>

          <ActivityFeed initialActivities={activity} liveCampaignIds={liveCampaignIds} />
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
