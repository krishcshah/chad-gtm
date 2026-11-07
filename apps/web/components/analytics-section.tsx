"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronDown } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Skeleton,
  Stat,
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
import { AnalyticsDailyTable, AnalyticsSeriesChart } from "./analytics-series-chart";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: AnalyticsSummaryView; points: AnalyticsPointView[] }
  | { status: "problem"; problem: AnalyticsProblem };

type RangeOption = `${(typeof ANALYTICS_PRESETS)[number]["days"]}` | "custom";

/**
 * Date range, headline numbers and daily charts for all campaigns (no
 * campaignId) or one campaign. The first render uses data loaded on the
 * server by AnalyticsSectionLoader; range changes refetch on the client.
 */
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
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [rangeError, setRangeError] = useState<string | null>(initialRangeError);
  const [retry, setRetry] = useState(0);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [announcement, setAnnouncement] = useState("");

  const matchedPreset = ANALYTICS_PRESETS.find((p) => {
    const r = rangeEndingOn(today, p.days);
    return r.from === from && r.to === to;
  });
  const [customOpen, setCustomOpen] = useState(!matchedPreset || Boolean(initialRangeError));
  const rangeValue: RangeOption = customOpen || !matchedPreset ? "custom" : (String(matchedPreset.days) as RangeOption);

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
    const input = { from, to, ...(campaignId ? { campaignId } : {}) };
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
        setFetchState({ status: "ready", summary: summaryRes.data, points: seriesRes.data.points });
      } catch (error) {
        if (cancelled) return;
        if (isNextRedirect(error)) throw error;
        const message = error instanceof Error ? error.message : "Could not load analytics.";
        setFetchState({
          status: "problem",
          problem: { kind: isPermissionMessage(message) ? "permission" : "error", message },
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
      `Leads emailed ${formatCount(summary.leadsContacted)}. Open rate ${formatAnalyticsRate(summary.openRate)}. Click rate ${formatAnalyticsRate(summary.clickRate)}. Reply rate ${formatAnalyticsRate(summary.replyRate)}, ${plural(summary.replyCount, "reply", "replies")}. Bounce rate ${formatAnalyticsRate(summary.bounceRate)}, ${plural(summary.bounceCount, "bounce", "bounces")}.`,
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

  function onRangeChange(value: RangeOption) {
    if (value === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    const range = rangeEndingOn(today, Number(value));
    commit(range.from, range.to);
  }

  const rangeLabel = `${formatRangeDate(from)} to ${formatRangeDate(to)}`;

  return (
    <section className="flex flex-col gap-6" aria-labelledby={heading ? headingId : undefined} aria-label={heading ? undefined : "Analytics"}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {heading ? (
              <h2 id={headingId} className="text-[15px] font-semibold tracking-[-0.01em]">
                {heading}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-[13px] text-muted-foreground">{description}</p> : null}
            <p className={cn("text-[13px] text-muted-foreground", (heading || description) && "mt-1")}>
              {rangeError ? "Choose a valid date range." : rangeLabel}
              <span className="text-subtle-foreground"> · UTC</span>
            </p>
          </div>
          <SegmentedControl<RangeOption>
            aria-label="Date range"
            value={rangeValue}
            onValueChange={onRangeChange}
            options={[
              ...ANALYTICS_PRESETS.map((p) => ({ value: String(p.days) as RangeOption, label: p.label })),
              { value: "custom", label: "Custom" },
            ]}
            className="self-start sm:self-auto"
          />
        </div>

        {customOpen ? (
          <form
            aria-label="Custom date range"
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              commit(draftFrom, draftTo);
            }}
          >
            <Field label="From" className="w-[calc(50%-0.375rem)] sm:w-44">
              <Input
                type="date"
                name="from"
                value={draftFrom}
                max={today}
                required
                autoComplete="off"
                aria-invalid={rangeError ? true : undefined}
                onChange={(event) => setDraftFrom(event.target.value)}
                className="tabular"
              />
            </Field>
            <Field label="To" className="w-[calc(50%-0.375rem)] sm:w-44">
              <Input
                type="date"
                name="to"
                value={draftTo}
                max={today}
                required
                autoComplete="off"
                aria-invalid={rangeError ? true : undefined}
                onChange={(event) => setDraftTo(event.target.value)}
                className="tabular"
              />
            </Field>
            <Button type="submit" variant="outline">
              Apply
            </Button>
          </form>
        ) : null}

        {rangeError ? <Alert variant="destructive">{rangeError}</Alert> : null}
      </div>

      {loading ? <AnalyticsSectionSkeleton hideKpis={hideKpis} /> : null}

      {!loading && problem ? (
        <StatePanel
          kind={problem.kind === "permission" ? "permission" : "error"}
          title={problem.kind === "permission" ? "Access denied" : "Could not load analytics"}
          description={
            problem.kind === "permission"
              ? "You do not have permission to view these numbers. Sign in with an allowed account."
              : problem.message
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => commit(from, to)}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Back to overview</Link>
              </Button>
            </div>
          }
        />
      ) : null}

      {!loading && !problem && !rangeError && summary && points ? (
        <>
          {!hideKpis ? <StatStrip summary={summary} points={points} /> : null}

          {chartEmpty ? (
            <Card>
              <EmptyState
                compact
                icon={BarChart3}
                title="No activity in this range"
                description={
                  noActivity
                    ? `Nothing was sent, replied to or bounced between ${formatRangeDate(from)} and ${formatRangeDate(to)}. Try a longer range.`
                    : "There is no daily breakdown for this range."
                }
                action={
                  campaignId ? undefined : (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/campaigns">Go to campaigns</Link>
                    </Button>
                  )
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="min-w-0">
                  <CardHeader>
                    <CardTitle>Sending volume</CardTitle>
                    <CardDescription>Emails sent, including follow-ups, and leads emailed per day.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsSeriesChart points={points} from={from} to={to} series={["sent", "contacted"]} />
                  </CardContent>
                </Card>
                <Card className="min-w-0">
                  <CardHeader>
                    <CardTitle>Replies and bounces</CardTitle>
                    <CardDescription>Leads who replied and emails that bounced, per day.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsSeriesChart points={points} from={from} to={to} series={["replies", "bounces"]} />
                  </CardContent>
                </Card>
              </div>
              <DailyNumbers points={points} from={from} to={to} />
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

function StatStrip({ summary, points }: { summary: AnalyticsSummaryView; points: AnalyticsPointView[] }) {
  const sent = points.reduce((total, p) => total + p.sent, 0);
  return (
    <div className="@container">
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border @lg:grid-cols-3 @4xl:grid-cols-6 [&>*]:bg-card">
      <Stat bare label="Emails sent" value={formatCount(sent)} hint="Including follow-ups" />
      <Stat bare label="Leads emailed" value={formatCount(summary.leadsContacted)} hint="Each lead counted once" />
      <Stat
        bare
        label="Replies"
        value={formatCount(summary.replyCount)}
        hint={`${formatAnalyticsRate(summary.replyRate)} reply rate`}
      />
      <Stat
        bare
        label="Bounces"
        value={formatCount(summary.bounceCount)}
        hint={`${formatAnalyticsRate(summary.bounceRate)} bounce rate`}
      />
      <RateStat label="Open rate" rate={summary.openRate} count={summary.openCount} noun={["open", "opens"]} />
      <RateStat label="Click rate" rate={summary.clickRate} count={summary.clickCount} noun={["click", "clicks"]} />
      </Card>
    </div>
  );
}

/** Opens and clicks may be untracked. Then the value is a dash, never a zero or an estimate. */
function RateStat({
  label,
  rate,
  count,
  noun,
}: {
  label: string;
  rate: number | null;
  count?: number;
  noun: [string, string];
}) {
  if (rate == null) {
    return (
      <Stat
        bare
        label={label}
        value={
          <>
            <span aria-hidden>{formatAnalyticsRate(null)}</span>
            <span className="sr-only">Not tracked</span>
          </>
        }
        hint="Not tracked"
      />
    );
  }
  return (
    <Stat
      bare
      label={label}
      value={formatAnalyticsRate(rate)}
      hint={count != null ? plural(count, noun[0], noun[1]) : undefined}
    />
  );
}

function DailyNumbers({ points, from, to }: { points: AnalyticsPointView[]; from: string; to: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <Card>
      <CardHeader
        className="pb-5"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Show"}
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden />
          </Button>
        }
      >
        <CardTitle>Daily numbers</CardTitle>
        <CardDescription>The exact figures behind both charts, newest day first.</CardDescription>
      </CardHeader>
      {open ? (
        <div id={panelId} className="border-t border-border">
          <AnalyticsDailyTable points={points} from={from} to={to} />
        </div>
      ) : null}
    </Card>
  );
}

/** Placeholder shaped like the stat strip and the two chart cards. */
export function AnalyticsSectionSkeleton({ hideKpis = false }: { hideKpis?: boolean }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      {!hideKpis ? (
        <div className="@container">
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border @lg:grid-cols-3 @4xl:grid-cols-6 [&>*]:bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 p-5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-6 w-14" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </Card>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="flex flex-col gap-4 p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
            <Skeleton className="h-48 w-full sm:h-60" />
          </Card>
        ))}
      </div>
      <span className="sr-only">Loading analytics</span>
    </div>
  );
}
