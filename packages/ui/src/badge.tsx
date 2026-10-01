import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-none border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-zinc-700 bg-zinc-900 text-zinc-100",
        secondary: "border-zinc-800 bg-black text-zinc-400",
        success: "border-zinc-600 bg-zinc-900 text-white",
        warning: "border-zinc-700 bg-zinc-900 text-zinc-300",
        destructive: "border-zinc-700 bg-zinc-900 text-zinc-300",
        info: "border-zinc-700 bg-zinc-900 text-zinc-200",
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
      {dot && <span className="size-1.5 rounded-none bg-current shrink-0" aria-hidden />}
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
