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
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
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
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/chad-gtm"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ChevronLeft className="size-3.5" /> Back to ChadGTM
            </Link>
            <span className="text-muted-foreground/40">•</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                status === "active"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}
            >
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              {status === "active" ? "Engine Active" : "Engine Paused"}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Mission Control: {run?.companyName || "Autonomous Outreach"}
          </h1>
          <p className="text-xs text-muted-foreground">
            Targeting URL:{" "}
            <a
              href={run?.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {run?.url} <ExternalLink className="size-2.5" />
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
            className="text-xs border-border/60 hover:bg-muted font-medium w-full sm:w-auto h-9"
          >
            <Download className="size-3.5 mr-1.5" /> Export Interested Leads
          </Button>

          <Button
            type="button"
            onClick={handleToggleStatus}
            disabled={isPending}
            className={`text-xs font-bold shadow-md w-full sm:w-auto h-9 ${
              status === "active"
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Prospects Queued */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-1 shadow-sm">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Mail className="size-3.5 text-primary" /> Target Prospects
          </span>
          <div className="text-2xl font-bold text-foreground">
            {kpis.queuedProspects.toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground">Verified Apollo B2B prospects queued</p>
        </div>

        {/* Emails Sent */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-1 shadow-sm">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Send className="size-3.5 text-emerald-400" /> Dispatched
          </span>
          <div className="text-2xl font-bold text-foreground">
            {kpis.sentToday} <span className="text-xs font-normal text-muted-foreground">today</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {kpis.sentLifetime.toLocaleString()} lifetime sends
          </p>
        </div>

        {/* Open Rate */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-1 shadow-sm">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Eye className="size-3.5 text-amber-400" /> Open Rate
          </span>
          <div className="text-2xl font-bold text-foreground">
            {kpis.openRate}%
          </div>
          <p className="text-[11px] text-muted-foreground">
            {kpis.openCount.toLocaleString()} opens recorded
          </p>
        </div>

        {/* Replies & Sentiment */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-1 shadow-sm">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="size-3.5 text-primary" /> Replies & Positive Intent
          </span>
          <div className="text-2xl font-bold text-foreground">
            {kpis.repliesCount}{" "}
            <span className="text-xs font-semibold text-emerald-400">
              ({kpis.positiveSentimentCount} interested)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {kpis.replyRate}% total response conversion
          </p>
        </div>
      </div>

      {/* Main Grid: Velocity Adjuster & Live Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Live Velocity Adjuster & Offer Angle */}
        <div className="space-y-6">
          {/* Live Velocity Slider Card */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Gauge className="size-4 text-primary" /> Sending Velocity
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
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
              className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
            />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>30 / day</span>
              <span>250 / day</span>
              <span>500 / day</span>
            </div>

            <div className="rounded-xl bg-muted/30 border border-border/40 p-3 text-xs text-muted-foreground space-y-1">
              <span className="font-semibold text-foreground block">Horizontally Scaled:</span>
              Automatically mapped across managed shared mailboxes with 30-email safety caps.
            </div>
          </div>

          {/* Active Campaign Angle Card */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
              <Sparkles className="size-3.5 text-emerald-400" /> Calibrated Positioning
            </div>
            <div className="rounded-xl bg-muted/20 border border-border/40 p-3.5 text-xs space-y-2">
              <span className="text-[10px] font-bold text-primary uppercase block">
                Primary Outreach Hook
              </span>
              <p className="text-muted-foreground leading-relaxed">
                {(run?.offers as any[])?.[0]?.valueProp ||
                  "Intelligent B2B outreach tailored to operational decision-makers."}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (2 cols): Live Activity Feed */}
        <div className="lg:col-span-2 rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/40 px-5 py-3.5 bg-muted/20">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Live Dispatch & Engagement Feed
                </h3>
              </div>
              <span className="text-[10px] text-muted-foreground">Auto-refreshing</span>
            </div>

            <div className="divide-y divide-border/30">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity: any) => (
                  <div
                    key={activity.id}
                    className="flex items-start justify-between gap-4 p-4 hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`size-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          activity.type === "reply"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {activity.type === "reply" ? (
                          <MessageSquare className="size-4" />
                        ) : (
                          <Send className="size-4" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">
                            {activity.recipient}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.2 text-[9px] font-extrabold uppercase ${
                              activity.type === "reply"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {activity.type}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {activity.detail || "Dispatched via shared system mailbox pool"}
                        </p>
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground/70 shrink-0">
                      {activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center space-y-2">
                  <div className="mx-auto size-10 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground">
                    <Clock className="size-5" />
                  </div>
                  <h4 className="text-xs font-bold text-foreground">Outreach Engine Initialized</h4>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    The background worker will begin dispatching during the active sending window. Live events will appear here in real time.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-border/40 bg-muted/10 text-center text-xs text-muted-foreground">
            All sends protected by pre-warmed rotating mailboxes.
          </div>
        </div>
      </div>
    </div>
  );
}
