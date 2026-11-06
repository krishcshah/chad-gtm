import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium leading-none",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
        brand: "bg-brand-soft text-brand-text",
        success: "bg-success-soft text-success-text",
        warning: "bg-warning-soft text-warning-text",
        destructive: "bg-destructive-soft text-destructive-text",
        info: "bg-info-soft text-info-text",
        outline: "text-muted-foreground ring-1 ring-inset ring-border-strong",
        solid: "bg-primary text-primary-foreground",
        /** @deprecated aliases */
        default: "bg-muted text-foreground ring-1 ring-inset ring-border",
        secondary: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Leading status dot in the badge's colour. */
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Map domain statuses to badge variants, used across the whole app. */
export function statusVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "active":
    case "running":
    case "sent":
    case "completed":
    case "ok":
    case "replied":
    case "contacted":
    case "connected":
    case "healthy":
    case "approved":
    case "resolved":
      return "success";
    case "scheduled":
    case "queued":
    case "pending":
    case "processing":
    case "new":
    case "open":
      return "info";
    case "warming":
    case "warning":
    case "needs_attention":
    case "waiting":
      return "warning";
    case "paused":
    case "draft":
    case "untested":
      return "neutral";
    case "failed":
    case "bounced":
    case "unsubscribed":
    case "blocked":
    case "error":
    case "rejected":
      return "destructive";
    case "archived":
    case "cancelled":
    case "closed":
      return "outline";
    default:
      return "neutral";
  }
}

export { badgeVariants };
