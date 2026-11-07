import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { formatDate, formatDateTime } from "@smartreach/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  Stat,
  StatePanel,
} from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { getCampaign, getTemplate, listSenders } from "@/lib/queries";
import { getCampaignSequence } from "@/lib/actions";
import { getPostalHold } from "@/lib/postal-hold";
import { describeSendBlock } from "@/lib/send-block";
import { loadCampaignCapacity } from "@/lib/sending-capacity";
import { getDb } from "@/lib/db";
import { getCampaignLeadConversation } from "@/lib/lead-conversations-server";
import { LeadConversationsControl } from "@/components/lead-conversations/lead-conversations-control";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";
import { Page } from "@/components/layout/page";
import { PostalHoldNotice } from "../../postal-hold-notice";
import { CampaignSendStatus } from "../../campaign-send-status";
import { CampaignStatusBadge } from "../../campaign-status-badge";
import { formatPercent } from "../format";
import { CampaignHeaderActions } from "./campaign-header-actions";
import { AddNewLeadsButton } from "./add-new-leads-button";
import { CampaignTabs } from "./campaign-tabs";
import { DeliveryCard, MailboxesCard, ScheduleCard, SequenceSummaryCard } from "./overview-cards";
import { SequenceEditor } from "./sequence-editor";
import { VariantResults } from "./variant-results";
import { getVariantStatsForCampaign } from "@/lib/analytics";
import { summarizeVariantStats, type VariantStatRow } from "@/lib/variant-stats";

export const dynamic = "force-dynamic";

// Shared by generateMetadata and the page so the campaign is read once per request.
const loadCampaign = cache(getCampaign);

