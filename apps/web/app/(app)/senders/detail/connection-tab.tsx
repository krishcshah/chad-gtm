"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button, SectionHeader, Separator, SheetBody, SheetFooter, toast } from "@smartreach/ui";
import { retestSenderConnection, testSenderConnection, updateSenderDetails } from "@/lib/actions";
import { ConnectionResult } from "../connection-result";
import { firstFieldErrors, type ConnectionCheck, type SenderRow } from "../sender-types";
import { ImapFields, SmtpFields, type ServerValues } from "../server-fields";

/** Saved server settings. Passwords always start blank: stored ones never reach the browser. */
function initialValues(s: SenderRow): ServerValues {
  return {
    smtpHost: s.smtpHost || "",
    smtpPort: String(s.smtpPort || 587),
    smtpSecurity: s.smtpSecurity || "tls",
    smtpUsername: s.smtpUsername || s.email || "",
    smtpPassword: "",
    imapHost: s.imapHost || "",
    imapPort: String(s.imapPort || 993),
    imapUsername: s.imapUsername || s.email || "",
    imapPassword: "",
  };
}

type Errors = Partial<Record<keyof ServerValues, string>>;

function validPort(v: string) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export function ConnectionTab({ sender }: { sender: SenderRow }) {
  const router = useRouter();
  const saved = useMemo(() => initialValues(sender), [sender]);
  const [v, setV] = useState<ServerValues>(saved);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [check, setCheck] = useState<ConnectionCheck | null>(null);
  // After a save, adopt what the server stored (trimmed values, blank passwords).
  const resync = useRef(false);
  useEffect(() => {
    if (!resync.current) return;
    resync.current = false;
    setV(saved);
  }, [saved]);

  const update = (patch: Partial<ServerValues>) => {
    setV((prev) => ({ ...prev, ...patch }));
    setCheck(null);
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k as keyof ServerValues];
      return next;
    });
  };

  const settingsChanged = (Object.keys(saved) as (keyof ServerValues)[]).some(
    (k) => k !== "smtpPassword" && k !== "imapPassword" && v[k].trim() !== saved[k].trim(),
  );
  const passwordsTyped = v.smtpPassword.trim() !== "" || v.imapPassword.trim() !== "";
  const dirty = settingsChanged || passwordsTyped;

  const validate = (): Errors => {
    const e: Errors = {};
    if (!v.smtpHost.trim()) e.smtpHost = "Enter the SMTP server";
    if (!v.smtpUsername.trim()) e.smtpUsername = "Enter the username";
    if (!validPort(v.smtpPort)) e.smtpPort = "Use a port between 1 and 65535";
    if (v.imapHost.trim() && !validPort(v.imapPort)) e.imapPort = "Use a port between 1 and 65535";
    return e;
  };

  const runTest = async () => {
    setCheck(null);
    const e = validate();
    // Unchanged settings: test the saved login on the server.
    // Changed settings: the saved password can't be reused, so it must be typed.
    if (dirty && !v.smtpPassword.trim()) {
      e.smtpPassword = "Enter the password to test changed settings";
    }
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setTesting(true);
    try {
      if (!dirty) {
        const res = await retestSenderConnection(sender.id);
        if (!res.ok) {
          toast.error(res.error || "The connection test failed");
          return;
        }
        if (res.data) {
          setCheck({ smtp: res.data.smtp, imap: res.data.imap });
          router.refresh();
        }
        return;
      }
      const res = await testSenderConnection({
        smtpHost: v.smtpHost.trim(),
        smtpPort: Number(v.smtpPort),
        smtpUsername: v.smtpUsername.trim(),
        smtpPassword: v.smtpPassword.trim(),
        smtpSecurity: v.smtpSecurity,
        imapHost: v.imapHost.trim(),
        imapPort: Number(v.imapPort),
        imapUsername: v.imapUsername.trim(),
        imapPassword: v.imapPassword.trim(),
      });
      if (!res.ok) {
        setErrors(firstFieldErrors(res.fieldErrors) as Errors);
        toast.error(res.error || "The connection test failed");
        return;
      }
      if (res.data) setCheck(res.data);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not run the connection test");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setSaving(true);
    try {
      const res = await updateSenderDetails(sender.id, {
        smtpHost: v.smtpHost.trim(),
        smtpPort: Number(v.smtpPort),
        smtpUsername: v.smtpUsername.trim(),
        smtpPassword: v.smtpPassword.trim() || undefined,
        smtpSecurity: v.smtpSecurity,
        imapHost: v.imapHost.trim(),
        imapPort: Number(v.imapPort),
        imapUsername: v.imapUsername.trim(),
        imapPassword: v.imapPassword.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error || "Could not save the server settings");
        return;
      }
      toast.success("Server settings saved. Test the connection to check them.");
      setV((prev) => ({ ...prev, smtpPassword: "", imapPassword: "" }));
      resync.current = true;
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the server settings");
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
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Saved passwords are encrypted and never shown. Type a new one only to replace it.
        </p>

        <section className="flex flex-col gap-5">
          <SectionHeader title="Sending (SMTP)" />
          <SmtpFields values={v} onChange={update} errors={errors} mode="edit" />
        </section>

        <Separator />

        <section className="flex flex-col gap-5">
          <SectionHeader title="Reply detection (IMAP)" description="Lets AutoGTM see replies and stop follow-ups." />
          <ImapFields values={v} onChange={update} errors={errors} mode="edit" />
        </section>

        {check && <ConnectionResult result={check} imapConfigured={Boolean(v.imapHost.trim())} />}
      </SheetBody>

      <SheetFooter className="flex-wrap">
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving || testing}
            onClick={() => {
              setV(saved);
              setErrors({});
              setCheck(null);
            }}
          >
            Discard
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={testing}
          disabled={saving}
          onClick={() => void runTest()}
        >
          {testing ? "Testing…" : dirty ? "Test new settings" : "Test connection"}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!dirty || testing}>
          Save changes
        </Button>
      </SheetFooter>
    </form>
  );
}
