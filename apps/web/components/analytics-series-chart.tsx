"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@smartreach/ui";
import {
  chartScale,
  formatChartDate,
  formatRangeDate,
  formatTick,
  xLabelIndexes,
  type AnalyticsPointView,
} from "@/lib/analytics-range";

export type AnalyticsSeriesKey = "sent" | "contacted" | "replies" | "bounces";

/** Colour follows the metric, never its position, so a metric looks the same on every chart. */
export const ANALYTICS_SERIES: Record<AnalyticsSeriesKey, { label: string; color: string; dash?: string }> = {
  sent: { label: "Emails sent", color: "var(--chart-1)" },
  contacted: { label: "Leads contacted", color: "var(--chart-2)", dash: "5 4" },
  replies: { label: "Replies", color: "var(--chart-3)" },
  bounces: { label: "Bounces", color: "var(--chart-4)", dash: "5 4" },
};

const ALL_SERIES: AnalyticsSeriesKey[] = ["sent", "contacted", "replies", "bounces"];

const PAD_TOP = 12;
const PAD_BOTTOM = 8;

/** Monotone cubic path: smooth, but never overshoots the data or dips below zero. */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    slopes.push(dx === 0 ? 0 : (pts[i + 1]!.y - pts[i]!.y) / dx);
  }
  const tangents: number[] = new Array(n).fill(0);
  tangents[0] = slopes[0]!;
  tangents[n - 1] = slopes[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = slopes[i - 1]!;
    const b = slopes[i]!;
    tangents[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const s = slopes[i]!;
    if (s === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i]! / s;
    const b = tangents[i + 1]! / s;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangents[i] = t * a * s;
      tangents[i + 1] = t * b * s;
    }
  }
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const dx = (q.x - p.x) / 3;
    const lo = Math.min(p.y, q.y);
    const hi = Math.max(p.y, q.y);
    const c1 = Math.max(lo, Math.min(hi, p.y + tangents[i]! * dx));
    const c2 = Math.max(lo, Math.min(hi, q.y - tangents[i + 1]! * dx));
    d += ` C ${(p.x + dx).toFixed(1)} ${c1.toFixed(1)}, ${(q.x - dx).toFixed(1)} ${c2.toFixed(1)}, ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }
  return d;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Daily line chart for analytics. One shared y-axis, so only put metrics of
 * the same scale together (volume in one chart, replies and bounces in another).
 * Hover or use the arrow keys on the plot to read exact values.
 */
export function AnalyticsSeriesChart({
  points,
  from,
  to,
  series = ALL_SERIES,
  className,
}: {
  points: AnalyticsPointView[];
  from: string;
  to: string;
  series?: AnalyticsSeriesKey[];
  className?: string;
}) {
  const [plotRef, { width, height }] = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const tooltipId = useId();

  const count = points.length;
  const peak = points.reduce((max, p) => Math.max(max, ...series.map((key) => p[key])), 0);
  const scale = chartScale(peak);
  const max = scale.max;
  // Counts are whole numbers, so skip a fractional middle tick (e.g. 2.5 on a 0–5 axis).
  const ticks = scale.ticks.filter((t) => Number.isInteger(t));
  const labelIndexes = xLabelIndexes(count);
  const names = series.map((key) => ANALYTICS_SERIES[key].label.toLowerCase());
  const caption = `Daily ${names.join(", ")} from ${formatRangeDate(from)} to ${formatRangeDate(to)}.`;

  const xAt = (i: number) => (count <= 1 ? width / 2 : (i / (count - 1)) * width);
  const yAt = (value: number) => {
    const span = Math.max(height - PAD_TOP - PAD_BOTTOM, 1);
    const t = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
    return PAD_TOP + (1 - t) * span;
  };

  const point = active !== null ? points[active] : undefined;
  const ready = width > 0 && height > 0;

  // Keep the tooltip inside the card: beside the crosshair when it fits, otherwise clamped.
  // It may extend left over the y-axis column (36px + 12px gap) but never past the plot's right edge.
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipWidth, setTipWidth] = useState(176);
  useLayoutEffect(() => {
    if (tipRef.current) setTipWidth(tipRef.current.offsetWidth);
  }, [active, series.length]);
  let tipLeft = 0;
  if (active !== null) {
    const x = xAt(active);
    const maxLeft = width - tipWidth;
    tipLeft = x + 12 <= maxLeft ? x + 12 : x - 12 - tipWidth;
    tipLeft = Math.max(-48, Math.min(tipLeft, maxLeft));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return;
    const current = active ?? -1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = Math.min(count - 1, current + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, current < 0 ? count - 1 : current - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  }

  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="sr-only">{caption}</figcaption>

      {series.length > 1 ? (
        <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
          {series.map((key) => {
            const s = ANALYTICS_SERIES[key];
            return (
              <li key={key} className="flex items-center gap-2">
                <svg width="20" height="8" aria-hidden className="shrink-0">
                  <line x1="1" y1="4" x2="19" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} strokeLinecap="round" />
                </svg>
                {s.label}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex gap-3">
        {/* Y axis */}
        <div className="relative h-48 w-9 shrink-0 sm:h-60" aria-hidden>
          {ready
            ? ticks.map((tick) => (
                <span
                  key={tick}
                  className="tabular absolute right-0 -translate-y-1/2 text-xs text-subtle-foreground"
                  style={{ top: yAt(tick) }}
                >
                  {formatTick(tick)}
                </span>
              ))
            : null}
        </div>

        {/* Plot */}
        <div
          ref={plotRef}
          role="group"
          tabIndex={count > 0 ? 0 : -1}
          aria-label={`${caption} Use the left and right arrow keys to read each day.`}
          aria-describedby={point ? tooltipId : undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerMove={(event) => {
            if (count === 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const frac = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
            setActive(Math.min(count - 1, Math.max(0, Math.round(frac * (count - 1)))));
          }}
          onPointerLeave={() => setActive(null)}
          className="relative h-48 min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:h-60"
        >
          {ready ? (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block overflow-visible">
              {ticks.map((tick) => (
                <line
                  key={tick}
                  x1={0}
                  x2={width}
                  y1={yAt(tick)}
                  y2={yAt(tick)}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : "2 4"}
                />
              ))}

              {series.map((key) => {
                const s = ANALYTICS_SERIES[key];
                const pts = points.map((p, i) => ({ x: xAt(i), y: yAt(p[key]) }));
                return (
                  <path
                    key={key}
                    d={monotonePath(pts)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray={s.dash}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}

              {count === 1
                ? series.map((key) => (
                    <circle key={key} cx={xAt(0)} cy={yAt(points[0]![key])} r={4} fill={ANALYTICS_SERIES[key].color} />
                  ))
                : null}

              {point && active !== null ? (
                <g>
                  <line
                    x1={xAt(active)}
                    x2={xAt(active)}
                    y1={PAD_TOP}
                    y2={height - PAD_BOTTOM}
                    stroke="var(--border-strong)"
                    strokeWidth={1}
                  />
                  {series.map((key) => (
                    <circle
                      key={key}
                      cx={xAt(active)}
                      cy={yAt(point[key])}
                      r={4}
                      fill={ANALYTICS_SERIES[key].color}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  ))}
                </g>
              ) : null}
            </svg>
          ) : null}

          {point && active !== null && ready ? (
            <div
              ref={tipRef}
              id={tooltipId}
              role="status"
              className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
              style={{ left: tipLeft }}
            >
              <p className="font-medium text-foreground">{formatChartDate(point.date)}</p>
              <dl className="mt-1.5 flex flex-col gap-1">
                {series.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-full" style={{ backgroundColor: ANALYTICS_SERIES[key].color }} aria-hidden />
                      {ANALYTICS_SERIES[key].label}
                    </dt>
                    <dd className="tabular font-medium text-foreground">{point[key].toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      </div>

      {/* X axis */}
      <div className="relative ml-12 mt-2 h-4" aria-hidden>
        {labelIndexes.map((i) => {
          const p = points[i];
          if (!p) return null;
          const first = i === 0 && count > 1;
          const last = i === count - 1 && count > 1;
          return (
            <span
              key={p.date}
              className="tabular absolute top-0 whitespace-nowrap text-xs text-subtle-foreground"
              style={{
                left: `${count <= 1 ? 50 : (i / (count - 1)) * 100}%`,
                transform: first ? "none" : last ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {formatChartDate(p.date)}
            </span>
          );
        })}
      </div>
    </figure>
  );
}

/** Every day in the range as a table: the accessible, exact view of the charts. */
export function AnalyticsDailyTable({ points, from, to }: { points: AnalyticsPointView[]; from: string; to: string }) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <Table>
        <caption className="sr-only">
          Daily numbers from {formatRangeDate(from)} to {formatRangeDate(to)}.
        </caption>
        <TableHeader className="sticky top-0 z-[1] bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Date</TableHead>
            {ALL_SERIES.map((key) => (
              <TableHead key={key} scope="col" className="text-right">
                {ANALYTICS_SERIES[key].label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...points].reverse().map((p) => (
            <TableRow key={p.date}>
              <TableCell className="whitespace-nowrap font-medium">{formatChartDate(p.date)}</TableCell>
              {ALL_SERIES.map((key) => (
                <TableCell key={key} className="tabular text-right text-muted-foreground">
                  {p[key].toLocaleString()}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
