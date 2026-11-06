"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clock,
  Hourglass,
  Loader2,
  Mail,
  RefreshCw,
  Rocket,
  SearchX,
  Target,
} from "lucide-react";
import { Button, Input, Textarea, cn, toast } from "@smartreach/ui";
import {
  completeAutopilotSetupAction,
  retryAutopilotLaunchAction,
  retryAutopilotResearchAction,
  type AutopilotOutcome,
} from "@/lib/autopilot-actions";
import type { RunPhase } from "@/lib/autopilot-policy";
import type { PlanPreview } from "@/lib/autopilot-state";

type Missing = NonNullable<AutopilotOutcome["missing"]>;

/** Badge label + colors per run phase (launcher list and mission control header). */
export const PHASE_BADGE: Record<RunPhase, { label: string; dot: string; text: string; ring: string }> = {
  live: { label: "Live", dot: "bg-brand-400", text: "text-brand-300", ring: "border-brand-400/25 bg-brand-400/10" },
  paused: { label: "Paused", dot: "bg-zinc-500", text: "text-zinc-400", ring: "border-zinc-700 bg-zinc-900" },
  completed: { label: "Completed", dot: "bg-zinc-500", text: "text-zinc-400", ring: "border-zinc-700 bg-zinc-900" },
  needs_research: { label: "Needs your input", dot: "bg-amber-400", text: "text-amber-300", ring: "border-amber-400/25 bg-amber-400/10" },
  needs_details: { label: "Needs details", dot: "bg-amber-400", text: "text-amber-300", ring: "border-amber-400/25 bg-amber-400/10" },
  awaiting_approval: { label: "Waiting for approval", dot: "bg-sky-400", text: "text-sky-300", ring: "border-sky-400/25 bg-sky-400/10" },
  ready: { label: "Ready to launch", dot: "bg-brand-400", text: "text-brand-300", ring: "border-brand-400/25 bg-brand-400/10" },
  launch_failed: { label: "Not launched", dot: "bg-rose-400", text: "text-rose-300", ring: "border-rose-400/25 bg-rose-400/10" },
  launching: { label: "Launching", dot: "bg-sky-400", text: "text-sky-300", ring: "border-sky-400/25 bg-sky-400/10" },
  draft: { label: "Draft", dot: "bg-zinc-500", text: "text-zinc-400", ring: "border-zinc-700 bg-zinc-900" },
};

