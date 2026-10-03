"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Textarea } from "@smartreach/ui";
import { Send, Loader2, Sparkles, Bug, Lightbulb, Mail, HelpCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { submitTicketAction } from "@/lib/support-actions";
import { TICKET_CATEGORIES, type TicketCategory } from "@/lib/support-types";

const categoryIcons: Record<TicketCategory, any> = {
  bug_report: Bug,
  feature_request: Sparkles,
  suggestion: Lightbulb,
  contact: Mail,
  miscellaneous: HelpCircle,
};

export function TicketCreateForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [category, setCategory] = useState<TicketCategory>("bug_report");
  const [heading, setHeading] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!heading.trim() || heading.trim().length < 3) {
      toast.error("Please enter a ticket subject (at least 3 characters).");
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      toast.error("Please enter a description for your ticket.");
      return;
    }

    startTransition(async () => {
      const res = await submitTicketAction({
        category,
        heading: heading.trim(),
        description: description.trim(),
        url: url.trim() || undefined,
      });

      if (res.ok && res.id) {
        toast.success("Support ticket created successfully.");
        if (onSuccess) onSuccess();
        router.push(`/support/${res.id}`);
      } else {
        toast.error(res.error || "Failed to create ticket.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 font-mono">
      {/* Category Tag Selection */}
      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
          Ticket Category / Tag
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TICKET_CATEGORIES.map((cat) => {
            const Icon = categoryIcons[cat.id] || HelpCircle;
            const isSelected = category === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`flex items-start gap-2.5 p-3 text-left rounded-none border transition-all ${
                  isSelected
                    ? "border-white bg-zinc-900 text-white"
                    : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <Icon className={`size-4 shrink-0 mt-0.5 ${isSelected ? "text-white" : "text-zinc-500"}`} />
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wider">{cat.label}</div>
                  <div className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5 font-sans">
                    {cat.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ticket Heading / Subject */}
      <div className="space-y-1.5">
        <Label htmlFor="heading" className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
          Subject / Issue Title
        </Label>
        <Input
          id="heading"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          placeholder="e.g. Apollo leads matching filter error on healthcare sector"
          required
          className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono h-10"
        />
      </div>

      {/* Description / First Message */}
      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
          Detailed Description &amp; Reproduction Context
        </Label>
        <Textarea
          id="description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what happened, what you expected, or provide detailed feedback/questions for our engineering team..."
          required
          className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono resize-y"
        />
      </div>

      {/* Relevant URL */}
      <div className="space-y-1.5">
        <Label htmlFor="url" className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold flex items-center gap-1.5">
          <ExternalLink className="size-3" /> Page URL (Optional)
        </Label>
        <Input
          id="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://chadgtm.com/campaigns/..."
          className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono h-9"
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs uppercase tracking-wider font-mono h-10 px-5 gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Creating Ticket...
            </>
          ) : (
            <>
              <Send className="size-3.5" /> Submit Support Ticket
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
