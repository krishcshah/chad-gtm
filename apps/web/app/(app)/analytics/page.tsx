import Link from "next/link";
import { BarChart3, Inbox, Mail, Rocket } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getDashboardStats, listCampaigns, listReplies } from "@/lib/queries";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Progress,
} from "@smartreach/ui";
import { formatDateTime } from "@smartreach/shared";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requireUser();
  const [stats, campaigns, replies] = await Promise.all([
    getDashboardStats(user.id),
    listCampaigns(user.id),
    listReplies(user.id, 8),
  ]);

  const cards = [
    { label: "Emails sent today", value: stats.emailsSentToday },
    { label: "Queued today", value: stats.emailsQueuedToday },
    { label: "Failed today", value: stats.failedToday },
    { label: "Total replies", value: stats.replyCount },
    { label: "Total leads", value: stats.totalLeads },
    { label: "Senders", value: `${stats.senderActive}/${stats.senderTotal}` },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="Analytics"
        description="Reply-first signal across campaigns. No vanity charts."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-5">
              <p className="text-[13px] text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[15px] font-medium">
              <BarChart3 className="size-4 text-primary" aria-hidden />
              Campaign reply rates
            </h3>
            {campaigns.length === 0 ? (
              <EmptyState
                icon={Rocket}
                title="No campaigns yet"
                description="Launch a campaign to see sent vs replied rates here."
                className="border-0 bg-transparent py-10"
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/campaigns/new">Create campaign</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {campaigns.map((c) => {
                  const rate = c.sent > 0 ? (c.replied / c.sent) * 100 : 0;
                  return (
                    <Link
                      key={c.id}
                      href={`/campaigns/${c.id}`}
                      className="block rounded-lg border border-border/60 p-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {c.replied}/{c.sent} · {rate.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={Math.min(100, rate)} className="h-1.5" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[15px] font-medium">
              <Inbox className="size-4 text-primary" aria-hidden />
              Recent replies
            </h3>
            {replies.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No replies yet"
                description="When a lead replies, it lands in Unibox and sending stops for them."
                className="border-0 bg-transparent py-10"
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/unibox">Open Unibox</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {replies.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border/50 px-3 py-2.5 text-sm">
                    <p className="font-medium">{r.fromEmail}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.subject} · {formatDateTime(r.receivedAt)}
                    </p>
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