export function PhaseBadge({ phase }: { phase: RunPhase }) {
  const b = PHASE_BADGE[phase];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", b.ring, b.text)}>
      {phase === "live" ? <span className="live-dot" /> : <span className={cn("size-1.5 rounded-full", b.dot)} />} {b.label}
    </span>
  );
}

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
      ? "Two quick things before we send"
      : needsBooking
        ? "One last thing: where should leads book?"
        : "Add your sender details";

  return (
    <div className="w-full animate-float-up rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-left">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
          <CalendarClock className="size-4" />
        </div>
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit && !pending) submit();
          }}
        >
          <h2 className="text-[15px] font-semibold text-zinc-50">{title}</h2>
          <div className="mt-4 flex flex-col gap-4">
            {needsBooking && (
              <div>
                <label htmlFor="setup-booking" className="mb-1 block text-xs font-medium text-zinc-300">
                  Booking link
                </label>
                <p className="mb-2 text-xs text-zinc-500">
                  We couldn&apos;t find a booking page on {companyLabel}&apos;s site. Paste your Calendly, Cal.com, HubSpot, or
                  Google booking link.
                </p>
                <Input
                  id="setup-booking"
                  autoFocus
                  value={booking}
                  onChange={(e) => setBooking(e.target.value)}
                  placeholder="https://cal.com/you/intro"
                  className="h-10 text-sm"
                />
              </div>
            )}
            {needsIdentity && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-zinc-500">
                  Anti-spam law (CAN-SPAM) requires every email to name the sender and include a physical postal address. We
                  add them to the footer and save them in Settings → Compliance.
                </p>
                <div>
                  <label htmlFor="setup-company" className="mb-1 block text-xs font-medium text-zinc-300">
                    Company name
                  </label>
                  <Input
                    id="setup-company"
                    autoFocus={!needsBooking}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Inc."
                    className="h-10 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="setup-postal" className="mb-1 block text-xs font-medium text-zinc-300">
                    Physical postal address
                  </label>
                  <Textarea
                    id="setup-postal"
                    value={postalAddress}
                    onChange={(e) => setPostalAddress(e.target.value)}
                    placeholder={"123 Market St, Suite 400\nSan Francisco, CA 94105\nUSA"}
                    rows={3}
                    className="text-sm"
                  />
                </div>
              </div>
            )}
          </div>
          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
          <div className="mt-4 flex justify-end">
            <Button type="submit" variant="brand" size="lg" disabled={pending || !canSubmit}>
              {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />} Save and continue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  onChanged,
}: {
  runId: string;
  phase: RunPhase;
  reason?: string | null;
  failureCode?: string | null;
  approved: boolean;
  companyLabel: string;
  missing?: Missing;
  identity?: { companyName: string; postalAddress: string };
  onChanged: (outcome: AutopilotOutcome, message?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  const retryLaunch = () =>
    start(async () => {
      const res = await retryAutopilotLaunchAction(runId);
      if (!res.ok) return void toast.error(res.error);
      if (res.data?.phase === "live") toast.success(res.message || "Outreach is live");
      else if (res.message) toast.info(res.message);
      onChanged(res.data!, res.message);
    });

  const retryResearch = () =>
    start(async () => {
      const res = await retryAutopilotResearchAction(runId, notes);
      if (!res.ok) return void toast.error(res.error);
      if (res.data?.phase === "live") toast.success(res.message || "Outreach is live");
      else if (res.message) toast.info(res.message);
      onChanged(res.data!, res.message);
    });

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
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <Input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder='Who do you sell to? e.g. "dental clinics" or "logistics companies"'
        className="h-10 text-sm"
        aria-label="Who do you sell to"
      />
      <Button variant="brand" size="lg" onClick={retryResearch} disabled={pending} className="shrink-0">
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Retry research
      </Button>
    </div>
  );

  if (phase === "needs_research") {
    return (
      <StateCard tone="amber" icon={<Target className="size-4" />} title="We need a hint about your audience">
        <p>{reason}</p>
        {researchRetry}
      </StateCard>
    );
  }

  if (phase === "awaiting_approval" || phase === "ready") {
    return (
      <StateCard tone="sky" icon={<Hourglass className="size-4" />} title={approved ? "Ready to launch" : "Waiting for approval"}>
        <p>
          {approved
            ? "Your account is approved. Review the plan and sample emails below, then launch when you're ready."
            : reason ||
              "Your plan is ready. We review every new account before it can send from our mailboxes. You'll get an email when you're approved, and you can launch from this screen."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="brand" size="lg" onClick={retryLaunch} disabled={pending || !approved}>
            {pending ? <Loader2 className="animate-spin" /> : <Rocket />} Launch outreach
          </Button>
          {!approved && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="size-3.5" /> Launch unlocks once an admin approves your account.
            </span>
          )}
        </div>
      </StateCard>
    );
  }

  if (phase === "launch_failed") {
    const audienceProblem = failureCode === "no_leads" || failureCode === "all_contacted";
    return (
      <StateCard
        tone="rose"
        icon={audienceProblem ? <SearchX className="size-4" /> : <AlertTriangle className="size-4" />}
        title="Not launched yet"
      >
        <p>{reason || "The launch didn't complete and nothing was sent. Your plan is saved, so you can retry."}</p>
        {audienceProblem ? (
          researchRetry
        ) : (
          <div className="mt-4">
            <Button variant="brand" size="lg" onClick={retryLaunch} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Retry launch
            </Button>
          </div>
        )}
      </StateCard>
    );
  }

  if (phase === "launching") {
    return (
      <StateCard tone="sky" icon={<Loader2 className="size-4 animate-spin" />} title="Setting up your campaign">
        <p>This usually takes under a minute. If it doesn&apos;t finish, retry below.</p>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={retryLaunch} disabled={pending}>
            <RefreshCw /> Retry launch
          </Button>
        </div>
      </StateCard>
    );
  }

  return null;
}

