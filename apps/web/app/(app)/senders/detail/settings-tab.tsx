"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES } from "@smartreach/shared";
import {
  Button,
  Field,
  Input,
  NativeSelect,
  SectionHeader,
  Separator,
  SheetBody,
  SheetFooter,
  Textarea,
  toast,
} from "@smartreach/ui";
import { updateSenderDetails, updateSenderLimits } from "@/lib/actions";
import { stripWarmupMarker } from "@/lib/sender-warmup";
import type { SenderRow } from "../sender-types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialValues(s: SenderRow) {
  return {
    senderName: s.senderName || "",
    fromName: s.fromName || s.senderName || "",
    replyTo: s.replyTo || "",
    timezone: s.timezone || "UTC",
    signature: stripWarmupMarker(s.signature),
    dailyLimit: String(s.dailyLimit || 50),
    hourlyLimit: String(s.hourlyLimit || 10),
  };
}

type Values = ReturnType<typeof initialValues>;
type Errors = Partial<Record<keyof Values, string>>;

/** Name, how mail appears, signature and sending limits. */
export function SettingsTab({ sender }: { sender: SenderRow }) {
  const router = useRouter();
  const saved = useMemo(() => initialValues(sender), [sender]);
  const [v, setV] = useState<Values>(saved);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  // After a save, adopt what the server stored (it trims, and a blank display
  // name falls back to the name) so the form doesn't stay "changed".
  const resync = useRef(false);
  useEffect(() => {
    if (!resync.current) return;
    resync.current = false;
    setV(saved);
  }, [saved]);

  const set =(key: keyof Values, value: string) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const limitsDirty = v.dailyLimit !== saved.dailyLimit || v.hourlyLimit !== saved.hourlyLimit;
  const detailsDirty =
    v.senderName !== saved.senderName ||
    v.fromName !== saved.fromName ||
    v.replyTo !== saved.replyTo ||
    v.timezone !== saved.timezone ||
    v.signature !== saved.signature;
  const dirty = limitsDirty || detailsDirty;

  const save = async () => {
    const e: Errors = {};
    if (!v.senderName.trim()) e.senderName = "Give the mailbox a name";
    if (v.replyTo.trim() && !EMAIL_RE.test(v.replyTo.trim())) e.replyTo = "Enter a valid email address";
    const daily = Number(v.dailyLimit);
    const hourly = Number(v.hourlyLimit);
    if (!Number.isInteger(daily) || daily < 1 || daily > 2000) e.dailyLimit = "Use a whole number from 1 to 2,000";
    if (!Number.isInteger(hourly) || hourly < 1 || hourly > 200) e.hourlyLimit = "Use a whole number from 1 to 200";
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }

    setSaving(true);
    try {
      if (limitsDirty) {
        const res = await updateSenderLimits(sender.id, daily, hourly);
        if (!res.ok) {
          toast.error(res.error || "Could not update the limits");
          return;
        }
      }
      if (detailsDirty) {
        const res = await updateSenderDetails(sender.id, {
          senderName: v.senderName.trim(),
          fromName: v.fromName.trim(),
          replyTo: v.replyTo.trim(),
          timezone: v.timezone,
          cleanSignature: v.signature,
        });
        if (!res.ok) {
          toast.error(res.error || "Could not save these settings");
          return;
        }
      }
      toast.success("Settings saved");
      resync.current = true;
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save these settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <SheetBody className="flex flex-col gap-6">
        <section className="flex flex-col gap-5">
          <SectionHeader title="Identity" description="How this mailbox appears to the people you email." />
          <Field label="Name" required error={errors.senderName} hint="Helps you tell mailboxes apart.">
            <Input value={v.senderName} onChange={(e) => set("senderName", e.target.value)} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Display name" optional error={errors.fromName} hint="Shown next to the address.">
              <Input value={v.fromName} onChange={(e) => set("fromName", e.target.value)} />
            </Field>
            <Field
              label="Reply-to address"
              optional
              error={errors.replyTo}
              hint="Leave blank to receive replies here."
            >
              <Input
                type="email"
                value={v.replyTo}
                onChange={(e) => set("replyTo", e.target.value)}
                spellCheck={false}
              />
            </Field>
          </div>
          <Field label="Time zone" error={errors.timezone}>
            <NativeSelect value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {!(TIMEZONES as readonly string[]).includes(v.timezone) && <option value={v.timezone}>{v.timezone}</option>}
              {(TIMEZONES as readonly string[]).map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Signature" optional error={errors.signature} hint="Added wherever a template uses {{signature}}.">
            <Textarea rows={4} value={v.signature} onChange={(e) => set("signature", e.target.value)} />
          </Field>
        </section>

        <Separator />

        <section className="flex flex-col gap-5">
          <SectionHeader
            title="Sending limits"
            description="Campaigns stop using this mailbox for the day or hour once a limit is reached."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Emails per day" error={errors.dailyLimit} hint="From 1 to 2,000.">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={2000}
                value={v.dailyLimit}
                onChange={(e) => set("dailyLimit", e.target.value)}
                className="tabular"
              />
            </Field>
            <Field label="Emails per hour" error={errors.hourlyLimit} hint="From 1 to 200.">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={v.hourlyLimit}
                onChange={(e) => set("hourlyLimit", e.target.value)}
                className="tabular"
              />
            </Field>
          </div>
        </section>
      </SheetBody>

      <SheetFooter>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setV(saved);
              setErrors({});
            }}
          >
            Discard changes
          </Button>
        )}
        <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </SheetFooter>
    </form>
  );
}
