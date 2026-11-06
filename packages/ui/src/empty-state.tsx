import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

/** Empty list or first-run state: icon, title, one sentence, optional actions. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Smaller padding for use inside cards. */
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-6 py-10" : "rounded-xl border border-dashed border-border-strong px-6 py-16",
        className,
      )}
    >
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
