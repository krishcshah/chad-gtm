"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES } from "@smartreach/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  NativeSelect,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@smartreach/ui";
import { bulkUpdateSenders } from "@/lib/actions";
import { PasswordInput } from "./password-input";
import { SECURITY_OPTIONS, type SmtpSecurity } from "./sender-types";

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSuccess: () => void;
}

const KEEP = "keep";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY = {
  status: KEEP as typeof KEEP | "active" | "paused",
  dailyLimit: "",
  hourlyLimit: "",
  smtpHost: "",
  smtpPort: "",
  smtpPassword: "",
  smtpSecurity: KEEP as typeof KEEP | SmtpSecurity,
  imapHost: "",
  imapPort: "",
  imapPassword: "",
  fromName: "",
  replyTo: "",
  timezone: "",
};

type Values = typeof EMPTY;
type Updates = Parameters<typeof bulkUpdateSenders>[1];

/** Only fields the user filled in become updates; everything else is left as it is. */
function buildUpdates(v: Values): Updates {
  const updates: Updates = {};
  const num = (s: string) => (s.trim() && !isNaN(Number(s)) ? Number(s) : undefined);

  if (v.status !== KEEP) updates.status = v.status;
  const daily = num(v.dailyLimit);
  if (daily !== undefined) updates.dailyLimit = Math.max(1, daily);
  const hourly = num(v.hourlyLimit);
  if (hourly !== undefined) updates.hourlyLimit = Math.max(1, hourly);

  if (v.smtpHost.trim()) updates.smtpHost = v.smtpHost.trim();
  const smtpPort = num(v.smtpPort);
  if (smtpPort !== undefined) updates.smtpPort = smtpPort;
  if (v.smtpPassword.trim()) updates.smtpPassword = v.smtpPassword.trim();
  if (v.smtpSecurity !== KEEP) updates.smtpSecurity = v.smtpSecurity;

  if (v.imapHost.trim()) updates.imapHost = v.imapHost.trim();
  const imapPort = num(v.imapPort);
  if (imapPort !== undefined) updates.imapPort = imapPort;
  if (v.imapPassword.trim()) updates.imapPassword = v.imapPassword.trim();

  if (v.fromName.trim()) updates.fromName = v.fromName.trim();
  if (v.replyTo.trim()) updates.replyTo = v.replyTo.trim();
  if (v.timezone.trim()) updates.timezone = v.timezone.trim();
  return updates;
}

