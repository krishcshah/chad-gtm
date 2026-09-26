"use client";

import { useState, useTransition } from "react";
import {
  Badge,
  Button,
  Label,
  Switch,
  Textarea,
  cn,
} from "@smartreach/ui";
import {
  Sparkles,
  Eye,
  RefreshCw,
  Sliders,
  Wand2,
  HelpCircle,
} from "lucide-react";
import { previewAiSequenceGeneration } from "@/lib/actions";
import { AiGenerationPreviewDialog, type PreviewSample } from "./ai-generation-preview-dialog";
import { toast } from "sonner";

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

const PROMPT_RECIPES = [
  {
    label: "Pain Point Hook",
    prompt: "Cite their company's likely growth challenges in their industry. Keep it under 75 words with a casual, respectful tone and a low-friction ask.",
  },
  {
    label: "Benchmark Data",
    prompt: "Highlight that we benchmarked deliverability and conversion rates for companies in their space. Ask if they are open to reviewing the benchmark deck.",
  },
  {
    label: "Short & Direct 3-Sentence",
    prompt: "Keep the body strictly to 3 sentences. State why we reached out to their company, the tangible ROI, and ask for a 4-minute intro this week.",
  },
];

const VARIABLE_CHIPS = [
  "first_name",
  "company",
  "job_title",
  "industry",
  "website",
  "location",
];

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
  const [previewSamples, setPreviewSamples] = useState<PreviewSample[]>([]);
  const [loading, startTransition] = useTransition();

  const handleOpenPreview = () => {
    startTransition(async () => {
      try {
        setPreviewOpen(true);
        const res = await previewAiSequenceGeneration({
          campaignId,
          leadListId,
          customInstruction: instruction,
          fallbackSubject,
          fallbackBody,
          sampleCount: 5,
        });

        if (!res.ok) {
          toast.error(res.error || "Failed to generate sample preview emails");
          return;
        }

        if (!res.data) {
          toast.error("No preview samples returned");
          return;
        }

        setPreviewSamples(res.data.samples);
      } catch (err: any) {
        toast.error(err?.message || "Failed to preview AI generation");
      }
    });
  };

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    onInstructionChange(instruction ? `${instruction} ${token}` : token);
  };

  return (
    <>
      <div
        className={cn(
          "rounded-xl border transition-all duration-200 p-4 space-y-3.5",
          enabled
            ? "border-primary/40 bg-primary/[0.03] shadow-xs"
            : "border-border/70 bg-card/60 hover:border-border",
          className
        )}
      >
        {/* Card Header & Toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-lg transition-colors shrink-0 mt-0.5 sm:mt-0",
                enabled ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted text-muted-foreground"
              )}
            >
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="font-semibold text-xs sm:text-sm text-foreground">
                  Write scripts on the fly
                </span>
                <Badge
                  variant={enabled ? "default" : "outline"}
                  className={cn(
                    "text-[10px] uppercase font-bold tracking-wider py-0 px-1.5 shrink-0",
                    enabled ? "bg-primary text-primary-foreground" : "text-muted-foreground border-border"
                  )}
                >
                  AI Personalization
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 sm:line-clamp-none">
                Generate unique, lead-specific cold outreach scripts at dispatch-time based on their live role and company data.
              </p>
            </div>
          </div>

          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-label="Toggle write scripts on the fly"
            className="shrink-0 self-center"
          />
        </div>

        {/* Expanded Controls when Enabled */}
        {enabled && (
          <div className="pt-2 border-t border-primary/20 space-y-3 animate-in fade-in-50 duration-200">
            {/* Custom Instructions Input */}
            <div className="space-y-1.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]">
                <Label htmlFor="ai-instructions" className="font-semibold text-foreground flex items-center gap-1.5 shrink-0">
                  <Sliders className="size-3 text-primary" />
                  Custom Instructions & Script Prompt
                </Label>
                <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                  <span className="shrink-0">Insert variables:</span>
                  <div className="flex flex-wrap items-center gap-1">
                    {VARIABLE_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => insertVariable(chip)}
                        className="rounded bg-muted/80 px-1.5 py-0.2 hover:bg-primary/20 hover:text-primary transition-colors text-[10px] font-mono"
                        title={`Insert {{${chip}}}`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Textarea
                id="ai-instructions"
                rows={3}
                value={instruction}
                onChange={(e) => onInstructionChange(e.target.value)}
                placeholder="e.g. Reference their company industry challenges. Focus on deliverability without domain burn. Keep body under 70 words, casual peer-to-peer tone, with a soft ask for benchmark data..."
                className="text-xs resize-y bg-background/80 min-h-[75px] max-h-[160px]"
              />
            </div>

            {/* Prompt Quick Recipes & Preview Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80 shrink-0">Recipes:</span>
                {PROMPT_RECIPES.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => onInstructionChange(r.prompt)}
                    className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
                  >
                    + {r.label}
                  </button>
                ))}
              </div>

              {/* Top 5 Saved Leads Preview Button */}
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleOpenPreview}
                disabled={loading}
                className="h-7 px-3 text-xs font-semibold gap-1.5 shadow-xs w-full sm:w-auto shrink-0 justify-center"
              >
                {loading ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Eye className="size-3.5" />
                )}
                <span>{loading ? "Generating Previews…" : "Preview Top 5 Leads"}</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 10 Sample Email Preview Dialog */}
      <AiGenerationPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        samples={previewSamples}
        loading={loading}
        onRegenerate={handleOpenPreview}
        customInstruction={instruction}
      />
    </>
  );
}
