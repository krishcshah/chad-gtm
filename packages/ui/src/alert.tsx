import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

const alertVariants = cva("relative flex w-full gap-3 rounded-lg border px-4 py-3 text-sm", {
  variants: {
    variant: {
      default: "border-border bg-muted/60 text-foreground [&>svg]:text-muted-foreground",
      info: "border-info/20 bg-info-soft text-foreground [&>svg]:text-info-text",
      success: "border-success/20 bg-success-soft text-foreground [&>svg]:text-success-text",
      warning: "border-warning/25 bg-warning-soft text-foreground [&>svg]:text-warning-text",
      destructive: "border-destructive/20 bg-destructive-soft text-foreground [&>svg]:text-destructive-text",
      brand: "border-brand/20 bg-brand-soft text-foreground [&>svg]:text-brand-text",
    },
  },
  defaultVariants: { variant: "default" },
});

const icons = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  destructive: AlertCircle,
  brand: Info,
};

/** Inline message. Put an action button in `action` (right side on desktop). */
export function Alert({
  className,
  variant = "default",
  icon = true,
  action,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & { icon?: boolean; action?: React.ReactNode }) {
  const Icon = icons[variant ?? "default"];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="flex shrink-0 items-start gap-2">{action}</div> : null}
    </div>
  );
}
export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-medium leading-snug", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-0.5 text-[13px] leading-relaxed text-muted-foreground", className)} {...props} />;
}
