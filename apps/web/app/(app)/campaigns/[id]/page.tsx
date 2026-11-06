import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatDateTime } from "@smartreach/shared";
import { Badge, Button, Card, PageHeader, Stat, StatePanel, statusVariant } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { getCampaign, getTemplate, listSenders } from "@/lib/queries";
import { getCampaignSequence } from "@/lib/actions";
import { getPostalHold } from "@/lib/postal-hold";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";
import { Page } from "@/components/layout/page";
import { PostalHoldNotice } from "../../postal-hold-notice";
import { formatPercent } from "../format";
import { CampaignHeaderActions } from "./campaign-header-actions";
import { CampaignTabs } from "./campaign-tabs";
import { DeliveryCard, MailboxesCard, ScheduleCard, SequenceSummaryCard } from "./overview-cards";
import { SequenceEditor } from "./sequence-editor";

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

  const [sequence, template, allSenders, postalHold] = await Promise.all([
    getCampaignSequence(id),
    c.templateId ? getTemplate(user.id, c.templateId) : Promise.resolve(null),
    listSenders(user.id, workspace.id, workspace.isDefault),
    // Compliance settings belong to the campaign owner (that is what the engine reads).
    getPostalHold(c.userId, { campaignId: c.id }),
  ]);

  const { total, sent, replied, failed, bounced, pending } = c.stats;
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  const steps = sequence.ok ? (sequence.data?.steps ?? []) : null;
  const sequenceError = sequence.ok ? null : sequence.error;
  const denied = sequenceError ? isDenied(sequenceError) : false;
  const retryHref = `/campaigns/${c.id}?tab=sequence`;
  const mailboxCount = c.senders.length;

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
            {c.leadListId ? (
              <>
                Sends to{" "}
                <Link
                  href={`/leads/${c.leadListId}`}
                  className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                >
                  {c.leadListName ?? "its lead list"}
                </Link>
                {" "}from {mailboxCount} {mailboxCount === 1 ? "mailbox" : "mailboxes"}.
              </>
            ) : (
              <>
                No lead list attached. Sends from {mailboxCount} {mailboxCount === 1 ? "mailbox" : "mailboxes"}.
              </>
            )}
          </>
        }
        meta={
          <>
            <Badge variant={statusVariant(c.status)} dot className="capitalize">
              {c.status}
            </Badge>
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
          />
        }
      />

      <PostalHoldNotice hold={postalHold} scope="campaign" />

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
        <Stat bare label="Leads" value={total.toLocaleString()} hint={`${pending.toLocaleString()} not contacted yet`} />
        <Stat bare label="Emails sent" value={sent.toLocaleString()} hint={`${pct}% of leads`} />
        <Stat
          bare
          label="Replies"
          value={replied.toLocaleString()}
          delta={sent > 0 ? { value: formatPercent(replied, sent), tone: replied > 0 ? "success" : "neutral" } : undefined}
          hint="Reply rate on sent email"
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
              <SequenceSummaryCard steps={steps} error={sequenceError} templateName={template?.name ?? null} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <DeliveryCard total={total} sent={sent} pending={pending} dailyLimit={c.dailyLimit} />
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
              />
              <MailboxesCard senders={c.senders} />
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
    </Page>
  );
}
