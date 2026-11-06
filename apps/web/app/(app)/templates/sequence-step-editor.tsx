"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Button, Field, Input, SegmentedControl, Textarea } from "@smartreach/ui";
import type { TemplateStepItem } from "@/lib/sequence-templates";
import { AiAssistantPopover } from "@/components/ai/ai-assistant-popover";
import { wordCount } from "./template-utils";
import { SEQUENCE_VARIABLES, VariableButtons, useCaretInsert } from "./variables";

export interface StepEditorProps {
  index: number;
  step: TemplateStepItem;
  totalSteps: number;
  activeVariant: number;
  onActiveVariantChange: (vi: number) => void;
  subjectError?: (vi: number) => string | undefined;
  onDelayChange: (days: number) => void;
  onRemove: () => void;
  onAddVariant: () => void;
  onRemoveVariant: (vi: number) => void;
  onSubjectChange: (vi: number, subject: string) => void;
  onBodyChange: (vi: number, body: string) => void;
}

/** One email in the sequence editor: timing, optional A/B version, subject and body. */
export function SequenceStepEditor({
  index,
  step,
  totalSteps,
  activeVariant,
  onActiveVariantChange,
  subjectError,
  onDelayChange,
  onRemove,
  onAddVariant,
  onRemoveVariant,
  onSubjectChange,
  onBodyChange,
}: StepEditorProps) {
  const vi = Math.min(activeVariant, Math.max(0, step.variants.length - 1));
  const variant = step.variants[vi] ?? { label: "A", subject: "", bodyText: "" };
  const isAb = step.variants.length > 1;
  const body = variant.bodyText ?? "";
  const caret = useCaretInsert(body, (next) => onBodyChange(vi, next));
  const title = index === 0 ? "First email" : `Follow-up ${index}`;
  const headingId = `step-${step.key ?? index}-title`;
  const versionSuffix = isAb ? ` (version ${variant.label})` : "";

  return (
    <li aria-labelledby={headingId} className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {index + 1}
          </span>
          <div className="min-w-0">
            <h3 id={headingId} className="text-sm font-semibold">
              {title}
            </h3>
            {index === 0 && <p className="text-xs text-muted-foreground">Sent when the campaign starts</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Wait
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                value={Number.isFinite(step.delayDays) ? step.delayDays : 0}
                onChange={(e) => onDelayChange(Number(e.target.value))}
                aria-label={`Days to wait before follow-up ${index}`}
                className="tabular h-8 w-16 text-center"
              />
              {step.delayDays === 1 ? "day" : "days"}
            </label>
          )}
          {totalSteps > 1 && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${title.toLowerCase()}`}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {isAb ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SegmentedControl
              size="sm"
              aria-label={`Version of ${title.toLowerCase()} to edit`}
              value={String(vi)}
              onValueChange={(v) => onActiveVariantChange(Number(v))}
              options={step.variants.map((v, i) => ({ value: String(i), label: `Version ${v.label || (i === 0 ? "A" : "B")}` }))}
            />
            <span className="text-xs text-muted-foreground">Leads are split evenly between the two versions.</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="ml-auto"
              onClick={() => onRemoveVariant(vi)}
              aria-label={`Remove version ${variant.label} of ${title.toLowerCase()}`}
            >
              <X />
              Remove version {variant.label}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Want to test a different angle? Add a second version.</span>
            <Button type="button" variant="ghost" size="xs" onClick={onAddVariant}>
              <Plus />
              Add version B
            </Button>
          </div>
        )}

        <Field
          label={`Subject${versionSuffix}`}
          required
          error={subjectError?.(vi)}
          action={
            <AiAssistantPopover
              subject={variant.subject}
              bodyText={body}
              onApply={(improved) => {
                onSubjectChange(vi, improved.subject);
                onBodyChange(vi, improved.bodyText);
              }}
            />
          }
        >
          <Input
            value={variant.subject}
            onChange={(e) => onSubjectChange(vi, e.target.value)}
            placeholder={index === 0 ? "Quick question about {{company}}" : "Re: quick question"}
            maxLength={300}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <Field label={`Body${versionSuffix}`}>
            <Textarea
              ref={caret.ref}
              onSelect={caret.onSelect}
              rows={9}
              value={body}
              onChange={(e) => onBodyChange(vi, e.target.value)}
              placeholder={"Hi {{first_name}},\n\n…"}
              className="min-h-[200px] resize-y"
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VariableButtons variables={SEQUENCE_VARIABLES} onInsert={caret.insert} />
            <span className="tabular text-xs text-subtle-foreground">{wordCount(body).toLocaleString()} words</span>
          </div>
        </div>
      </div>
    </li>
  );
}
