"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  Globe,
  Inbox,
  Loader2,
  MailCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Button, Input, cn, toast } from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import { setBookingUrlAction, startAutopilotAction } from "@/lib/autopilot-actions";

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
}

const STAGES = [
  { icon: Globe, label: "Reading your website", detail: "Product, pricing, proof, and positioning" },
  { icon: Target, label: "Building your ideal customer profile", detail: "Industries, titles, and pains" },
  { icon: Users, label: "Matching verified buyers", detail: "From the shared B2B directory" },
  { icon: MailCheck, label: "Writing the sequence", detail: "Three touches, personalized per lead" },
  { icon: Inbox, label: "Assigning warmed mailboxes", detail: "30 sends per mailbox per day, human pacing" },
];

const STATUS_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  active: { label: "Live", dot: "bg-brand-400", text: "text-brand-300" },
  paused: { label: "Paused", dot: "bg-zinc-500", text: "text-zinc-400" },
  needs_input: { label: "Needs booking link", dot: "bg-amber-400", text: "text-amber-300" },
  analyzing: { label: "Analyzing", dot: "bg-sky-400", text: "text-sky-300" },
  reviewing: { label: "Draft", dot: "bg-zinc-500", text: "text-zinc-400" },
  calibrating: { label: "Draft", dot: "bg-zinc-500", text: "text-zinc-400" },
  ready: { label: "Ready", dot: "bg-sky-400", text: "text-sky-300" },
  completed: { label: "Completed", dot: "bg-zinc-500", text: "text-zinc-400" },
};

