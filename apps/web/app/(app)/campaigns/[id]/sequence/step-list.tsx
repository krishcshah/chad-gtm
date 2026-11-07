"use client";

import { Clock, Plus } from "lucide-react";
import { Button, cn } from "@smartreach/ui";
import { MAX_SEQUENCE_STEP_COUNT, waitLabel, type DraftStep } from "@/lib/sequence-draft";
import { AI_WRITTEN_LABEL, aiCopyState } from "@/lib/sequence-labels";

/** Vertical list of steps with the wait before each one. */
export function StepList({
  steps,
  selected,
  onSelect,
  onAdd,
}: {
  steps: DraftStep[];
  selected: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
}) {
  const atMax = steps.length >= MAX_SEQUENCE_STEP_COUNT;

  return (
    <nav aria-label="Sequence steps" className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const current = index === selected;
          const aiState = aiCopyState(step.variants);
          const subject = aiState === "ai" ? AI_WRITTEN_LABEL : step.variants[0]?.subject?.trim() || "No subject yet";
          const showWait = index > 0 || step.delayDays > 0;
          return (
            <li key={step.key} className="flex flex-col">
              {showWait ? (
                <div className="flex items-center gap-2 py-2 pl-3 text-xs text-muted-foreground">
                  <span className="flex w-6 justify-center" aria-hidden>
                    <Clock className="size-3.5 text-subtle-foreground" />
                  </span>
                  {waitLabel(step.delayDays, index)}
                </div>
              ) : null}
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(index)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                  current
                    ? "border-foreground/25 bg-card shadow-xs ring-1 ring-foreground/10"
                    : "border-border bg-card/60 hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                    current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">
                    {index === 0 ? "First email" : `Follow-up ${index}`}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{subject}</span>
                  {aiState === "ai_no_prompt" ? (
                    <span className="mt-0.5 block text-xs text-warning-text">AI on, no instructions</span>
                  ) : null}
                  {step.variants.length > 1 ? (
                    <span className="mt-0.5 block text-xs text-subtle-foreground">
                      A/B test
                      {step.variants.some((v) => v.pausedAt) ? " · one variant paused" : ""}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="outline" onClick={onAdd} disabled={atMax} className="w-full">
        <Plus />
        Add step
      </Button>
      {atMax ? (
        <p className="text-xs text-muted-foreground">{MAX_SEQUENCE_STEP_COUNT} steps is the maximum.</p>
      ) : null}
    </nav>
  );
}
