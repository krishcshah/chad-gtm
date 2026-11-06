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
import { upsertWorkspaceSettings } from "@/lib/actions";
import { isUsablePostalAddress } from "@/lib/campaign-start-guard";

type Settings = {
  companyName: string;
  postalAddress: string;
  unsubscribeBaseUrl: string;
};

type FieldErrors = Partial<Record<keyof Settings, string>>;

/**
 * Company name, postal address and unsubscribe URL used in every campaign
 * footer. The wrapper with id="postalAddress" is the target of
 * POSTAL_SETTINGS_HREF (/settings#postalAddress); arriving there focuses the field.
 */
export function ComplianceForms({ initialSettings }: { initialSettings: Settings }) {
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
    settings.postalAddress !== saved.postalAddress ||
    settings.unsubscribeBaseUrl !== saved.unsubscribeBaseUrl;
  const addressOnHold = !isUsablePostalAddress(saved.postalAddress);

  function update<K extends keyof Settings>(key: K, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await upsertWorkspaceSettings(settings);
      if (r.ok) {
        const trimmed = {
          companyName: settings.companyName.trim(),
          postalAddress: settings.postalAddress.trim(),
          unsubscribeBaseUrl: settings.unsubscribeBaseUrl.trim(),
        };
        setSettings(trimmed);
        setSaved(trimmed);
        setErrors({});
        toast.success(r.message ?? "Compliance details saved");
      } else {
        const fe = r.fieldErrors ?? {};
        setErrors({
          companyName: fe.companyName?.[0],
          postalAddress: fe.postalAddress?.[0],
          unsubscribeBaseUrl: fe.unsubscribeBaseUrl?.[0],
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
            Anti-spam law (CAN-SPAM, EU e-Privacy) requires your company and a real postal address in every cold
            email. AutoGTM adds them to each campaign email&apos;s footer.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {addressOnHold ? (
            <Alert variant="warning">
              <AlertTitle>Add a postal address to start campaigns</AlertTitle>
              <AlertDescription>
                Campaigns cannot start until a valid address is saved, and running campaigns hold their emails
                while it is missing. Held emails go out once you save it.
              </AlertDescription>
            </Alert>
          ) : null}

          <Field label="Company name" error={errors.companyName} hint="Shown in the email footer.">
            <Input
              value={settings.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder="Acme Inc."
              autoComplete="organization"
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
          </div>

          <Field
            label="Unsubscribe link base URL"
            optional
            error={errors.unsubscribeBaseUrl}
            hint="Leave empty to use the AutoGTM unsubscribe page. Only change it if you host your own."
          >
            <Input
              type="url"
              inputMode="url"
              value={settings.unsubscribeBaseUrl}
              onChange={(e) => update("unsubscribeBaseUrl", e.target.value)}
              placeholder="https://example.com/unsubscribe"
              autoComplete="off"
              className="font-mono text-[13px]"
            />
          </Field>
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
