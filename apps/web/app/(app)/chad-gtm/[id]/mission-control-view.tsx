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
    <div className="space-y-6 font-mono">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/chad-gtm"
              className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 uppercase tracking-wider"
            >
              <ChevronLeft className="size-3.5" /> Back to ChadGTM
            </Link>
            <span className="text-zinc-700">•</span>
            <span
              className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${
                status === "active"
                  ? "bg-zinc-900 text-white border-zinc-700"
                  : "bg-black text-zinc-500 border-zinc-800"
              }`}
            >
              <span className="size-1 rounded-none bg-white" />
              {status === "active" ? "Engine Active" : "Engine Paused"}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase tracking-wider flex items-center gap-2">
            Mission Control: {run?.companyName || "Autonomous Outreach"}
          </h1>
          <p className="text-xs text-zinc-500 font-mono">
            Targeting:{" "}
            <a
              href={run?.url}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-300 hover:underline inline-flex items-center gap-1"
            >
              {run?.url} <ExternalLink className="size-2.5" />
            </a>
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportInterested}
            className="rounded-none text-xs font-mono uppercase tracking-wider border-zinc-800 hover:border-zinc-700 text-zinc-300 w-full sm:w-auto h-9"
          >
            <Download className="size-3.5 mr-1.5" /> Export Interested
          </Button>

          <Button
            type="button"
            onClick={handleToggleStatus}
            disabled={isPending}
            className={`rounded-none text-xs font-mono uppercase tracking-wider font-semibold border h-9 w-full sm:w-auto ${
              status === "active"
                ? "bg-black text-zinc-300 border-zinc-800 hover:bg-zinc-900 hover:text-white"
                : "bg-white text-black border-white hover:bg-zinc-200"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Prospects Queued */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
            <Mail className="size-3 text-white" /> Target Prospects
          </span>
          <div className="text-2xl font-bold text-white">
            {kpis.queuedProspects.toLocaleString()}
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Apollo B2B prospects queued</p>
        </div>

        {/* Emails Sent */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
            <Send className="size-3 text-white" /> Dispatched
          </span>
          <div className="text-2xl font-bold text-white">
            {kpis.sentToday} <span className="text-xs font-normal text-zinc-500 uppercase">today</span>
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
            {kpis.sentLifetime.toLocaleString()} lifetime sends
          </p>
        </div>

        {/* Open Rate */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
            <Eye className="size-3 text-white" /> Open Rate
          </span>
          <div className="text-2xl font-bold text-white">
            {kpis.openRate}%
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
            {kpis.openCount.toLocaleString()} opens recorded
          </p>
        </div>

        {/* Replies & Sentiment */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
            <MessageSquare className="size-3 text-white" /> Responses
          </span>
          <div className="text-2xl font-bold text-white">
            {kpis.repliesCount}{" "}
            <span className="text-xs font-normal text-zinc-400">
              ({kpis.positiveSentimentCount} interested)
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
            {kpis.replyRate}% conversion rate
          </p>
        </div>
      </div>

      {/* Main Grid: Velocity Adjuster & Live Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Live Velocity Adjuster & Offer Angle */}
        <div className="space-y-4">
          {/* Live Velocity Slider Card */}
          <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                <Gauge className="size-3.5 text-white" /> Sending Velocity
              </span>
              <span className="rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-xs font-bold text-white">
                {velocity} / DAY
              </span>
            </div>

            <input
              type="range"
              min={30}
              max={500}
              step={10}
              value={velocity}
              onChange={(e) => handleUpdateVelocity(Number(e.target.value))}
              className="w-full accent-white h-1.5 bg-zinc-800 rounded-none cursor-pointer"
            />

            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
              <span>30/D</span>
              <span>250/D</span>
              <span>500/D</span>
            </div>

            <div className="rounded-none bg-black border border-zinc-800 p-2.5 text-[10px] text-zinc-400 uppercase tracking-wider space-y-0.5">
              <span className="font-bold text-white block">Horizontal Pacing:</span>
              Mapped across shared pool with 30-email safety thresholds.
            </div>
          </div>

          {/* Active Campaign Angle Card */}
          <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <span>Calibrated Angle</span>
            </div>
            <div className="rounded-none bg-black border border-zinc-800 p-3 text-xs space-y-1.5">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">
                Primary Outreach Hook
              </span>
              <p className="text-zinc-300 font-sans leading-relaxed text-xs">
                {(run?.offers as any[])?.[0]?.valueProp ||
                  "Intelligent B2B outreach tailored to operational decision-makers."}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (2 cols): Live Activity Feed */}
        <div className="lg:col-span-2 rounded-none border border-zinc-800 bg-zinc-950 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 bg-black">
              <div className="flex items-center gap-2">
                <Clock className="size-3.5 text-white" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Live Dispatch & Engagement Feed
                </h3>
              </div>
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Live Sync</span>
            </div>

            <div className="divide-y divide-zinc-800">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity: any) => (
                  <div
                    key={activity.id}
                    className="flex items-start justify-between gap-4 p-3.5 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`size-7 rounded-none border flex items-center justify-center shrink-0 mt-0.5 ${
                          activity.type === "reply"
                            ? "border-white bg-white text-black"
                            : "border-zinc-800 bg-black text-zinc-400"
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
                          <span className="text-xs font-bold text-white">
                            {activity.recipient}
                          </span>
                          <span
                            className={`rounded-none px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border ${
                              activity.type === "reply"
                                ? "border-white bg-white text-black"
                                : "border-zinc-800 bg-black text-zinc-400"
                            }`}
                          >
                            {activity.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-1 font-sans">
                          {activity.detail || "Dispatched via shared system mailbox pool"}
                        </p>
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-500 shrink-0">
                      {activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center space-y-2">
                  <div className="mx-auto size-8 rounded-none border border-zinc-800 bg-black flex items-center justify-center text-zinc-500">
                    <Clock className="size-4" />
                  </div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Outreach Engine Initialized</h4>
                  <p className="text-xs text-zinc-500 font-sans max-w-sm mx-auto">
                    The background worker will begin dispatching during the active sending window. Live events will appear here in real time.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 border-t border-zinc-800 bg-black text-center text-[10px] uppercase tracking-widest text-zinc-500">
            Sends distributed across pre-warmed rotating mailboxes.
          </div>
        </div>
      </div>
    </div>
  );
}
