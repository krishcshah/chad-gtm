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
            Optional company name, postal address, and unsubscribe base URL. Stored with your
            workspace and appended to your campaign emails for CAN-SPAM and GDPR compliance.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyName">Company name</Label>
          <Input
            id="companyName"
            value={settings.companyName}
            onChange={(e) => setSettings((s) => ({ ...s, companyName: e.target.value }))}
            placeholder="Acme Inc."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postalAddress">Physical postal address</Label>
          <Textarea
            id="postalAddress"
            value={settings.postalAddress}
            onChange={(e) => setSettings((s) => ({ ...s, postalAddress: e.target.value }))}
            placeholder={"123 Market St\nSan Francisco, CA 94105\nUSA"}
            rows={3}
            aria-describedby="postal-optional-hint"
          />
          <p id="postal-optional-hint" className="text-xs text-muted-foreground">
            Required by anti-spam regulations (CAN-SPAM / EU e-Privacy) in cold outreach footers.
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
