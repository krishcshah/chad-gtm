"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
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
import { GUIDED_SETUP_HREF, LAUNCH_AUDIENCE_NOTE, guidedSetupHref, type RunPhase } from "@/lib/autopilot-policy";
import type { PlanAudience, PlanPreview } from "@/lib/autopilot-state";
import { bodyAboveSignature, stripWarmupMarker } from "@smartreach/shared/signature";
import { awaitingApprovalText } from "@/lib/approval-copy";

type Missing = NonNullable<AutopilotOutcome["missing"]>;

export { GUIDED_SETUP_HREF, guidedSetupHref };

/** Label and badge variant per run phase (launcher list and mission control header). */
export const PHASE_BADGE: Record<RunPhase, { label: string; variant: BadgeProps["variant"] }> = {
  live: { label: "Live", variant: "success" },
  held: { label: "Held: needs postal address", variant: "warning" },
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
 * Booking link + CAN-SPAM identity in one step. The booking link is asked for
 * only when missing. The sender identity of the run's workspace is always
 * shown: read-only when complete (with "Change for this workspace"), editable
 * when missing. It is saved for that workspace only (#73).
 */
export function LaunchDetailsForm({
  runId,
  companyLabel,
  missing,
  identity,
  workspaceName = "",
  suggestedCompanyName,
  onOutcome,
}: {
  runId: string;
  companyLabel: string;
  missing: Missing;
  identity?: { companyName: string; postalAddress: string; workspaceName?: string };
  /** The run's workspace: the footer identity belongs to it. */
  workspaceName?: string;
  /** The researched company name: a labelled prefill, only while the workspace has no company name. */
  suggestedCompanyName?: string;
  onOutcome: (outcome: AutopilotOutcome, message?: string) => void;
}) {
  const needsBooking = missing.includes("bookingUrl");
  const needsIdentity = missing.includes("companyName") || missing.includes("postalAddress");
  const savedCompany = identity?.companyName ?? "";
  const savedPostal = identity?.postalAddress ?? "";
  const suggestion = !savedCompany.trim() ? (suggestedCompanyName ?? "").trim() : "";
  const wsName = (workspaceName || identity?.workspaceName || "").trim();
  const [editingIdentity, setEditingIdentity] = useState(needsIdentity);
  const [booking, setBooking] = useState("");
  const [companyName, setCompanyName] = useState(savedCompany || suggestion);
  const [postalAddress, setPostalAddress] = useState(savedPostal);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errorId = useId();
  const sendingAsId = useId();

  const identityEdited = companyName.trim() !== savedCompany.trim() || postalAddress.trim() !== savedPostal.trim();
  // Only what the client was asked for or changed is saved.
  const sendIdentity = needsIdentity || (editingIdentity && identityEdited);

  const canSubmit =
    (!needsBooking || booking.trim().length > 0) &&
    (!editingIdentity || (companyName.trim().length > 0 && postalAddress.trim().length > 0));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await completeAutopilotSetupAction(runId, {
        ...(needsBooking ? { bookingUrl: booking } : {}),
        ...(sendIdentity ? { companyName, postalAddress } : {}),
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
          <div role="group" aria-labelledby={sendingAsId} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={sendingAsId} className="text-[13px] font-medium">
                  Sending as
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {wsName ? `For workspace ${wsName}` : "For this workspace"}
                </p>
              </div>
              {!editingIdentity && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingIdentity(true)}>
                  Change for this workspace
                </Button>
              )}
            </div>
            {!editingIdentity && (
              <dl className="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Company name</dt>
                  <dd className="mt-1 text-foreground">{savedCompany.trim() || "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Postal address</dt>
                  <dd className="mt-1 whitespace-pre-line text-foreground">{savedPostal.trim() || "Not set"}</dd>
                </div>
              </dl>
            )}
          </div>
          {editingIdentity && (
            <>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Anti-spam law (CAN-SPAM) requires every cold email to name the sender and include a physical postal
                address. We add both to the footer of every email sent from {wsName || "this workspace"}, and save them
                in Settings for this workspace only.
              </p>
              <FormRow
                id="setup-company"
                label="Company name"
                hint={
                  suggestion && companyName === suggestion
                    ? "Filled in from your website research. Use your legal or trading name."
                    : undefined
                }
              >
                <Input
                  id="setup-company"
                  autoFocus={!needsBooking || !needsIdentity}
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  aria-describedby={suggestion && companyName === suggestion ? "setup-company-hint" : undefined}
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
  companyLabel,
  missing,
  identity,
  workspaceName,
  suggestedCompanyName,
  onChanged,
}: {
  runId: string;
  phase: RunPhase;
  reason?: string | null;
  failureCode?: string | null;
  approved: boolean;
  /** Unused here: the global approval banner is the only place that mentions the approval email. */
  emailOnApprove?: boolean;
  companyLabel: string;
  missing?: Missing;
  identity?: { companyName: string; postalAddress: string; workspaceName?: string };
  /** The run's workspace, named in the "Sending as" block. */
  workspaceName?: string;
  /** The researched company name, offered while the workspace has none. */
  suggestedCompanyName?: string;
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
        workspaceName={workspaceName}
        suggestedCompanyName={suggestedCompanyName}
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
            href={guidedSetupHref(runId)}
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
            : awaitingApprovalText()}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="brand" onClick={retryLaunch} loading={pending} disabled={!approved}>
            {!pending && <Rocket />}
            Launch outreach
          </Button>
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
          <Button variant="outline" size="sm" onClick={retryLaunch} loading={pending} disabled={pending}>
            {!pending && <RefreshCw />}
            Retry launch
          </Button>
        </div>
      </StateCard>
    );
  }

  if (phase === "draft") {
    // A guided setup that was left before launch: continue it on this run, never a dead end.
    return (
      <StateCard tone="info" icon={Target} title="Setup isn't finished">
        <p>Nothing has been sent. Pick up where you left off: choose who to target, then review and launch.</p>
        <div className="mt-4">
          <Button asChild>
            <Link href={guidedSetupHref(runId)}>
              Continue setup
              <ArrowRight />
            </Link>
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
  // The signature the sending mailbox appends, joined the way the engine joins it.
  const signature = stripWarmupMarker(preview.sender?.signature);
  const signed = email && signature ? { ...bodyAboveSignature(email.body, signature), signature } : null;

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
        <PlanRow label="Company size (contacted first)" values={preview.companySizes ?? []} />
        <PlanRow label="Countries" values={preview.countries} />
        <div>
          <dt className="text-xs text-muted-foreground">Sending window</dt>
          <dd className="mt-1.5 text-foreground">{preview.sendingWindow}</dd>
        </div>
        {preview.audience && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Audience</dt>
            <dd className="mt-1.5 leading-relaxed text-foreground">{audienceText(preview.audience, preview.countries)}</dd>
          </div>
        )}
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
            {preview.sender && (
              <p data-testid="plan-sample-from" className="text-xs text-subtle-foreground">
                {preview.sender.name
                  ? `From ${preview.sender.name} · one of ${preview.sender.poolSize} AutoGTM ${preview.sender.poolSize === 1 ? "mailbox" : "mailboxes"}`
                  : "From an AutoGTM mailbox"}
              </p>
            )}
            {email.recipient && (
              <p className="mb-2 text-xs text-subtle-foreground">
                To {email.recipient.firstName || "a prospect"}
                {email.recipient.jobTitle ? `, ${email.recipient.jobTitle}` : ""}
                {email.recipient.company ? ` at ${email.recipient.company}` : ""}
              </p>
            )}
            <p className="text-sm font-medium">{email.subject}</p>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
              {signed ? signed.body : email.body}
              {signed ? (
                <span data-testid="plan-sample-signature">
                  {signed.separator}
                  <span className="sr-only">Signature added by the sending mailbox: </span>
                  {signed.signature}
                </span>
              ) : null}
            </p>
          </article>
          <p className="mt-2 text-xs text-subtle-foreground">
            Written for a real prospect that matches your plan. Every live email is personalized for its recipient.
            {preview.sender && preview.sender.poolSize > 1
              ? " Each lead hears from one mailbox, under its own name and signature."
              : ""}
          </p>
        </div>
      )}
    </Card>
  );
}

/** How many people a launch works through, where, in what order, and who is skipped. */
export function audienceText(a: PlanAudience, countries: string[] = []): string {
  const total = a.roleMatches + (a.strictRoles ? 0 : a.otherRoles);
  if (a.unavailable) {
    return `We couldn't count the matching contacts just now. Launch still contacts all of them in priority order: your job titles first${a.strictRoles ? "" : ", then other decision-makers and people in your industries"}. Each gets three emails over five days.`;
  }
  if (total === 0) {
    return "No contacts match this plan, so the launch would fail. Retry the research with a note about who you sell to.";
  }
  const where = countries.length > 0 ? ` in the countries we send to (${countries.join(", ")})` : " in the countries we send to";
  const order = a.strictRoles
    ? "only people with your job titles"
    : `${a.roleMatches.toLocaleString()} with your job titles first, then ${a.otherRoles.toLocaleString()} other decision-makers and people in your industries`;
  // Company size orders the list; it never leaves anyone out.
  const size = a.bySize ? " People at your company size go first in each group." : "";
  return `All ${total.toLocaleString()} matching contacts${where}, in priority order: ${order}.${size} Each gets three emails over five days. ${LAUNCH_AUDIENCE_NOTE}`;
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
