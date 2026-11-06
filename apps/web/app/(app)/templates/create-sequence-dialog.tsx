"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  toast,
} from "@smartreach/ui";
import { saveSequenceAsTemplate, updateSequenceTemplate } from "@/lib/actions";
import type { ReusableSequence, TemplateStepItem, TemplateVariantItem } from "@/lib/sequence-templates";
import { SequenceStepEditor } from "./sequence-step-editor";
import { meaningfulDescription, sequenceSummary, starterDescription, starterName } from "./template-utils";

interface CreateSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saved sequence to edit, or a starter (`isPreset`) to copy. Empty for a new sequence. */
  sequence?: ReusableSequence | null;
  onSuccess?: () => void;
}

let keySeq = 0;
const newKey = () => `step-${Date.now()}-${++keySeq}`;

function defaultSteps(): TemplateStepItem[] {
  return [
    {
      key: newKey(),
      stepNumber: 1,
      delayDays: 0,
      variants: [
        {
          label: "A",
          subject: "Quick question about {{company}}",
          bodyText:
            "Hi {{first_name}},\n\nI was looking at {{company}} and noticed…\n\nWould a short call this week be useful?\n\nBest,\n{{sender_name}}",
        },
      ],
    },
    {
      key: newKey(),
      stepNumber: 2,
      delayDays: 3,
      variants: [
        {
          label: "A",
          subject: "Re: Quick question about {{company}}",
          bodyText:
            "Hi {{first_name}},\n\nFollowing up on my last note in case it got buried. Is this worth a conversation?\n\nBest,\n{{sender_name}}",
        },
      ],
    },
  ];
}

function stepsFrom(sequence: ReusableSequence): TemplateStepItem[] {
  if (!sequence.steps?.length) return defaultSteps();
  return sequence.steps.map((st, i) => ({
    key: newKey(),
    stepNumber: st.stepNumber || i + 1,
    delayDays: st.delayDays ?? (i === 0 ? 0 : 3),
    variants:
      st.variants && st.variants.length > 0
        ? st.variants.map((v, vi) => ({
            ...v,
            label: v.label || (vi === 0 ? "A" : "B"),
            subject: v.subject || "",
            bodyText: v.bodyText || "",
            bodyHtml: v.bodyHtml || "",
          }))
        : [{ label: "A", subject: i === 0 ? "Quick question" : "Re: Quick question", bodyText: "" }],
  }));
}

/**
 * Sequence editor in a side sheet. Creates a new sequence, edits a saved one,
 * or saves a copy of a starter. The export name is kept for existing callers.
 */