function StateCard({
  tone,
  icon,
  title,
  children,
}: {
  tone: "amber" | "sky" | "rose";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    amber: "border-amber-400/25 bg-amber-400/[0.06]",
    sky: "border-sky-400/25 bg-sky-400/[0.06]",
    rose: "border-rose-400/25 bg-rose-400/[0.06]",
  } as const;
  const iconTones = {
    amber: "bg-amber-400/15 text-amber-300",
    sky: "bg-sky-400/15 text-sky-300",
    rose: "bg-rose-400/15 text-rose-300",
  } as const;
  return (
    <div className={cn("w-full animate-float-up rounded-2xl border p-5 text-left", tones[tone])}>
      <div className="flex items-start gap-3">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", iconTones[tone])}>{icon}</div>
        <div className="min-w-0 flex-1 text-[13px] text-zinc-400">
          <h2 className="mb-1 text-[15px] font-semibold text-zinc-50">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The targeting plan and the baseline emails the client is approving. */
export function PlanPreviewCard({ preview }: { preview: PlanPreview }) {
  const [open, setOpen] = useState(0);
  const email = preview.sampleEmails[open];
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70">
      <div className="border-b border-zinc-800/70 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-zinc-100">Your plan</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Nothing is sent until the campaign is live.</p>
      </div>
      <dl className="grid gap-4 px-5 py-4 text-[13px] sm:grid-cols-2">
        <PlanRow label="Industries" values={preview.industries} />
        <PlanRow label="Job titles" values={preview.titles} />
        <PlanRow label="Countries" values={preview.countries} />
        <div>
          <dt className="text-xs font-medium text-zinc-500">Sending window</dt>
          <dd className="mt-1 text-zinc-200">{preview.sendingWindow}</dd>
        </div>
        {preview.offer?.valueProp && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-zinc-500">Pitch</dt>
            <dd className="mt-1 text-zinc-200">
              {preview.offer.title ? <span className="font-medium">{preview.offer.title}: </span> : null}
              {preview.offer.valueProp}
            </dd>
          </div>
        )}
      </dl>
      {email && (
        <div className="border-t border-zinc-800/70 px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Mail className="size-3.5" /> Sample emails
            </h3>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-900/70 p-1 ring-1 ring-zinc-800">
              {preview.sampleEmails.map((e, i) => (
                <button
                  key={e.step}
                  type="button"
                  onClick={() => setOpen(i)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                    open === i ? "bg-zinc-50 text-black shadow" : "text-zinc-400 hover:text-zinc-100",
                  )}
                >
                  {i === 0 ? "Email 1" : `Day ${preview.sampleEmails.slice(0, i + 1).reduce((d, s) => d + s.delayDays, 0)}`}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-900/50 p-4 ring-1 ring-zinc-800">
            {email.recipient && (
              <div className="mb-2 text-[11px] text-zinc-500">
                To {email.recipient.firstName || "a prospect"}
                {email.recipient.jobTitle ? `, ${email.recipient.jobTitle}` : ""}
                {email.recipient.company ? ` at ${email.recipient.company}` : ""}
              </div>
            )}
            <div className="text-[13px] font-medium text-zinc-100">{email.subject}</div>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{email.body}</p>
          </div>
          <p className="mt-2 text-[11px] text-zinc-600">
            Sample built from your plan for a real matching prospect. Each live email is personalized for its
            recipient.
          </p>
        </div>
      )}
    </section>
  );
}

function PlanRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 flex flex-wrap gap-1.5">
        {values.length === 0 ? (
          <span className="text-zinc-500">—</span>
        ) : (
          values.map((v) => (
            <span key={v} className="rounded-md bg-zinc-900 px-2 py-0.5 text-xs text-zinc-200 ring-1 ring-zinc-800">
              {v}
            </span>
          ))
        )}
      </dd>
    </div>
  );
}
