import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCampaign, getTemplate } from "@/lib/queries";
import { getCampaignSequence } from "@/lib/actions";
import { Badge, Button, Card, CardContent, Progress, StatePanel, statusVariant } from "@smartreach/ui";
import { formatDate } from "@smartreach/shared";
import { CampaignActions } from "../campaign-actions";
import { CampaignTabs } from "./campaign-tabs";
import { SequenceEditor } from "./sequence-editor";

export const dynamic = "force-dynamic";


function isDenied(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab } = await searchParams;
  const c = await getCampaign(user.id, id);
  if (!c) notFound();

  const [sequence, template] = await Promise.all([
    getCampaignSequence(id),
    c.templateId ? getTemplate(user.id, c.templateId) : Promise.resolve(null),
  ]);

  const total = Number(c.stats?.total ?? 0);
  const sent = Number(c.stats?.sent ?? 0);
  const replied = Number(c.stats?.replied ?? 0);
  const failed = Number(c.stats?.failed ?? 0);
  const bounced = Number(c.stats?.bounced ?? 0);
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;

  const replyRate = sent > 0 ? `${((replied / sent) * 100).toFixed(1)}%` : "—";
  const stats = [
    { label: "Total leads", value: total },
    { label: "Sent", value: sent },
    { label: "Replies", value: replied },
    { label: "Reply rate", value: replyRate },
    { label: "Failed", value: failed },
    { label: "Bounced", value: bounced },
  ];

  const sequenceError = sequence.ok ? null : sequence.error;
  const denied = sequenceError ? isDenied(sequenceError) : false;
  const retryHref = `/campaigns/${c.id}?tab=sequence`;

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            <Badge variant={statusVariant(c.status)} dot={c.status === "running"}>
              {c.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {formatDate(c.createdAt)}
            {c.scheduledAt ? ` · Scheduled for ${formatDate(c.scheduledAt)}` : ""}
          </p>
        </div>
        <CampaignActions id={c.id} status={c.status} />
      </div>

      <CampaignTabs
        initialTab={tab === "sequence" ? "sequence" : "overview"}
        stepCount={sequence.ok ? sequence.data?.steps.length ?? 0 : undefined}
        overview={
          <>
            <Card>
              <CardContent className="p-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Delivery progress</span>
                  <span className="tabular-nums text-muted-foreground">
                    {sent}/{total} · {pct}%
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
                {total === 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No leads queued yet. Attach a lead list with pending prospects to start delivering.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {stats.map((s) => (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="mt-1 text-2xl font-semibold">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="p-5">
                <h3 className="mb-4 font-medium">Sender rotation ({c.senders.length})</h3>
                {c.senders.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
                    No senders attached to this campaign.
                  </p>
                ) : (
                  <div className="divide-y">
                    {c.senders.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{s.senderName}</span>
                          <span className="ml-2 text-muted-foreground">{s.email}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                          <span>health {s.health}</span>
                          <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        }
        sequence={
          sequence.ok && sequence.data ? (
            <SequenceEditor
              campaignId={c.id}
              initialSteps={sequence.data.steps}
              templateName={template?.name ?? null}
              hasTemplate={Boolean(c.templateId)}
            />
          ) : (
            <StatePanel
              kind={denied ? "permission" : "error"}
              title={denied ? "Access denied" : "Could not load this sequence"}
              description={
                denied
                  ? "You do not have permission to view this sequence. Sign in with an allowed account, or go back to the dashboard."
                  : sequenceError || "The sequence could not be loaded."
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={retryHref}>Try again</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard">Back to dashboard</Link>
                  </Button>
                </div>
              }
            />
          )
        }
      />
    </div>
  );
}
