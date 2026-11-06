"use client";

import { useState, useTransition } from "react";
import { upsertWorkspaceSettings } from "@/lib/actions";
import { Button, Card, CardContent, Input, Label, Textarea } from "@smartreach/ui";

type Settings = {
  companyName: string;
  postalAddress: string;
  unsubscribeBaseUrl: string;
};

export function ComplianceForms({
  initialSettings,
}: {
  initialSettings: Settings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="font-medium">Company & Unsubscribe Compliance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your company name and physical postal address are required: they are added to every
            campaign email (CAN-SPAM / GDPR), and campaigns will not start or send until they are
            set. The unsubscribe base URL is optional.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyName">Company name (required)</Label>
          <Input
            id="companyName"
            value={settings.companyName}
            onChange={(e) => setSettings((s) => ({ ...s, companyName: e.target.value }))}
            placeholder="Acme Inc."
            required
            aria-required="true"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postalAddress">Physical postal address (required)</Label>
          <Textarea
            id="postalAddress"
            value={settings.postalAddress}
            onChange={(e) => setSettings((s) => ({ ...s, postalAddress: e.target.value }))}
            placeholder={"123 Market St\nSan Francisco, CA 94105\nUSA"}
            rows={3}
            required
            aria-required="true"
            aria-describedby="postal-required-hint"
          />
          <p id="postal-required-hint" className="text-xs text-muted-foreground">
            Required. A real street address or P.O. box with city, postcode and country. Anti-spam
            law (CAN-SPAM / EU e-Privacy) requires it in every cold email, so campaigns are held
            until it is set.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="unsubscribeBaseUrl">Unsubscribe base URL (optional)</Label>
          <Input
            id="unsubscribeBaseUrl"
            value={settings.unsubscribeBaseUrl}
            onChange={(e) => setSettings((s) => ({ ...s, unsubscribeBaseUrl: e.target.value }))}
            placeholder="https://130-61-146-177.sslip.io/unsubscribe"
          />
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              setErr(null);
              const r = await upsertWorkspaceSettings(settings);
              if (r.ok) setMsg(r.message ?? "Saved compliance settings");
              else setErr(r.error);
            })
          }
        >
          Save compliance settings
        </Button>
        {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </CardContent>
    </Card>
  );
}
