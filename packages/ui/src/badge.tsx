import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-tight transition-colors whitespace-nowrap shadow-2xs",
  {
    variants: {
      variant: {
        default: "border-zinc-700/80 bg-zinc-800 text-zinc-100",
        secondary: "border-zinc-800/80 bg-zinc-900/80 text-zinc-400",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-400 font-semibold",
        destructive: "border-rose-500/30 bg-rose-500/10 text-rose-400 font-semibold",
        info: "border-sky-500/30 bg-sky-500/10 text-sky-400 font-semibold",
        outline: "border-zinc-800 bg-transparent text-zinc-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden />}
      {children}
    </div>
  );
}

/** Map domain statuses → badge variants, used across the whole app. */
export function statusVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "active":
    case "running":
    case "sent":
    case "completed":
    case "ok":
    case "replied":
    case "contacted":
      return "success";
    case "scheduled":
    case "queued":
    case "pending":
    case "processing":
    case "new":
      return "info";
    case "paused":
    case "draft":
    case "untested":
      return "secondary";
    case "failed":
    case "bounced":
    case "unsubscribed":
    case "blocked":
      return "destructive";
    case "archived":
    case "cancelled":
      return "outline";
    default:
      return "secondary";
  }
}
