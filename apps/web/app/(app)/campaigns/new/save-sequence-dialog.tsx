"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  toast,
} from "@smartreach/ui";
import { saveSequenceAsTemplate } from "@/lib/actions";
import type { DraftStep } from "@/lib/sequence-draft";
import { serializeSequenceTemplate, type TemplateStepItem } from "@/lib/sequence-templates";
import type { TemplateOpt } from "./wizard-types";
import { plural } from "./wizard-utils";

/** Save the current steps to the template library so later campaigns can reuse them. */
export function SaveSequenceDialog({
  open,
  onOpenChange,
  steps,
  campaignName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: DraftStep[];
  campaignName: string;
  onSaved: (tpl: TemplateOpt) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(campaignName.trim() ? `${campaignName.trim()} sequence` : "");
    setDescription("");
    setError(null);
  }, [open, campaignName]);

  const versionCount = steps.reduce((n, s) => n + s.variants.length, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the template a name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const templateSteps: TemplateStepItem[] = steps.map((s) => ({
        delayDays: s.delayDays,
        variants: s.variants.map((v) => ({
          label: v.label,
          subject: v.subject,
          bodyText: v.bodyText,
          bodyHtml: v.bodyHtml,
          aiGenerateOnTheFly: v.aiGenerateOnTheFly,
          aiPrompt: v.aiPrompt,
        })),
      }));
      const res = await saveSequenceAsTemplate(trimmed, description, templateSteps);
      if (res.ok && res.data) {
        onSaved({
          id: res.data.id,
          name: trimmed,
          subject: steps[0]?.variants[0]?.subject || trimmed,
          bodyText: serializeSequenceTemplate(trimmed, description.trim(), templateSteps),
        });
        toast.success(`Saved “${trimmed}” to your templates`);
        onOpenChange(false);
      } else {
        setError(!res.ok ? res.error : "Could not save the template.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Saves {plural(steps.length, "email")} ({plural(versionCount, "version")}) with their wait times, so you can
            start future campaigns from it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Field label="Template name" required error={error ?? undefined}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Three-step agency follow-up"
              autoFocus
            />
          </Field>
          <Field label="Description" optional hint="Shown in the template list.">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who it is for and what it offers"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
