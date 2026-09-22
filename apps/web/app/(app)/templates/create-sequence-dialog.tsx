"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Layers, Loader2, Pencil, Plus, Sparkles, Split, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@smartreach/ui";
import { saveSequenceAsTemplate, updateSequenceTemplate } from "@/lib/actions";
import type { ReusableSequence, TemplateStepItem, TemplateVariantItem } from "@/lib/sequence-templates";

interface CreateSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sequence?: ReusableSequence | null;
  onSuccess?: () => void;
}

const DEFAULT_STEPS: TemplateStepItem[] = [
  {
    key: "step-1",
    stepNumber: 1,
    delayDays: 0,
    variants: [
      {
        label: "A",
        subject: "Quick question regarding {{company}}",
        bodyText:
          "Hi {{first_name}},\n\nI was looking at {{company}} and noticed...\n\nWould you be open to a quick 5-min intro this Thursday?\n\nBest,\n{{sender_name}}",
      },
    ],
  },
  {
    key: "step-2",
    stepNumber: 2,
    delayDays: 3,
    variants: [
      {
        label: "A",
        subject: "Re: Quick question regarding {{company}}",
        bodyText:
          "Hey {{first_name}},\n\nJust following up on my previous note. Did you have a moment to review this?\n\nBest,\n{{sender_name}}",
      },
    ],
  },
];

