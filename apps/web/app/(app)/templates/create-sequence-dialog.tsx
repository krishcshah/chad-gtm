"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Layers, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
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
import { saveSequenceAsTemplate } from "@/lib/actions";
import type { TemplateStepItem } from "@/lib/sequence-templates";

interface CreateSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateSequenceDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateSequenceDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<TemplateStepItem[]>([
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
  ]);

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
  };

  const updateStepDelay = (index: number, days: number) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, delayDays: Math.max(0, days) } : s)),
    );
  };

  const updateStepSubject = (index: number, subject: string) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const variants = [...s.variants];
        variants[0] = { ...variants[0]!, subject };
        return { ...s, variants };
      }),
    );
  };

  const updateStepBody = (index: number, bodyText: string) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const variants = [...s.variants];
        variants[0] = { ...variants[0]!, bodyText };
        return { ...s, variants };
      }),
    );
  };

  const resetForm = () => {
    setName("");
    setDescription("");
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Please enter a name for this sequence");
      return;
    }

    startTransition(async () => {
      const res = await saveSequenceAsTemplate(name.trim(), description.trim(), steps);
      if (!res.ok) {
        toast.error(res.error || "Failed to save sequence");
      } else {
        toast.success(`Sequence "${name.trim()}" saved successfully`);
        resetForm();
        onOpenChange(false);
        onSuccess?.();
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Layers className="size-5 text-primary" />
            Create Reusable Sequence
          </DialogTitle>
          <DialogDescription className="text-xs">
            Build a multi-touch outreach sequence that can be imported into any campaign with 1 click.
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

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sequence Steps ({steps.length})
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Use <code className="font-mono text-primary">{"{{first_name}}"}</code>, <code className="font-mono text-primary">{"{{company}}"}</code>
              </span>
            </div>

            <div className="space-y-3">
              {steps.map((st, i) => {
                const v = st.variants[0]!;
                return (
                  <div
                    key={st.key || i}
                    className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {i === 0 ? "Initial Outreach Email" : `Follow-up Step ${i + 1}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {i > 0 && (
                          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2 py-0.5 text-xs">
                            <Clock className="size-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">Wait</span>
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={st.delayDays}
                              onChange={(e) => updateStepDelay(i, Number(e.target.value))}
                              className="w-10 rounded border border-border/80 bg-background px-1 py-0.5 text-center text-xs font-semibold tabular-nums"
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

                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Subject Line</Label>
                      <Input
                        value={v.subject}
                        onChange={(e) => updateStepSubject(i, e.target.value)}
                        placeholder="Subject line…"
                        className="bg-background text-xs font-medium"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Email Body</Label>
                      <Textarea
                        rows={4}
                        value={v.bodyText}
                        onChange={(e) => updateStepBody(i, e.target.value)}
                        placeholder="Write message content…"
                        className="bg-background text-xs font-mono"
                      />
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
            {pending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
            {pending ? "Saving sequence…" : `Save Sequence (${steps.length} Steps)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
