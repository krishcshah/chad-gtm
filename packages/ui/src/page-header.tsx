import * as React from "react";
import { cn } from "./utils";

/** Consistent page title row used across Must-path screens. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Small label above the title, e.g. a section name. */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-400/90">{eyebrow}</div>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-[26px]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
