"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clock,
  Hourglass,
  Loader2,
  RefreshCw,
  Rocket,
  SearchX,
  Target,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SegmentedControl,
  Textarea,
  cn,
  toast,
  type BadgeProps,
} from "@smartreach/ui";
import {
  completeAutopilotSetupAction,
  retryAutopilotLaunchAction,
  retryAutopilotResearchAction,
  type AutopilotOutcome,
} from "@/lib/autopilot-actions";
import type { RunPhase } from "@/lib/autopilot-policy";
import type { PlanPreview } from "@/lib/autopilot-state";
import { approvalCopy, awaitingApprovalText } from "@/lib/approval-copy";

type Missing = NonNullable<AutopilotOutcome["missing"]>;

/** Manual targeting: the client picks directory industries and titles themselves. */
export const GUIDED_SETUP_HREF = "/chad-gtm?mode=guided";

/** Label and badge variant per run phase (launcher list and mission control header). */
export const PHASE_BADGE: Record<RunPhase, { label: string; variant: BadgeProps["variant"] }> = {
  live: { label: "Live", variant: "success" },
  paused: { label: "Paused", variant: "neutral" },
  completed: { label: "Completed", variant: "outline" },
  needs_research: { label: "Needs your input", variant: "warning" },
  needs_details: { label: "Needs details", variant: "warning" },
  awaiting_approval: { label: "Waiting for approval", variant: "info" },
  ready: { label: "Ready to launch", variant: "info" },
  launch_failed: { label: "Not launched", variant: "destructive" },
  launching: { label: "Launching", variant: "info" },
  draft: { label: "Draft", variant: "neutral" },
};

export function PhaseBadge({ phase, className }: { phase: RunPhase; className?: string }) {
  const b = PHASE_BADGE[phase] ?? PHASE_BADGE.draft;
  return (
    <Badge variant={b.variant} dot className={className}>
      {b.label}
    </Badge>
  );
}

/* ─── Shared building blocks ─────────────────────────────────────────── */

type Tone = "warning" | "info" | "destructive";

const toneIcon: Record<Tone, string> = {
  warning: "bg-warning-soft text-warning-text",
  info: "bg-info-soft text-info-text",
  destructive: "bg-destructive-soft text-destructive-text",
};

/** One card that explains a blocked run and holds the action that unblocks it. */
function StateCard({
  tone,
  icon: Icon,
  spin,
  title,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  spin?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneIcon[tone])}>
          <Icon className={cn("size-4", spin && "animate-spin")} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
        </div>
      </div>
    </Card>
  );
}

