"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Textarea,
} from "@smartreach/ui";
import { saveSenderIdentityAction } from "@/lib/workspace-profile-actions";
import { isUsablePostalAddress } from "@/lib/campaign-start-guard";

type Settings = {
  companyName: string;
  postalAddress: string;
};

type FieldErrors = Partial<Record<keyof Settings, string>>;

/**
 * Company name and postal address used in the footer of this workspace's
 * campaign emails (each workspace has its own). The
 * unsubscribe link always points at AutoGTM, so it isn't configurable. The wrapper with id="postalAddress" is the target of
 * POSTAL_SETTINGS_HREF (/settings#postalAddress); arriving there focuses the field.
 */
export function ComplianceForms({
  workspaceId,
  workspaceName,
  initialSettings,
}: {
  workspaceId: string;
  workspaceName: string;
  initialSettings: Settings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saved, setSaved] = useState(initialSettings);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const postalRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const focusIfTargeted = () => {
      if (window.location.hash === "#postalAddress") postalRef.current?.focus({ preventScroll: true });
    };
    focusIfTargeted();
    window.addEventListener("hashchange", focusIfTargeted);
    return () => window.removeEventListener("hashchange", focusIfTargeted);
  }, []);

  const dirty =
    settings.companyName !== saved.companyName ||
    settings.postalAddress !== saved.postalAddress;
  const addressBlank = saved.postalAddress.trim() === "";
  const addressIncomplete = !addressBlank && !isUsablePostalAddress(saved.postalAddress);

  function update<K extends keyof Settings>(key: K, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveSenderIdentityAction({ workspaceId, ...settings });
      if (r.ok) {
        const trimmed = {
          companyName: settings.companyName.trim(),
          postalAddress: settings.postalAddress.trim(),
        };
        setSettings(trimmed);
        setSaved(trimmed);
        setErrors({});
        toast.success(r.message);
      } else {
        const fe = ("fieldErrors" in r ? r.fieldErrors : undefined) ?? {};
        setErrors({
          companyName: fe.companyName?.[0],
          postalAddress: fe.postalAddress?.[0],
        });
        toast.error(r.error);
      }
    });
  }

  return (
    <Card>
      <form onSubmit={save} noValidate>
        <CardHeader>
          <CardTitle>Compliance</CardTitle>
          <CardDescription>
            For workspace: {workspaceName || "Primary Workspace"}. Anti-spam law (CAN-SPAM, EU e-Privacy) requires your
            company and a real postal address in every cold
            email. AutoGTM adds them to each campaign email&apos;s footer.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {addressBlank ? (
            <Alert variant="warning">
              <AlertTitle>Add a postal address to start campaigns</AlertTitle>
              <AlertDescription>
                Campaigns can&apos;t start, and running campaigns hold their emails until you add it.
              </AlertDescription>
            </Alert>
          ) : addressIncomplete ? (
            <Alert variant="warning">
              <AlertTitle>Complete your postal address</AlertTitle>
              <AlertDescription>
                This address looks incomplete. Campaigns can&apos;t start or resume until it includes a street or
                P.O. box, city, postcode and country. Running campaigns keep sending with it for now.
              </AlertDescription>
            </Alert>
          ) : null}

          <Field
            label="Company name"
            required
            error={errors.companyName}
            hint="Shown in the email footer. Required to start campaigns."
          >
            <Input
              value={settings.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder="Acme Inc."
              autoComplete="organization"
              aria-required="true"
              maxLength={200}
            />
          </Field>

          <div id="postalAddress" className="scroll-mt-24">
            <Field
              label="Postal address"
              required
              error={errors.postalAddress}
              hint="A street address or P.O. box with city, postcode and country. Campaigns cannot start without it."
            >
              <Textarea
                ref={postalRef}
                value={settings.postalAddress}
                onChange={(e) => update("postalAddress", e.target.value)}
                placeholder={"123 Market St\nSan Francisco, CA 94105\nUSA"}
                rows={3}
                autoComplete="street-address"
                aria-required="true"
                maxLength={1000}
              />
            </Field>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Every email includes an AutoGTM unsubscribe link, so opt-outs are recorded and honoured across all
              campaigns.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={pending} disabled={!dirty}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
