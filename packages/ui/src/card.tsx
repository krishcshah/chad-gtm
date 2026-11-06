import * as React from "react";
import { cn } from "./utils";

/** White surface with a hairline border. The basic container on every screen. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-xs", className)}
      {...props}
    />
  );
}

/** Header row: title + description on the left, `actions` on the right. */
export function CardHeader({
  className,
  actions,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { actions?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5 pb-0", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold leading-tight tracking-[-0.01em]", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] leading-relaxed text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3 rounded-b-xl",
        className,
      )}
      {...props}
    />
  );
}
