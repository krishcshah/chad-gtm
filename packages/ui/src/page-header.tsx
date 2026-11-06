import * as React from "react";
import { cn } from "./utils";

/**
 * Page title row. Every top-level screen starts with one.
 * `eyebrow` is for a breadcrumb/back link, not decoration.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small row above the title: breadcrumb or back link. */
  eyebrow?: React.ReactNode;
  /** Row under the description: status badges, owner, dates. */
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-[13px] text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-balance text-2xl font-semibold tracking-[-0.025em] text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
