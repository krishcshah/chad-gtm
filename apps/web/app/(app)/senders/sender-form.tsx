"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plug } from "lucide-react";
import { TIMEZONES } from "@smartreach/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  NativeSelect,
  SegmentedControl,
  Textarea,
  toast,
} from "@smartreach/ui";
import { createSender, testSenderConnection } from "@/lib/actions";
import { WARMUP_STATUS_DESCRIPTION, WARMUP_STATUS_TITLE } from "@/lib/sender-warmup";
import { ConnectionResult } from "./connection-result";
import { firstFieldErrors, type ConnectionCheck, type SmtpSecurity } from "./sender-types";
import { ImapFields, SmtpFields, type ServerValues } from "./server-fields";

type Provider = "google" | "microsoft" | "zoho" | "other";

/** Known server settings. They only fill the fields; everything stays editable. */
const PROVIDERS: Record<Exclude<Provider, "other">, Partial<ServerValues>> = {
  google: { smtpHost: "smtp.gmail.com", smtpPort: "587", smtpSecurity: "tls", imapHost: "imap.gmail.com", imapPort: "993" },
  microsoft: {
    smtpHost: "smtp.office365.com",
    smtpPort: "587",
    smtpSecurity: "tls",
    imapHost: "outlook.office365.com",
    imapPort: "993",
  },
  zoho: { smtpHost: "smtp.zoho.com", smtpPort: "465", smtpSecurity: "ssl", imapHost: "imap.zoho.com", imapPort: "993" },
};

interface FormValues extends ServerValues {
  senderName: string;
  email: string;
  fromName: string;
  replyTo: string;
  dailyLimit: string;
  hourlyLimit: string;
  timezone: string;
  signature: string;
}

const INITIAL: FormValues = {
  senderName: "",
  email: "",
  fromName: "",
  replyTo: "",
  smtpHost: "",
  smtpPort: "587",
  smtpSecurity: "tls",
  smtpUsername: "",
  smtpPassword: "",
  imapHost: "",
  imapPort: "993",
  imapUsername: "",
  imapPassword: "",
  dailyLimit: "50",
  hourlyLimit: "20",
  timezone: "UTC",
  signature: "",
};

type Errors = Partial<Record<keyof FormValues, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SERVER_KEYS: (keyof ServerValues)[] = [
  "smtpHost",
  "smtpPort",
  "smtpSecurity",
  "smtpUsername",
  "smtpPassword",
  "imapHost",
  "imapPort",
  "imapUsername",
  "imapPassword",
];

