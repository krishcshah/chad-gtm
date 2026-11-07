"use client";

import { useEffect, useState } from "react";
import {
  CalendarCheck,
  Check,
  Globe,
  Inbox,
  Loader2,
  PenLine,
  Send,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@smartreach/ui";

type Step = { icon: LucideIcon; title: string; detail: string };

const STEPS: Step[] = [
  { icon: Globe, title: "Read your website", detail: "northwind.io · 23 pages" },
  { icon: Target, title: "Picked your buyers", detail: "Heads of Ops at US logistics companies" },
  { icon: Users, title: "Ranked the people", detail: "18,240 matches in 100M+ contacts" },
  { icon: PenLine, title: "Wrote every email", detail: "One per person, plus two follow-ups" },
  { icon: Send, title: "Sent from managed mailboxes", detail: "Business hours, safe daily caps" },
  { icon: Inbox, title: "Answered the replies", detail: "Pricing question, case study request" },
  { icon: CalendarCheck, title: "Sent your booking link", detail: "3 leads picked a time" },
];

type Meeting = { day: number; start: number; span: number; who: string; company: string; at: number };

/** Meetings appear at tick `at` (the last step starts at tick 7). Rows are half hours from 9:00. */
const MEETINGS: Meeting[] = [
  { day: 1, start: 2, span: 2, who: "Dana Reyes", company: "Fleetwise", at: 7 },
  { day: 2, start: 9, span: 2, who: "Marco Tan", company: "Haulio", at: 8 },
  { day: 3, start: 4, span: 2, who: "Priya Shah", company: "Cargolane", at: 9 },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const ROWS = 14;
const TICK_MS = 1400;
/** Ticks to hold the finished state before the loop restarts. */
const HOLD = 6;

/**
 * Hero mock-up: the agent works through a run on the left while intro calls
 * land on the calendar on the right. Purely illustrative; it loops, pauses
 * while off screen, and shows the finished state for reduced motion.
 */
export function HeroDemo() {
  const total = STEPS.length + 1 + HOLD;
  const [tick, setTick] = useState(STEPS.length + 1);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    setAnimate(true);
    setTick(0);
    let id: number | undefined;
    const start = () => {
      if (id === undefined) id = window.setInterval(() => setTick((t) => (t + 1) % total), TICK_MS);
    };
    const stop = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const onVis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [total]);

  const progress = Math.min(tick, STEPS.length + 1);
  const booked = MEETINGS.filter((m) => tick >= m.at);

  return (
    <div className="relative" aria-label="Illustration: the agent runs outbound and books calls on your calendar" role="img">
      <div className="lp-panel overflow-hidden rounded-2xl">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-[12px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            autogtm.tech · Agent for northwind.io
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
            Your time <span className="tabular font-medium text-foreground">0 min</span>
          </div>
        </div>

        <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Agent activity */}
          <div className="border-b border-border p-4 sm:p-5 md:border-b-0 md:border-r">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">Agent activity</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
                </span>
                Running
              </span>
            </div>
            <ol className="flex flex-col">
              {STEPS.map((s, i) => {
                const state = !animate || i < progress - 1 ? "done" : i === progress - 1 ? "active" : "todo";
                const Icon = s.icon;
                return (
                  <li key={s.title} className="relative flex gap-3 py-2">
                    {i < STEPS.length - 1 && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-[13px] top-9 h-[calc(100%-22px)] w-px transition-colors duration-500",
                          state === "done" ? "bg-brand/50" : "bg-border",
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border transition-all duration-500",
                        state === "done" && "border-brand/40 bg-brand-soft text-brand-text",
                        state === "active" && "border-brand bg-card text-brand shadow-[0_0_0_4px_var(--brand-soft)]",
                        state === "todo" && "border-border bg-card text-subtle-foreground",
                      )}
                    >
                      {state === "done" ? (
                        <Check className="size-3.5" />
                      ) : state === "active" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Icon className="size-3.5" />
                      )}
                    </span>
                    <div
                      className={cn(
                        "min-w-0 pt-0.5 transition-opacity duration-500",
                        state === "todo" ? "opacity-40" : "opacity-100",
                      )}
                    >
                      <p className="text-[13px] font-medium leading-tight text-foreground">{s.title}</p>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{s.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Calendar */}
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">Your calendar</p>
              <p className="tabular text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">{animate ? booked.length : MEETINGS.length}</span> calls booked
              </p>
            </div>

            {/* Week grid (sm and up) */}
            <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
              <div className="grid grid-cols-[40px_repeat(5,minmax(0,1fr))] border-b border-border bg-muted/40 text-[11px] text-muted-foreground">
                <span />
                {DAYS.map((d) => (
                  <span key={d} className="border-l border-border px-2 py-1.5 font-medium">
                    {d}
                  </span>
                ))}
              </div>
              <div className="relative grid grid-cols-[40px_repeat(5,minmax(0,1fr))]">
                <div className="flex flex-col">
                  {Array.from({ length: ROWS / 2 }, (_, h) => (
                    <span key={h} className="tabular h-12 pr-1.5 pt-1 text-right text-[10px] text-subtle-foreground">
                      {9 + h}:00
                    </span>
                  ))}
                </div>
                {DAYS.map((d, day) => (
                  <div key={d} className="relative border-l border-border">
                    {Array.from({ length: ROWS / 2 }, (_, h) => (
                      <div key={h} className="h-12 border-b border-border/60 last:border-b-0" />
                    ))}
                    {(animate ? booked : MEETINGS)
                      .filter((m) => m.day === day)
                      .map((m) => (
                        <div
                          key={m.who}
                          className="lp-pop absolute inset-x-1 overflow-hidden rounded-md border border-brand/40 bg-brand-soft px-1.5 py-1"
                          style={{ top: m.start * 24 + 2, height: m.span * 24 - 4 }}
                        >
                          <p className="truncate text-[11px] font-medium leading-tight text-brand-text">Intro call</p>
                          <p className="truncate text-[10.5px] leading-tight text-foreground/80">
                            {m.who} · {m.company}
                          </p>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Agenda (phones) */}
            <ul className="flex flex-col gap-2 sm:hidden">
              {MEETINGS.map((m) => {
                const shown = !animate || booked.includes(m);
                return (
                  <li
                    key={m.who}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-500",
                      shown ? "border-brand/40 bg-brand-soft" : "border-dashed border-border opacity-50",
                    )}
                  >
                    <CalendarCheck className={cn("size-4", shown ? "text-brand-text" : "text-subtle-foreground")} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground">
                        {shown ? `Intro call · ${m.who}` : "Waiting for a reply…"}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {DAYS[m.day]} {9 + Math.floor(m.start / 2)}:{m.start % 2 ? "30" : "00"} · {m.company}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Latest booking toast */}
            <div className="mt-4 flex min-h-[52px] items-center">
              {(animate ? booked.at(-1) : MEETINGS.at(-1)) ? (
                <div
                  key={(animate ? booked.at(-1) : MEETINGS.at(-1))!.who}
                  className="lp-pop flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-md"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text">
                    <CalendarCheck className="size-4" />
                  </span>
                  <p className="min-w-0 text-[12.5px] leading-snug text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {(animate ? booked.at(-1) : MEETINGS.at(-1))!.who}
                    </span>{" "}
                    picked a time from your booking link. It's on your calendar.
                  </p>
                </div>
              ) : (
                <p className="text-[12.5px] text-subtle-foreground">Calls appear here as leads book.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11.5px] text-subtle-foreground">Sample run. Names and numbers are illustrative.</p>
    </div>
  );
}
