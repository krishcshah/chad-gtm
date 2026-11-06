"use client";

import { AlertCircle, Check } from "lucide-react";
import { cn } from "@smartreach/ui";
import { WIZARD_STEPS } from "./wizard-types";

/**
 * Numbered step indicator. Completed steps show a check, the current step is
 * bold, and any step the user may jump to (already reached and reachable) is a button.
 */
export function WizardStepper({
  current,
  canJumpTo,
  hasError,
  onJump,
}: {
  current: number;
  canJumpTo: (id: number) => boolean;
  hasError: (id: number) => boolean;
  onJump: (id: number) => void;
}) {
  const active = WIZARD_STEPS[current - 1];
  return (
    <nav aria-label="Campaign setup steps" className="flex flex-col gap-2">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {WIZARD_STEPS.map((s, i) => {
          const isCurrent = s.id === current;
          const isDone = s.id < current;
          const error = hasError(s.id);
          const jumpable = !isCurrent && canJumpTo(s.id);
          const status = error ? "has errors" : isDone ? "completed" : isCurrent ? "current step" : "not started";
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1.5 last:flex-none sm:gap-2">
              <button
                type="button"
                disabled={!jumpable}
                onClick={() => jumpable && onJump(s.id)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Step ${s.id}, ${s.label}, ${status}`}
                className={cn(
                  "group flex shrink-0 items-center gap-2 rounded-md py-1 pr-1 text-[13px] outline-none transition-colors",
                  "focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-default",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "tabular flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    error
                      ? "bg-destructive-soft text-destructive-text ring-1 ring-inset ring-destructive/30"
                      : isCurrent
                        ? "bg-primary text-primary-foreground"
                        : isDone
                          ? "bg-success-soft text-success-text group-hover:ring-1 group-hover:ring-inset group-hover:ring-success/40"
                          : "bg-card text-subtle-foreground ring-1 ring-inset ring-border-strong",
                  )}
                >
                  {error ? (
                    <AlertCircle className="size-3.5" />
                  ) : isDone ? (
                    <Check className="size-3.5" strokeWidth={2.5} />
                  ) : (
                    s.id
                  )}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "hidden whitespace-nowrap lg:inline",
                    isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                    jumpable && "group-hover:text-foreground",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn("h-px min-w-2 flex-1", s.id < current ? "bg-success/40" : "bg-border")}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] text-muted-foreground lg:hidden" aria-hidden>
        Step {current} of {WIZARD_STEPS.length}
        <span className="text-foreground">: {active?.label}</span>
      </p>
    </nav>
  );
}
