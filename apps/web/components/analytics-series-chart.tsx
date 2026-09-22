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

function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  if (pts.length === 2) return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[1]!.x} ${pts[1]!.y}`;

  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  const tension = 0.16;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Daily series chart with smooth Bézier interpolation, responsive layout,
 * and an interactive date-hover crosshair with bold dots and metric tooltips.
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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
  const padY = 14;

  function xAt(index: number) {
    if (count <= 1) return width / 2;
    return (index / (count - 1)) * width;
  }

  function yAt(value: number) {
    const span = Math.max(height - padY * 2, 1);
    const t = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
    return padY + (1 - t) * span;
  }

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

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
        <div
          ref={plotRef}
          className="relative h-52 min-w-0 flex-1 cursor-crosshair sm:h-64"
          onPointerMove={(e) => {
            if (count === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const frac = Math.max(0, Math.min(1, mouseX / rect.width));
            const idx = Math.min(Math.max(0, Math.round(frac * (count - 1))), count - 1);
            setHoverIndex(idx);
          }}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {width > 0 && height > 0 ? (
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              role="presentation"
              aria-hidden="true"
              className="block overflow-visible"
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
              {SERIES.map((series) => {
                const pts = points.map((point, index) => ({
                  x: xAt(index),
                  y: yAt(point[series.key]),
                }));
                return (
                  <path
                    key={series.key}
                    fill="none"
                    stroke={series.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={series.dash}
                    d={buildSmoothPath(pts)}
                  />
                );
              })}
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

              {/* Hover vertical crosshair line and bold circular dots */}
              {hoverIndex !== null && hoveredPoint && (
                <g className="transition-opacity duration-150">
                  <line
                    x1={xAt(hoverIndex)}
                    x2={xAt(hoverIndex)}
                    y1={padY - 4}
                    y2={height - padY + 4}
                    stroke="var(--foreground)"
                    strokeOpacity="0.2"
                    strokeDasharray="3 3"
                    strokeWidth="1.5"
                  />
                  {SERIES.map((series) => {
                    const cx = xAt(hoverIndex);
                    const cy = yAt(hoveredPoint[series.key]);
                    return (
                      <g key={series.key}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r="7"
                          fill={series.color}
                          fillOpacity="0.2"
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r="4.5"
                          fill={series.color}
                          stroke="var(--card)"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
          ) : null}

          {/* Interactive Tooltip Card */}
          {hoverIndex !== null && hoveredPoint && width > 0 && (
            <div
              className="pointer-events-none absolute top-2 z-20 min-w-[10rem] -translate-x-1/2 rounded-lg border border-border bg-popover/95 p-2.5 text-popover-foreground shadow-lg backdrop-blur transition-all duration-75"
              style={{
                left: `${Math.max(16, Math.min(width - 16, xAt(hoverIndex)))}px`,
                transform:
                  hoverIndex > count * 0.65
                    ? "translateX(-95%)"
                    : hoverIndex < count * 0.35
                      ? "translateX(-5%)"
                      : "translateX(-50%)",
              }}
            >
              <p className="border-b border-border/60 pb-1 text-xs font-semibold">
                {formatChartDate(hoveredPoint.date)}
              </p>
              <div className="mt-1.5 space-y-1 text-xs">
                {SERIES.map((series) => (
                  <div key={series.key} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: series.color }}
                      />
                      {series.label}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {hoveredPoint[series.key].toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