export function CreateSequenceDialog({
  open,
  onOpenChange,
  sequence,
  onSuccess,
}: CreateSequenceDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<TemplateStepItem[]>(DEFAULT_STEPS);
  const [activeVariants, setActiveVariants] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!open) return;
    if (sequence) {
      setName(sequence.isPreset ? `${sequence.name} (Custom)` : sequence.name);
      setDescription(sequence.description || "");
      if (sequence.steps && sequence.steps.length > 0) {
        setSteps(
          sequence.steps.map((st, i) => ({
            key: st.key || `step-${i + 1}-${Date.now()}`,
            stepNumber: st.stepNumber || i + 1,
            delayDays: st.delayDays ?? (i === 0 ? 0 : 3),
            variants:
              st.variants && st.variants.length > 0
                ? st.variants.map((v, vi) => ({
                    label: v.label || (vi === 0 ? "A" : "B"),
                    subject: v.subject || "",
                    bodyText: v.bodyText || "",
                    bodyHtml: v.bodyHtml || "",
                  }))
                : [
                    {
                      label: "A",
                      subject: i === 0 ? "Quick question" : "Re: Quick question",
                      bodyText: "",
                    },
                  ],
          }))
        );
      }
    } else {
      resetForm();
    }
    setActiveVariants({});
  }, [open, sequence]);

  const addStep = () => {
    const nextStepNum = steps.length + 1;
    const lastStep = steps[steps.length - 1];
    const defaultSubject =
      lastStep?.variants[0]?.subject.startsWith("Re:")
        ? lastStep.variants[0].subject
        : `Re: ${lastStep?.variants[0]?.subject || "Quick question"}`;

    setSteps((prev) => [
      ...prev,
      {
        key: `step-${Date.now()}`,
        stepNumber: nextStepNum,
        delayDays: 3,
        variants: [
          {
            label: "A",
            subject: defaultSubject,
            bodyText: `Hi {{first_name}},\n\nCircling back one last time to see if this is relevant for {{company}}.\n\nBest,\n{{sender_name}}`,
          },
        ],
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) {
      toast.error("A sequence must contain at least 1 step");
      return;
    }
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setActiveVariants((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const updateStepDelay = (index: number, days: number) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, delayDays: Math.max(0, days) } : s)),
    );
  };

  const addVariant = (stepIndex: number) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        if (s.variants.length >= 2) return s;
        const first = s.variants[0];
        const newVar: TemplateVariantItem = {
          label: "B",
          subject: first?.subject || (i === 0 ? "Alternative angle for {{company}}" : "Re: Quick question"),
          bodyText: first?.bodyText || "",
        };
        return { ...s, variants: [...s.variants, newVar] };
      }),
    );
    setActiveVariants((prev) => ({ ...prev, [stepIndex]: 1 }));
    toast.success(`Variant B added to Step ${stepIndex + 1} (A/B testing enabled)`);
  };

  const removeVariant = (stepIndex: number, variantIndex: number) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        if (s.variants.length <= 1) return s;
        const remaining = s.variants.filter((_, vi) => vi !== variantIndex);
        const normalized = remaining.map((v, vi) => ({
          ...v,
          label: vi === 0 ? "A" : "B",
        }));
        return { ...s, variants: normalized };
      }),
    );
    setActiveVariants((prev) => ({ ...prev, [stepIndex]: 0 }));
    toast.info(`Variant removed from Step ${stepIndex + 1}`);
  };

  const updateStepSubject = (stepIndex: number, variantIndex: number, subject: string) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const variants = s.variants.map((v, vi) => (vi === variantIndex ? { ...v, subject } : v));
        return { ...s, variants };
      }),
    );
  };

  const updateStepBody = (stepIndex: number, variantIndex: number, bodyText: string) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const variants = s.variants.map((v, vi) => (vi === variantIndex ? { ...v, bodyText } : v));
        return { ...s, variants };
      }),
    );
  };

  const insertToken = (stepIndex: number, variantIndex: number, token: string) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const variants = s.variants.map((v, vi) => {
          if (vi !== variantIndex) return v;
          const currentBody = v.bodyText || "";
          const spacer =
            currentBody.length > 0 && !currentBody.endsWith(" ") && !currentBody.endsWith("\n")
              ? " "
              : "";
          return { ...v, bodyText: currentBody + spacer + token };
        });
        return { ...s, variants };
      }),
    );
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setActiveVariants({});
    setSteps(DEFAULT_STEPS);
  };

  const isEditingExistingCustom = Boolean(sequence && !sequence.isPreset);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Please enter a name for this sequence");
      return;
    }

    const hasEmptySubjects = steps.some((st) => st.variants.some((v) => !v.subject.trim()));
    if (hasEmptySubjects) {
      toast.error("Please provide a subject line for every step and variant");
      return;
    }

    startTransition(async () => {
      let res;
      if (isEditingExistingCustom && sequence) {
        res = await updateSequenceTemplate(sequence.id, name.trim(), description.trim(), steps);
      } else {
        res = await saveSequenceAsTemplate(name.trim(), description.trim(), steps);
      }

      if (!res.ok) {
        toast.error(res.error || "Failed to save sequence");
      } else {
        toast.success(
          isEditingExistingCustom
            ? `Sequence "${name.trim()}" updated successfully`
            : `Sequence "${name.trim()}" saved successfully`
        );
        resetForm();
        onOpenChange(false);
        onSuccess?.();
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-4xl max-h-[92vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Layers className="size-5 text-primary" />
            {isEditingExistingCustom
              ? "Edit Sequence"
              : sequence?.isPreset
              ? "Customize Preset Sequence"
              : "Create Reusable Sequence"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEditingExistingCustom
              ? "Update your sequence steps, delays, subject lines, A/B testing variants, and email copy."
              : "Build a multi-touch outreach sequence with A/B testing variants that can be imported into any campaign with 1 click."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Sequence Name</Label>
              <Input
                placeholder="e.g. High-Conversion SaaS Outreach"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-card text-xs font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description (Optional)</Label>
              <Input
                placeholder="e.g. 3-step value proposition with soft CTA"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-card text-xs"
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sequence Steps ({steps.length})
                </Label>
                {steps.some((s) => s.variants.length > 1) && (
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    <Split className="size-2.5 mr-1" /> A/B Testing Enabled
                  </Badge>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Use <code className="font-mono text-primary">{"{{first_name}}"}</code>, <code className="font-mono text-primary">{"{{company}}"}</code>
              </span>
            </div>

            <div className="space-y-4">
              {steps.map((st, i) => {
                const currentVarIdx = Math.min(activeVariants[i] ?? 0, (st.variants.length || 1) - 1);
                const activeVar = st.variants[currentVarIdx] || st.variants[0]!;
                const hasMultipleVariants = st.variants.length > 1;

                return (
                  <div
                    key={st.key || i}
                    className="rounded-xl border border-border/70 bg-card/60 p-4 sm:p-5 space-y-4 shadow-2xs transition-colors hover:border-border"
                  >
                    {/* Step Header */}
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold ring-1 ring-primary/20">
                          {i + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {i === 0 ? "Initial Outreach Email" : `Follow-up Step ${i + 1}`}
                            </span>
                            {hasMultipleVariants ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                <Split className="size-2.5" /> A/B Split (50/50)
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-normal">
                                Single Variant
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {i === 0
                              ? "Sends immediately when campaign starts"
                              : `Waits ${st.delayDays} day${st.delayDays === 1 ? "" : "s"} after previous touchpoint`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {i > 0 && (
                          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1 text-xs">
                            <Clock className="size-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">Wait</span>
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={st.delayDays}
                              onChange={(e) => updateStepDelay(i, Number(e.target.value))}
                              className="w-11 rounded border border-border/80 bg-background px-1 py-0.5 text-center text-xs font-semibold tabular-nums focus:border-primary focus:outline-none"
                            />
                            <span className="text-[11px] text-muted-foreground">days</span>
                          </div>
                        )}
                        {steps.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeStep(i)}
                            className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Remove step"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* A/B Variant Bar */}
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 border border-border/50 p-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pl-1 mr-1">
                          Variants:
                        </span>
                        {st.variants.map((v, vi) => (
                          <div key={vi} className="flex items-center">
                            <button
                              type="button"
                              onClick={() => setActiveVariants((prev) => ({ ...prev, [i]: vi }))}
                              className={cn(
                                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all",
                                currentVarIdx === vi
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "bg-background border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80"
                              )}
                            >
                              <span>Variant {v.label}</span>
                              {hasMultipleVariants && (
                                <span
                                  className={cn(
                                    "text-[10px] font-normal opacity-80",
                                    currentVarIdx === vi
                                      ? "text-primary-foreground"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  (50%)
                                </span>
                              )}
                            </button>
                            {hasMultipleVariants && vi > 0 && (
                              <button
                                type="button"
                                onClick={() => removeVariant(i, vi)}
                                className="ml-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                title={`Remove Variant ${v.label}`}
                              >
                                <X className="size-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {st.variants.length < 2 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addVariant(i)}
                          className="h-7 gap-1 text-[11px] font-medium border-dashed hover:border-primary hover:text-primary"
                        >
                          <Plus className="size-3" /> Add A/B Variant
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground pr-1 flex items-center gap-1">
                          <Sparkles className="size-3 text-primary" /> 50/50 split active
                        </span>
                      )}
                    </div>

                    {/* Subject Line Field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-foreground">
                          Subject Line <span className="text-primary font-bold">({activeVar.label})</span>
                        </Label>
                        <span className="text-[10px] text-muted-foreground">
                          {activeVar.subject.length > 0 ? `${activeVar.subject.length} chars` : "Required"}
                        </span>
                      </div>
                      <Input
                        value={activeVar.subject}
                        onChange={(e) => updateStepSubject(i, currentVarIdx, e.target.value)}
                        placeholder={i === 0 ? "Subject line (e.g. Quick question for {{company}})" : "Re: Subject line..."}
                        className="bg-background text-xs font-medium"
                      />
                    </div>

                    {/* Email Body Field with increased height & insert tags */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-foreground">
                          Email Body <span className="text-primary font-bold">({activeVar.label})</span>
                        </Label>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground mr-1">Insert:</span>
                          {["{{first_name}}", "{{company}}", "{{sender_name}}"].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => insertToken(i, currentVarIdx, tag)}
                              className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Textarea
                        rows={9}
                        value={activeVar.bodyText}
                        onChange={(e) => updateStepBody(i, currentVarIdx, e.target.value)}
                        placeholder={`Write your outreach message for Variant ${activeVar.label}…`}
                        className="bg-background text-xs font-mono min-h-[220px] leading-relaxed resize-y"
                      />
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Tip: Personalize with variables like {"{{first_name}}"} and {"{{company}}"}</span>
                        <span>
                          {activeVar.bodyText.trim()
                            ? `${activeVar.bodyText.trim().split(/\s+/).length} words`
                            : "0 words"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addStep}
              className="w-full gap-1.5 border-dashed py-4 text-xs font-semibold"
            >
              <Plus className="size-3.5" /> Add Follow-up Step
            </Button>
          </div>
        </div>

        <DialogFooter className="shrink-0 mt-3 gap-2 border-t border-border/40 pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={pending || !name.trim()}>
            {pending ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : isEditingExistingCustom ? (
              <Pencil className="size-3.5 mr-1.5" />
            ) : (
              <Sparkles className="size-3.5 mr-1.5" />
            )}
            {pending
              ? "Saving sequence…"
              : isEditingExistingCustom
              ? `Save Changes (${steps.length} Steps)`
              : `Save Sequence (${steps.length} Steps)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
