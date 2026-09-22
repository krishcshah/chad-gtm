import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        secondary: "border-border/60 bg-secondary/70 text-secondary-foreground",
        success: "border-success/25 bg-success/12 text-success-foreground",
        warning: "border-warning/25 bg-warning/12 text-warning-foreground",
        destructive: "border-destructive/25 bg-destructive/12 text-destructive",
        info: "border-info/25 bg-info/12 text-info-foreground",
        outline: "border-border text-muted-foreground",
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
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
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
