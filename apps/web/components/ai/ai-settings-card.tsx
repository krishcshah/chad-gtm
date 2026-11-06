"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, DataList } from "@smartreach/ui";

interface AiSettingsCardProps {
  /** Kept for callers; the workspace always uses the managed model. */
  initialProvider?: string;
  initialModel?: string;
  hasApiKey?: boolean;
}

/** Settings → AI: explains the managed model. There is nothing to configure. */
export function AiSettingsCard(_props: AiSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI</CardTitle>
        <CardDescription>
          AutoGTM runs research, email writing and reply sorting on a model it manages for you. There is nothing to
          set up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataList
          items={[
            { label: "Model", value: "Managed by AutoGTM" },
            { label: "API key", value: "Not needed" },
            { label: "Used for", value: "Website research, ICP and personas, email copy, and sorting replies" },
            {
              label: "Reply agent limits",
              value: "Replies only use your booking link and your knowledge base",
            },
            {
              label: "If AI is unavailable",
              value: "Campaigns send the email you wrote instead of guessing",
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
