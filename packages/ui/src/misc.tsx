import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

/** Keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-muted-foreground", className)} aria-label="Loading" />;
}

const dotTone = {
  neutral: "text-subtle-foreground",
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
} as const;

/** Small coloured status dot. `pulse` for live/active states only. */
export function StatusDot({
  tone = "neutral",
  pulse,
  className,
}: {
  tone?: keyof typeof dotTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full bg-current",
        dotTone[tone],
        pulse && "animate-pulse-dot",
        className,
      )}
    />
  );
}

/** Section heading inside a page: title, optional description and actions. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Key/value rows for detail panels. */
export function DataList({
  items,
  className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-border text-[13px]", className)}>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-2.5">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 break-words text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
