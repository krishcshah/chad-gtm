"use client";

import { Field, Input, NativeSelect } from "@smartreach/ui";
import { PasswordInput } from "./password-input";
import { SECURITY_OPTIONS, type SmtpSecurity } from "./sender-types";

export interface ServerValues {
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: SmtpSecurity;
  smtpUsername: string;
  smtpPassword: string;
  imapHost: string;
  imapPort: string;
  imapUsername: string;
  imapPassword: string;
}

type Errors = Partial<Record<keyof ServerValues, string>>;

/** Picking a security mode moves the port along with it, unless the user typed a custom port. */
export function securityPatch(current: ServerValues, next: SmtpSecurity): Partial<ServerValues> {
  const knownPorts = SECURITY_OPTIONS.map((o) => String(o.port));
  const port = SECURITY_OPTIONS.find((o) => o.value === next)?.port ?? 587;
  return knownPorts.includes(current.smtpPort.trim()) || !current.smtpPort.trim()
    ? { smtpSecurity: next, smtpPort: String(port) }
    : { smtpSecurity: next };
}

export function SmtpFields({
  values,
  onChange,
  errors = {},
  mode,
  usernamePlaceholder,
}: {
  values: ServerValues;
  onChange: (patch: Partial<ServerValues>) => void;
  errors?: Errors;
  mode: "create" | "edit";
  usernamePlaceholder?: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-6">
      <Field label="SMTP server" required error={errors.smtpHost} className="sm:col-span-4">
        <Input
          name="smtpHost"
          value={values.smtpHost}
          onChange={(e) => onChange({ smtpHost: e.target.value })}
          placeholder="smtp.example.com"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Port" error={errors.smtpPort} className="sm:col-span-2">
        <Input
          name="smtpPort"
          type="number"
          inputMode="numeric"
          min={1}
          max={65535}
          value={values.smtpPort}
          onChange={(e) => onChange({ smtpPort: e.target.value })}
          className="tabular"
        />
      </Field>
      <Field label="Encryption" error={errors.smtpSecurity} className="sm:col-span-6">
        <NativeSelect
          name="smtpSecurity"
          value={values.smtpSecurity}
          onChange={(e) => onChange(securityPatch(values, e.target.value as SmtpSecurity))}
        >
          {SECURITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        label="Username"
        required={mode === "edit"}
        error={errors.smtpUsername}
        hint={mode === "create" ? "Usually the full email address. Left blank, we use the email above." : undefined}
        className="sm:col-span-3"
      >
        <Input
          name="smtpUsername"
          value={values.smtpUsername}
          onChange={(e) => onChange({ smtpUsername: e.target.value })}
          placeholder={usernamePlaceholder || "you@example.com"}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field
        label={mode === "create" ? "Password" : "New password"}
        required={mode === "create"}
        optional={mode === "edit"}
        error={errors.smtpPassword}
        hint={
          mode === "create"
            ? "For Gmail and Microsoft 365, use an app password."
            : "Leave blank to keep the saved password."
        }
        className="sm:col-span-3"
      >
        <PasswordInput
          name="smtpPassword"
          value={values.smtpPassword}
          onChange={(e) => onChange({ smtpPassword: e.target.value })}
          placeholder={mode === "edit" ? "Unchanged" : undefined}
        />
      </Field>
    </div>
  );
}

export function ImapFields({
  values,
  onChange,
  errors = {},
  mode,
}: {
  values: ServerValues;
  onChange: (patch: Partial<ServerValues>) => void;
  errors?: Errors;
  mode: "create" | "edit";
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-6">
      <Field
        label="IMAP server"
        optional
        error={errors.imapHost}
        hint={mode === "edit" ? "Clear it to stop reply detection." : undefined}
        className="sm:col-span-4"
      >
        <Input
          name="imapHost"
          value={values.imapHost}
          onChange={(e) => onChange({ imapHost: e.target.value })}
          placeholder="imap.example.com"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Port" error={errors.imapPort} className="sm:col-span-2">
        <Input
          name="imapPort"
          type="number"
          inputMode="numeric"
          min={1}
          max={65535}
          value={values.imapPort}
          onChange={(e) => onChange({ imapPort: e.target.value })}
          className="tabular"
        />
      </Field>
      <Field
        label="Username"
        optional={mode === "create"}
        error={errors.imapUsername}
        hint={mode === "create" ? "Left blank, we use the SMTP username." : undefined}
        className="sm:col-span-3"
      >
        <Input
          name="imapUsername"
          value={values.imapUsername}
          onChange={(e) => onChange({ imapUsername: e.target.value })}
          placeholder={values.smtpUsername || "you@example.com"}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field
        label={mode === "create" ? "Password" : "New password"}
        optional
        error={errors.imapPassword}
        hint={mode === "create" ? "Left blank, we use the SMTP password." : "Leave blank to keep the saved password."}
        className="sm:col-span-3"
      >
        <PasswordInput
          name="imapPassword"
          value={values.imapPassword}
          onChange={(e) => onChange({ imapPassword: e.target.value })}
          placeholder={mode === "edit" ? "Unchanged" : undefined}
        />
      </Field>
    </div>
  );
}
