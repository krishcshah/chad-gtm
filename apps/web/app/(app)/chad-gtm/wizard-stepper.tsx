import { Check } from "lucide-react";
import { cn } from "@smartreach/ui";

/**
 * Numbered step indicator: completed steps are checked, the current one is
 * bold. Collapses to "Step 2 of 5" with a segmented bar on small screens.
 */
export function WizardStepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <nav aria-label="Setup progress">
      <div className="sm:hidden">
        <p className="text-[13px]">
          <span className="text-muted-foreground">
            Step {current} of {steps.length}
          </span>{" "}
          <span className="font-medium">{steps[current - 1]}</span>
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={cn("h-1 flex-1 rounded-full", i < current ? "bg-foreground" : "bg-border")} />
          ))}
        </div>
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "tabular flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  done && "bg-foreground text-background",
                  active && "bg-primary text-primary-foreground ring-4 ring-border",
                  !done && !active && "border border-border-strong text-subtle-foreground",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : n}
              </span>
              <span
                className={cn(
                  "truncate text-[13px]",
                  active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-subtle-foreground",
                )}
              >
                {label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
              {n < steps.length && <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
