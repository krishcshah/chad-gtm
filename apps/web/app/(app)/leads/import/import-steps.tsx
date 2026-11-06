import { Check } from "lucide-react";
import { cn } from "@smartreach/ui";

const STEPS = ["Upload", "Preview", "Match columns"] as const;

/**
 * Numbered step indicator for the import wizard.
 * `current` is the zero-based active step; pass STEPS.length when all are done.
 */
export function ImportSteps({ current }: { current: number }) {
  return (
    <ol aria-label="Import steps" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "tabular flex size-6 items-center justify-center rounded-full text-xs font-medium",
                  done && "bg-success-soft text-success-text",
                  active && "bg-primary text-primary-foreground",
                  !done && !active && "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
              </span>
              <span className={cn(active ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {label}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
            </span>
            {index < STEPS.length - 1 ? <span aria-hidden className="hidden h-px w-10 bg-border sm:block" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export const IMPORT_STEP_COUNT = STEPS.length;
