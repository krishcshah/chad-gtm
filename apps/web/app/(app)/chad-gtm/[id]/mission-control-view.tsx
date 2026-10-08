"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Rocket,
  Play,
  Pause,
  Download,
  Mail,
  Send,
  Eye,
  MessageSquare,
  Clock,
  ExternalLink,
  ChevronLeft,
  Gauge,
  Loader2,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@smartreach/ui";
import { toast } from "sonner";
import {
  toggleChadGtmStatusAction,
  updateChadGtmVelocityAction,
} from "@/lib/chad-gtm-actions";

export function MissionControlView({
  runId,
  initialData,
}: {
  runId: string;
  initialData: any;
}) {
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState<"active" | "paused">(
    data?.run?.status === "active" ? "active" : "paused"
  );
  const [velocity, setVelocity] = useState<number>(data?.run?.dailyEmailLimit || 30);
  const [isPending, startTransition] = useTransition();

  const run = data?.run;
  const campaign = data?.campaign;
  const kpis = data?.kpis || {
    queuedProspects: 0,
    sentToday: 0,
    sentLifetime: 0,
    openCount: 0,
    openRate: 0,
    repliesCount: 0,
    replyRate: 0,
    positiveSentimentCount: 0,
  };
  const recentActivity = data?.recentActivity || [];

  const handleToggleStatus = () => {
    const nextStatus = status === "active" ? "paused" : "active";
    startTransition(async () => {
      const res = await toggleChadGtmStatusAction(runId, nextStatus);
      if (res.ok) {
        setStatus(nextStatus);
        toast.success(`Autonomous outreach ${nextStatus === "active" ? "resumed" : "paused"}`);
      } else {
        toast.error("Failed to update status");
      }
    });
  };

  const handleUpdateVelocity = (newLimit: number) => {
    setVelocity(newLimit);
    startTransition(async () => {
      const res = await updateChadGtmVelocityAction(runId, newLimit);
      if (res.ok) {
        toast.success(`Daily velocity updated to ${newLimit} emails/day`);
      } else {
        toast.error("Failed to update velocity");
      }
    });
  };

  const handleExportInterested = () => {
    const interestedReplies = recentActivity.filter(
      (a: any) =>
        a.type === "reply" &&
        (a.detail?.includes("interested") || a.detail?.includes("meeting"))
    );

    if (interestedReplies.length === 0) {
      toast.info("No positive sentiment replies yet. They will appear here automatically.");
      return;
    }

    const csvContent =
      "Recipient,Timestamp,Detail\n" +
      interestedReplies
        .map((r: any) => `"${r.recipient}","${r.timestamp}","${r.detail || ""}"`)
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `interested_leads_${run?.companyName || "gtm"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Link
              href="/chad-gtm"
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-medium transition-colors"
            >
              <ChevronLeft className="size-3.5" /> Back to ChadGTM
            </Link>
            <span className="text-zinc-700">•</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                status === "active"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800"
              }`}
            >
              <span className={`size-1.5 rounded-full ${status === "active" ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
              {status === "active" ? "Engine Active" : "Engine Paused"}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Mission Control: {run?.companyName || "Autonomous Outreach"}
          </h1>
          <p className="text-xs text-zinc-400">
            Targeting:{" "}
            <a
              href={run?.url}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-300 hover:underline inline-flex items-center gap-1 font-medium"
            >
              {run?.url} <ExternalLink className="size-3" />
            </a>
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportInterested}
            className="rounded-lg text-xs font-medium border-zinc-800 hover:border-zinc-700 text-zinc-300 w-full sm:w-auto h-9"
          >
            <Download className="size-3.5 mr-1.5" /> Export Interested
          </Button>

          <Button
            type="button"
            onClick={handleToggleStatus}
            disabled={isPending}
            className={`rounded-lg text-xs font-semibold h-9 w-full sm:w-auto shadow-xs transition-all active:scale-[0.98] ${
              status === "active"
                ? "bg-zinc-900 text-zinc-200 border border-zinc-700 hover:bg-zinc-800 hover:text-white"
                : "bg-white text-black hover:bg-zinc-200"
            }`}
          >
            {status === "active" ? (
              <>
                <Pause className="size-3.5 mr-1.5" /> Pause Outreach
              </>
            ) : (
              <>
                <Play className="size-3.5 mr-1.5" /> Resume Outreach
              </>
            )}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Prospects Queued */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-1.5 card-shine shadow-xs">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-2">
            <Mail className="size-3.5 text-zinc-300" /> Target Prospects
          </span>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {kpis.queuedProspects.toLocaleString()}
          </div>
          <p className="text-xs text-zinc-500">Apollo B2B prospects queued</p>
        </div>

        {/* Emails Sent */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-1.5 card-shine shadow-xs">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-2">
            <Send className="size-3.5 text-zinc-300" /> Dispatched
          </span>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {kpis.sentToday} <span className="text-xs font-normal text-zinc-400">today</span>
          </div>
          <p className="text-xs text-zinc-500">
            {kpis.sentLifetime.toLocaleString()} lifetime sends
          </p>
        </div>

        {/* Open Rate */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-1.5 card-shine shadow-xs">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-2">
            <Eye className="size-3.5 text-zinc-300" /> Open Rate
          </span>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {kpis.openRate}%
          </div>
          <p className="text-xs text-zinc-500">
            {kpis.openCount.toLocaleString()} opens recorded
          </p>
        </div>

        {/* Replies & Sentiment */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-1.5 card-shine shadow-xs">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-2">
            <MessageSquare className="size-3.5 text-zinc-300" /> Responses
          </span>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {kpis.repliesCount}{" "}
            <span className="text-xs font-medium text-emerald-400">
              ({kpis.positiveSentimentCount} interested)
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            {kpis.replyRate}% conversion rate
          </p>
        </div>
      </div>

      {/* Main Grid: Velocity Adjuster & Live Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Live Velocity Adjuster & Offer Angle */}
        <div className="space-y-4">
          {/* Live Velocity Slider Card */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-3.5 card-shine shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Gauge className="size-4 text-zinc-300" /> Sending Velocity
              </span>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                {velocity} / day
              </span>
            </div>

            <input
              type="range"
              min={30}
              max={500}
              step={10}
              value={velocity}
              onChange={(e) => handleUpdateVelocity(Number(e.target.value))}
              className="w-full accent-white h-2 bg-zinc-800 rounded-full cursor-pointer"
            />

            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium">
              <span>30/day</span>
              <span>250/day</span>
              <span>500/day</span>
            </div>

            <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 p-3 text-xs text-zinc-400 space-y-0.5">
              <span className="font-semibold text-white block">Horizontal Pacing:</span>
              Mapped across shared pool with 30-email safety thresholds.
            </div>
          </div>

          {/* Calibrated Voice Profile Card */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-3 card-shine shadow-xs">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
              <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <Sliders className="size-3.5 text-zinc-300" /> Calibrated Voice
              </span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold">
                Locked
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-zinc-500 font-medium block">
                Target Tone
              </span>
              <p className="text-xs sm:text-sm font-semibold text-white tracking-tight">
                {(run?.calibrationProfile as any)?.voiceTone || "Direct, Technical Peer-to-Peer"}
              </p>
            </div>

            {(run?.calibrationProfile as any)?.analysisSummary && (
              <p className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/60 pt-2">
                "{(run?.calibrationProfile as any)?.analysisSummary}"
              </p>
            )}

            <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 p-3 text-xs space-y-1">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">
                Subject Pattern
              </span>
              <p className="text-zinc-300 text-xs">
                {(run?.calibrationProfile as any)?.calibratedSubjectTemplate ||
                  (run?.offers as any[])?.[0]?.angle ||
                  "Quick question re: {{company}}"}
              </p>
            </div>
          </div>

          {/* Active Campaign Angle Card */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-2 card-shine shadow-xs">
            <div className="text-xs font-semibold text-zinc-400">
              <span>Primary Outreach Hook</span>
            </div>
            <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 p-3 text-xs space-y-1.5">
              <p className="text-zinc-300 leading-relaxed text-xs">
                {(run?.offers as any[])?.[0]?.valueProp ||
                  "Intelligent B2B outreach tailored to operational decision-makers."}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (2 cols): Live Activity Feed */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800/80 bg-zinc-950/90 overflow-hidden shadow-xs card-shine flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3 bg-zinc-950">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-zinc-300" />
                <h3 className="text-xs font-semibold text-white tracking-tight">
                  Live Dispatch & Engagement Feed
                </h3>
              </div>
              <span className="text-[11px] text-zinc-400 font-medium">Live Sync</span>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity: any) => (
                  <div
                    key={activity.id}
                    className="flex items-start justify-between gap-4 p-3.5 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`size-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                          activity.type === "reply"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400"
                        }`}
                      >
                        {activity.type === "reply" ? (
                          <MessageSquare className="size-3.5" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white">
                            {activity.recipient}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                              activity.type === "reply"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : "border-zinc-800 bg-zinc-900 text-zinc-400"
                            }`}
                          >
                            {activity.type}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-1">
                          {activity.detail || "Dispatched via shared system mailbox pool"}
                        </p>
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-500 shrink-0">
                      {activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center space-y-2">
                  <div className="mx-auto size-10 rounded-xl border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400">
                    <Clock className="size-5" />
                  </div>
                  <h4 className="text-xs font-semibold text-white tracking-tight">Outreach Engine Initialized</h4>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    The background worker will begin dispatching during the active sending window. Live events will appear here in real time.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/20 text-center text-xs text-zinc-500">
            Sends distributed across pre-warmed rotating mailboxes.
          </div>
        </div>
      </div>
    </div>
  );
}
