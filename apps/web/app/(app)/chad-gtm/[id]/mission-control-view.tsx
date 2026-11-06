"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  GitBranch,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader,
  Stat,
  toast,
} from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import { toggleChadGtmStatusAction, updateChadGtmVelocityAction } from "@/lib/chad-gtm-actions";
import { setBookingUrlAction, setReplyAgentModeAction, type AutopilotOutcome } from "@/lib/autopilot-actions";
import type { RunPhase } from "@/lib/autopilot-policy";
import type { PlanPreview } from "@/lib/autopilot-state";
import type { PostalHoldState } from "@/lib/postal-hold-policy";
import { Page } from "@/components/layout/page";
import { hostOf } from "@/components/chad-gtm/working-panel";
import { LaunchStatePanel, PhaseBadge, PlanPreviewCard } from "../launch-setup";
import { PostalHoldNotice } from "../../postal-hold-notice";
import { RunActivity, type RunActivityItem } from "./run-activity";
import { ReplyAgentCard, VolumeCard, type ReplyMode } from "./run-controls";

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
  identity: { companyName: string; postalAddress: string };
  preview: PlanPreview | null;
}

/** While a run is launching, refresh this often, for at most this long. */
const LAUNCH_POLL_MS = 10_000;
const LAUNCH_POLL_LIMIT_MS = 3 * 60_000;

