"use client";

import { RefreshCw } from "lucide-react";
import { STANDARD_LEAD_FIELDS } from "@smartreach/shared";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Skeleton,
} from "@smartreach/ui";
import { EmailBody } from "../../../unibox/message-body";
import { sentenceCase } from "./utils";

export type PreviewData = { subject: string; bodyHtml: string; bodyText: string };

/**
 * Server-built preview of one step/variant: variables filled from an
 * editable sample lead and spins resolved the way a real send is prepared.
 */
export function StepPreviewDialog({
  open,
  onOpenChange,
  pending,
  error,
  denied,
  data,
  stepNumber,
  variantLabel,
  samples,
  onSamplesChange,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: string | null;
  denied: boolean;
  data: PreviewData | null;
  stepNumber: number;
  variantLabel: string;
  samples: Record<string, string>;
  onSamplesChange: (next: Record<string, string>) => void;
  onRefresh: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Preview step {stepNumber}, variant {variantLabel}
          </DialogTitle>
          <DialogDescription>
            Variables are filled from the sample lead below. Spins pick a phrase at random, so each refresh can differ.
          </DialogDescription>
        </DialogHeader>

        {denied ? <Alert variant="warning">You do not have permission to preview this step.</Alert> : null}
        {error && !denied ? <Alert variant="destructive">{error}</Alert> : null}

        <div className="overflow-hidden rounded-xl border border-border" aria-busy={pending || undefined}>
          {pending && !data ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
              <span className="sr-only">Building preview</span>
            </div>
          ) : data ? (
            <>
              <div className="border-b border-border bg-muted/40 px-5 py-3">
                <p className="text-xs text-subtle-foreground">Subject</p>
                <p className="mt-0.5 text-sm font-medium">{data.subject || "No subject"}</p>
              </div>
              <div className="px-5 py-4 text-sm">
                {data.bodyHtml.trim() ? (
                  <EmailBody html={data.bodyHtml} text={data.bodyText} />
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {data.bodyText.trim() ? data.bodyText : <span className="text-muted-foreground">The body is empty.</span>}
                  </p>
                )}
              </div>
              {data.bodyHtml.trim() ? (
                <details className="border-t border-border px-5 py-3">
                  <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground">
                    Plain-text version
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">
                    {data.bodyText.trim() ? data.bodyText : "The plain-text version is empty."}
                  </p>
                </details>
              ) : null}
            </>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No preview yet.</p>
          )}
        </div>

        <details className="rounded-lg border border-border px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium">Sample lead</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {STANDARD_LEAD_FIELDS.map((field) => (
              <Field key={field.key} label={sentenceCase(field.label)}>
                <Input
                  value={samples[field.key] ?? ""}
                  onChange={(e) => onSamplesChange({ ...samples, [field.key]: e.target.value })}
                  autoComplete="off"
                />
              </Field>
            ))}
          </div>
        </details>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={onRefresh} loading={pending}>
            {pending ? null : <RefreshCw />}
            Refresh preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
