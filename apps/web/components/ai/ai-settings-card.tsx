"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, DataList } from "@smartreach/ui";

const LINK = "underline decoration-border-strong underline-offset-2 hover:decoration-foreground";

/** Settings → AI: explains the managed model. There is nothing to configure (stored keys are ignored). */
export function AiSettingsCard() {
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
              value: (
                <>
                  Replies only use your{" "}
                  <Link href="/settings#lead-conversations" className={LINK}>
                    booking link
                  </Link>{" "}
                  and your{" "}
                  <Link href="/requests#knowledge" className={LINK}>
                    knowledge base
                  </Link>
                </>
              ),
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
