"use client";

import { useEffect, useRef, useState } from "react";
import {
  chartScale,
  formatChartDate,
  formatRangeDate,
  formatTick,
  seriesPeak,
  xLabelIndexes,
  type AnalyticsPointView,
} from "@/lib/analytics-range";

const SERIES = [
  { key: "sent", label: "Sent", color: "var(--primary)", dash: undefined },
  { key: "contacted", label: "Contacted", color: "var(--info)", dash: "6 4" },
  { key: "replies", label: "Replies", color: "var(--success)", dash: "2 3" },
  { key: "bounces", label: "Bounces", color: "var(--warning)", dash: "9 3 2 3" },
] as const;

/**
 * One daily series chart drawn in pixel space so dashes stay even at 375px and 1440px.
 * No chart library is in the repo; this SVG is the lightest fit and uses design tokens.
 */
export function AnalyticsSeriesChart({
  points,
  from,
  to,
}: {
  points: AnalyticsPointView[];
  from: string;
  to: string;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const measure = () => {
      const rect = plot.getBoundingClientRect();
      setWidth(Math.max(1, Math.round(rect.width)));
      setHeight(Math.max(1, Math.round(rect.height)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);

  const peak = seriesPeak(points);
  const { max, ticks } = chartScale(peak);
  const count = points.length;
  const labels = xLabelIndexes(count);
  const caption = `Daily sent, contacted, replies, and bounces from ${formatRangeDate(from)} to ${formatRangeDate(to)}.`;
  const padY = 12;

  function xAt(index: number) {
    if (count <= 1) return width / 2;
    return (index / (count - 1)) * width;
  }

  function yAt(value: number) {
    const span = Math.max(height - padY * 2, 1);
    const t = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
    return padY + (1 - t) * span;
  }

  return (
    <figure aria-label={caption} className="min-w-0">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="flex gap-2">
        <div className="relative h-52 w-12 shrink-0 sm:h-64" aria-hidden="true">
          {height > 0
            ? ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                  style={{ top: `${(yAt(tick) / height) * 100}%` }}
                >
                  {formatTick(tick)}
                </span>
              ))
            : null}
        </div>
        <div ref={plotRef} className="h-52 min-w-0 flex-1 sm:h-64">
          {width > 0 && height > 0 ? (
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              role="presentation"
              aria-hidden="true"
              className="block"
            >
              {ticks.map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  x2={width}
                  y1={yAt(tick)}
                  y2={yAt(tick)}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
              ))}
              {SERIES.map((series) => (
                <polyline
                  key={series.key}
                  fill="none"
                  stroke={series.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={series.dash}
                  points={points.map((point, index) => `${xAt(index)},${yAt(point[series.key])}`).join(" ")}
                />
              ))}
              {count === 1
                ? SERIES.map((series) => (
                    <circle
                      key={series.key}
                      cx={xAt(0)}
                      cy={yAt(points[0]?.[series.key] ?? 0)}
                      r="4"
                      fill={series.color}
                    />
                  ))
                : null}
            </svg>
          ) : null}
        </div>
      </div>
      <div className="relative ml-14 mt-1 h-5" aria-hidden="true">
        {labels.map((index) => {
          const point = points[index];
          if (!point) return null;
          const atStart = index === 0;
          const atEnd = index === count - 1;
          return (
            <span
              key={point.date}
              className="absolute top-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
              style={{
                left: `${count <= 1 ? 50 : (index / (count - 1)) * 100}%`,
                transform: atStart && count > 1 ? "none" : atEnd ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {formatChartDate(point.date)}
            </span>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden="true" className="shrink-0">
              <line
                x1="1"
                y1="4"
                x2="27"
                y2="4"
                stroke={series.color}
                strokeWidth="2"
                strokeDasharray={series.dash}
                strokeLinecap="round"
              />
            </svg>
            <span>{series.label}</span>
          </li>
        ))}
      </ul>
      <details className="mt-4">
        <summary className="cursor-pointer rounded text-[13px] font-medium text-muted-foreground hover:text-foreground">
          View daily numbers
        </summary>
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-border/70">
          <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border/70 text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Sent
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Contacted
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Replies
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Bounces
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date} className="border-b border-border/50 last:border-0">
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-medium">
                    {formatChartDate(point.date)}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.sent}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.contacted}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.replies}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.bounces}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
