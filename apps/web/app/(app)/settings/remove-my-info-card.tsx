"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, Button, Input, Textarea, Label } from "@smartreach/ui";
import { UserX, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";
import { submitDataRemovalAction } from "@/lib/data-removal-actions";

export function RemoveMyInfoCard({ userEmail }: { userEmail?: string | null }) {
  const [contactEmail, setContactEmail] = useState(userEmail || "");
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

  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <UserX className="size-4 text-rose-400" />
              <h2 className="font-semibold text-base text-foreground">Remove My Info</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Exercise your GDPR Art. 17 &quot;Right to Erasure&quot;. Request the permanent removal of your email, company, or personal data from the SmartReach database and search index.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-400 shrink-0">
            <ShieldCheck className="size-3" /> GDPR Art. 17
          </span>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <CheckCircle2 className="size-4" />
              <span>Removal Request Submitted</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We have received your erasure request for <strong className="text-foreground">{contactEmail}</strong>. Our compliance team will review and purge all matching records from the database within 72 hours.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => setSubmitted(false)}
            >
              Submit Another Request
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="removal-email" className="text-xs font-medium">
                Contact Email
              </Label>
              <Input
                id="removal-email"
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="name@company.com"
                className="h-9 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                The primary email address to match and remove from all outreach lists and lead records.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="removal-description" className="text-xs font-medium">
                What do you want to get removed?
              </Label>
              <Textarea
                id="removal-description"
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Please purge my personal email, phone number, and any company lead records from your database."
                className="text-xs"
              />
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={isPending} size="sm" className="text-xs font-medium">
                {isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                Submit Erasure Request
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
