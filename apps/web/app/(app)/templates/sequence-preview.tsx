"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Pencil, Rocket } from "lucide-react";
import {
  Button,
  SegmentedControl,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@smartreach/ui";
import type { TemplateStepItem } from "@/lib/sequence-templates";
import { campaignHref, htmlToText, sequenceSummary, variantBody, type LibraryItem } from "./template-utils";
import { HighlightedText } from "./variables";

/** Read-only view of every email in a template, with a way to use or edit it. */
export function SequencePreview({
  item,
  onOpenChange,
  onEdit,
}: {
  item: LibraryItem | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: LibraryItem) => void;
}) {
  // Keep showing the last item while the sheet animates closed.
  const last = useRef(item);
  if (item) last.current = item;
  const shown = item ?? last.current;
  const steps = shown?.sequence.steps ?? [];
  const editLabel = shown?.kind === "starter" ? "Copy and edit" : "Edit";

  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        {shown && (
          <>
            <SheetHeader>
              <SheetTitle>{shown.name}</SheetTitle>
              <SheetDescription>
                {shown.kind === "email" ? "Single email" : sequenceSummary(steps)}
                {shown.description ? ` · ${shown.description}` : ""}
              </SheetDescription>
            </SheetHeader>

            <SheetBody>
              <ol key={shown.id} className="flex flex-col gap-4">
                {steps.map((st, i) => (
                  <PreviewStep
                    key={st.key ?? i}
                    step={st}
                    index={i}
                    single={shown.kind === "email"}
                    preferHtml={shown.format === "html"}
                  />
                ))}
              </ol>
              <p className="mt-5 text-xs text-muted-foreground">
                Variables are filled in for each lead when the email is sent.
              </p>
            </SheetBody>

            <SheetFooter>
              {shown.kind === "email" ? (
                <Button asChild variant="outline">
                  <Link href={`/templates/${encodeURIComponent(shown.id)}`}>
                    <Pencil />
                    Edit
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={() => onEdit(shown)}>
                  <Pencil />
                  {editLabel}
                </Button>
              )}
              <Button asChild>
                <Link href={campaignHref(shown.id)}>
                  <Rocket />
                  Use in campaign
                </Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PreviewStep({
  step,
  index,
  single,
  preferHtml,
}: {
  step: TemplateStepItem;
  index: number;
  single: boolean;
  /** HTML-format emails send the HTML body, so show that rather than a stale plain-text body. */
  preferHtml: boolean;
}) {
  const [vi, setVi] = useState(0);
  const variants = step.variants ?? [];
  const current = variants[Math.min(vi, Math.max(0, variants.length - 1))];
  const body = preferHtml && current?.bodyHtml?.trim() ? htmlToText(current.bodyHtml) : variantBody(current);
  const when =
    index === 0 ? "Sent when the campaign starts" : `${step.delayDays} ${step.delayDays === 1 ? "day" : "days"} after the previous email`;

  return (
    <li className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{single ? "Email" : index === 0 ? "First email" : `Follow-up ${index}`}</h3>
          {!single && <p className="text-xs text-muted-foreground">{when}</p>}
        </div>
        {variants.length > 1 && (
          <SegmentedControl
            size="sm"
            aria-label={`Version of email ${index + 1} to show`}
            value={String(vi)}
            onValueChange={(v) => setVi(Number(v))}
            options={variants.map((v, i) => ({ value: String(i), label: `Version ${v.label || (i === 0 ? "A" : "B")}` }))}
          />
        )}
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <div className="text-xs text-muted-foreground">Subject</div>
          <p className="mt-0.5 text-sm font-medium">
            {current?.subject?.trim() ? <HighlightedText text={current.subject} /> : <span className="text-subtle-foreground">No subject</span>}
          </p>
        </div>
        <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
          {body.trim() ? <HighlightedText text={body} /> : <span className="text-subtle-foreground">This email has no body yet.</span>}
        </div>
      </div>
    </li>
  );
}