/** Label + control + hint with a fixed control id (tests and deep links rely on these ids). */
function FormRow({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ─── Launch details ─────────────────────────────────────────────────── */

/**
 * Booking link + CAN-SPAM identity in one step. Only the missing fields are
 * shown; the identity is saved to the workspace compliance settings.
 */
export function LaunchDetailsForm({
  runId,
  companyLabel,
  missing,
  identity,
  onOutcome,
}: {
  runId: string;
  companyLabel: string;
  missing: Missing;
  identity?: { companyName: string; postalAddress: string };
  onOutcome: (outcome: AutopilotOutcome, message?: string) => void;
}) {
  const needsBooking = missing.includes("bookingUrl");
  const needsIdentity = missing.includes("companyName") || missing.includes("postalAddress");
  const [booking, setBooking] = useState("");
  const [companyName, setCompanyName] = useState(identity?.companyName ?? "");
  const [postalAddress, setPostalAddress] = useState(identity?.postalAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errorId = useId();

  const canSubmit =
    (!needsBooking || booking.trim().length > 0) &&
    (!needsIdentity || (companyName.trim().length > 0 && postalAddress.trim().length > 0));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await completeAutopilotSetupAction(runId, {
        ...(needsBooking ? { bookingUrl: booking } : {}),
        ...(needsIdentity ? { companyName, postalAddress } : {}),
      });
      if (!res.ok) return void setError(res.error);
      onOutcome(res.data!, res.message);
    });

  const title =
    needsBooking && needsIdentity
      ? "Two details before we send"
      : needsBooking
        ? "Where should interested leads book a call?"
        : "Add your sender details";

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !pending) submit();
        }}
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-warning-text" aria-hidden />
            <CardTitle>{title}</CardTitle>
          </div>
          <CardDescription>Nothing is sent until these are filled in.</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-5 p-5">
          {needsBooking && (
            <FormRow
              id="setup-booking"
              label="Booking link"
              hint={`We couldn't find a booking page on ${companyLabel}'s site. Paste a Calendly, Cal.com, HubSpot or Google Calendar link. The reply agent sends it to leads who want to talk.`}
            >
              <Input
                id="setup-booking"
                type="url"
                inputMode="url"
                autoComplete="url"
                autoFocus
                value={booking}
                onChange={(e) => setBooking(e.target.value)}
                placeholder="https://cal.com/you/intro"
                aria-describedby="setup-booking-hint"
              />
            </FormRow>
          )}
          {needsIdentity && (
            <>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Anti-spam law (CAN-SPAM) requires every cold email to name the sender and include a physical postal
                address. We add both to the footer and save them in Settings, under Compliance.
              </p>
              <FormRow id="setup-company" label="Company name">
                <Input
                  id="setup-company"
                  autoFocus={!needsBooking}
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                />
              </FormRow>
              <FormRow id="setup-postal" label="Postal address" hint="A street address or PO box where you receive mail.">
                <Textarea
                  id="setup-postal"
                  autoComplete="street-address"
                  value={postalAddress}
                  onChange={(e) => setPostalAddress(e.target.value)}
                  placeholder={"123 Market St, Suite 400\nSan Francisco, CA 94105\nUSA"}
                  rows={3}
                  aria-describedby="setup-postal-hint"
                />
              </FormRow>
            </>
          )}
          {error && (
            <p id={errorId} role="alert" className="text-[13px] text-destructive-text">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button type="submit" loading={pending} disabled={!canSubmit}>
            Save and continue
            {!pending && <ArrowRight />}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ─── Launch state ───────────────────────────────────────────────────── */

/**
 * The state card for an autopilot run that is not live yet: what blocks it,
 * and the one action that moves it forward.
 */
export function LaunchStatePanel({
  runId,
  phase,
  reason,
  failureCode,
  approved,
  emailOnApprove = false,
  companyLabel,
  missing,
  identity,
  onChanged,
}: {
  runId: string;
  phase: RunPhase;
  reason?: string | null;
  failureCode?: string | null;
  approved: boolean;
  /** False when no system mailer is configured: approval is then not emailed. */
  emailOnApprove?: boolean;
  companyLabel: string;
  missing?: Missing;
  identity?: { companyName: string; postalAddress: string };
  onChanged: (outcome: AutopilotOutcome, message?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const notesId = useId();

  const report = (res: Awaited<ReturnType<typeof retryAutopilotLaunchAction>>) => {
    if (!res.ok) return void toast.error(res.error);
    if (res.data?.phase === "live") toast.success(res.message || "Outreach is live");
    else if (res.message) toast.info(res.message);
    onChanged(res.data!, res.message);
  };

  const retryLaunch = () => start(async () => report(await retryAutopilotLaunchAction(runId)));
  const retryResearch = () => start(async () => report(await retryAutopilotResearchAction(runId, notes)));

  if (phase === "needs_details") {
    return (
      <LaunchDetailsForm
        runId={runId}
        companyLabel={companyLabel}
        missing={missing && missing.length > 0 ? missing : ["bookingUrl"]}
        identity={identity}
        onOutcome={onChanged}
      />
    );
  }

  const researchRetry = (
    <form
      className="mt-4 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) retryResearch();
      }}
    >
      <Label htmlFor={notesId} className="text-foreground">
        Who do you sell to?
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={notesId}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. dental clinics, or logistics companies in the US"
        />
        <Button type="submit" loading={pending} className="shrink-0">
          {!pending && <RefreshCw />}
          Retry research
        </Button>
      </div>
    </form>
  );

  if (phase === "needs_research") {
    return (
      <StateCard tone="warning" icon={Target} title="Tell us who you sell to">
        <p>{reason}</p>
        {researchRetry}
        <p className="mt-4 text-[13px]">
          If your site blocks automated visits, retrying won&apos;t help. You can{" "}
          <Link
            href={GUIDED_SETUP_HREF}
            className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
          >
            pick industries and titles yourself in guided setup
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </StateCard>
    );
  }

  if (phase === "awaiting_approval" || phase === "ready") {
    return (
      <StateCard tone="info" icon={Hourglass} title={approved ? "Ready to launch" : "Waiting for approval"}>
        <p>
          {approved
            ? "Your account is approved. Check the plan below, then launch when you're ready."
            : reason
              ? approvalCopy(reason, emailOnApprove)
              : awaitingApprovalText(emailOnApprove)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="brand" onClick={retryLaunch} loading={pending} disabled={!approved}>
            {!pending && <Rocket />}
            Launch outreach
          </Button>
          {!approved && (
            <span className="inline-flex items-center gap-1.5 text-xs text-subtle-foreground">
              <Clock className="size-3.5" aria-hidden />
              Launch unlocks once your account is approved.
            </span>
          )}
        </div>
      </StateCard>
    );
  }

  if (phase === "launch_failed") {
    const audienceProblem = failureCode === "no_leads" || failureCode === "all_contacted";
    return (
      <StateCard tone="destructive" icon={audienceProblem ? SearchX : AlertTriangle} title="Not launched yet">
        <p>{reason || "The launch didn't finish and nothing was sent. Your plan is saved, so you can try again."}</p>
        {audienceProblem ? (
          researchRetry
        ) : (
          <div className="mt-4">
            <Button onClick={retryLaunch} loading={pending}>
              {!pending && <RefreshCw />}
              Retry launch
            </Button>
          </div>
        )}
      </StateCard>
    );
  }

  if (phase === "launching") {
    return (
      <StateCard tone="info" icon={Loader2} spin title="Setting up your campaign">
        <p>This usually takes under a minute and this page updates on its own. If it seems stuck, retry.</p>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={retryLaunch} loading={pending}>
            {!pending && <RefreshCw />}
            Retry launch
          </Button>
        </div>
      </StateCard>
    );
  }

  return null;
}

/* ─── Plan preview ───────────────────────────────────────────────────── */

/** The targeting plan and the baseline emails the client is approving. */
export function PlanPreviewCard({ preview }: { preview: PlanPreview }) {
  const [open, setOpen] = useState("0");
  const index = Number(open);
  const email = preview.sampleEmails[index];

  const options = preview.sampleEmails.map((_, i) => ({
    value: String(i),
    label:
      i === 0
        ? "First email"
        : `Day ${preview.sampleEmails.slice(0, i + 1).reduce((d, s) => d + s.delayDays, 0)}`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your plan</CardTitle>
        <CardDescription>Who we&apos;ll contact and what they&apos;ll receive. Nothing is sent until the campaign is live.</CardDescription>
      </CardHeader>
      <dl className="grid gap-x-6 gap-y-4 p-5 text-[13px] sm:grid-cols-2">
        <PlanRow label="Industries" values={preview.industries} />
        <PlanRow label="Job titles" values={preview.titles} />
        <PlanRow label="Countries" values={preview.countries} />
        <div>
          <dt className="text-xs text-muted-foreground">Sending window</dt>
          <dd className="mt-1.5 text-foreground">{preview.sendingWindow}</dd>
        </div>
        {preview.offer?.valueProp && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Pitch</dt>
            <dd className="mt-1.5 leading-relaxed text-foreground">
              {preview.offer.title ? <span className="font-medium">{preview.offer.title}. </span> : null}
              {preview.offer.valueProp}
            </dd>
          </div>
        )}
      </dl>
      {email && (
        <div className="border-t border-border p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[13px] font-medium">Sample sequence</h3>
            {options.length > 1 && (
              <SegmentedControl size="sm" aria-label="Choose a sample email" value={open} onValueChange={setOpen} options={options} />
            )}
          </div>
          <article className="rounded-lg border border-border bg-muted/40 p-4">
            {email.recipient && (
              <p className="mb-2 text-xs text-subtle-foreground">
                To {email.recipient.firstName || "a prospect"}
                {email.recipient.jobTitle ? `, ${email.recipient.jobTitle}` : ""}
                {email.recipient.company ? ` at ${email.recipient.company}` : ""}
              </p>
            )}
            <p className="text-sm font-medium">{email.subject}</p>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{email.body}</p>
          </article>
          <p className="mt-2 text-xs text-subtle-foreground">
            Written for a real prospect that matches your plan. Every live email is personalized for its recipient.
          </p>
        </div>
      )}
    </Card>
  );
}

function PlanRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 flex flex-wrap gap-1.5">
        {values.length === 0 ? (
          <span className="text-subtle-foreground">Not set</span>
        ) : (
          values.map((v) => (
            <Badge key={v} variant="neutral">
              {v}
            </Badge>
          ))
        )}
      </dd>
    </div>
  );
}
