"use client";

import { useState, useTransition } from "react";
import { addSuppression, removeSuppression, upsertWorkspaceSettings } from "@/lib/actions";
import { Button, Card, CardContent, Input, Label, Textarea } from "@smartreach/ui";

type Settings = {
  companyName: string;
  postalAddress: string;
  unsubscribeBaseUrl: string;
};

type Suppression = {
  id: string;
  value: string;
  kind: string;
  reason: string;
  source: string;
};

export function ComplianceForms({
  initialSettings,
  suppressions,
}: {
  initialSettings: Settings;
  suppressions: Suppression[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="font-medium">Compliance (CAN-SPAM)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Physical postal address is appended to every outbound campaign email. Unsubscribe links
              and List-Unsubscribe headers are added automatically.
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
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unsubscribeBaseUrl">Unsubscribe base URL (optional)</Label>
            <Input
              id="unsubscribeBaseUrl"
              value={settings.unsubscribeBaseUrl}
              onChange={(e) => setSettings((s) => ({ ...s, unsubscribeBaseUrl: e.target.value }))}
              placeholder="http://localhost:3000"
            />
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMsg(null);
                setErr(null);
                const r = await upsertWorkspaceSettings(settings);
                if (r.ok) setMsg(r.message ?? "Saved");
                else setErr(r.error);
              })
            }
          >
            Save compliance settings
          </Button>
          {msg ? <p className="text-sm text-emerald-600">{msg}</p> : null}
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="font-medium">Suppression / block list</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Emails or domains (prefix with @) that must never be mailed.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="email@example.com or @domain.com"
            />
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
            />
            <Button
              disabled={pending || !value.trim()}
              onClick={() =>
                start(async () => {
                  setMsg(null);
                  setErr(null);
                  const r = await addSuppression({ value, reason });
                  if (r.ok) {
                    setMsg(r.message ?? "Added");
                    setValue("");
                    setReason("");
                  } else setErr(r.error);
                })
              }
            >
              Add
            </Button>
          </div>
          <ul className="divide-y rounded-lg border">
            {suppressions.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">No suppressions yet.</li>
            ) : (
              suppressions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-mono">{s.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.kind} · {s.source}
                      {s.reason ? ` · ${s.reason}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await removeSuppression(s.id);
                      })
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
