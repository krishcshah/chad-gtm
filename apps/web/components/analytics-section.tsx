"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import {
  AnalyticsBodySkeleton,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  StatePanel,
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
      `Leads contacted ${formatCount(summary.leadsContacted)}. Reply rate ${formatAnalyticsRate(summary.replyRate)}, ${plural(summary.replyCount, "reply", "replies")}. Bounce rate ${formatAnalyticsRate(summary.bounceRate)}, ${plural(summary.bounceCount, "bounce", "bounces")}. Open rate not tracked. Click rate not tracked.`,
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
    <section className="space-y-4" aria-labelledby={heading ? headingId : undefined}>
      {heading ? (
        <div>
          <h2 id={headingId} className="text-[15px] font-semibold tracking-tight">
            {heading}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="space-y-3">
        <div role="group" aria-label="Quick ranges" className="flex flex-wrap gap-2">
          {ANALYTICS_PRESETS.map((preset) => {
            const range = rangeEndingOn(today, preset.days);
            const active = !rangeError && from === range.from && to === range.to && draftFrom === from && draftTo === to;
            return (
              <Button
                key={preset.days}
                type="button"
                size="sm"
                variant={active ? "secondary" : "outline"}
                aria-pressed={active}
                onClick={() => commit(range.from, range.to)}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
        <form
          aria-label="Custom date range"
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            commit(draftFrom, draftTo);
          }}
        >
          <div className="grid flex-1 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={fromId}>
                From<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                id={fromId}
                type="date"
                name="from"
                value={draftFrom}
                required
                autoComplete="off"
                aria-invalid={rangeError ? true : undefined}
                aria-describedby={rangeError ? errorId : undefined}
                className="[color-scheme:light] dark:[color-scheme:dark]"
                onChange={(event) => setDraftFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={toId}>
                To<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                id={toId}
                type="date"
                name="to"
                value={draftTo}
                required
                autoComplete="off"
                aria-invalid={rangeError ? true : undefined}
                aria-describedby={rangeError ? errorId : undefined}
                className="[color-scheme:light] dark:[color-scheme:dark]"
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </div>
          </div>
          <Button type="submit" size="sm" className="w-full sm:w-auto">
            Apply
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {rangeError ? "Inclusive, UTC." : `Showing ${formatRangeDate(from)} to ${formatRangeDate(to)}. Inclusive, UTC.`}
        </p>
        {rangeError ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {rangeError}
          </p>
        ) : null}
      </div>

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Leads contacted" value={formatCount(summary.leadsContacted)} />
            <Kpi
              label="Reply rate"
              value={formatAnalyticsRate(summary.replyRate)}
              hint={plural(summary.replyCount, "reply", "replies")}
            />
            <Kpi
              label="Bounce rate"
              value={formatAnalyticsRate(summary.bounceRate)}
              hint={plural(summary.bounceCount, "bounce", "bounces")}
            />
            <UntrackedKpi label="Open rate" />
            <UntrackedKpi label="Click rate" />
          </div>

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

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <dl>
          <dt className="text-[13px] text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
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
