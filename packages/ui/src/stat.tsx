import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

/**
 * Metric tile: label, big number, optional delta/hint. Numbers use tabular
 * figures. Put several in a grid; wrap the grid in a Card with
 * `divide-x` for a joined strip (see docs/DESIGN.md).
 */
export function Stat({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  className,
  bare,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** e.g. { value: "+12%", tone: "success" } */
  delta?: { value: React.ReactNode; tone?: "success" | "destructive" | "neutral" };
  icon?: LucideIcon;
  className?: string;
  /** No border/background: for use inside a joined strip. */
  bare?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 p-5", !bare && "rounded-xl border border-border bg-card shadow-xs", className)}>
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[26px] font-semibold leading-none tracking-[-0.03em] text-foreground">{value}</span>
        {delta ? (
          <span
            className={cn(
              "tabular text-xs font-medium",
              delta.tone === "success" && "text-success-text",
              delta.tone === "destructive" && "text-destructive-text",
              (!delta.tone || delta.tone === "neutral") && "text-muted-foreground",
            )}
          >
            {delta.value}
          </span>
        ) : null}
      </div>
      {hint ? <div className="truncate text-xs text-subtle-foreground">{hint}</div> : null}
    </div>
  );
}
