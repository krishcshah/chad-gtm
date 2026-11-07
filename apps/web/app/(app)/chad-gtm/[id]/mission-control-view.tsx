"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  GitBranch,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader,
  Stat,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import {
  dismissRunAction,
  exportInterestedLeadsAction,
  toggleChadGtmStatusAction,
  updateChadGtmVelocityAction,
  updateRunPitchAction,
} from "@/lib/chad-gtm-actions";
import {
  clearBookingUrlAction,
  setBookingUrlAction,
  // Aliased: a server action, not a React hook.
  useWorkspaceBookingUrlAction as applyWorkspaceBookingUrlAction,
  type AutopilotOutcome,
} from "@/lib/autopilot-actions";
import { handWaitingToAgentAction, previewModeChangeAction } from "@/lib/lead-conversation-actions";
import {
  OUTREACH_PAUSED_TOAST,
  PAUSE_OUTREACH_HINT,
  replyAuthorsHint,
  type LeadConversationState,
} from "@/lib/lead-conversations";
import { HandOverDialog } from "@/components/lead-conversations/lead-conversations-control";
import { AUTOPILOT_DAILY_DEFAULT, type RunPhase } from "@/lib/autopilot-policy";
import type { PlanPreview } from "@/lib/autopilot-state";
import type { PostalHoldState } from "@/lib/postal-hold-policy";
import { describeSendBlock } from "@/lib/send-block";
import { Page } from "@/components/layout/page";
import { hostOf } from "@/components/chad-gtm/working-panel";
import { LaunchStatePanel, PhaseBadge, PlanPreviewCard } from "../launch-setup";
import { PostalHoldNotice } from "../../postal-hold-notice";
import { CampaignSendStatus } from "../../campaign-send-status";
import { RunActivity, type RunActivityItem } from "./run-activity";
import { PitchCard, ReplyAgentCard, VolumeCard } from "./run-controls";

/** Launch state for a run that may not be live yet (computed on the server). */
export interface LaunchView {
  phase: RunPhase;
  approved: boolean;
  /** False without a system mailer: approval is not emailed, so the copy must not promise it. */
  emailOnApprove: boolean;
  /** Sends held because the workspace has no postal address (live runs only). */
  postalHold: PostalHoldState;
  reason: string | null;
  failureCode: string | null;
  missing: NonNullable<AutopilotOutcome["missing"]>;
  /** The run's workspace sender identity (what the footer will carry) and that workspace's name. */
  identity: { companyName: string; postalAddress: string; workspaceName?: string };
  /** The researched company name, offered as a labelled prefill while the workspace has none. */
  suggestedCompanyName?: string;
  preview: PlanPreview | null;
  /** The workspace sender details every email and agent reply uses (read-only here). */
  sender?: {
    companyName: string;
    postalAddress: string;
    workspaceName: string;
    /** The AutoGTM mailboxes leads hear from: count, one From name and its signature (#66). */
    mailboxes?: { poolSize: number; exampleName: string; exampleSignature: string } | null;
  };
  /** The workspace booking link; used while the run has none of its own. */
  defaultBookingUrl?: string | null;
  /** The run's workspace. */
  workspaceName?: string;
  /** Follow-ups waiting for their own mailbox (paused, or its replies can't be read) (#60). */
  heldFollowUps?: number;
}

/** Read-only "Sending as" line: the workspace sender details on every email and agent reply. */
function SendingAsCard({ sender }: { sender: LaunchView["sender"] | null }) {
  if (!sender) return null;
  const company = sender.companyName.trim();
  const address = sender.postalAddress.replace(/\s*\n\s*/g, ", ").trim();
  const mailboxes = sender.mailboxes ?? null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 py-4 text-[13px]">
        {company ? (
          <p>
            Sending as <span className="font-medium">{company}</span>
            {address ? <span className="text-muted-foreground">, {address}</span> : null}
          </p>
        ) : (
          <p className="text-muted-foreground">No sender details yet. Nothing is sent until you add them.</p>
        )}
        {mailboxes && mailboxes.poolSize > 0 ? (
          <div data-testid="sending-mailboxes" className="text-muted-foreground">
            <p>
              From one of {mailboxes.poolSize} AutoGTM {mailboxes.poolSize === 1 ? "mailbox" : "mailboxes"}
              {mailboxes.exampleName ? (
                <>
                  , such as <span className="font-medium text-foreground">{mailboxes.exampleName}</span>
                </>
              ) : null}
              . Each lead hears from one mailbox, under its name and signature.
            </p>
            {mailboxes.exampleSignature.trim() ? (
              <p className="mt-1.5 whitespace-pre-line border-l-2 border-border pl-3 text-xs">
                <span className="sr-only">Example signature: </span>
                {mailboxes.exampleSignature}
              </p>
            ) : null}
          </div>
        ) : null}
        <Link
          href="/settings#compliance"
          className="w-fit text-xs font-medium text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground hover:decoration-foreground"
        >
          Edit for this workspace
        </Link>
      </CardContent>
    </Card>
  );
}