function isDenied(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireWorkspace();
    const { id } = await params;
    const c = await loadCampaign(user.id, id, workspace.id, workspace.isDefault);
    return { title: c?.name ?? "Campaign" };
  } catch {
    return { title: "Campaign" };
  }
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const c = await loadCampaign(user.id, id, workspace.id, workspace.isDefault);
  if (!c) notFound();

  const [sequence, template, allSenders, postalHold, leadConversation, capacity, variantRows] = await Promise.all([
    getCampaignSequence(id),
    c.templateId ? getTemplate(user.id, c.templateId) : Promise.resolve(null),
    listSenders(user.id, workspace.id, workspace.isDefault),
    // Compliance settings belong to the campaign owner (that is what the engine reads).
    getPostalHold(c.userId, { campaignId: c.id }),
    getCampaignLeadConversation(user.id, c.id),
    loadCampaignCapacity(getDb(), c, c.senders),
    getVariantStatsForCampaign(user.id, id).catch(() => [] as VariantStatRow[]),
  ]);
  // The postal hold has its own notice below, so the status line skips it.
  const sendStatus = describeSendBlock(c, new Date(), { skipPostal: true });
  const linkedRunId = leadConversation?.target.kind === "campaign" ? leadConversation.target.runId : null;

  const { total, sent, replied, failed, bounced, pending } = c.stats;
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  const steps = sequence.ok ? (sequence.data?.steps ?? []) : null;
  const sequenceError = sequence.ok ? null : sequence.error;
  const denied = sequenceError ? isDenied(sequenceError) : false;
  const retryHref = `/campaigns/${c.id}?tab=sequence`;
  const mailboxCount = c.senders.length;
  // Autopilot writes this campaign's emails; admins keep the editor.
  const autopilotRunId = c.autopilotRunId;
  const managed = Boolean(autopilotRunId) && !isAdmin(user);
  // Pool campaigns send from the shared mailbox pool, not mailboxes the user owns (#67).
  const usesPool = c.senders.some((s) => s.isSystemPool);
  const mailboxPhrase = usesPool
    ? "the shared AutoGTM mailbox pool"
    : `${mailboxCount} ${mailboxCount === 1 ? "mailbox" : "mailboxes"}`;
  // The campaign emails a copy of its list; offer to add leads that joined later (#40).
  const showAddNewLeads =
    c.newListLeads > 0 &&
    ["running", "scheduled", "paused"].includes(c.status) &&
    !((c.isAutopilot || usesPool) && !isAdmin(user));

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Campaigns
          </Link>
        }
        title={c.name}
        description={
          <>
            {c.leadListId && c.leadListDeleted ? (
              <>Its lead list was deleted. Sends from {mailboxPhrase}.</>
            ) : c.leadListId ? (
              <>
                {c.leadListCopiedAt ? "Sends to the leads that were in " : "Sends to "}
                <Link
                  href={`/leads/${c.leadListId}`}
                  className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                >
                  {c.leadListName ?? "its lead list"}
                </Link>
                {c.leadListCopiedAt
                  ? ` on ${formatDate(c.leadListCopiedAt)}, from ${mailboxPhrase}.`
                  : ` from ${mailboxPhrase}.`}
                {showAddNewLeads ? (
                  <span className="ml-2 inline-flex align-middle">
                    <AddNewLeadsButton campaignId={c.id} count={c.newListLeads} />
                  </span>
                ) : null}
              </>
            ) : (
              <>No lead list attached. Sends from {mailboxPhrase}.</>
            )}
          </>
        }
        meta={
          <>
            <CampaignStatusBadge status={c.status} held={postalHold.held} />
            {autopilotRunId ? <Badge variant="neutral">Autopilot</Badge> : null}
            {c.status === "scheduled" && c.scheduledAt ? (
              <span className="text-[13px] text-muted-foreground">Starts {formatDateTime(c.scheduledAt)}</span>
            ) : null}
            <span className="text-[13px] text-subtle-foreground">Created {formatDate(c.createdAt)}</span>
          </>
        }
        actions={
          <CampaignHeaderActions
            status={c.status}
            campaign={c}
            availableSenders={allSenders.map((s) => ({
              id: s.id,
              senderName: s.senderName,
              email: s.email,
              status: s.status,
            }))}
            autopilotRunId={autopilotRunId}
            managed={managed}
            failed={c.stats.failed}
          />
        }
      />

      <PostalHoldNotice hold={postalHold} scope="campaign" />
      <CampaignSendStatus view={sendStatus} />

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
        <Stat bare label="Leads" value={total.toLocaleString()} hint={`${pending.toLocaleString()} not contacted yet`} />
        <Stat bare label="Leads emailed" value={sent.toLocaleString()} hint={`${pct}% of leads`} />
        <Stat
          bare
          label="Replies"
          value={replied.toLocaleString()}
          delta={sent > 0 ? { value: formatPercent(replied, sent), tone: replied > 0 ? "success" : "neutral" } : undefined}
          hint="Share of leads emailed who replied"
        />
        <Stat bare label="Failed" value={failed.toLocaleString()} hint={`${bounced.toLocaleString()} bounced`} />
      </Card>

      <CampaignTabs
        initialTab={sp.tab === "sequence" ? "sequence" : "overview"}
        stepCount={steps ? steps.length : undefined}
        overview={
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              <AnalyticsSectionLoader
                campaignId={c.id}
                from={sp.from}
                to={sp.to}
                heading="Activity"
                description="Emails sent, replies and bounces per day."
              />
              <SequenceSummaryCard
                steps={steps}
                error={sequenceError}
                templateName={template?.name ?? null}
                managed={managed}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <DeliveryCard total={total} sent={sent} pending={pending} capacity={capacity} />
              <ScheduleCard
                dailyLimit={c.dailyLimit}
                windowStart={c.sendingWindowStart}
                windowEnd={c.sendingWindowEnd}
                timezone={c.sendingTimezone}
                businessDaysOnly={c.businessDaysOnly}
                minDelaySec={c.minDelaySec}
                maxDelaySec={c.maxDelaySec}
                stopOnReply={c.stopOnReply}
                trackOpens={c.trackOpens}
                capacity={capacity}
                maxEmailsPerSenderPerDay={c.maxEmailsPerSenderPerDay}
                retryFailed={c.retryFailed}
                retryCount={c.retryCount}
                managedByAutopilot={managed}
              />
              {leadConversation ? (
                <Card>
                  <CardHeader
                    actions={
                      linkedRunId ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/chad-gtm/${linkedRunId}`}>
                            Autopilot run <ArrowUpRight />
                          </Link>
                        </Button>
                      ) : undefined
                    }
                  >
                    <CardTitle>Lead conversations</CardTitle>
                    <CardDescription>
                      Who answers replies from this campaign&apos;s leads.
                      {linkedRunId ? " Also shown on the Autopilot run." : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <LeadConversationsControl
                      target={{ campaignId: c.id }}
                      initialState={leadConversation}
                      showOffer
                      label="Who answers"
                    />
                  </CardContent>
                </Card>
              ) : null}
              <MailboxesCard senders={c.senders} />
            </div>
          </div>
        }
        sequence={
          managed && autopilotRunId ? (
            <div className="flex flex-col gap-6">
              <Alert
                variant="info"
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/chad-gtm/${autopilotRunId}`}>Open in Autopilot</Link>
                  </Button>
                }
              >
                <AlertTitle>Managed by Autopilot</AlertTitle>
                <AlertDescription>
                  Autopilot writes these emails for each lead from your plan, so they can&apos;t be edited here.
                </AlertDescription>
              </Alert>
              <SequenceSummaryCard
                steps={steps}
                error={sequenceError}
                templateName={template?.name ?? null}
                managed
              />
            </div>
          ) : sequence.ok && sequence.data ? (
            <div className="flex flex-col gap-6">
              <VariantResults steps={summarizeVariantStats(variantRows, { trackOpens: c.trackOpens })} />
              <SequenceEditor
                campaignId={c.id}
                initialSteps={sequence.data.steps}
                templateName={template?.name ?? null}
                hasTemplate={Boolean(c.templateId)}
              />
            </div>
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
    </Page>
  );
}
