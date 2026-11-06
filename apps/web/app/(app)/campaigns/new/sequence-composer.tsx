"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import { Button, Input, SegmentedControl, Textarea, cn } from "@smartreach/ui";
import { clampDelayDays, type DraftStep, type DraftVariant } from "@/lib/sequence-draft";
import { AiAssistantPopover } from "@/components/ai/ai-assistant-popover";
import { AiDynamicScriptCard } from "@/components/ai/ai-dynamic-script-card";
import { ManualEmailPreviewDialog } from "@/components/email/manual-email-preview-dialog";
import { WizardField, fieldAria } from "./wizard-field";
import { bodyHtmlFromText, stepTitle } from "./wizard-utils";

const MERGE_FIELDS = ["first_name", "last_name", "company", "email"] as const;
const SUBJECT_MAX = 500;

type BodyMode = "formatted" | "plain";

/** Editor for one step of the sequence: wait time, A/B versions, subject, body and AI options. */
export function SequenceComposer({
  step,
  index,
  stepCount,
  variantIndex,
  leadListId,
  subjectError,
  onVariantIndexChange,
  onPatchStep,
  onPatchVariant,
  onAddVariant,
  onRemoveVariant,
  onMove,
  onRemove,
}: {
  step: DraftStep;
  index: number;
  stepCount: number;
  variantIndex: number;
  leadListId?: string;
  subjectError?: string;
  onVariantIndexChange: (i: number) => void;
  onPatchStep: (patch: Partial<DraftStep>) => void;
  onPatchVariant: (patch: Partial<DraftVariant>) => void;
  onAddVariant: () => void;
  onRemoveVariant: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [bodyMode, setBodyMode] = useState<BodyMode>("formatted");
  const [previewOpen, setPreviewOpen] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"subject" | "body">("body");

  const variant = step.variants[variantIndex] ?? step.variants[0]!;
  const aiOn = Boolean(variant.aiGenerateOnTheFly);
  const title = stepTitle(index);

  const setBody = (text: string) => onPatchVariant({ bodyText: text, bodyHtml: bodyHtmlFromText(text) });

  const insertField = (token: string) => {
    if (lastField.current === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? variant.subject.length;
      const end = el.selectionEnd ?? variant.subject.length;
      onPatchVariant({ subject: variant.subject.slice(0, start) + token + variant.subject.slice(end) });
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      return;
    }
    const el = bodyRef.current;
    const text = variant.bodyText || "";
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setBody(text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {index === 0
              ? "Sent first, when the campaign reaches a lead."
              : "Sent after the wait below. Leads who replied are skipped while stop on reply is on."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <AiAssistantPopover
            subject={variant.subject}
            bodyText={variant.bodyText}
            onApply={(improved) =>
              onPatchVariant({
                subject: improved.subject,
                bodyText: improved.bodyText,
                bodyHtml: improved.bodyHtml || bodyHtmlFromText(improved.bodyText),
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${title.toLowerCase()} up`}
            title="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${title.toLowerCase()} down`}
            title="Move down"
            disabled={index === stepCount - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          {stepCount > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${title.toLowerCase()}`}
              title="Remove step"
              className="hover:text-destructive-text"
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        {index > 0 ? (
          <WizardField id={`step-wait-${step.key}`} label="Wait before sending">
            <div className="flex items-center gap-2">
              <Input
                id={`step-wait-${step.key}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                value={step.delayDays}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onPatchStep({ delayDays: clampDelayDays(Number.isNaN(val) ? 0 : val) });
                }}
                className="tabular w-20"
              />
              <span className="text-[13px] text-muted-foreground">days after the previous email</span>
            </div>
          </WizardField>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {step.variants.length > 1 ? (
            <>
              <SegmentedControl
                size="sm"
                aria-label="Email version"
                value={String(variantIndex)}
                onValueChange={(v) => onVariantIndexChange(Number(v))}
                options={step.variants.map((v, i) => ({ value: String(i), label: `Version ${v.label}` }))}
              />
              <Button type="button" variant="ghost" size="xs" onClick={onRemoveVariant}>
                Remove version {variant.label}
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="xs" onClick={onAddVariant}>
              <Plus />
              Add A/B version
            </Button>
          )}
        </div>
      </div>
      {step.variants.length > 1 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Leads are split evenly between version A and version B.
        </p>
      )}

      <WizardField
        id="step-subject"
        label={aiOn ? "Fallback subject" : "Subject"}
        error={subjectError}
        hint={aiOn ? "Used if AI cannot write this email for a lead." : undefined}
        action={
          <span
            className={cn(
              "tabular text-xs",
              variant.subject.length > SUBJECT_MAX ? "text-destructive-text" : "text-subtle-foreground",
            )}
          >
            {variant.subject.length}/{SUBJECT_MAX}
          </span>
        }
      >
        <Input
          ref={subjectRef}
          {...fieldAria("step-subject", subjectError, aiOn)}
          value={variant.subject}
          onFocus={() => (lastField.current = "subject")}
          onChange={(e) => onPatchVariant({ subject: e.target.value })}
          placeholder="Quick question, {{first_name}}"
        />
      </WizardField>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="step-body" className="text-[13px] font-medium leading-none text-foreground">
            {aiOn ? "Fallback email" : "Email"}
          </label>
          <Button type="button" variant="ghost" size="xs" onClick={() => setPreviewOpen(true)}>
            <Eye />
            Preview with a lead
          </Button>
        </div>
        <div className="overflow-hidden rounded-md border border-border-strong bg-card shadow-xs focus-within:border-brand focus-within:ring-[3px] focus-within:ring-ring">
          <Textarea
            ref={bodyRef}
            id="step-body"
            rows={12}
            value={variant.bodyText}
            onFocus={() => (lastField.current = "body")}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              bodyMode === "formatted"
                ? "Hi {{first_name}},\n\nI noticed {{company}} and wanted to reach out…"
                : "Plain text email body…"
            }
            className={cn(
              "min-h-[280px] resize-y rounded-none border-0 shadow-none focus-visible:border-0 focus-visible:ring-0",
              bodyMode === "plain" && "font-mono text-[13px]",
            )}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Insert</span>
              {MERGE_FIELDS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertField(`{{${v}}}`)}
                  aria-label={`Insert ${v.replace(/_/g, " ")}`}
                  className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
            <SegmentedControl
              size="sm"
              aria-label="Editor view"
              value={bodyMode}
              onValueChange={setBodyMode}
              options={[
                { value: "formatted", label: "Formatted" },
                { value: "plain", label: "Plain text" },
              ]}
            />
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {bodyMode === "formatted"
            ? aiOn
              ? "Used if AI cannot write this email for a lead. Blank lines become paragraphs."
              : "Blank lines become paragraphs. Merge fields are filled in for each lead."
            : "Standard plain text view in a fixed-width font, so spacing shows exactly as typed."}
        </p>
      </div>

      <AiDynamicScriptCard
        enabled={aiOn}
        onEnabledChange={(enabled) => onPatchVariant({ aiGenerateOnTheFly: enabled })}
        instruction={variant.aiPrompt ?? ""}
        onInstructionChange={(val) => onPatchVariant({ aiPrompt: val })}
        fallbackSubject={variant.subject}
        fallbackBody={variant.bodyText}
        leadListId={leadListId}
      />

      <ManualEmailPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        subject={variant.subject}
        bodyText={variant.bodyText}
        bodyHtml={variant.bodyHtml}
        leadListId={leadListId}
      />
    </section>
  );
}
