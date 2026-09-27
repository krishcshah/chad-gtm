"use client";

import React, { useState, useTransition } from "react";
import { Bug, CheckCircle2, Send, AlertCircle, Loader2 } from "lucide-react";
import { submitBugReportAction } from "@/lib/bug-report-actions";

export function BugReportForm() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [heading, setHeading] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!heading.trim()) {
      setError("Please enter a short heading for the bug.");
      return;
    }
    if (!description.trim()) {
      setError("Please provide a description of the issue.");
      return;
    }

    const formData = new FormData();
    formData.append("heading", heading);
    formData.append("description", description);
    formData.append("url", typeof window !== "undefined" ? window.location.href : "");

    startTransition(async () => {
      try {
        const res = await submitBugReportAction(formData);
        if (res.ok) {
          setSuccess(true);
          setHeading("");
          setDescription("");
        } else {
          setError(res.error || "Failed to submit bug report. Please try again.");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          <CheckCircle2 className="size-5 shrink-0 mt-0.5 text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-300">Bug report sent successfully!</p>
            <p className="mt-0.5 text-xs text-emerald-400/90 leading-relaxed">
              Thank you for helping us improve SmartReach. Our engineering team has received your report and will look into it promptly.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
          <AlertCircle className="size-5 shrink-0 mt-0.5 text-rose-400" />
          <p className="text-xs leading-relaxed">{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="heading" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Bug Heading / Title <span className="text-rose-400">*</span>
        </label>
        <input
          id="heading"
          name="heading"
          type="text"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          placeholder="e.g. Lead CSV import hangs at 95% on Firefox"
          required
          disabled={isPending}
          className="w-full rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Short Description <span className="text-rose-400">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened? What were you trying to do, and what went wrong? Any error message you noticed?"
          required
          disabled={isPending}
          className="w-full rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-y transition-colors leading-relaxed"
        />
      </div>

      <div className="pt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Your account & workspace information will be automatically attached.
        </span>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 transition-all cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send className="size-4" />
              <span>Send Bug Report</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
