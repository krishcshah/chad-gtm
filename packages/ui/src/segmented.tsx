"use client";
import * as React from "react";
import { cn } from "./utils";

/** Compact single-choice toggle (date ranges, views). Use Tabs when it switches page content. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = "md",
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; disabled?: boolean }[];
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5 ring-1 ring-inset ring-border",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50 [&_svg]:size-4",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