export function BulkEditDialog({ open, onOpenChange, selectedIds, onSuccess }: BulkEditDialogProps) {
  const router = useRouter();
  const [v, setV] = useState<Values>(EMPTY);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const updates = buildUpdates(v);
  const changeCount = Object.keys(updates).length;
  // The server stores reply-to as typed, so check it here.
  const replyToError =
    v.replyTo.trim() && !EMAIL_RE.test(v.replyTo.trim()) ? "Enter a valid email address" : undefined;
  const n = selectedIds.length;
  const noun = n === 1 ? "mailbox" : "mailboxes";

  const close = (o: boolean) => {
    if (!o) setV(EMPTY);
    onOpenChange(o);
  };

  const apply = async () => {
    if (n === 0 || changeCount === 0 || replyToError) return;
    setPending(true);
    try {
      const res = await bulkUpdateSenders(selectedIds, updates);
      if (!res.ok) {
        toast.error(res.error || "Could not update these mailboxes");
        return;
      }
      // The server message says "senders"; keep the UI's own wording.
      toast.success(`Updated ${n} ${noun}`);
      close(false);
      onSuccess();
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update these mailboxes");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Edit {n} {noun}
          </DialogTitle>
          <DialogDescription>
            Only the fields you fill in change. Everything you leave blank stays as it is on each mailbox.
          </DialogDescription>
        </DialogHeader>

        <form
          id="bulk-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          <Tabs defaultValue="sending">
            <TabsList>
              <TabsTrigger value="sending">Sending</TabsTrigger>
              <TabsTrigger value="servers">Servers</TabsTrigger>
              <TabsTrigger value="identity">Identity</TabsTrigger>
            </TabsList>

            <TabsContent value="sending" className="flex flex-col gap-5">
              <Field label="Status">
                <NativeSelect value={v.status} onChange={(e) => set("status", e.target.value as Values["status"])}>
                  <option value={KEEP}>Don&apos;t change</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </NativeSelect>
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Emails per day" hint="Between 1 and 2,000.">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={2000}
                    placeholder="Don't change"
                    value={v.dailyLimit}
                    onChange={(e) => set("dailyLimit", e.target.value)}
                    className="tabular"
                  />
                </Field>
                <Field label="Emails per hour" hint="Between 1 and 500.">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    placeholder="Don't change"
                    value={v.hourlyLimit}
                    onChange={(e) => set("hourlyLimit", e.target.value)}
                    className="tabular"
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="servers" className="flex flex-col gap-5">
              <p className="text-[13px] text-muted-foreground">
                Every selected mailbox gets the same value. Use this when they share one provider.
              </p>
              <div className="grid gap-5 sm:grid-cols-6">
                <Field label="SMTP server" className="sm:col-span-4">
                  <Input
                    placeholder="Don't change"
                    value={v.smtpHost}
                    onChange={(e) => set("smtpHost", e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label="SMTP port" className="sm:col-span-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={v.smtpPort}
                    onChange={(e) => set("smtpPort", e.target.value)}
                    className="tabular"
                  />
                </Field>
                <Field label="Encryption" className="sm:col-span-3">
                  <NativeSelect
                    value={v.smtpSecurity}
                    onChange={(e) => set("smtpSecurity", e.target.value as Values["smtpSecurity"])}
                  >
                    <option value={KEEP}>Don&apos;t change</option>
                    {SECURITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="SMTP password" className="sm:col-span-3">
                  <PasswordInput
                    placeholder="Don't change"
                    value={v.smtpPassword}
                    onChange={(e) => set("smtpPassword", e.target.value)}
                  />
                </Field>
                <Field label="IMAP server" className="sm:col-span-4">
                  <Input
                    placeholder="Don't change"
                    value={v.imapHost}
                    onChange={(e) => set("imapHost", e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label="IMAP port" className="sm:col-span-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={v.imapPort}
                    onChange={(e) => set("imapPort", e.target.value)}
                    className="tabular"
                  />
                </Field>
                <Field label="IMAP password" className="sm:col-span-6">
                  <PasswordInput
                    placeholder="Don't change"
                    value={v.imapPassword}
                    onChange={(e) => set("imapPassword", e.target.value)}
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="identity" className="flex flex-col gap-5">
              <Field label="Display name" hint="The name recipients see next to the address.">
                <Input placeholder="Don't change" value={v.fromName} onChange={(e) => set("fromName", e.target.value)} />
              </Field>
              <Field
                label="Reply-to address"
                error={replyToError}
                hint="Replies from every selected mailbox go to this inbox."
              >
                <Input
                  type="email"
                  placeholder="Don't change"
                  value={v.replyTo}
                  onChange={(e) => set("replyTo", e.target.value)}
                  spellCheck={false}
                />
              </Field>
              <Field label="Time zone">
                <NativeSelect value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  <option value="">Don&apos;t change</option>
                  {(TIMEZONES as readonly string[]).map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </TabsContent>
          </Tabs>
        </form>

        <DialogFooter className="sm:justify-between">
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            {changeCount === 0
              ? "Nothing to change yet."
              : `${changeCount} ${changeCount === 1 ? "change" : "changes"} to apply.`}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => close(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="bulk-edit-form"
              loading={pending}
              disabled={changeCount === 0 || n === 0 || Boolean(replyToError)}
            >
              Apply to {n} {noun}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
