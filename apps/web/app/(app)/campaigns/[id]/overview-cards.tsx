import { ArrowUpRight, Layers, Mail } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataList,
  EmptyState,
  Progress,
  statusVariant,
} from "@smartreach/ui";
import { waitLabel, type StepSource } from "@/lib/sequence-draft";
import { OpenSequenceButton } from "./campaign-tabs";

/** "90s", "2 min", "2.5 min" */
function seconds(value: number): string {
  if (value < 120) return `${value}s`;
  const min = value / 60;
  return `${Number.isInteger(min) ? min : min.toFixed(1)} min`;
}

export function DeliveryCard({
  total,
  sent,
  pending,
  dailyLimit,
}: {
  total: number;
  sent: number;
  pending: number;
  dailyLimit: number | null;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  // Only leads still waiting for their first email count; failed leads are never retried here.
  const days = dailyLimit && dailyLimit > 0 && pending > 0 ? Math.ceil(pending / dailyLimit) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery</CardTitle>
        <CardDescription>How far the campaign has got through its leads.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-muted-foreground">
            <span className="tabular font-medium text-foreground">{sent.toLocaleString()}</span> of{" "}
            <span className="tabular">{total.toLocaleString()}</span> leads emailed
          </span>
          <span className="tabular font-medium">{pct}%</span>
        </div>
        <Progress value={pct} aria-label={`${pct}% of leads emailed`} />
        {total === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            No leads are queued yet. Leads from the attached list are queued when the campaign starts.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-subtle-foreground">
            {pending.toLocaleString()} not contacted yet
            {days ? ` · about ${days} more sending ${days === 1 ? "day" : "days"} at the daily limit` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ScheduleCard({
  dailyLimit,
  windowStart,
  windowEnd,
  timezone,
  businessDaysOnly,
  minDelaySec,
  maxDelaySec,
  stopOnReply,
  trackOpens,
}: {
  dailyLimit: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  timezone: string | null;
  businessDaysOnly: boolean | null;
  minDelaySec: number | null;
  maxDelaySec: number | null;
  stopOnReply: boolean | null;
  trackOpens: boolean | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
        <CardDescription>Change these in Settings.</CardDescription>
      </CardHeader>
      <CardContent className="pt-3">
        <DataList
          items={[
            { label: "Daily limit", value: dailyLimit ? `${dailyLimit.toLocaleString()} emails` : "No limit" },
            {
              label: "Sending hours",
              value: `${windowStart || "09:00"}–${windowEnd || "17:00"} ${timezone || "UTC"}`,
            },
            { label: "Days", value: businessDaysOnly ? "Weekdays only" : "Every day" },
            {
              label: "Gap between emails",
              value: `${seconds(minDelaySec || 120)}–${seconds(maxDelaySec || 300)}`,
            },
            { label: "Stop on reply", value: stopOnReply === false ? "Off" : "On" },
            { label: "Open tracking", value: trackOpens === false ? "Off" : "On" },
          ]}
        />
      </CardContent>
    </Card>
  );
}

export function MailboxesCard({
  senders,
}: {
  senders: { id: string; senderName: string | null; email: string; status: string; health: number | null }[];
}) {
  const active = senders.filter((s) => s.status === "active").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mailboxes</CardTitle>
        <CardDescription>
          {senders.length === 0
            ? "Emails rotate across these mailboxes."
            : `${active} of ${senders.length} active. Emails rotate across them.`}
        </CardDescription>
      </CardHeader>
      {senders.length === 0 ? (
        <EmptyState
          compact
          icon={Mail}
          title="No mailboxes"
          description="Pick at least one mailbox in Settings before you start the campaign."
        />
      ) : (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {senders.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{s.senderName || s.email}</span>
                <span className="block truncate text-xs text-subtle-foreground">
                  {s.senderName ? s.email : null}
                  {s.senderName && typeof s.health === "number" ? " · " : null}
                  {typeof s.health === "number" ? `Health ${s.health}%` : null}
                </span>
              </span>
              <Badge variant={statusVariant(s.status)} dot className="shrink-0 capitalize">
                {s.status.replace(/_/g, " ")}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SequenceSummaryCard({
  steps,
  error,
  templateName,
}: {
  steps: StepSource[] | null;
  error: string | null;
  templateName: string | null;
}) {
  return (
    <Card>
      <CardHeader
        actions={
          <OpenSequenceButton>
            Edit sequence <ArrowUpRight />
          </OpenSequenceButton>
        }
      >
        <CardTitle>Sequence</CardTitle>
        <CardDescription>
          {steps && steps.length > 0
            ? `${steps.length} ${steps.length === 1 ? "email" : "emails"} per lead.`
            : "The emails each lead receives, in order."}
        </CardDescription>
      </CardHeader>
      {error ? (
        <CardContent>
          <p className="text-[13px] text-muted-foreground">The sequence could not be loaded: {error}</p>
        </CardContent>
      ) : !steps || steps.length === 0 ? (
        <EmptyState
          compact
          icon={Layers}
          title="No steps yet"
          description={
            templateName
              ? `Leads get the ${templateName} template until you add steps.`
              : "Add steps to write the first email and its follow-ups."
          }
        />
      ) : (
        <ol className="mt-3 divide-y divide-border border-t border-border">
          {steps.map((step, index) => {
            const first = step.variants[0];
            const ai = step.variants.some((v) => v.aiGenerateOnTheFly);
            const subject = ai ? "Written by AI for each lead" : first?.subject?.trim() || "No subject";
            return (
              <li key={step.id} className="flex items-center gap-3 px-5 py-3">
                <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{subject}</span>
                  <span className="block text-xs text-subtle-foreground">
                    {waitLabel(step.delayDays, index)}
                    {step.variants.length > 1 ? " · A/B test" : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
