"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, ListChecks } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Textarea,
  cn,
  toast,
} from "@smartreach/ui";
import Link from "next/link";
import { startAutopilotAction, type AutopilotOutcome } from "@/lib/autopilot-actions";
import { AUTOPILOT_DAILY_DEFAULT } from "@/lib/autopilot-policy";
import { DailyVolumeInput, VolumeForecast } from "@/components/chad-gtm/velocity-slider";
import { hasCompliantIdentity, type RunPhase } from "@/lib/autopilot-policy";
import { Page } from "@/components/layout/page";
import { GUIDED_SETUP_HREF, LaunchDetailsForm } from "./launch-setup";
import { RunList } from "./run-list";
import { WorkingPanel, hostOf } from "@/components/chad-gtm/working-panel";
import { takePendingWebsite } from "@/lib/pending-website";

export interface RunSummary {
  id: string;
  companyName: string;
  url: string;
  status: string;
  campaignId: string | null;
  bookingUrl: string | null;
  autopilot: boolean;
  replyAgentMode: string;
  dailyEmailLimit: number;
  createdAt: string;
  phase: RunPhase;
}

/** What the server does during one startAutopilotAction request, in order. */
const LAUNCH_STEPS = [
  "Read your website: product, pricing, proof and positioning",
  "Work out which industries and job titles to target",
  "Match contacts from the B2B directory",
  "Write a three-email sequence, personalized per lead",
  "Assign warmed mailboxes from our pool",
];

/** The active workspace's sender identity: what a new run's footer will carry. */
export interface LauncherSender {
  workspaceName: string;
  companyName: string;
  postalAddress: string;
}

/** First line of a postal address (single-line addresses: up to the first comma). */
function firstAddressLine(address: string): string {
  const line = address.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return address.includes("\n") ? line : line.split(",")[0]!.trim();
}

