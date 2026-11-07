"use client";

import { useEffect, useState, useTransition } from "react";
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
import type { RunPhase } from "@/lib/autopilot-policy";
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

export function AutopilotLauncher({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  // Pre-fill the website the visitor pasted on the landing page before signing up.
  useEffect(() => {
    const pending = takePendingWebsite();
    if (pending) setUrl((current) => current || pending);
  }, []);
  const [booking, setBooking] = useState("");
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
      const res = await startAutopilotAction({ url, bookingUrl: booking, notes });
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
                <span className="font-normal text-subtle-foreground">Optional</span>
              </button>
              {showMore && (
                <div id="launcher-options" className="mt-4 grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Booking link"
                    optional
                    hint="Where interested leads book a call. If empty, we look for one on your site."
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
