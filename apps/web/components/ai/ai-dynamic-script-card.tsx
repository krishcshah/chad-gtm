"use client";

import { useId, useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { Alert, Button, Switch, Textarea, cn } from "@smartreach/ui";
import { toast } from "sonner";
import { previewAiSequenceGeneration } from "@/lib/actions";
import { AiGenerationPreviewDialog, type PreviewSample } from "./ai-generation-preview-dialog";

interface AiDynamicScriptCardProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  fallbackSubject: string;
  fallbackBody: string;
  campaignId?: string;
  leadListId?: string;
  className?: string;
}

const EXAMPLES = [
  {
    label: "Their likely challenge",
    prompt:
      "Cite their company's likely growth challenges in their industry. Keep it under 75 words with a casual, respectful tone and a low-friction ask.",
  },
  {
    label: "Benchmark offer",
    prompt:
      "Highlight that we benchmarked deliverability and conversion rates for companies in their space. Ask if they are open to reviewing the benchmark deck.",
  },
  {
    label: "Three sentences",
    prompt:
      "Keep the body strictly to 3 sentences. State why we reached out to their company, the tangible ROI, and ask for a 4-minute intro this week.",
  },
];

const LEAD_FIELDS = ["first_name", "company", "job_title", "industry", "website", "location"];

const SAMPLE_COUNT = 5;

/**
 * "Write each email with AI" setting for one email version. When on, the
 * sender writes a unique email per lead at send time from these instructions;
 * the written email is the fallback if that fails.
 */
export function AiDynamicScriptCard({
  enabled,
  onEnabledChange,
  instruction,
  onInstructionChange,
  fallbackSubject,
  fallbackBody,
  campaignId,
  leadListId,
  className,
}: AiDynamicScriptCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [samples, setSamples] = useState<PreviewSample[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();
  const id = useId();
  const switchLabelId = `${id}-label`;
  const switchDescId = `${id}-desc`;
  const instructionsId = `${id}-instructions`;
  const instructionsHintId = `${id}-instructions-hint`;

  const runPreview = () => {
    setPreviewOpen(true);
    setPreviewError(null);
    startTransition(async () => {
      try {
        const res = await previewAiSequenceGeneration({
          campaignId,
          leadListId,
          customInstruction: instruction,
          fallbackSubject,
          fallbackBody,
          sampleCount: SAMPLE_COUNT,
        });
        if (!res.ok) {
          setSamples([]);
          setPreviewError(res.error || "Could not write the sample emails.");
          toast.error(res.error || "Could not write the sample emails");
          return;
        }
        if (!res.data) {
          setSamples([]);
          setPreviewError("No sample emails came back. Try again.");
          return;
        }
        setSamples(res.data.samples);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not write the sample emails.";
        setSamples([]);
        setPreviewError(message);
        toast.error(message);
      }
    });
  };

  const insertField = (field: string) => {
    const token = `{{${field}}}`;
    onInstructionChange(instruction ? `${instruction} ${token}` : token);
  };

  const missingInstructions = enabled && !instruction.trim();

  return (
    <>
      <div className={cn("rounded-lg border border-border", className)}>
        <div className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <p id={switchLabelId} className="text-sm font-medium text-foreground">
              Write each email with AI
            </p>
            <p id={switchDescId} className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              At send time, AI writes a unique version for every lead from their name, role and company. If it
              cannot, the email you wrote is sent instead.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-labelledby={switchLabelId}
            aria-describedby={switchDescId}
            className="mt-0.5"
          />
        </div>

        {enabled && (
          <div className="flex flex-col gap-4 border-t border-border p-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={instructionsId} className="text-[13px] font-medium leading-none text-foreground">
                Instructions for the AI
              </label>
              <Textarea
                id={instructionsId}
                rows={4}
                value={instruction}
                onChange={(e) => onInstructionChange(e.target.value)}
                aria-describedby={instructionsHintId}
                placeholder="What the email should say, the tone, the length and the ask. For example: mention a challenge typical for their industry, stay under 70 words, ask if they want the benchmark."
                className="max-h-64 min-h-[96px] resize-y text-[13px]"
              />
              <div id={instructionsHintId} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Add a lead field</span>
                {LEAD_FIELDS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => insertField(f)}
                    aria-label={`Insert ${f.replace(/_/g, " ")}`}
                    className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    {`{{${f}}}`}
                  </button>
                ))}
              </div>
            </div>

            {missingInstructions ? (
              <Alert variant="warning">
                Add instructions. Without them every lead gets the email you wrote above.
              </Alert>
            ) : null}

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Start from an example</span>
                {EXAMPLES.map((r) => (
                  <Button
                    key={r.label}
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => onInstructionChange(r.prompt)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runPreview}
                loading={loading}
                className="self-start"
              >
                {!loading && <Eye aria-hidden />}
                {loading ? "Writing samples…" : `Preview ${SAMPLE_COUNT} leads`}
              </Button>
            </div>
          </div>
        )}
      </div>

      <AiGenerationPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        samples={samples}
        loading={loading}
        error={previewError}
        onRegenerate={runPreview}
        customInstruction={instruction}
      />
    </>
  );
}