function validPort(v: string) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export function SenderForm() {
  const router = useRouter();
  const [f, setF] = useState<FormValues>(INITIAL);
  const [provider, setProvider] = useState<Provider>("other");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<ConnectionCheck | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Move focus to the first field with an error so keyboard and screen-reader users land on it.
  const showErrors = (e: Errors) => {
    setErrors(e);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };

  const update = (patch: Partial<FormValues>) => {
    setF((prev) => ({ ...prev, ...patch }));
    // A result for different server settings would be misleading.
    if (Object.keys(patch).some((k) => SERVER_KEYS.includes(k as keyof ServerValues) || k === "email")) setTest(null);
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k as keyof FormValues];
      return next;
    });
  };

  const pickProvider = (p: Provider) => {
    setProvider(p);
    if (p !== "other") update(PROVIDERS[p]);
  };

  // Usernames default to the email address, IMAP login to the SMTP login.
  const smtpUsername = f.smtpUsername.trim() || f.email.trim();
  const imapEnabled = f.imapHost.trim() !== "";
  const imapUsername = imapEnabled ? f.imapUsername.trim() || smtpUsername : f.imapUsername.trim();
  const imapPassword = imapEnabled ? f.imapPassword || f.smtpPassword : f.imapPassword;

  const serverPayload = () => ({
    smtpHost: f.smtpHost.trim(),
    smtpPort: Number(f.smtpPort || 587),
    smtpUsername,
    smtpPassword: f.smtpPassword,
    smtpSecurity: f.smtpSecurity as SmtpSecurity,
    imapHost: f.imapHost.trim(),
    imapPort: Number(f.imapPort || 993),
    imapUsername,
    imapPassword,
  });

  const serverErrors = (): Errors => {
    const e: Errors = {};
    if (!f.smtpHost.trim()) e.smtpHost = "Enter the SMTP server";
    if (!smtpUsername) e.smtpUsername = "Enter the username, or fill in the email address";
    if (!f.smtpPassword) e.smtpPassword = "Enter the password";
    if (!validPort(f.smtpPort)) e.smtpPort = "Use a port between 1 and 65535";
    if (imapEnabled && !validPort(f.imapPort)) e.imapPort = "Use a port between 1 and 65535";
    return e;
  };

  const runTest = async () => {
    setTest(null);
    const e = serverErrors();
    if (Object.keys(e).length > 0) {
      showErrors(e);
      toast.error(
        e.smtpHost || e.smtpUsername || e.smtpPassword
          ? "Fill in the SMTP server, username and password first"
          : "Check the highlighted fields",
      );
      return;
    }
    setTesting(true);
    try {
      const res = await testSenderConnection(serverPayload());
      if (res.ok && res.data) setTest(res.data);
      else if (!res.ok) {
        setErrors(firstFieldErrors(res.fieldErrors) as Errors);
        toast.error(res.error);
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    const e: Errors = { ...serverErrors() };
    if (!f.senderName.trim()) e.senderName = "Give the mailbox a name";
    if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address";
    if (f.replyTo.trim() && !EMAIL_RE.test(f.replyTo.trim())) e.replyTo = "Enter a valid email address";
    if (!(Number(f.dailyLimit) >= 1)) e.dailyLimit = "Use at least 1";
    if (!(Number(f.hourlyLimit) >= 1)) e.hourlyLimit = "Use at least 1";
    if (Object.keys(e).length > 0) {
      showErrors(e);
      toast.error("Check the highlighted fields");
      return;
    }

    setSaving(true);
    try {
      const res = await createSender({
        senderName: f.senderName.trim(),
        email: f.email.trim(),
        ...serverPayload(),
        dailyLimit: Number(f.dailyLimit || 50),
        hourlyLimit: Number(f.hourlyLimit || 20),
        fromName: f.fromName.trim() || f.senderName.trim(),
        replyTo: f.replyTo.trim(),
        timezone: f.timezone || "UTC",
        signature: f.signature,
      });
      if (res.ok) {
        toast.success(`${f.email.trim()} connected`);
        router.push("/senders");
        return;
      }
      showErrors(firstFieldErrors(res.fieldErrors) as Errors);
      toast.error(res.error);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not connect this mailbox");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Mailbox</CardTitle>
          <CardDescription>The address campaigns send from and how it appears to recipients.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" required error={errors.senderName} hint="Helps you tell mailboxes apart.">
            <Input
              name="senderName"
              value={f.senderName}
              onChange={(e) => update({ senderName: e.target.value })}
              placeholder="Jane, sales"
              autoComplete="off"
            />
          </Field>
          <Field label="Email address" required error={errors.email}>
            <Input
              name="email"
              type="email"
              value={f.email}
              onChange={(e) => update({ email: e.target.value })}
              placeholder="jane@yourcompany.com"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Display name"
            optional
            error={errors.fromName}
            hint="What recipients see next to the address. Defaults to the name above."
          >
            <Input
              name="fromName"
              value={f.fromName}
              onChange={(e) => update({ fromName: e.target.value })}
              placeholder="Jane Cooper"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Reply-to address"
            optional
            error={errors.replyTo}
            hint="Send replies to a different inbox. Leave blank to keep them in this mailbox."
          >
            <Input
              name="replyTo"
              type="email"
              value={f.replyTo}
              onChange={(e) => update({ replyTo: e.target.value })}
              placeholder="replies@yourcompany.com"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sending server (SMTP)</CardTitle>
          <CardDescription>Pick your email provider to fill in its server settings, or enter them yourself.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="-mx-5 overflow-x-auto px-5">
            <SegmentedControl
              aria-label="Email provider"
              value={provider}
              onValueChange={pickProvider}
              options={[
                { value: "google", label: "Google" },
                { value: "microsoft", label: "Microsoft 365" },
                { value: "zoho", label: "Zoho" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>
          <SmtpFields
            values={f}
            onChange={update}
            errors={errors}
            mode="create"
            usernamePlaceholder={f.email.trim() || undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reply detection (IMAP)</CardTitle>
          <CardDescription>
            Optional, but without it AutoGTM can&apos;t see replies, so follow-ups keep going to people who already
            answered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImapFields values={f} onChange={update} errors={errors} mode="create" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limits and signature</CardTitle>
          <CardDescription>Keep volume low on new mailboxes. You can change these later.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Emails per day" error={errors.dailyLimit} hint="Sending stops for the day at this number.">
              <Input
                name="dailyLimit"
                type="number"
                inputMode="numeric"
                min={1}
                value={f.dailyLimit}
                onChange={(e) => update({ dailyLimit: e.target.value })}
                className="tabular"
              />
            </Field>
            <Field label="Emails per hour" error={errors.hourlyLimit} hint="Spreads sending across the day.">
              <Input
                name="hourlyLimit"
                type="number"
                inputMode="numeric"
                min={1}
                value={f.hourlyLimit}
                onChange={(e) => update({ hourlyLimit: e.target.value })}
                className="tabular"
              />
            </Field>
            <Field label="Time zone" error={errors.timezone}>
              <NativeSelect name="timezone" value={f.timezone} onChange={(e) => update({ timezone: e.target.value })}>
                {(TIMEZONES as readonly string[]).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field
            label="Signature"
            optional
            error={errors.signature}
            hint="Added wherever a template uses {{signature}}."
          >
            <Textarea
              name="signature"
              rows={4}
              value={f.signature}
              onChange={(e) => update({ signature: e.target.value })}
              placeholder={"Jane Cooper\nHead of Sales, Acme"}
            />
          </Field>
        </CardContent>
      </Card>

      <Alert variant="info">
        <AlertTitle>{WARMUP_STATUS_TITLE}</AlertTitle>
        <AlertDescription>{WARMUP_STATUS_DESCRIPTION}</AlertDescription>
      </Alert>

      {test && <ConnectionResult result={test} imapConfigured={imapEnabled} />}

      <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground sm:max-w-xs">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Passwords are encrypted before they&apos;re stored and are never shown again.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" loading={testing} disabled={saving} onClick={() => void runTest()}>
            {testing ? null : <Plug />}
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <Button type="submit" loading={saving} disabled={testing}>
            Connect mailbox
          </Button>
        </div>
      </div>
    </form>
  );
}
