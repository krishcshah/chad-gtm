"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  cn,
} from "@smartreach/ui";

export interface PreviewSample {
  lead: {
    id?: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    industry?: string | null;
    website?: string | null;
    location?: string | null;
  };
  email: {
    subject: string;
    bodyText: string;
    bodyHtml: string;
    personalizationReason?: string;
  };
}

interface AiGenerationPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  samples: PreviewSample[];
  loading?: boolean;
  /** Message from a failed preview request. */
  error?: string | null;
  onRegenerate?: () => void;
  customInstruction: string;
}

function leadName(lead: PreviewSample["lead"]) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email.split("@")[0] || lead.email;
}

/** Sample emails the AI wrote for a few real leads, so the instructions can be checked before sending. */
export function AiGenerationPreviewDialog({
  open,
  onOpenChange,
  samples,
  loading = false,
  error,
  onRegenerate,
  customInstruction,
}: AiGenerationPreviewDialogProps) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [samples]);

  const sample = samples[index] ?? samples[0] ?? null;
  const words = sample ? sample.email.bodyText.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 pb-4 pr-14 pt-6">
          <DialogTitle>Sample AI emails</DialogTitle>
          <DialogDescription>
            Written now for {samples.length > 0 ? `${samples.length} of your leads` : "a few of your leads"}. Real
            emails are written again for each lead when they are sent, so wording will differ.
          </DialogDescription>
          {customInstruction.trim() ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Instructions:</span> {customInstruction.trim()}
            </p>
          ) : null}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {samples.length > 0 && (
            <>
              <nav
                aria-label="Sample leads"
                className="hidden w-60 shrink-0 overflow-y-auto border-r border-border md:block"
              >
                <ul className="divide-y divide-border">
                  {samples.map((s, i) => (
                    <li key={s.lead.id || i}>
                      <button
                        type="button"
                        aria-current={i === index ? "true" : undefined}
                        onClick={() => setIndex(i)}
                        className={cn(
                          "flex w-full flex-col px-4 py-3 text-left outline-none transition-colors focus-visible:bg-muted",
                          i === index ? "bg-muted" : "hover:bg-muted/50",
                        )}
                      >
                        <span className="truncate text-[13px] font-medium text-foreground">{leadName(s.lead)}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[s.lead.jobTitle, s.lead.company].filter(Boolean).join(", ") || s.lead.email}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 md:hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous lead"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft />
                </Button>
                <span className="tabular text-[13px] text-muted-foreground">
                  Lead {index + 1} of {samples.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next lead"
                  disabled={index >= samples.length - 1}
                  onClick={() => setIndex((i) => Math.min(samples.length - 1, i + 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </>
          )}

          <div className="min-h-[18rem] min-w-0 flex-1 overflow-y-auto px-6 py-5" aria-live="polite" aria-busy={loading}>
            {loading ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-muted-foreground">Writing sample emails. This can take a few seconds.</p>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : error ? (
              <Alert variant="destructive">{error}</Alert>
            ) : sample ? (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{leadName(sample.lead)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[sample.lead.jobTitle, sample.lead.company, sample.lead.industry, sample.lead.location]
                      .filter(Boolean)
                      .join(" · ") || sample.lead.email}
                  </p>
                </div>
                {sample.email.personalizationReason ? (
                  <p className="text-[13px] text-muted-foreground">
                    <span className="font-medium text-foreground">Why it is personal:</span>{" "}
                    {sample.email.personalizationReason}
                  </p>
                ) : null}
                <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">Subject</p>
                    <p className="mt-0.5 text-sm font-medium text-foreground">{sample.email.subject}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Email</span>
                      <span className="tabular">{words} words</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {sample.email.bodyText}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-[13px] text-muted-foreground">No sample emails yet.</p>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          {onRegenerate ? (
            <Button type="button" variant="outline" onClick={onRegenerate} disabled={loading}>
              <RefreshCw aria-hidden />
              Write new samples
            </Button>
          ) : null}
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
