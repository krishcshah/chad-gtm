import { getAnalyticsSeries, getAnalyticsSummary } from "@/lib/actions";
import {
  analyticsProblem,
  parseAnalyticsRange,
  utcToday,
  type AnalyticsPointView,
  type AnalyticsSummaryView,
} from "@/lib/analytics-range";
import { AnalyticsSection } from "./analytics-section";

/**
 * Server entry for overview (no campaignId) and campaign analytics.
 * Calls getAnalyticsSummary + getAnalyticsSeries only — no other metrics.
 */
export async function AnalyticsSectionLoader({
  from,
  to,
  campaignId,
  heading,
  description,
}: {
  from?: string;
  to?: string;
  campaignId?: string;
  heading?: string;
  description?: string;
}) {
  const now = new Date();
  const today = utcToday(now);
  const range = parseAnalyticsRange(from, to, now);

  let initialSummary: AnalyticsSummaryView | null = null;
  let initialPoints: AnalyticsPointView[] | null = null;
  let initialProblem: ReturnType<typeof analyticsProblem> = null;

  if (range.ok) {
    const input = {
      from: range.from,
      to: range.to,
      ...(campaignId ? { campaignId } : {}),
    };
    const [summaryRes, seriesRes] = await Promise.all([
      getAnalyticsSummary(input),
      getAnalyticsSeries({ ...input, granularity: "day" }),
    ]);
    initialProblem = analyticsProblem(summaryRes, seriesRes);
    if (summaryRes.ok && summaryRes.data) initialSummary = summaryRes.data;
    if (seriesRes.ok && seriesRes.data) initialPoints = seriesRes.data.points;
  }

  return (
    <AnalyticsSection
      campaignId={campaignId}
      today={today}
      heading={heading}
      description={description}
      initialFrom={range.from}
      initialTo={range.to}
      initialRangeError={range.ok ? null : range.error}
      initialSummary={initialSummary}
      initialPoints={initialPoints}
      initialProblem={initialProblem}
    />
  );
}
