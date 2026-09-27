"use client";

import { useState, useTransition } from "react";
import { Button, Input, Textarea, Label } from "@smartreach/ui";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { submitDataRemovalAction } from "@/lib/data-removal-actions";

export function PublicRemoveMyInfoForm() {
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append("contactEmail", contactEmail);
    formData.append("description", description);

    startTransition(async () => {
      const res = await submitDataRemovalAction(formData);
      if (res.ok) {
        setSubmitted(true);
        setDescription("");
      } else {
        setError(res.error || "Failed to submit request.");
      }
    });
  };

  if (submitted) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-foreground">Request Received</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Thank you. We have recorded your request to remove data for <strong className="text-foreground">{contactEmail}</strong>. All matching records will be removed within 72 hours.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSubmitted(false);
            setContactEmail("");
          }}
          className="mt-2"
        >
          Submit Another Request
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="public-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your Contact Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="public-email"
          type="email"
          required
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="your.email@example.com"
          className="h-10 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Enter the exact email address or corporate address you wish to have removed from all lists.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="public-desc" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          What do you want to get removed? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="public-desc"
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Please remove my name, work email address, phone number, and company lead record from the database."
          className="text-sm"
        />
      </div>

      <div className="pt-2 flex justify-end">
        <Button type="submit" disabled={isPending} className="font-semibold text-xs px-5">
          {isPending ? (
            <>
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="mr-2 size-3.5" />
              Submit Erasure Request
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
