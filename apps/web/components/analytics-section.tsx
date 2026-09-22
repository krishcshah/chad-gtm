"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { AlertCircle, BarChart3, Calendar, TrendingUp } from "lucide-react";
import {
  AnalyticsBodySkeleton,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  StatePanel,
  cn,
} from "@smartreach/ui";
import { getAnalyticsSeries, getAnalyticsSummary } from "@/lib/actions";
import { isNextRedirect } from "@/lib/lead-form";
import {
  ANALYTICS_PRESETS,
  analyticsProblem,
  formatAnalyticsRate,
  formatCount,
  formatRangeDate,
  isAnalyticsEmpty,
  isPermissionMessage,
  normalizeDateKey,
  plural,
  rangeEndingOn,
  type AnalyticsPointView,
  type AnalyticsProblem,
  type AnalyticsSummaryView,
} from "@/lib/analytics-range";
import { AnalyticsSeriesChart } from "./analytics-series-chart";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: AnalyticsSummaryView; points: AnalyticsPointView[] }
  | { status: "problem"; problem: AnalyticsProblem };

export function AnalyticsSection({
  campaignId,
  today,
  heading,
  description,
  initialFrom,
  initialTo,
  initialRangeError,
  initialSummary,
  initialPoints,
  initialProblem,
  hideKpis = false,
}: {
  campaignId?: string;
  today: string;
  heading?: string;
  description?: string;
  initialFrom: string;
  initialTo: string;
  initialRangeError: string | null;
  initialSummary: AnalyticsSummaryView | null;
  initialPoints: AnalyticsPointView[] | null;
  initialProblem: AnalyticsProblem | null;
  hideKpis?: boolean;
}) {
  const headingId = useId();
  const errorId = useId();
  const fromId = useId();
  const toId = useId();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [rangeError, setRangeError] = useState<string | null>(initialRangeError);
  const [retry, setRetry] = useState(0);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [announcement, setAnnouncement] = useState("");

  const showingInitial = from === initialFrom && to === initialTo && retry === 0 && !rangeError;
  const summary = showingInitial ? initialSummary : fetchState.status === "ready" ? fetchState.summary : null;
  const points = showingInitial ? initialPoints : fetchState.status === "ready" ? fetchState.points : null;
  const problem = showingInitial ? initialProblem : fetchState.status === "problem" ? fetchState.problem : null;
  const loading = !rangeError && !showingInitial && (fetchState.status === "loading" || fetchState.status === "idle");
  const noActivity = summary && points ? isAnalyticsEmpty(summary, points) : false;
  const chartEmpty = Boolean(summary && points && (noActivity || points.length === 0));

  useEffect(() => {
    if (rangeError || showingInitial) return;
    let cancelled = false;
    setFetchState({ status: "loading" });
    const input = {
      from,
      to,
      ...(campaignId ? { campaignId } : {}),
    };
    (async () => {
      try {
        const [summaryRes, seriesRes] = await Promise.all([
          getAnalyticsSummary(input),
          getAnalyticsSeries({ ...input, granularity: "day" }),
        ]);
        if (cancelled) return;
        const nextProblem = analyticsProblem(summaryRes, seriesRes);
        if (nextProblem || !summaryRes.ok || !summaryRes.data || !seriesRes.ok || !seriesRes.data) {
          setFetchState({
            status: "problem",
            problem: nextProblem ?? { kind: "error", message: "Could not load analytics." },
          });
          return;
        }
        setFetchState({
          status: "ready",
          summary: summaryRes.data,
          points: seriesRes.data.points,
        });
      } catch (error) {
        if (cancelled) return;
        if (isNextRedirect(error)) throw error;
        const message = error instanceof Error ? error.message : "Could not load analytics.";
        setFetchState({
          status: "problem",
          problem: {
            kind: isPermissionMessage(message) ? "permission" : "error",
            message,
          },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, from, rangeError, retry, showingInitial, to]);

  useEffect(() => {
    if (loading) {
      setAnnouncement("Loading analytics.");
      return;
    }
    if (problem || rangeError || !summary || noActivity) {
      setAnnouncement("");
      return;
    }
    setAnnouncement(
      `Leads contacted ${formatCount(summary.leadsContacted)}. Open rate ${formatAnalyticsRate(summary.openRate)}. Click rate ${formatAnalyticsRate(summary.clickRate)}. Reply rate ${formatAnalyticsRate(summary.replyRate)}, ${plural(summary.replyCount, "reply", "replies")}. Bounce rate ${formatAnalyticsRate(summary.bounceRate)}, ${plural(summary.bounceCount, "bounce", "bounces")}.`,
    );
  }, [from, loading, noActivity, problem, rangeError, summary, to]);

  function commit(nextFrom: string, nextTo: string) {
    const fromKey = normalizeDateKey(nextFrom);
    const toKey = normalizeDateKey(nextTo);
    if (!fromKey || !toKey) {
      setRangeError("Enter a real start and end date.");
      return;
    }
    if (fromKey > toKey) {
      setDraftFrom(fromKey);
      setDraftTo(toKey);
      setRangeError("Start date must be on or before the end date.");
      return;
    }
    setRangeError(null);
    setDraftFrom(fromKey);
    setDraftTo(toKey);
    const url = new URL(window.location.href);
    url.searchParams.set("from", fromKey);
    url.searchParams.set("to", toKey);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    if (fromKey === from && toKey === to) {
      setRetry((value) => value + 1);
      setFetchState({ status: "loading" });
      return;
    }
    setFetchState({ status: "loading" });
    setFrom(fromKey);
    setTo(toKey);
  }

  const ChartTitle = heading ? "h3" : "h2";

  return (
    <section className="space-y-3" aria-labelledby={heading ? headingId : undefined}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* Info-Dense Executive Header & Range Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/50 p-3.5 backdrop-blur shadow-2xs lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Heading, Description & Active Range Badge */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={heading ? headingId : undefined} className="text-base font-semibold tracking-tight text-foreground flex items-center gap-1.5">
              <TrendingUp className="size-4 text-primary" aria-hidden />
              {heading || "Campaign Outreach & Delivery Trajectory"}
            </h2>
            <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground border-border/60 bg-background/50">
              {rangeError ? "UTC" : `${formatRangeDate(from)} – ${formatRangeDate(to)}`}
            </Badge>
          </div>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {description}
            </p>
          )}
        </div>

        {/* Right: Info-dense inline controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Segmented Preset Switcher */}
          <div role="group" aria-label="Quick ranges" className="inline-flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 shadow-2xs">
            {ANALYTICS_PRESETS.map((preset) => {
              const range = rangeEndingOn(today, preset.days);
              const active = !rangeError && from === range.from && to === range.to && draftFrom === from && draftTo === to;
              return (
                <button
                  key={preset.days}
                  type="button"
                  aria-pressed={active}
                  onClick={() => commit(range.from, range.to)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    active
                      ? "bg-background text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Compact Inline Date Range Picker */}
          <form
            aria-label="Custom date range"
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              commit(draftFrom, draftTo);
            }}
          >
            <div className="flex items-center rounded-lg border border-border/60 bg-background/80 px-2.5 py-1 shadow-2xs">
              <Calendar className="size-3.5 text-muted-foreground mr-1.5 shrink-0" />
              <input
                id={fromId}
                type="date"
                name="from"
                aria-label="Start date"
                value={draftFrom}
                required
                autoComplete="off"
                aria-invalid={rangeError ? true : undefined}
                className="w-28 border-0 bg-transparent p-0 text-xs font-mono text-foreground focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
                onChange={(event) => setDraftFrom(event.target.value)}
              />
              <span className="mx-1 text-muted-foreground text-xs">→</span>
              <input
                id={toId}
                type="date"
                name="to"
                aria-label="End date"
                value={draftTo}
                required
                autoComplete="off"
                aria-invalid={rangeError ? true : undefined}
                className="w-28 border-0 bg-transparent p-0 text-xs font-mono text-foreground focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs font-medium px-2.5 shadow-2xs">
              Apply
            </Button>
          </form>
        </div>
      </div>

      {rangeError && (
        <div id={errorId} role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{rangeError}</span>
        </div>
      )}

      {loading ? <AnalyticsBodySkeleton /> : null}

      {!loading && problem ? (
        <StatePanel
          kind={problem.kind === "permission" ? "permission" : "error"}
          title={problem.kind === "permission" ? "Access denied" : "Could not load analytics"}
          description={
            problem.kind === "permission"
              ? "You do not have permission to view these analytics. Sign in with an allowed account, or go back to the dashboard."
              : problem.message
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => commit(from, to)}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          }
        />
      ) : null}

      {!loading && !problem && !rangeError && summary && points ? (
        <>
          {!hideKpis && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Kpi label="Leads Contacted" value={formatCount(summary.leadsContacted)} hint="Emails delivered" />
              <Kpi
                label="Open Rate"
                value={formatAnalyticsRate(summary.openRate)}
                hint={`${summary.openCount ?? 0} opens`}
                highlight={summary.openRate && summary.openRate > 0 ? "emerald" : undefined}
              />
              <Kpi
                label="Click Rate"
                value={formatAnalyticsRate(summary.clickRate)}
                hint={`${summary.clickCount ?? 0} clicks`}
                highlight={summary.clickRate && summary.clickRate > 0 ? "emerald" : undefined}
              />
              <Kpi
                label="Reply Rate"
                value={formatAnalyticsRate(summary.replyRate)}
                hint={plural(summary.replyCount, "unique reply", "unique replies")}
                highlight="emerald"
              />
              <Kpi
                label="Bounce Rate"
                value={formatAnalyticsRate(summary.bounceRate)}
                hint={plural(summary.bounceCount, "bounce", "bounces")}
                highlight={summary.bounceCount > 0 ? "destructive" : undefined}
              />
            </div>
          )}

          <Card>
            <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
              <ChartTitle className="text-[15px] font-medium">Activity by day</ChartTitle>
              {chartEmpty ? (
                <EmptyState
                  icon={BarChart3}
                  title="No activity in this range"
                  description={
                    noActivity
                      ? `Nothing was sent, contacted, replied, or bounced from ${formatRangeDate(from)} to ${formatRangeDate(to)}.`
                      : "No daily breakdown for this range."
                  }
                  className="border-0 bg-transparent px-2 py-10"
                />
              ) : (
                <div className="mt-4">
                  <AnalyticsSeriesChart points={points} from={from} to={to} />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: "emerald" | "destructive";
}) {
  return (
    <Card className={cn(
      "border-border/70 transition-colors",
      highlight === "emerald" && "border-emerald-500/30 bg-emerald-500/[0.02]",
      highlight === "destructive" && "border-destructive/30 bg-destructive/[0.02]"
    )}>
      <CardContent className="p-4">
        <dl>
          <dt className="text-[13px] text-muted-foreground">{label}</dt>
          <dd className={cn(
            "mt-1 text-2xl font-semibold tracking-tight tabular-nums",
            highlight === "emerald" && "text-emerald-400",
            highlight === "destructive" && "text-destructive"
          )}>
            {value}
          </dd>
          {hint ? <dd className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{hint}</dd> : null}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Opens and clicks are not tracked. The value is an em dash, not a zero or an estimate. */
function UntrackedKpi({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <dl>
          <dt className="text-[13px] text-muted-foreground">{label}</dt>
          <dd className="mt-1">
            <span className="text-2xl font-semibold tracking-tight" aria-hidden="true">
              {formatAnalyticsRate(null)}
            </span>
            <span className="sr-only">Not tracked</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground" aria-hidden="true">
              Not tracked
            </span>
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
