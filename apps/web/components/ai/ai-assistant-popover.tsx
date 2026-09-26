"use client";

import { useState, useTransition } from "react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@smartreach/ui";
import {
  Sparkles,
  Zap,
  Briefcase,
  Target,
  Wand2,
  Check,
  RefreshCw,
  X,
  ArrowRight,
} from "lucide-react";
import { improveSequenceCopy } from "@/lib/actions";
import { toast } from "sonner";

interface AiAssistantPopoverProps {
  subject: string;
  bodyText: string;
  onApply: (improved: { subject: string; bodyText: string; bodyHtml?: string }) => void;
  disabled?: boolean;
}

export function AiAssistantPopover({
  subject,
  bodyText,
  onApply,
  disabled = false,
}: AiAssistantPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [pending, startTransition] = useTransition();

  // Review modal state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    subject: string;
    bodyText: string;
    bodyHtml: string;
    changesSummary: string;
  } | null>(null);

  const handleImprove = (tone: string, instruction?: string) => {
    setPopoverOpen(false);
    startTransition(async () => {
      try {
        const res = await improveSequenceCopy({
          subject,
          bodyText,
          tone,
          instruction: instruction || "",
        });

        if (!res.ok) {
          toast.error(res.error || "Failed to generate copy suggestion");
          return;
        }

        if (!res.data) {
          toast.error("No suggestion returned");
          return;
        }

        setSuggestion(res.data);
        setReviewOpen(true);
      } catch (err: any) {
        toast.error(err?.message || "AI copy assistant failed");
      }
    });
  };

  const handleAccept = () => {
    if (suggestion) {
      onApply({
        subject: suggestion.subject,
        bodyText: suggestion.bodyText,
        bodyHtml: suggestion.bodyHtml,
      });
      toast.success("Applied AI enhanced copy to variant");
    }
    setReviewOpen(false);
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || pending}
            className="h-7 gap-1.5 px-2.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/10 hover:text-primary transition-all"
            title="AI Copywriting Assistant"
          >
            <Sparkles className={cn("size-3.5", pending && "animate-spin text-primary")} />
            {pending ? "Enhancing…" : "AI Assistant"}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-64 p-2 space-y-1 shadow-lg border-border/80">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Copy Enhancement
          </div>

          <button
            type="button"
            onClick={() => handleImprove("auto")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Wand2 className="size-3.5 text-primary" />
            <span>Auto-Improve Copy</span>
          </button>

          <button
            type="button"
            onClick={() => handleImprove("concise")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Zap className="size-3.5 text-amber-500" />
            <span>Make More Concise (-30%)</span>
          </button>

          <button
            type="button"
            onClick={() => handleImprove("executive")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Briefcase className="size-3.5 text-blue-500" />
            <span>Executive / Peer Tone</span>
          </button>

          <button
            type="button"
            onClick={() => handleImprove("punchy_cta")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Target className="size-3.5 text-emerald-500" />
            <span>Strengthen Call to Action</span>
          </button>

          <div className="pt-2 border-t border-border/50 px-1 space-y-1.5">
            <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Custom Request</Label>
            <div className="flex items-center gap-1">
              <Input
                placeholder="e.g. Add humor, mention SOC2"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customPrompt.trim()) {
                    e.preventDefault();
                    handleImprove("custom", customPrompt.trim());
                  }
                }}
                className="h-7 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={!customPrompt.trim()}
                onClick={() => handleImprove("custom", customPrompt.trim())}
                className="h-7 px-2"
              >
                <ArrowRight className="size-3" />
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl p-6 space-y-4">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <DialogTitle className="text-base font-semibold">Review AI Suggestion</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {suggestion?.changesSummary || "Review the enhanced copy before applying to your sequence."}
            </DialogDescription>
          </DialogHeader>

          {suggestion ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/80 bg-background p-3 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Suggested Subject</span>
                <p className="text-sm font-semibold text-foreground">{suggestion.subject}</p>
              </div>

              <div className="rounded-lg border border-border/80 bg-background p-4 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Suggested Body</span>
                <p className="text-xs whitespace-pre-wrap leading-relaxed text-foreground/90">{suggestion.bodyText}</p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setReviewOpen(false)}>
              Discard
            </Button>
            <Button type="button" size="sm" onClick={handleAccept} className="gap-1.5 font-semibold">
              <Check className="size-3.5" />
              Apply to Sequence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