/** The launched campaign's effective schedule, as the engine applies it. */
export function campaignScheduleLine(c: {
  businessDaysOnly?: boolean | null;
  sendingWindowStart?: string | null;
  sendingWindowEnd?: string | null;
  sendingTimezone?: string | null;
  stopOnReply?: boolean | null;
}): string {
  const days = c.businessDaysOnly ? "Monday–Friday" : "Every day";
  const tz = String(c.sendingTimezone || "UTC").replace(/_/g, " ");
  const reply = c.stopOnReply ? "Stops emailing a lead once they reply." : "Follow-ups continue after a reply.";
  return `${days}, ${c.sendingWindowStart}–${c.sendingWindowEnd} (${tz}). ${reply}`;
}

/** While a run is launching, refresh this often, for at most this long. */
const LAUNCH_POLL_MS = 10_000;
const LAUNCH_POLL_LIMIT_MS = 3 * 60_000;

export function MissionControlView({
  runId,
  initialData,
  launch,
  sameWorkspace = true,
  workspaceNotice = null,
}: {
  runId: string;
  initialData: any;
  launch: LaunchView;
  /** False when the run belongs to another workspace than the active one. */
  sameWorkspace?: boolean;
  /** Shown under the header, e.g. "This run belongs to the … workspace". */
  workspaceNotice?: ReactNode;
}) {
  const router = useRouter();
  const run = initialData?.run;
  const kpis = {
    queuedProspects: 0,
    sentToday: 0,
    sentLifetime: 0,
    leadsEmailed: 0,
    openCount: 0,
    openRate: 0,
    repliesCount: 0,
    replyRate: 0,
    positiveSentimentCount: 0,
    agentReplies: 0,
    approvedReplies: 0,
    youReplies: 0,
    openRequests: 0,
    bookingWaiting: 0,
    meetingsBooked: 0,
    bookingLinksSent: 0,
    ...(initialData?.kpis || {}),
  };
  const recentActivity: RunActivityItem[] = initialData?.recentActivity || [];

  // The server's phase (from the campaign's status) is the one on/off state.
  const status: "active" | "paused" = launch.phase === "live" || launch.phase === "held" ? "active" : "paused";
  const leadConversation: LeadConversationState | null = initialData?.leadConversation ?? null;
  // The run's own booking link, else the workspace default (Settings › Lead conversations).
  const ownBooking: string = run?.bookingUrl || "";
  const defaultBooking: string = launch.defaultBookingUrl || "";
  const effectiveBooking = ownBooking || defaultBooking;
  const [booking, setBooking] = useState<string>(effectiveBooking);
  // Launched runs may have no link on purpose (the agent asks instead); only an unlaunched run opens in edit.
  const [editingBooking, setEditingBooking] = useState(!effectiveBooking && !run?.campaignId);
  const [removingBooking, startRemoveBooking] = useTransition();
  const [pitchPending, startPitch] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [alsoDefault, setAlsoDefault] = useState(false);
  const [, startTransition] = useTransition();
  const [statusPending, startStatus] = useTransition();
  const [bookingPending, startBooking] = useTransition();
  /** After Resume: conversations held while paused, offered to the agent (never automatic). */
  const [heldWaiting, setHeldWaiting] = useState(0);
  const [handOverPending, startHandOver] = useTransition();
  const [exportPending, startExport] = useTransition();

  // Anything without a campaign is not live, whatever its status says.
  const needsLaunch = !run?.campaignId;
  // The campaign finished, or was archived or deleted: nothing more to pause or resume.
  const completed = !needsLaunch && launch.phase === "completed";
  const campaign = initialData?.campaign ?? null;
  // Every lead went through the sequence (not archived or deleted).
  const finished = completed && Boolean(campaign) && !campaign.deletedAt && campaign.status !== "archived";
  // Archived or deleted in Campaigns & leads: nothing sends and the agent stops answering.
  const removed = completed && Boolean(campaign) && (Boolean(campaign.deletedAt) || campaign.status === "archived");
  const scheduleLine = !needsLaunch && campaign ? campaignScheduleLine(campaign) : undefined;

  // A launching run becomes live on the server; pick that up without a manual reload.
  useEffect(() => {
    if (launch.phase !== "launching") return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > LAUNCH_POLL_LIMIT_MS) return clearInterval(t);
      if (document.visibilityState === "visible") router.refresh();
    }, LAUNCH_POLL_MS);
    return () => clearInterval(t);
  }, [launch.phase, router]);

  const onLaunchChanged = (_outcome: AutopilotOutcome) => {
    router.refresh();
  };

  const handleToggleStatus = () => {
    const next = status === "active" ? "paused" : "active";
    startStatus(async () => {
      const res = await toggleChadGtmStatusAction(runId, next);
      if (!res.ok) return void toast.error(res.error || "Couldn't update the run. Try again.");
      if (next === "paused") {
        toast.success(OUTREACH_PAUSED_TOAST);
        return void router.refresh();
      }
      toast.success("Outreach resumed");
      // Replies held while paused wait for you; offer them to the agent only if it answers here.
      if (run?.campaignId && leadConversation?.effective.handledBy !== "you") {
        const preview = await previewModeChangeAction({ campaignId: run.campaignId }).catch(() => null);
        const waiting = preview && preview.ok && preview.data ? preview.data.waiting : 0;
        if (waiting > 0) setHeldWaiting(waiting);
      }
      router.refresh();
    });
  };

  const handOverHeld = (apply: boolean) => {
    if (!apply || !run?.campaignId) return void setHeldWaiting(0);
    const campaignId: string = run.campaignId;
    startHandOver(async () => {
      const res = await handWaitingToAgentAction({ campaignId });
      setHeldWaiting(0);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Handed to the agent");
      router.refresh();
    });
  };

  const commitVelocity = (v: number) =>
    startTransition(async () => {
      const res = await updateChadGtmVelocityAction(runId, v);
      if (res.ok) toast.success(`Now sending up to ${v} emails a day`);
      else toast.error(res.error || "Couldn't change the daily volume. Try again.");
    });

  const saveBooking = () =>
    startBooking(async () => {
      const res = await setBookingUrlAction(runId, booking, { workspaceDefault: alsoDefault });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Saved");
      setEditingBooking(false);
      setAlsoDefault(false);
      router.refresh();
    });

  // #58: a launched run can drop its booking link; the agent then asks the client.
  const removeBooking = () =>
    new Promise<void>((resolve) =>
      startRemoveBooking(async () => {
        try {
          const res = await clearBookingUrlAction(runId);
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message || "Booking link removed");
          setBooking(defaultBooking);
          setEditingBooking(false);
          router.refresh();
        } finally {
          resolve();
        }
      }),
    );

  // #51: edit the pitch the agent works from.
  const savePitch = (pitch: { title: string; valueProp: string; summary: string }) =>
    new Promise<boolean>((resolve) =>
      startPitch(async () => {
        const res = await updateRunPitchAction(runId, pitch);
        if (!res.ok) {
          toast.error(res.error || "Couldn't save the pitch. Try again.");
          return resolve(false);
        }
        toast.success(res.message || "Pitch saved");
        router.refresh();
        resolve(true);
      }),
    );

  // #55: remove a run that never launched.
  const deleteRun = async () => {
    const res = await dismissRunAction(runId);
    if (!res.ok) return void toast.error(res.error || "Couldn't delete this run. Try again.");
    setDeleteOpen(false);
    toast.success("Run deleted");
    router.push("/chad-gtm");
  };

  const useDefaultBooking = () =>
    startBooking(async () => {
      const res = await applyWorkspaceBookingUrlAction(runId);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Saved");
      setBooking(res.data?.bookingUrl ?? defaultBooking);
      setEditingBooking(false);
      router.refresh();
    });

  // Every interested lead in the run, built on the server from all of its replies.
  const exportInterested = () =>
    startExport(async () => {
      const res = await exportInterestedLeadsAction(runId);
      if (!res.ok) return void toast.error(res.error);
      if (res.count === 0) return void toast.info("No interested leads in this run yet.");
      const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `interested_${(run?.companyName || "leads").replace(/\W+/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} ${res.count === 1 ? "lead" : "leads"}`);
    });

  const host = hostOf(run?.url);
  const name = run?.companyName || host;
  const offer = (run?.offers as Array<{ title?: string; valueProp?: string }> | undefined)?.[0];
  const overviewSummary = String((run?.businessOverview as { summary?: string } | null)?.summary ?? "");
  // #57: how many launched leads match the target job titles.
  const launchAudience = (run?.calibrationProfile as { launchAudience?: { roleMatches?: number } } | null)
    ?.launchAudience;
  const heldFollowUps = Number(launch.heldFollowUps) || 0;

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/chad-gtm" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            Autopilot
          </Link>
        }
        title={name}
        meta={
          <>
            <PhaseBadge phase={launch.phase} />
            {run?.url && (
              <a
                href={run.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
              >
                {host}
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            {run?.createdAt && (
              <span className="text-[13px] text-subtle-foreground" suppressHydrationWarning>
                Started {timeAgo(run.createdAt)}
              </span>
            )}
          </>
        }
        actions={
          <>
            {finished && (
              <Button asChild>
                <Link href="/chad-gtm">Start a new run</Link>
              </Button>
            )}
            {!needsLaunch && (launch.phase === "live" || launch.phase === "held" || launch.phase === "paused") && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={status === "active" ? "outline" : "primary"}
                      onClick={handleToggleStatus}
                      loading={statusPending}
                    >
                      {!statusPending && (status === "active" ? <Pause /> : <Play />)}
                      {status === "active" ? "Pause outreach" : "Resume outreach"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {status === "active" ? PAUSE_OUTREACH_HINT : "Starts sending new emails again."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={exportInterested} disabled={exportPending}>
                  <Download />
                  Export interested leads
                </DropdownMenuItem>
                {/* The campaign page only opens in the run's own workspace. Autopilot writes the
                    sequence, so it is shown read-only there (#49). */}
                {run?.campaignId && sameWorkspace && campaign && !campaign.deletedAt && (
                  <DropdownMenuItem onSelect={() => router.push(`/campaigns/${run.campaignId}?tab=sequence`)}>
                    <Eye />
                    View sequence
                  </DropdownMenuItem>
                )}
                {needsLaunch && (
                  <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
                    <Trash2 />
                    Delete run
                  </DropdownMenuItem>
                )}
                {run?.agentRunId && (
                  <DropdownMenuItem onSelect={() => router.push(`/chad-gtm/${runId}/trace`)}>
                    <GitBranch />
                    Research trace
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {workspaceNotice}

      {finished && (
        <Alert variant="info">
          <AlertTitle>Outreach finished</AlertTitle>
          <AlertDescription>
            Every lead has been through the sequence. Replies still come into the Inbox.
          </AlertDescription>
        </Alert>
      )}

      {kpis.openRequests > 0 && (
        <Alert
          variant="warning"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={`/requests?run=${encodeURIComponent(runId)}`}>Answer now</Link>
            </Button>
          }
        >
          <AlertTitle>
            {kpis.openRequests} {kpis.openRequests === 1 ? "lead is" : "leads are"} waiting on you
          </AlertTitle>
          <AlertDescription>
            The agent waits on those conversations until you answer. New messages from those leads join the same card.
          </AlertDescription>
        </Alert>
      )}

      {!needsLaunch && heldFollowUps > 0 && (
        <Alert variant="warning">
          <AlertTitle>
            {heldFollowUps} {heldFollowUps === 1 ? "follow-up is" : "follow-ups are"} waiting for their mailbox
          </AlertTitle>
          <AlertDescription>
            They go out from the same sender once its mailbox is back in service, so each lead keeps hearing from one
            person. Nothing to do on your side.
          </AlertDescription>
        </Alert>
      )}

      {!needsLaunch && removed ? (
        <Alert variant="info">
          <AlertTitle>This campaign was archived</AlertTitle>
          <AlertDescription>
            It was archived or deleted in Campaigns &amp; leads, so nothing more is sent. The agent no longer answers its
            leads; their replies wait for you in the Inbox.
          </AlertDescription>
        </Alert>
      ) : (
        !needsLaunch && <PostalHoldNotice hold={launch.postalHold} scope="campaign" />
      )}
      {!needsLaunch && status === "active" && initialData?.campaign ? (
        <CampaignSendStatus view={describeSendBlock(initialData.campaign, new Date(), { skipPostal: true })} />
      ) : null}

      {needsLaunch && (
        <LaunchStatePanel
          runId={runId}
          phase={launch.phase}
          reason={launch.reason}
          failureCode={launch.failureCode}
          approved={launch.approved}
          emailOnApprove={launch.emailOnApprove}
          companyLabel={name}
          missing={launch.missing}
          identity={launch.identity}
          workspaceName={launch.identity.workspaceName || launch.workspaceName || ""}
          suggestedCompanyName={launch.suggestedCompanyName}
          onChanged={onLaunchChanged}
        />
      )}

      {!needsLaunch && (
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
          <Stat
            bare
            label="Prospects"
            value={Number(kpis.queuedProspects).toLocaleString()}
            hint={
              launchAudience && typeof launchAudience.roleMatches === "number"
                ? `${launchAudience.roleMatches.toLocaleString()} match your roles`
                : "Matched leads"
            }
          />
          <Stat
            bare
            label="Emails sent"
            value={Number(kpis.sentLifetime).toLocaleString()}
            hint={`${Number(kpis.sentToday).toLocaleString()} today · ${Number(kpis.leadsEmailed).toLocaleString()} leads`}
          />
          <Stat
            bare
            label="Replies"
            value={Number(kpis.repliesCount).toLocaleString()}
            delta={{ value: `${kpis.replyRate}%`, tone: Number(kpis.replyRate) > 0 ? "success" : "neutral" }}
            hint={replyAuthorsHint({
              agent: Number(kpis.agentReplies) || 0,
              approved: Number(kpis.approvedReplies) || 0,
              you: Number(kpis.youReplies) || 0,
            })}
          />
          {/* Nothing records a real booking: count the leads sent the link, and tagged meetings beside it. */}
          <Stat
            bare
            label="Booking links sent"
            value={Number(kpis.bookingLinksSent).toLocaleString()}
            hint={
              effectiveBooking
                ? `${Number(kpis.meetingsBooked).toLocaleString()} marked Meeting booked · ${Number(kpis.positiveSentimentCount).toLocaleString()} interested`
                : "No booking link set"
            }
          />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {needsLaunch && launch.preview ? (
            <PlanPreviewCard preview={launch.preview} />
          ) : (
            <RunActivity
              items={recentActivity}
              state={needsLaunch ? "not_launched" : status === "active" && !completed ? "live" : "paused"}
              campaignId={run?.campaignId ?? null}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ReplyAgentCard
            runId={runId}
            leadConversation={leadConversation}
            booking={booking}
            onBookingChange={setBooking}
            editingBooking={editingBooking}
            onEditBooking={setEditingBooking}
            onSaveBooking={saveBooking}
            onCancelBooking={
              effectiveBooking
                ? () => {
                    setBooking(effectiveBooking);
                    setEditingBooking(false);
                    setAlsoDefault(false);
                  }
                : undefined
            }
            savingBooking={bookingPending}
            openRequests={Number(kpis.openRequests)}
            bookingWaiting={Number(kpis.bookingWaiting) || 0}
            usingWorkspaceDefault={!ownBooking && Boolean(defaultBooking)}
            workspaceDefaultBooking={defaultBooking}
            onUseWorkspaceDefault={ownBooking && defaultBooking ? useDefaultBooking : undefined}
            workspaceName={launch.workspaceName || ""}
            alsoDefault={alsoDefault}
            onAlsoDefaultChange={setAlsoDefault}
            onRemoveBooking={needsLaunch ? undefined : removeBooking}
            removingBooking={removingBooking}
          />
          <SendingAsCard sender={launch.sender ?? null} />
          <VolumeCard
            // After launch the campaign's daily limit is the one the engine uses.
            initial={campaign?.dailyLimit ?? run?.dailyEmailLimit ?? AUTOPILOT_DAILY_DEFAULT}
            onCommit={commitVelocity}
            disabled={completed}
            schedule={scheduleLine}
          />
          {!needsLaunch ? (
            <PitchCard
              title={offer?.title ?? ""}
              valueProp={offer?.valueProp ?? ""}
              summary={overviewSummary}
              onSave={savePitch}
              saving={pitchPending}
              campaignOffer={leadConversation?.target.kind === "campaign" ? leadConversation.agentOffer : ""}
            />
          ) : offer?.title || offer?.valueProp ? (
            <Card>
              <CardHeader>
                <CardTitle>Pitch</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {offer.title && <p className="text-[13px] font-medium">{offer.title}</p>}
                {offer.valueProp && (
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{offer.valueProp}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this run?"
        description="Its research and sample emails are removed. Nothing was sent."
        confirmLabel="Delete run"
        destructive
        onConfirm={deleteRun}
      />

      <HandOverDialog
        open={heldWaiting > 0}
        waiting={heldWaiting}
        pending={handOverPending}
        description="These replies arrived while outreach was paused. The agent answers them after the same checks as any reply. Nothing is sent right now, and conversations someone already answered are left alone."
        onChoose={handOverHeld}
        onCancel={() => setHeldWaiting(0)}
      />
    </Page>
  );
}
