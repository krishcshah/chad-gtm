"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, Card, CardDescription, CardHeader, CardTitle, Field, Input, Textarea } from "@smartreach/ui";
import { WorkingPanel, hostOf } from "@/components/chad-gtm/working-panel";

const RESEARCH_STEPS = [
  "Read your homepage and the pages it links to",
  "Summarize what you sell and what sets you apart",
  "Suggest industries, job titles and company sizes to target",
  "Draft three pitch angles you can choose from",
];

/** Step 1 of guided setup: the website (and optional notes) the research starts from. */
export function WebsiteStep({
  url,
  notes,
  onUrlChange,
  onNotesChange,
  analyzing,
  onSubmit,
}: {
  url: string;
  notes: string;
  onUrlChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  analyzing: boolean;
  onSubmit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  if (analyzing) {
    return (
      <WorkingPanel
        title={`Researching ${hostOf(url)}`}
        description="This usually takes 30 to 60 seconds. Keep this tab open; you'll review everything before anything is sent."
        steps={RESEARCH_STEPS}
      />
    );
  }

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return void setError("Enter your company website.");
          setError(null);
          onSubmit();
        }}
      >
        <CardHeader>
          <CardTitle>Which company are we selling for?</CardTitle>
          <CardDescription>
            We read your site and propose a strategy. You can edit every part of it in the next steps.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-5 p-5">
          <Field label="Company website" required error={error}>
            <Input
              value={url}
              onChange={(e) => {
                onUrlChange(e.target.value);
                if (error) setError(null);
              }}
              placeholder="yourcompany.com"
              autoComplete="url"
              inputMode="url"
              autoFocus
              className="h-11 text-[15px]"
            />
          </Field>
          <Field
            label="Anything we should know?"
            optional
            hint="An offer, a niche or an angle. We use it alongside what we find on your site."
          >
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="e.g. We offer a free 14-day benchmark to Series B engineering teams"
            />
          </Field>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button type="submit" className="w-full sm:w-auto">
            Research my website
            <ArrowRight />
          </Button>
        </div>
      </form>
    </Card>
  );
}
