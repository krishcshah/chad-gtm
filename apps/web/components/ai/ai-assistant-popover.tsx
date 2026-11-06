"use client";

import { useId, useState, useTransition } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@smartreach/ui";
import { toast } from "sonner";
import { improveSequenceCopy } from "@/lib/actions";

interface AiAssistantPopoverProps {
  subject: string;
  bodyText: string;
  onApply: (improved: { subject: string; bodyText: string; bodyHtml?: string }) => void;
  disabled?: boolean;
}

type Suggestion = { subject: string; bodyText: string; bodyHtml: string; changesSummary: string };

/** Tones accepted by improveSequenceCopy (aiImproveCopySchema). */
const PRESETS: { tone: "auto" | "concise" | "executive" | "punchy_cta"; label: string; hint: string }[] = [
  { tone: "auto", label: "Improve overall", hint: "Clearer, more natural wording" },
  { tone: "concise", label: "Make it shorter", hint: "Cut about a third of the words" },
  { tone: "executive", label: "Sound more senior", hint: "Peer-to-peer, less salesy" },
  { tone: "punchy_cta", label: "Strengthen the ask", hint: "A clearer, easier next step" },
];

/**
 * "Improve with AI" menu for an email. Every suggestion opens in a review
 * dialog first; nothing changes until the user applies it.
 */
export function AiAssistantPopover({ subject, bodyText, onApply, disabled = false }: AiAssistantPopoverProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [pending, startTransition] = useTransition();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const customId = useId();

  const empty = !subject.trim() && !bodyText.trim();

  const improve = (tone: (typeof PRESETS)[number]["tone"], instruction = "") => {
    setMenuOpen(false);
    startTransition(async () => {
      try {
        const res = await improveSequenceCopy({ subject, bodyText, tone, instruction });
        if (!res.ok) {
          toast.error(res.error || "Could not get a suggestion");
          return;
        }
        if (!res.data) {
          toast.error("The AI returned no suggestion. Try again.");
          return;
        }
        setSuggestion(res.data);
        setReviewOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not get a suggestion");
      }
    });
  };

  const submitCustom = () => {
    const text = custom.trim();
    if (!text) return;
    improve("auto", text);
  };

  const apply = () => {
    if (suggestion) {
      onApply({ subject: suggestion.subject, bodyText: suggestion.bodyText, bodyHtml: suggestion.bodyHtml });
      toast.success("Suggestion applied");
    }
    setReviewOpen(false);
  };

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="xs" disabled={disabled} loading={pending}>
            {!pending && <Sparkles aria-hidden />}
            {pending ? "Writing…" : "Improve with AI"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1.5">
          {empty ? (
            <p className="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">
              This email is empty, so the AI writes a first draft. Describe what it should say below for a better start.
            </p>
          ) : null}
          <ul className="flex flex-col">
            {PRESETS.map((p) => (
              <li key={p.tone}>
                <button
                  type="button"
                  onClick={() => improve(p.tone)}
                  className="flex w-full flex-col rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                >
                  <span className="text-[13px] font-medium text-foreground">{p.label}</span>
                  <span className="text-xs text-muted-foreground">{p.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-1 flex flex-col gap-1.5 border-t border-border px-1 pb-1 pt-2.5"
            onSubmit={(e) => {
              // Rendered in a portal but still inside the caller's React tree: keep the
              // submit from reaching any form the editor is wrapped in.
              e.preventDefault();
              e.stopPropagation();
              submitCustom();
            }}
          >
            <label htmlFor={customId} className="px-1 text-xs font-medium text-muted-foreground">
              Or describe the change
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                id={customId}
                value={custom}
                maxLength={2000}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Mention our SOC 2 report"
                className="h-8 text-[13px]"
              />
              <Button
                type="submit"
                size="icon-sm"
                aria-label="Ask the AI"
                disabled={!custom.trim()}
              >
                <ArrowRight />
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review the suggestion</DialogTitle>
            <DialogDescription>
              {suggestion?.changesSummary || "Compare with your version, then apply it or keep yours."}
            </DialogDescription>
          </DialogHeader>
          {suggestion ? (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              <div className="flex flex-col gap-1 px-4 py-3">
                <span className="text-xs text-muted-foreground">Subject</span>
                <p className="text-sm font-medium text-foreground">{suggestion.subject || "No subject"}</p>
                {subject && subject !== suggestion.subject ? (
                  <p className="text-xs text-subtle-foreground">
                    Was: <span className="line-through">{subject}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex max-h-[45dvh] flex-col gap-1 overflow-y-auto px-4 py-3">
                <span className="text-xs text-muted-foreground">Email</span>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{suggestion.bodyText}</p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>
              Keep mine
            </Button>
            <Button type="button" onClick={apply}>
              Apply suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