export function CreateSequenceDialog({ open, onOpenChange, sequence, onSuccess }: CreateSequenceDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<TemplateStepItem[]>(defaultSteps);
  const [activeVariants, setActiveVariants] = useState<Record<string, number>>({});
  const [nameError, setNameError] = useState<string | undefined>();
  const [subjectErrors, setSubjectErrors] = useState<Set<string>>(new Set());

  const isEditingExistingCustom = Boolean(sequence && !sequence.isPreset);
  const isCopyingStarter = Boolean(sequence?.isPreset);

  useEffect(() => {
    if (!open) return;
    if (sequence) {
      setName(sequence.isPreset ? `${starterName(sequence)} (copy)` : sequence.name);
      setDescription((sequence.isPreset ? starterDescription(sequence) : meaningfulDescription(sequence.description)) || "");
      setSteps(stepsFrom(sequence));
    } else {
      setName("");
      setDescription("");
      setSteps(defaultSteps());
    }
    setActiveVariants({});
    setNameError(undefined);
    setSubjectErrors(new Set());
  }, [open, sequence]);

  const keyOf = (st: TemplateStepItem, i: number) => st.key ?? `idx-${i}`;

  const updateStep = (index: number, fn: (s: TemplateStepItem) => TemplateStepItem) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? fn(s) : s)));

  const updateVariant = (index: number, vi: number, patch: Partial<TemplateVariantItem>) =>
    updateStep(index, (s) => ({ ...s, variants: s.variants.map((v, j) => (j === vi ? { ...v, ...patch } : v)) }));

  const clearSubjectError = (index: number, vi: number) => {
    const k = `${keyOf(steps[index]!, index)}:${vi}`;
    if (!subjectErrors.has(k)) return;
    setSubjectErrors((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  };

  const addStep = () => {
    setSteps((prev) => {
      const lastSubject = prev[prev.length - 1]?.variants[0]?.subject || "Quick question";
      const subject = /^re:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`;
      return [
        ...prev,
        {
          key: newKey(),
          stepNumber: prev.length + 1,
          delayDays: 3,
          variants: [
            {
              label: "A",
              subject,
              bodyText:
                "Hi {{first_name}},\n\nOne last note in case this is relevant for {{company}}. If not, I'll leave it here.\n\nBest,\n{{sender_name}}",
            },
          ],
        },
      ];
    });
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const addVariant = (index: number) => {
    const st = steps[index];
    if (!st || st.variants.length >= 2) return;
    const first = st.variants[0];
    updateStep(index, (s) => ({
      ...s,
      variants: [...s.variants, { label: "B", subject: first?.subject || "", bodyText: first?.bodyText || "" }],
    }));
    setActiveVariants((prev) => ({ ...prev, [keyOf(st, index)]: 1 }));
  };

  const removeVariant = (index: number, vi: number) => {
    const st = steps[index];
    if (!st || st.variants.length <= 1) return;
    updateStep(index, (s) => ({
      ...s,
      variants: s.variants.filter((_, j) => j !== vi).map((v, j) => ({ ...v, label: j === 0 ? "A" : "B" })),
    }));
    const k = keyOf(st, index);
    setActiveVariants((prev) => ({ ...prev, [k]: 0 }));
    // Versions are relabelled, so errors keyed by version index no longer line up.
    setSubjectErrors((prev) => new Set([...prev].filter((e) => !e.startsWith(`${k}:`))));
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const missing = new Set<string>();
    const jumpTo: Record<string, number> = {};
    steps.forEach((st, i) => {
      st.variants.forEach((v, vi) => {
        if (!v.subject.trim()) {
          const k = keyOf(st, i);
          missing.add(`${k}:${vi}`);
          if (jumpTo[k] === undefined) jumpTo[k] = vi;
        }
      });
    });

    setNameError(trimmedName ? undefined : "Give the sequence a name");
    setSubjectErrors(missing);
    if (!trimmedName || missing.size > 0) {
      if (missing.size > 0) {
        setActiveVariants((prev) => ({ ...prev, ...jumpTo }));
        toast.error("Every email needs a subject line");
      }
      return;
    }

    const payload = steps.map((st, i) => ({
      ...st,
      stepNumber: i + 1,
      delayDays: i === 0 ? 0 : Math.max(0, Number(st.delayDays) || 0),
    }));

    startTransition(async () => {
      const res =
        isEditingExistingCustom && sequence
          ? await updateSequenceTemplate(sequence.id, trimmedName, description.trim(), payload)
          : await saveSequenceAsTemplate(trimmedName, description.trim(), payload);

      if (!res.ok) {
        toast.error(res.error || "Could not save the sequence");
        return;
      }
      toast.success(isEditingExistingCustom ? `Saved changes to “${trimmedName}”` : `Saved “${trimmedName}”`);
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    });
  };

  const title = isEditingExistingCustom ? "Edit sequence" : isCopyingStarter ? "Copy starter sequence" : "New sequence";
  const subtitle = isEditingExistingCustom
    ? "Changes apply to campaigns you create from now on. Campaigns that already use this sequence keep their own copy."
    : isCopyingStarter
      ? "This saves a copy to your templates that you can edit. Nothing is sent from here."
      : "Write the emails once and reuse them in any campaign. Nothing is sent from here.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" required error={nameError} hint={nameError ? undefined : "Shown when you pick a sequence for a campaign."}>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError && e.target.value.trim()) setNameError(undefined);
                }}
                placeholder="Founder intro, 3 emails"
                maxLength={120}
              />
            </Field>
            <Field label="Description" optional hint="A note for yourself about when to use it.">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short and casual, for seed-stage founders"
              />
            </Field>
          </div>

          <section aria-labelledby="sequence-emails-heading" className="flex flex-col gap-4">
            <div>
              <h2 id="sequence-emails-heading" className="text-[15px] font-semibold tracking-[-0.01em]">
                Emails
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Each follow-up waits the number of days you set after the previous email. Variables like{" "}
                <code className="font-mono text-[12px] text-foreground">{"{{first_name}}"}</code> are filled in for each lead.
              </p>
            </div>

            <ol className="flex flex-col gap-4">
              {steps.map((st, i) => {
                const k = keyOf(st, i);
                return (
                  <SequenceStepEditor
                    key={k}
                    index={i}
                    step={st}
                    totalSteps={steps.length}
                    activeVariant={activeVariants[k] ?? 0}
                    onActiveVariantChange={(vi) => setActiveVariants((prev) => ({ ...prev, [k]: vi }))}
                    subjectError={(vi) => (subjectErrors.has(`${k}:${vi}`) ? "Add a subject line" : undefined)}
                    onDelayChange={(days) =>
                      updateStep(i, (s) => ({ ...s, delayDays: Math.min(60, Math.max(0, Number.isFinite(days) ? days : 0)) }))
                    }
                    onRemove={() => removeStep(i)}
                    onAddVariant={() => addVariant(i)}
                    onRemoveVariant={(vi) => removeVariant(i, vi)}
                    onSubjectChange={(vi, subject) => {
                      updateVariant(i, vi, { subject });
                      if (subject.trim()) clearSubjectError(i, vi);
                    }}
                    onBodyChange={(vi, bodyText) => updateVariant(i, vi, { bodyText })}
                  />
                );
              })}
            </ol>

            <Button type="button" variant="outline" onClick={addStep} className="self-start">
              <Plus />
              Add follow-up
            </Button>
          </section>
        </SheetBody>

        <SheetFooter>
          <span className="mr-auto hidden text-[13px] text-muted-foreground sm:block">{sequenceSummary(steps)}</span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} loading={pending}>
            {isEditingExistingCustom ? "Save changes" : "Save sequence"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
