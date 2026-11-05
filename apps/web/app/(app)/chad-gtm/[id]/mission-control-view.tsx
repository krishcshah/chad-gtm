"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  CalendarClock,
  CalendarCheck,
  ChevronLeft,
  Download,
  ExternalLink,
  Gauge,
  GitBranch,
  HandHelping,
  Inbox,
  Loader2,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { Button, Input, cn, toast } from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import { toggleChadGtmStatusAction, updateChadGtmVelocityAction } from "@/lib/chad-gtm-actions";
import { setBookingUrlAction, setReplyAgentModeAction } from "@/lib/autopilot-actions";

type Mode = "autopilot" | "approve" | "off";

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "autopilot", label: "Autopilot", hint: "Answers, shares resources, and sends your booking link on its own." },
  { id: "approve", label: "Approve first", hint: "Drafts every reply and waits for your OK in Needs you." },
  { id: "off", label: "Off", hint: "Only classifies replies. You answer from the UniBox." },
];

export function MissionControlView({ runId, initialData }: { runId: string; initialData: any }) {
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
  const recentActivity: any[] = initialData?.recentActivity || [];

  const [status, setStatus] = useState<"active" | "paused">(run?.status === "active" ? "active" : "paused");
  const [velocity, setVelocity] = useState<number>(run?.dailyEmailLimit || 30);
  const [mode, setMode] = useState<Mode>((run?.replyAgentMode as Mode) || "autopilot");
  const [booking, setBooking] = useState<string>(run?.bookingUrl || "");
  const [editingBooking, setEditingBooking] = useState(!run?.bookingUrl);
  const [isPending, startTransition] = useTransition();

  const needsLaunch = run?.status === "needs_input" || !run?.campaignId;

  const handleToggleStatus = () => {
    const next = status === "active" ? "paused" : "active";
    startTransition(async () => {
      const res = await toggleChadGtmStatusAction(runId, next);
      if (res.ok) {
        setStatus(next);
        toast.success(next === "active" ? "Outreach resumed" : "Outreach paused");
      } else toast.error(res.error || "Failed to update status");
    });
  };

  const commitVelocity = (v: number) =>
    startTransition(async () => {
      const res = await updateChadGtmVelocityAction(runId, v);
      if (res.ok) toast.success(`Now sending up to ${v} emails a day`);
      else toast.error(res.error || "Failed to update velocity");
    });

  const changeMode = (m: Mode) => {
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
    startTransition(async () => {
      const res = await setBookingUrlAction(runId, booking);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Saved");
      setEditingBooking(false);
      router.refresh();
    });

  const exportInterested = () => {
    const rows = recentActivity.filter((a) => a.type === "agent" && /interested|booking|shared|answered/i.test(a.detail || ""));
    if (rows.length === 0) return void toast.info("No interested leads yet — they'll show up here as they reply.");
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

  let host = run?.url || "";
  try {
    host = new URL(run?.url).hostname.replace(/^www\./, "");
  } catch {}

  const funnel = [
    { icon: Users, label: "Prospects", value: kpis.queuedProspects, sub: "matched to your ICP" },
    { icon: Send, label: "Sent", value: kpis.sentLifetime, sub: `${kpis.sentToday} today` },
    { icon: MessageSquare, label: "Replies", value: kpis.repliesCount, sub: `${kpis.replyRate}% reply rate` },
    { icon: Bot, label: "Handled by agent", value: kpis.agentReplies, sub: `${kpis.positiveSentimentCount} interested` },
    { icon: CalendarCheck, label: "Meetings", value: kpis.meetingsBooked, sub: "booked on your calendar" },
  ];

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/chad-gtm" className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
            <ChevronLeft className="size-3.5" /> Autopilot
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-[28px]">{run?.companyName || host}</h1>
            {needsLaunch ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                <span className="size-1.5 rounded-full bg-amber-400" /> Waiting for booking link
              </span>
            ) : status === "active" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-0.5 text-xs font-medium text-brand-300">
                <span className="live-dot" /> Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                <span className="size-1.5 rounded-full bg-zinc-500" /> Paused
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <a href={run?.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-300">
              {host} <ExternalLink className="size-3" />
            </a>
            {run?.agentRunId && (
              <Link href={`/chad-gtm/${runId}/trace`} className="inline-flex items-center gap-1 hover:text-zinc-300">
                <GitBranch className="size-3" /> Research trace
              </Link>
            )}
            {run?.campaignId && (
              <Link href={`/campaigns/${run.campaignId}`} className="inline-flex items-center gap-1 hover:text-zinc-300">
                <Pencil className="size-3" /> Edit sequence
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportInterested} className="h-9">
            <Download /> Export interested
          </Button>
          {!needsLaunch && (
            <Button
              size="sm"
              variant={status === "active" ? "outline" : "brand"}
              onClick={handleToggleStatus}
              disabled={isPending}
              className="h-9"
            >
              {status === "active" ? <Pause /> : <Play />} {status === "active" ? "Pause outreach" : "Resume outreach"}
            </Button>
          )}
        </div>
      </div>

      {kpis.openRequests > 0 && (
        <Link
          href="/requests"
          className="group flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 transition-colors hover:bg-amber-400/[0.1]"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
            <HandHelping className="size-4" />
          </div>
          <div className="min-w-0 flex-1 text-[13px]">
            <span className="font-medium text-zinc-50">
              {kpis.openRequests} {kpis.openRequests === 1 ? "lead is" : "leads are"} waiting on you
            </span>
            <span className="text-zinc-400"> — the agent paused those threads until you answer.</span>
          </div>
          <ArrowUpRight className="size-4 text-amber-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      )}

      {/* Funnel */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {funnel.map((f, i) => (
          <div
            key={f.label}
            className={cn(
              "hairline-top relative rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-4",
              i === funnel.length - 1 && "col-span-2 md:col-span-1 ring-brand-soft border-brand-400/20",
            )}
          >
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <f.icon className={cn("size-3.5", i === funnel.length - 1 ? "text-brand-300" : "text-zinc-500")} /> {f.label}
            </div>
            <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-zinc-50 tabular-nums">
              {Number(f.value || 0).toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-zinc-500">{f.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Activity */}
        <section className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70">
          <div className="flex items-center justify-between border-b border-zinc-800/70 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-zinc-100">Activity</h2>
            <Link href="/unibox" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
              <Inbox className="size-3.5" /> Open UniBox
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-zinc-900 ring-1 ring-zinc-800">
                <Sparkles className="size-4 text-brand-300" />
              </div>
              <p className="text-[13px] font-medium text-zinc-200">
                {needsLaunch ? "Add your booking link to go live" : "First emails go out in the next sending window"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
                Sends are paced 45–120 seconds apart across the mailbox pool. Replies and the agent&apos;s responses
                show up here as they happen.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {recentActivity.map((a) => {
                const isAgent = a.type === "agent";
                const isReply = a.type === "reply";
                return (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <div
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                        isAgent
                          ? "bg-brand-400/10 text-brand-300 ring-1 ring-brand-400/20"
                          : isReply
                            ? "bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/20"
                            : "bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800",
                      )}
                    >
                      {isAgent ? <Bot className="size-3.5" /> : isReply ? <MessageSquare className="size-3.5" /> : <Send className="size-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13px]">
                        <span className="truncate font-medium text-zinc-200">
                          {isAgent ? "Agent" : isReply ? a.recipient : `Sent to ${a.recipient}`}
                        </span>
                        {isAgent && <span className="truncate text-xs text-zinc-500">→ {a.recipient}</span>}
                      </div>
                      <p className={cn("line-clamp-1 text-xs", isAgent ? "text-brand-200/80" : "text-zinc-500")}>
                        {a.detail || "—"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-600" suppressHydrationWarning>{timeAgo(a.timestamp)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          {/* Reply agent */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-4">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-brand-300" />
              <h2 className="text-sm font-semibold text-zinc-100">Reply agent</h2>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-zinc-900/70 p-1 ring-1 ring-zinc-800">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => changeMode(m.id)}
                  disabled={isPending}
                  className={cn(
                    "rounded-lg py-1.5 text-xs font-medium transition-all",
                    mode === m.id ? "bg-zinc-50 text-black shadow" : "text-zinc-400 hover:text-zinc-100",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">{MODES.find((m) => m.id === mode)?.hint}</p>

            <div className="mt-4 border-t border-zinc-800/70 pt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <CalendarClock className="size-3.5" /> Booking link
                </span>
                {!editingBooking && (
                  <button type="button" onClick={() => setEditingBooking(true)} className="text-xs text-zinc-500 hover:text-zinc-300">
                    Change
                  </button>
                )}
              </div>
              {editingBooking ? (
                <div className="flex gap-2">
                  <Input value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="https://cal.com/you/intro" />
                  <Button size="sm" variant="brand" className="h-9" onClick={saveBooking} disabled={isPending || !booking.trim()}>
                    {isPending ? <Loader2 className="animate-spin" /> : "Save"}
                  </Button>
                </div>
              ) : (
                <a href={booking} target="_blank" rel="noreferrer" className="block truncate rounded-lg bg-zinc-900/60 px-3 py-2 text-xs text-sky-300 ring-1 ring-zinc-800 hover:underline">
                  {booking}
                </a>
              )}
            </div>
            <Link
              href="/requests"
              className="mt-4 flex items-center justify-between rounded-xl bg-zinc-900/50 px-3 py-2.5 text-xs text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200"
            >
              <span className="inline-flex items-center gap-1.5">
                <HandHelping className="size-3.5" /> Needs you & knowledge base
              </span>
              <span className="tabular-nums text-zinc-500">{kpis.openRequests} open</span>
            </Link>
          </div>

          {/* Velocity */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Gauge className="size-4 text-zinc-400" /> Daily volume
              </span>
              <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-zinc-100 tabular-nums ring-1 ring-zinc-800">
                {velocity}/day
              </span>
            </div>
            <input
              type="range"
              min={30}
              max={500}
              step={10}
              value={velocity}
              onChange={(e) => setVelocity(Number(e.target.value))}
              onPointerUp={() => commitVelocity(velocity)}
              onKeyUp={() => commitVelocity(velocity)}
              aria-label="Daily email volume"
              className="mt-4 w-full cursor-pointer accent-[#34d3a6]"
            />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-600">
              <span>30</span>
              <span>250</span>
              <span>500</span>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Every mailbox stays capped at 30 sends a day, so higher volume spreads across more of the pool.
            </p>
          </div>

          {/* Offer */}
          {(run?.offers as any[])?.[0] && (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-4">
              <div className="text-xs font-medium text-zinc-500">Pitch</div>
              <div className="mt-1 text-[13px] font-medium text-zinc-100">{(run.offers as any[])[0].title}</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{(run.offers as any[])[0].valueProp}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