export function MissionControlView({
  runId,
  initialData,
  launch,
}: {
  runId: string;
  initialData: any;
  launch: LaunchView;
}) {
  const router = useRouter();
  const run = initialData?.run;
  const kpis = {
    queuedProspects: 0,
    sentToday: 0,
    sentLifetime: 0,
    openCount: 0,
    openRate: 0,
    repliesCount: 0,
    replyRate: 0,
    positiveSentimentCount: 0,
    agentReplies: 0,
    openRequests: 0,
    meetingsBooked: 0,
    ...(initialData?.kpis || {}),
  };
  const recentActivity: RunActivityItem[] = initialData?.recentActivity || [];

  const [status, setStatus] = useState<"active" | "paused">(run?.status === "active" ? "active" : "paused");
  const [mode, setMode] = useState<ReplyMode>((run?.replyAgentMode as ReplyMode) || "autopilot");
  const [booking, setBooking] = useState<string>(run?.bookingUrl || "");
  const [editingBooking, setEditingBooking] = useState(!run?.bookingUrl);
  const [isPending, startTransition] = useTransition();
  const [statusPending, startStatus] = useTransition();
  const [bookingPending, startBooking] = useTransition();

  // Server data wins after a refresh.
  useEffect(() => {
    setStatus(run?.status === "active" ? "active" : "paused");
  }, [run?.status]);

  // Anything without a campaign is not live, whatever its status says.
  const needsLaunch = !run?.campaignId;

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

  const onLaunchChanged = (outcome: AutopilotOutcome) => {
    if (outcome.phase === "live") setStatus("active");
    router.refresh();
  };

  const handleToggleStatus = () => {
    const next = status === "active" ? "paused" : "active";
    startStatus(async () => {
      const res = await toggleChadGtmStatusAction(runId, next);
      if (res.ok) {
        setStatus(next);
        toast.success(next === "active" ? "Outreach resumed" : "Outreach paused");
      } else toast.error(res.error || "Couldn't update the run. Try again.");
    });
  };

  const commitVelocity = (v: number) =>
    startTransition(async () => {
      const res = await updateChadGtmVelocityAction(runId, v);
      if (res.ok) toast.success(`Now sending up to ${v} emails a day`);
      else toast.error(res.error || "Couldn't change the daily volume. Try again.");
    });

  const changeMode = (m: ReplyMode) => {
    const prev = mode;
    setMode(m);
    startTransition(async () => {
      const res = await setReplyAgentModeAction(runId, m);
      if (!res.ok) {
        setMode(prev);
        return void toast.error(res.error);
      }
      toast.success(res.message || "Saved");
    });
  };

  const saveBooking = () =>
    startBooking(async () => {
      const res = await setBookingUrlAction(runId, booking);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Saved");
      setEditingBooking(false);
      router.refresh();
    });

  const exportInterested = () => {
    const rows = recentActivity.filter(
      (a) => a.type === "agent" && /interested|booking|shared|answered/i.test(a.detail || ""),
    );
    if (rows.length === 0) return void toast.info("No interested leads yet. They show up here as they reply.");
    const csv =
      "Lead,When,What happened\n" +
      rows.map((r) => `"${r.recipient}","${r.timestamp}","${String(r.detail || "").replace(/"/g, "'")}"`).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `interested_${(run?.companyName || "leads").replace(/\W+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const host = hostOf(run?.url);
  const name = run?.companyName || host;
  const offer = (run?.offers as Array<{ title?: string; valueProp?: string }> | undefined)?.[0];

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
            {needsLaunch ? (
              <PhaseBadge phase={launch.phase} />
            ) : status === "active" ? (
              <Badge variant="success" dot>
                Live
              </Badge>
            ) : (
              <Badge variant="neutral" dot>
                Paused
              </Badge>
            )}
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
            {!needsLaunch && (
              <Button
                variant={status === "active" ? "outline" : "primary"}
                onClick={handleToggleStatus}
                loading={statusPending}
              >
                {!statusPending && (status === "active" ? <Pause /> : <Play />)}
                {status === "active" ? "Pause outreach" : "Resume outreach"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={exportInterested}>
                  <Download />
                  Export interested leads
                </DropdownMenuItem>
                {run?.campaignId && (
                  <DropdownMenuItem onSelect={() => router.push(`/campaigns/${run.campaignId}`)}>
                    <Pencil />
                    Edit sequence
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

      {kpis.openRequests > 0 && (
        <Alert
          variant="warning"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/requests">Answer now</Link>
            </Button>
          }
        >
          <AlertTitle>
            {kpis.openRequests} {kpis.openRequests === 1 ? "lead is" : "leads are"} waiting on you
          </AlertTitle>
          <AlertDescription>The agent paused those threads until you answer.</AlertDescription>
        </Alert>
      )}

      {!needsLaunch && <PostalHoldNotice hold={launch.postalHold} scope="campaign" />}

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
          onChanged={onLaunchChanged}
        />
      )}

      {!needsLaunch && (
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
          <Stat bare label="Prospects" value={Number(kpis.queuedProspects).toLocaleString()} hint="Matched leads" />
          <Stat
            bare
            label="Emails sent"
            value={Number(kpis.sentLifetime).toLocaleString()}
            hint={`${Number(kpis.sentToday).toLocaleString()} today`}
          />
          <Stat
            bare
            label="Replies"
            value={Number(kpis.repliesCount).toLocaleString()}
            delta={{ value: `${kpis.replyRate}%`, tone: Number(kpis.replyRate) > 0 ? "success" : "neutral" }}
            hint={`${Number(kpis.agentReplies).toLocaleString()} by the agent`}
          />
          <Stat
            bare
            label="Meetings booked"
            value={Number(kpis.meetingsBooked).toLocaleString()}
            hint={`${Number(kpis.positiveSentimentCount).toLocaleString()} interested`}
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
              state={needsLaunch ? "not_launched" : status === "active" ? "live" : "paused"}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ReplyAgentCard
            mode={mode}
            onModeChange={changeMode}
            booking={booking}
            onBookingChange={setBooking}
            editingBooking={editingBooking}
            onEditBooking={setEditingBooking}
            onSaveBooking={saveBooking}
            onCancelBooking={
              run?.bookingUrl
                ? () => {
                    setBooking(run.bookingUrl);
                    setEditingBooking(false);
                  }
                : undefined
            }
            savingBooking={bookingPending}
            busy={isPending}
            openRequests={Number(kpis.openRequests)}
          />
          <VolumeCard initial={run?.dailyEmailLimit || 30} onCommit={commitVelocity} />
          {offer?.title || offer?.valueProp ? (
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
    </Page>
  );
}