export function AutopilotLauncher({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [booking, setBooking] = useState("");
  const [notes, setNotes] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);
  const [needsLink, setNeedsLink] = useState<{ runId: string; company: string } | null>(null);
  const [lateLink, setLateLink] = useState("");
  const [pending, start] = useTransition();

  // Visual progress while the server works (research + launch is one request).
  useEffect(() => {
    if (!running) return;
    setStage(0);
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 4500);
    return () => clearInterval(t);
  }, [running]);

  const launch = () => {
    if (!url.trim()) return void toast.error("Enter your company website first.");
    setRunning(true);
    start(async () => {
      const res = await startAutopilotAction({ url, bookingUrl: booking, notes });
      setRunning(false);
      if (!res.ok) return void toast.error(res.error);
      if (res.data?.needsBookingUrl) {
        setNeedsLink({ runId: res.data.runId, company: res.data.companyName || "your company" });
        return;
      }
      toast.success(res.message || "Outreach is live");
      router.push(`/chad-gtm/${res.data!.runId}`);
    });
  };

  const submitLateLink = () =>
    start(async () => {
      if (!needsLink) return;
      const res = await setBookingUrlAction(needsLink.runId, lateLink);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Live");
      router.push(`/chad-gtm/${needsLink.runId}`);
    });

  return (
    <div className="page-stack">
      <section className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-950/70 px-5 py-10 sm:px-10 sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[46rem] -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/10 px-3 py-1 text-[11px] font-medium text-brand-300">
            <Sparkles className="size-3.5" /> Autopilot
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-50 sm:text-[40px] sm:leading-[1.1]">
            Your website in. <span className="text-brand-gradient">Meetings out.</span>
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-[15px] text-zinc-400">
            We research your market, find verified buyers, send from our warmed mailboxes, answer every reply, and
            send interested leads to your calendar. You only hear from us when a lead needs something we don&apos;t have.
          </p>

          {needsLink ? (
            <div className="mt-8 w-full animate-float-up rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-left">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
                  <CalendarClock className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold text-zinc-50">One last thing: where should leads book?</h2>
                  <p className="mt-1 text-[13px] text-zinc-400">
                    We researched {needsLink.company} but couldn&apos;t find a booking page on the site. Paste your
                    Calendly, Cal.com, HubSpot, or Google booking link and we go live.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Input
                      autoFocus
                      value={lateLink}
                      onChange={(e) => setLateLink(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitLateLink()}
                      placeholder="https://cal.com/you/intro"
                      className="h-10 text-sm"
                      aria-label="Booking link"
                    />
                    <Button variant="brand" size="lg" onClick={submitLateLink} disabled={pending || !lateLink.trim()}>
                      {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />} Go live
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : running ? (
            <div className="mt-8 w-full max-w-md animate-float-up text-left" aria-live="polite">
              <ol className="flex flex-col gap-1">
                {STAGES.map((s, i) => {
                  const done = i < stage;
                  const active = i === stage;
                  return (
                    <li
                      key={s.label}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                        active && "bg-zinc-900/70 ring-1 ring-zinc-800",
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-lg",
                          done ? "bg-brand-400/15 text-brand-300" : active ? "bg-zinc-800 text-zinc-100" : "text-zinc-600",
                        )}
                      >
                        {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <s.icon className="size-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className={cn("text-[13px] font-medium", active ? "shimmer-text" : done ? "text-zinc-300" : "text-zinc-600")}>
                          {s.label}
                        </div>
                        {active && <div className="text-xs text-zinc-500">{s.detail}</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-center text-xs text-zinc-500">This usually takes under a minute. Keep this tab open.</p>
            </div>
          ) : (
            <form
              className="mt-8 w-full"
              onSubmit={(e) => {
                e.preventDefault();
                launch();
              }}
            >
              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-[0_20px_60px_-30px_rgba(52,211,166,0.35)] focus-within:border-brand-400/50 sm:flex-row">
                <div className="relative flex-1">
                  <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="yourcompany.com"
                    aria-label="Company website"
                    autoComplete="url"
                    className="h-12 w-full rounded-xl bg-transparent pl-10 pr-3 text-[15px] text-zinc-50 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
                <Button type="submit" variant="brand" size="lg" className="h-12 px-6 text-sm" disabled={pending}>
                  Start outreach <ArrowRight />
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <SlidersHorizontal className="size-3" /> {showMore ? "Hide options" : "Booking link & notes (optional)"}
              </button>
              {showMore && (
                <div className="mt-3 grid animate-float-up gap-2 text-left sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-zinc-500">Booking link</label>
                    <Input value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="We'll look for it on your site" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-zinc-500">Anything we should know?</label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. focus on Series A fintechs in the EU" />
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        {!running && !needsLink && (
          <div className="relative mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              { icon: Users, title: "Leads included", body: "Verified B2B contacts matched to your ICP." },
              { icon: Inbox, title: "Mailboxes included", body: "Pre-warmed pool. No DNS, no domains to buy." },
              { icon: Bot, title: "Replies handled", body: "The agent answers and books calls for you." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-4">
                <f.icon className="size-4 text-brand-300" />
                <div className="mt-2 text-[13px] font-medium text-zinc-100">{f.title}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{f.body}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            Your campaigns <span className="ml-1 text-zinc-500 tabular-nums">{runs.length}</span>
          </h2>
          <Link href="/chad-gtm?mode=guided" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
            Prefer to review strategy and voice first? Guided setup <ChevronRight className="size-3" />
          </Link>
        </div>
        {runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-10 text-center text-[13px] text-zinc-500">
            No campaigns yet. Paste your website above to start.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {runs.map((r) => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.reviewing!;
              let host = r.url;
              try {
                host = new URL(r.url).hostname.replace(/^www\./, "");
              } catch {}
              return (
                <li key={r.id}>
                  <Link
                    href={r.status === "reviewing" || r.status === "calibrating" ? "/chad-gtm?mode=guided" : `/chad-gtm/${r.id}`}
                    className="group flex items-center gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900/50"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-zinc-200 ring-1 ring-zinc-800">
                      {(r.companyName || host).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-zinc-100">{r.companyName || host}</span>
                        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", st.text)}>
                          <span className={cn("size-1.5 rounded-full", st.dot)} /> {st.label}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-zinc-500" suppressHydrationWarning>
                        {host} · {r.dailyEmailLimit}/day · reply agent {r.replyAgentMode} · {timeAgo(r.createdAt)}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