export function AutopilotLauncher({
  runs,
  defaultBookingUrl = null,
  sender = null,
}: {
  runs: RunSummary[];
  /** The workspace booking link (Settings › Lead conversations), used when this field is empty. */
  defaultBookingUrl?: string | null;
  /** The active workspace's sender identity (#73). */
  sender?: LauncherSender | null;
}) {
  const senderComplete = Boolean(sender && hasCompliantIdentity(sender));
  const senderWorkspace = sender?.workspaceName.trim() ?? "";
  const router = useRouter();
  const [url, setUrl] = useState("");
  // Pre-fill the website the visitor pasted on the landing page before signing up.
  useEffect(() => {
    const pending = takePendingWebsite();
    if (pending) setUrl((current) => current || pending);
  }, []);
  const [booking, setBooking] = useState("");
  // The one control the client sets: emails per day (follow-ups included).
  const [dailyLimit, setDailyLimit] = useState(AUTOPILOT_DAILY_DEFAULT);
  const volumeId = useId();
  const [notes, setNotes] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [needsDetails, setNeedsDetails] = useState<AutopilotOutcome | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** Live → mission control; details missing → ask here; anything else → mission control explains it. */
  const handleOutcome = (outcome: AutopilotOutcome, message?: string) => {
    if (outcome.phase === "needs_details") {
      setNeedsDetails(outcome);
      return;
    }
    setNeedsDetails(null);
    if (outcome.phase === "live") toast.success(message || "Outreach is live");
    else if (message) toast.info(message);
    router.push(`/chad-gtm/${outcome.runId}`);
  };

  const launch = () => {
    if (!url.trim()) {
      setUrlError("Enter your company website first.");
      return;
    }
    setUrlError(null);
    setError(null);
    setRunning(true);
    start(async () => {
      const res = await startAutopilotAction({ url, bookingUrl: booking, notes, dailyLimit });
      setRunning(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      handleOutcome(res.data!, res.message);
    });
  };

  return (
    <Page>
      <PageHeader
        title="Autopilot"
        description="Paste your website. AutoGTM finds the right buyers, writes and sends the emails from warmed mailboxes, answers replies and sends interested leads to your calendar."
        actions={
          <Button asChild variant="outline">
            <Link href={GUIDED_SETUP_HREF}>
              <ListChecks />
              Guided setup
            </Link>
          </Button>
        }
      />

      {needsDetails ? (
        <div className="max-w-2xl">
          <LaunchDetailsForm
            runId={needsDetails.runId}
            companyLabel={needsDetails.companyName || "your company"}
            missing={needsDetails.missing ?? ["bookingUrl"]}
            identity={needsDetails.identity}
            workspaceName={needsDetails.identity?.workspaceName || senderWorkspace}
            suggestedCompanyName={needsDetails.suggestedCompanyName}
            onOutcome={handleOutcome}
          />
        </div>
      ) : running ? (
        <WorkingPanel
          title={`Setting up outreach for ${hostOf(url)}`}
          description="Research and launch happen in one go. It usually takes under a minute, so keep this tab open."
          steps={LAUNCH_STEPS}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Start a new run</CardTitle>
            <CardDescription>
              We research your market and set everything up. You only hear from us when a lead needs something we
              don&apos;t have.
            </CardDescription>
          </CardHeader>
          <form
            noValidate
            className="flex flex-col gap-5 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              launch();
            }}
          >
            <Field label="Company website" error={urlError} hint="Your homepage is enough. We read the pages it links to.">
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (urlError) setUrlError(null);
                }}
                placeholder="yourcompany.com"
                autoComplete="url"
                inputMode="url"
                autoFocus={runs.length === 0}
                className="h-11 text-[15px]"
              />
            </Field>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={volumeId} className="text-[13px] font-medium">
                  Emails per day
                </label>
                <span className="tabular text-[22px] font-semibold leading-none tracking-[-0.03em]">
                  {dailyLimit}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">a day</span>
                </span>
              </div>
              <div className="mt-3">
                <DailyVolumeInput id={volumeId} value={dailyLimit} onChange={setDailyLimit} disabled={running} />
              </div>
              <VolumeForecast perDay={dailyLimit} className="mt-3" />
            </div>

            {error && (
              <Alert
                variant="destructive"
                action={
                  <Button type="submit" variant="outline" size="sm" loading={pending}>
                    Try again
                  </Button>
                }
              >
                {error}
              </Alert>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                aria-controls="launcher-options"
                className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} aria-hidden />
                Booking link and notes
              </button>
              {showMore && (
                <div id="launcher-options" className="mt-4 grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Booking link"
                    hint={
                      defaultBookingUrl
                        ? `Leave empty to use this workspace's booking link (${hostOf(defaultBookingUrl)}).`
                        : "Needed to launch. Leave it empty and we look for one on your site; if we can't find one, we ask you before anything is sent."
                    }
                  >
                    <Input
                      value={booking}
                      onChange={(e) => setBooking(e.target.value)}
                      placeholder="https://cal.com/you/intro"
                      inputMode="url"
                    />
                  </Field>
                  <Field label="Anything we should know?" optional hint="Who you sell to, or an angle you want us to use.">
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="min-h-9"
                      placeholder="e.g. We sell to dental clinics and orthodontists"
                    />
                  </Field>
                </div>
              )}
            </div>

            {sender && (
              <p data-testid="launcher-sending-as" className="text-[13px] leading-relaxed text-muted-foreground">
                {senderComplete ? (
                  <>
                    Sending as {sender.companyName.trim()} · {firstAddressLine(sender.postalAddress)} ·{" "}
                    {senderWorkspace ? `For workspace ${senderWorkspace}` : "For this workspace"}.{" "}
                    <Link
                      href="/settings#compliance"
                      className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                    >
                      Change for this workspace
                    </Link>
                  </>
                ) : (
                  "Before anything is sent we'll ask for this workspace's company name and postal address."
                )}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-subtle-foreground">
                Leads, mailboxes and reply handling are included. No domains or DNS to set up.
              </p>
              <Button type="submit" variant="brand" size="lg" loading={pending} className="w-full sm:w-auto">
                Start outreach
                {!pending && <ArrowRight />}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <RunList runs={runs} />
    </Page>
  );
}
