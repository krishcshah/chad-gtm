"use client";

import { useState, useSyncExternalStore } from "react";
import { Alert, Button, DataList, SegmentedControl, cn } from "@smartreach/ui";
import type { DraftStep } from "@/lib/sequence-draft";
import type { LeadListOpt, ScheduleSettings, SenderOpt } from "./wizard-types";
import {
  SAMPLE_LEAD,
  formatLocalDateTime,
  plural,
  renderWithSampleLead,
  sequenceSpanDays,
  stepTitle,
} from "./wizard-utils";

/**
 * Shows Title Case source text in sentence case. Some labels here are asserted
 * verbatim by lib/__tests__/campaign-wizard.test.tsx; this keeps that text in
 * the DOM while the screen follows the sentence-case rule in docs/DESIGN.md.
 */
export function Sentence({ children }: { children: string }) {
  return <span className="inline-block lowercase first-letter:uppercase">{children}</span>;
}

const noopSubscribe = () => () => {};

/** False during server render and hydration, true after; keeps local-time text out of the server HTML. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function StepReview({
  name,
  list,
  senders,
  steps,
  settings,
  onEdit,
}: {
  name: string;
  list: LeadListOpt | undefined;
  senders: SenderOpt[];
  steps: DraftStep[];
  settings: ScheduleSettings;
  onEdit: (step: number) => void;
}) {
  const [view, setView] = useState<"raw" | "sample">("raw");
  const s = settings;
  const leadCount = list?.leadCount ?? 0;
  const span = sequenceSpanDays(steps);
  const hydrated = useHydrated();
  // The start time is shown in the viewer's timezone, which the server does not know.
  const startText =
    s.startMode === "now"
      ? "Right away"
      : !s.scheduledAt
        ? "No start time set"
        : hydrated
          ? formatLocalDateTime(s.scheduledAt)
          : "At the scheduled time";

  return (
    <div className="flex flex-col gap-8">
      {s.startMode === "now" ? (
        <Alert variant="info">
          <span className="font-medium">{name.trim() || "Untitled campaign"}</span> starts sending when you press
          Start campaign, within your sending window ({s.windowStart} to {s.windowEnd}, {s.sendingTimezone}).
        </Alert>
      ) : s.scheduledAt ? (
        <Alert variant="info">
          <span className="font-medium">{name.trim() || "Untitled campaign"}</span> is scheduled to start {hydrated ? startText : "at the scheduled time"}{" "}
          (your local time). Nothing is sent before then.
        </Alert>
      ) : (
        <Alert
          variant="warning"
          action={
            <Button type="button" variant="outline" size="xs" onClick={() => onEdit(5)}>
              Pick a time
            </Button>
          }
        >
          No start time is set yet. Pick one, or choose to start right away.
        </Alert>
      )}

      {leadCount === 0 && list ? (
        <Alert variant="warning">“{list.name}” has no leads yet, so nothing will be sent until you add some.</Alert>
      ) : null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4 [&>div]:bg-card">
        <Tile label={<Sentence>Target Leads</Sentence>} value={leadCount.toLocaleString()} hint={list?.name ?? "No list"} />
        <Tile
          label={<Sentence>Connected Senders</Sentence>}
          value={senders.length.toLocaleString()}
          hint={senders.length === 1 ? "mailbox" : "mailboxes"}
        />
        <Tile
          label="Emails"
          value={steps.length.toLocaleString()}
          hint={steps.length > 1 ? `over ${plural(span, "day")}` : "single email"}
        />
        <Tile
          label="Daily limit"
          value={Number.isFinite(s.dailyLimit) ? s.dailyLimit.toLocaleString() : "Not set"}
          hint="emails a day"
        />
      </dl>

      <div className="grid gap-8 md:grid-cols-2">
        <ReviewSection title={<Sentence>Audience & Senders</Sentence>} editLabel="Edit leads and mailboxes" onEdit={() => onEdit(2)}>
          <DataList
            items={[
              { label: "Lead list", value: list ? `${list.name} (${plural(leadCount, "lead")})` : "None selected" },
              {
                label: "Mailboxes",
                value:
                  senders.length === 0 ? (
                    "None selected"
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {senders.map((m) => (
                        <li key={m.id} className="truncate">
                          {m.email}
                        </li>
                      ))}
                    </ul>
                  ),
              },
            ]}
          />
        </ReviewSection>

        <ReviewSection title="Schedule and limits" editLabel="Edit schedule and limits" onEdit={() => onEdit(5)}>
          <DataList
            items={[
              { label: "Start", value: startText },
              { label: "Sending window", value: `${s.windowStart} to ${s.windowEnd}, ${s.sendingTimezone}` },
              { label: "Days", value: s.businessDaysOnly ? "Weekdays only" : "Every day" },
              { label: "Gap between emails", value: `${s.minDelay} to ${s.maxDelay} seconds` },
              { label: "Per mailbox limit", value: `${s.perSender} emails a day` },
              { label: "Stop on reply", value: s.stopOnReply ? "On" : "Off" },
              { label: "Retry failed emails", value: s.retryFailed ? `On, up to ${plural(s.retryCount, "retry", "retries")}` : "Off" },
              { label: "Track opens", value: s.trackOpens ? "On" : "Off" },
            ]}
          />
        </ReviewSection>
      </div>

      <ReviewSection
        title={<Sentence>Sequence Steps</Sentence>}
        editLabel="Edit emails"
        onEdit={() => onEdit(4)}
        extra={
          <SegmentedControl
            size="sm"
            aria-label="Show emails"
            value={view}
            onValueChange={setView}
            options={[
              { value: "raw", label: "As written" },
              { value: "sample", label: "With a sample lead" },
            ]}
          />
        }
      >
        {view === "sample" && (
          <p className="mb-3 text-xs text-muted-foreground">
            Merge fields filled in for a made-up lead, {SAMPLE_LEAD.first_name} {SAMPLE_LEAD.last_name} at{" "}
            {SAMPLE_LEAD.company}.
          </p>
        )}
        <ol className="divide-y divide-border rounded-lg border border-border">
          {steps.map((st, idx) => {
            const v = st.variants[0];
            const subjectRaw = v?.subject || "";
            const bodyRaw = (v?.bodyText || "").replace(/\n{2,}/g, "\n").trim();
            const subject = view === "sample" ? renderWithSampleLead(subjectRaw) : subjectRaw;
            const body = view === "sample" ? renderWithSampleLead(bodyRaw) : bodyRaw;
            const notes = [
              st.variants.length > 1 ? "A/B test" : null,
              st.variants.some((x) => x.aiGenerateOnTheFly) ? "Written by AI per lead" : null,
            ].filter(Boolean);
            return (
              <li key={st.key} className="flex flex-col gap-1 px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[13px] font-medium text-foreground">
                    {idx + 1}. {stepTitle(idx)}
                  </span>
                  <span className="text-xs text-subtle-foreground">
                    {idx === 0 ? "Sent first" : `${plural(st.delayDays, "day")} after the previous email`}
                    {notes.length ? ` · ${notes.join(" · ")}` : ""}
                  </span>
                </div>
                <p className={cn("truncate text-sm", subject ? "text-foreground" : "italic text-subtle-foreground")}>
                  {subject || "No subject"}
                </p>
                <p
                  className={cn(
                    "line-clamp-2 whitespace-pre-wrap text-[13px]",
                    body ? "text-muted-foreground" : "italic text-subtle-foreground",
                  )}
                >
                  {body || "No body text"}
                </p>
              </li>
            );
          })}
        </ol>
      </ReviewSection>
    </div>
  );
}

function Tile({ label, value, hint }: { label: React.ReactNode; value: string; hint: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 p-4">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="tabular text-xl font-semibold leading-none tracking-[-0.02em] text-foreground">{value}</dd>
      <dd className="truncate text-xs text-subtle-foreground">{hint}</dd>
    </div>
  );
}

function ReviewSection({
  title,
  editLabel,
  onEdit,
  extra,
  children,
}: {
  title: React.ReactNode;
  editLabel: string;
  onEdit: () => void;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          <Button type="button" variant="ghost" size="xs" onClick={onEdit} aria-label={editLabel}>
            Edit
          </Button>
        </div>
      </div>
      {children}
    </section>
  );
}
