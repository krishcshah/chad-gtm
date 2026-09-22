import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers, Mail, Timer, Users } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getCampaign, getTemplate, listSenders } from "@/lib/queries";
import { getCampaignSequence } from "@/lib/actions";
import { Badge, Button, Card, CardContent, Progress, StatePanel, statusVariant, cn } from "@smartreach/ui";
import { formatDate } from "@smartreach/shared";
import { CampaignActions } from "../campaign-actions";
import { CampaignTabs } from "./campaign-tabs";
import { SequenceEditor } from "./sequence-editor";
import { EditCampaignDialog } from "./edit-campaign-dialog";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";

export const dynamic = "force-dynamic";

function isDenied(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const c = await getCampaign(user.id, id);
  if (!c) notFound();

  const [sequence, template, allSenders] = await Promise.all([
    getCampaignSequence(id),
    c.templateId ? getTemplate(user.id, c.templateId) : Promise.resolve(null),
    listSenders(user.id),
  ]);

  const total = Number(c.stats?.total ?? 0);
  const sent = Number(c.stats?.sent ?? 0);
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;

  const sequenceError = sequence.ok ? null : sequence.error;
  const denied = sequenceError ? isDenied(sequenceError) : false;
  const retryHref = `/campaigns/${c.id}?tab=sequence`;

  return (
    <div className="page-stack">
      {/* Executive Header */}
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

        {/* Action Controls: Edit Campaign & Dropdown Actions */}
        <div className="flex items-center gap-2">
          <EditCampaignDialog
            campaign={c}
            availableSenders={allSenders.map((s) => ({
              id: s.id,
              senderName: s.senderName,
              email: s.email,
              status: s.status,
            }))}
          />
          <CampaignActions id={c.id} status={c.status} />
        </div>
      </div>

      <CampaignTabs
        initialTab={sp.tab === "sequence" ? "sequence" : "overview"}
        stepCount={sequence.ok ? sequence.data?.steps.length ?? 0 : undefined}
        overview={
          <div className="space-y-6">
            {/* Delivery Progress Bar */}
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

            {/* Analytics & Performance Graph AT THE TOP */}
            <AnalyticsSectionLoader
              campaignId={c.id}
              from={sp.from}
              to={sp.to}
              heading="Campaign Outreach & Conversion Trajectory"
              description="Real-time daily sending volume, unique lead reply conversions, and bounce monitoring."
            />

            {/* Rich Campaign Intelligence Section Below Graph */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Mailbox Delivery Health */}
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Mail className="size-4 text-primary" />
                      Connected Inboxes ({c.senders.length})
                    </h3>
                    <span className="text-xs text-muted-foreground font-mono">
                      {c.senders.filter((s) => s.status === "active").length} active
                    </span>
                  </div>
                  {c.senders.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No senders attached to this campaign.</p>
                  ) : (
                    <div className="space-y-2">
                      {c.senders.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={cn(
                                "size-2 rounded-full shrink-0",
                                s.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                              )}
                            />
                            <span className="font-medium text-foreground truncate">{s.senderName || s.email}</span>
                            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">&lt;{s.email}&gt;</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 font-mono">
                              {s.health ?? 100}% Health
                            </Badge>
                            <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 capitalize">
                              {s.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sending Schedule & Pacing */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <Timer className="size-4 text-primary" />
                    Sending Schedule & Pace
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-[11px] text-muted-foreground">Daily Sending Limit</span>
                      <p className="mt-0.5 font-semibold text-foreground font-mono">
                        {c.dailyLimit ? `${c.dailyLimit.toLocaleString()} emails/day` : "Unlimited"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-[11px] text-muted-foreground">Active Window</span>
                      <p className="mt-0.5 font-semibold text-foreground font-mono">
                        {c.sendingWindowStart || "09:00"} – {c.sendingWindowEnd || "17:00"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-[11px] text-muted-foreground">Sending Timezone</span>
                      <p className="mt-0.5 font-semibold text-foreground font-mono">
                        {c.sendingTimezone || "UTC"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-[11px] text-muted-foreground">Schedule Mode</span>
                      <p className="mt-0.5 font-semibold text-foreground">
                        {c.businessDaysOnly ? "Weekdays (Mon–Fri)" : "All 7 Days"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                    <span>Anti-spam jitter delay:</span>
                    <span className="font-mono text-foreground font-medium">
                      ~{c.minDelaySec || 120}s – {c.maxDelaySec || 300}s between sends
                    </span>
                  </div>
                  {c.dailyLimit && c.dailyLimit > 0 && total > sent ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Estimated to complete remaining {(total - sent).toLocaleString()} leads in ~{Math.ceil((total - sent) / c.dailyLimit)} days.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            {/* Sequence Step Funnel Overview & Audience */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Sequence Flow */}
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Layers className="size-4 text-primary" />
                      Sequence Flow ({sequence.ok ? sequence.data?.steps.length ?? 0 : 0} steps)
                    </h3>
                    <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-primary">
                      <Link href={`/campaigns/${c.id}?tab=sequence`}>
                        Edit Sequence &rarr;
                      </Link>
                    </Button>
                  </div>
                  {sequence.ok && sequence.data && sequence.data.steps.length > 0 ? (
                    <div className="space-y-2">
                      {sequence.data.steps.map((step, idx) => (
                        <div
                          key={step.id}
                          className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {idx + 1}
                            </span>
                            <span className="font-medium text-foreground truncate">
                              {step.variants[0]?.subject || (idx === 0 ? "Initial Outreach" : "Follow-up Step")}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                            {idx === 0 ? "Immediate" : `+${step.delayDays}d delay`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No sequence steps configured yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* Audience & Lead List */}
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Users className="size-4 text-primary" />
                      Target Audience
                    </h3>
                    {c.leadListId ? (
                      <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-primary">
                        <Link href={`/leads/${c.leadListId}`}>
                          View List &rarr;
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-[11px] text-muted-foreground">Attached Contact List</span>
                      <p className="mt-0.5 font-medium text-foreground">
                        {c.leadListName || "All Contacts / Custom Snapshot"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                        <span className="text-[11px] text-muted-foreground">Total Ingested Leads</span>
                        <p className="mt-0.5 font-semibold text-foreground font-mono">{total.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                        <span className="text-[11px] text-muted-foreground">Remaining in Queue</span>
                        <p className="mt-0.5 font-semibold text-foreground font-mono">{Math.max(0, total - sent).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
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
