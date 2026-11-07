"use client";

import { useId } from "react";
import { Alert, Field, Input, Switch } from "@smartreach/ui";
import type { NotificationSettingsView } from "@/lib/workspace-profile-actions";

export type NotificationDraft = Pick<NotificationSettingsView, "notifyEmail" | "notifyEscalations" | "notifyReminders">;

/** True when the form differs from what is saved (the email is compared trimmed, as the server stores it). */
export function notificationsDirty(draft: NotificationDraft, saved: NotificationDraft) {
  return (
    draft.notifyEmail.trim() !== saved.notifyEmail ||
    draft.notifyEscalations !== saved.notifyEscalations ||
    draft.notifyReminders !== saved.notifyReminders
  );
}

/**
 * Settings › Lead conversations › Notifications: where "Needs you" emails go and which are sent.
 * Controlled by the Lead conversations card, whose one "Save changes" button saves these too.
 */
export function NotificationSettings({
  loginEmail,
  value,
  onChange,
  mailerConfigured,
}: {
  loginEmail: string;
  value: NotificationDraft;
  onChange: (next: NotificationDraft) => void;
  /** False when this server has no system mailer: nothing is emailed, everything stays in Needs you. */
  mailerConfigured: boolean;
}) {
  const id = useId();
  const { notifyEmail } = value;
  const setNotifyEmail = (notifyEmail: string) => onChange({ ...value, notifyEmail });

  const toggles = [
    {
      key: "escalations",
      label: "Email when a lead needs you",
      checked: value.notifyEscalations,
      onChange: (notifyEscalations: boolean) => onChange({ ...value, notifyEscalations }),
    },
    {
      key: "reminders",
      label: "Daily reminder about unanswered requests",
      checked: value.notifyReminders,
      onChange: (notifyReminders: boolean) => onChange({ ...value, notifyReminders }),
    },
  ];

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5">
      <div>
        <p className="text-[13px] font-medium">Notifications</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Emails about leads waiting on you. Everything also appears in Needs you.
        </p>
      </div>
      {!mailerConfigured ? (
        <Alert variant="info">Email notifications are not set up on this server. Everything still appears in Needs you.</Alert>
      ) : null}
      <Field label="Send 'Needs you' emails to" hint={`Leave empty to use ${loginEmail}.`}>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={notifyEmail}
          onChange={(e) => setNotifyEmail(e.target.value)}
          placeholder={loginEmail}
        />
      </Field>
      {toggles.map((t) => (
        <div key={t.key} className="flex items-center justify-between gap-4">
          <label htmlFor={`${id}-${t.key}`} className="text-[13px]">
            {t.label}
          </label>
          <Switch id={`${id}-${t.key}`} checked={t.checked} onCheckedChange={t.onChange} />
        </div>
      ))}
    </div>
  );
}
