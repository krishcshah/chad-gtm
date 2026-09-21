import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

const alertVariants = cva("relative w-full rounded-xl border px-4 py-3 text-sm flex gap-3", {
  variants: {
    variant: {
      default: "border-border bg-card/80 text-foreground",
      info: "border-info/30 bg-info/10 text-info-foreground",
      success: "border-success/30 bg-success/10 text-success-foreground",
      warning: "border-warning/30 bg-warning/10 text-warning-foreground",
      destructive: "border-destructive/30 bg-destructive/10 text-destructive",
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
};

export function Alert({
  className,
  variant = "default",
  icon = true,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants> & { icon?: boolean }) {
  const Icon = icons[variant ?? "default"];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {icon && <Icon className="size-4 mt-0.5 shrink-0" aria-hidden />}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-medium leading-none mb-1", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-[13px] opacity-90 leading-relaxed", className)} {...props} />;
}
