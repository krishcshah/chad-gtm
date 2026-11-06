"use client";

import { useState } from "react";
import { BookmarkPlus, Plus } from "lucide-react";
import { Alert, Button, cn, toast } from "@smartreach/ui";
import {
  MAX_SEQUENCE_STEP_COUNT,
  addStep,
  addVariant,
  moveStep,
  removeStep,
  removeVariant,
  type DraftStep,
  type DraftVariant,
} from "@/lib/sequence-draft";
import type { ReusableSequence } from "@/lib/sequence-templates";
import { SaveSequenceDialog } from "./save-sequence-dialog";
import { SequenceComposer } from "./sequence-composer";
import { SequenceLibrary } from "./sequence-library";
import type { TemplateOpt } from "./wizard-types";
import { bodyHtmlFromText, plural, sequenceSpanDays, sequenceToDraftSteps, stepTitle } from "./wizard-utils";

/** Step 4: the list of emails on the left, the editor for the selected one on the right. */
export function SequenceBuilder({
  steps,
  onStepsChange,
  templates,
  onTemplateSaved,
  onTemplateApplied,
  campaignName,
  leadListId,
  error,
}: {
  steps: DraftStep[];
  onStepsChange: (next: DraftStep[]) => void;
  templates: TemplateOpt[];
  onTemplateSaved: (tpl: TemplateOpt) => void;
  onTemplateApplied: (templateId: string) => void;
  campaignName: string;
  leadListId?: string;
  error?: string;
}) {
  const [selected, setSelected] = useState(0);
  const [variantIndex, setVariantIndex] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);

  const stepIndex = Math.min(selected, Math.max(0, steps.length - 1));
  const active = steps[stepIndex];
  const activeVariantIndex = active ? Math.min(variantIndex, active.variants.length - 1) : 0;
  const atMax = steps.length >= MAX_SEQUENCE_STEP_COUNT;
  const span = sequenceSpanDays(steps);
  const onFirstVersion = stepIndex === 0 && activeVariantIndex === 0;
  // A missing first subject is shown on the subject field itself; any other
  // sequence problem (or the user looking at another email) gets an alert.
  const firstSubjectMissing = !steps[0]?.variants[0]?.subject.trim();
  const inlineError = error && firstSubjectMissing && onFirstVersion ? error : undefined;

  const select = (i: number, v = 0) => {
    setSelected(i);
    setVariantIndex(v);
  };

  const patchStep = (index: number, patch: Partial<DraftStep>) =>
    onStepsChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const patchVariant = (index: number, vIndex: number, patch: Partial<DraftVariant>) =>
    onStepsChange(
      steps.map((s, i) =>
        i === index ? { ...s, variants: s.variants.map((v, vi) => (vi === vIndex ? { ...v, ...patch } : v)) } : s,
      ),
    );

  const applySequence = (seq: ReusableSequence) => {
    if (!seq.steps || seq.steps.length === 0) return;
    const previous = steps;
    const next = sequenceToDraftSteps(seq);
    onStepsChange(next);
    select(0);
    toast.success(`Loaded “${seq.name}” (${plural(next.length, "email")})`, {
      action: { label: "Undo", onClick: () => onStepsChange(previous) },
    });
  };

  const applySingle = (tpl: TemplateOpt) => {
    onTemplateApplied(tpl.id);
    patchVariant(stepIndex, activeVariantIndex, {
      subject: tpl.subject,
      bodyText: tpl.bodyText,
      bodyHtml: bodyHtmlFromText(tpl.bodyText),
    });
    toast.success(`Filled ${stepTitle(stepIndex).toLowerCase()} with “${tpl.name}”`);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {plural(steps.length, "email")}
          {steps.length > 1 ? ` over ${plural(span, "day")}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SequenceLibrary templates={templates} onApplySequence={applySequence} onApplySingle={applySingle} />
          <Button type="button" variant="ghost" size="sm" onClick={() => setSaveOpen(true)}>
            <BookmarkPlus />
            Save as template
          </Button>
        </div>
      </div>

      {error && !inlineError ? (
        <Alert
          variant="destructive"
          id="template-group"
          tabIndex={-1}
          action={
            firstSubjectMissing && !onFirstVersion ? (
              <Button type="button" variant="outline" size="xs" onClick={() => select(0)}>
                Open initial email
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <ol aria-label="Emails in this sequence" className="flex flex-col gap-1.5">
            {steps.map((item, index) => {
              const current = index === stepIndex;
              const subject = item.variants[0]?.subject?.trim();
              const ai = item.variants.some((v) => v.aiGenerateOnTheFly);
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-current={current ? "step" : undefined}
                    onClick={() => select(index)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors",
                      "focus-visible:ring-[3px] focus-visible:ring-ring",
                      current ? "border-border-strong bg-muted" : "border-transparent hover:bg-muted/50",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                        current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">{stepTitle(index)}</span>
                        <span className="tabular shrink-0 text-xs text-subtle-foreground">
                          {index === 0 ? "Day 0" : `+${item.delayDays}d`}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block truncate text-[13px]",
                          subject ? "text-muted-foreground" : "italic text-subtle-foreground",
                        )}
                      >
                        {subject || "No subject yet"}
                      </span>
                      {(item.variants.length > 1 || ai) && (
                        <span className="mt-1 block text-xs text-subtle-foreground">
                          {[item.variants.length > 1 ? "A/B test" : null, ai ? "Written by AI per lead" : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={atMax}
            onClick={() => {
              const res = addStep(steps);
              if (!res.error) {
                onStepsChange(res.steps);
                select(res.steps.length - 1);
              }
            }}
          >
            <Plus />
            Add step
          </Button>
          {atMax && (
            <p className="text-xs text-muted-foreground">
              A sequence can have up to {MAX_SEQUENCE_STEP_COUNT} emails.
            </p>
          )}
        </div>

        {active ? (
          <div className="min-w-0 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <SequenceComposer
              key={active.key}
              step={active}
              index={stepIndex}
              stepCount={steps.length}
              variantIndex={activeVariantIndex}
              leadListId={leadListId}
              subjectError={inlineError}
              onVariantIndexChange={setVariantIndex}
              onPatchStep={(patch) => patchStep(stepIndex, patch)}
              onPatchVariant={(patch) => patchVariant(stepIndex, activeVariantIndex, patch)}
              onAddVariant={() => {
                patchStep(stepIndex, addVariant(active));
                setVariantIndex(1);
              }}
              onRemoveVariant={() => {
                patchStep(stepIndex, removeVariant(active, activeVariantIndex));
                setVariantIndex(0);
              }}
              onMove={(direction) => {
                onStepsChange(withStepTypes(moveStep(steps, stepIndex, direction)));
                setSelected(stepIndex + direction);
              }}
              onRemove={() => {
                const next = withStepTypes(removeStep(steps, stepIndex));
                onStepsChange(next);
                select(Math.min(stepIndex, Math.max(0, next.length - 1)));
              }}
            />
          </div>
        ) : null}
      </div>

      <SaveSequenceDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        steps={steps}
        campaignName={campaignName}
        onSaved={onTemplateSaved}
      />
    </div>
  );
}

/** The first email is always the initial one; everything after it is a follow-up. */
function withStepTypes(steps: DraftStep[]): DraftStep[] {
  return steps.map((s, i) => {
    const type = i === 0 ? "initial" : "follow_up";
    return s.type === type ? s : { ...s, type };
  });
}
