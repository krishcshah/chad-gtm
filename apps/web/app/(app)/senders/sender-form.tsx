"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flame, Loader2, Plug, XCircle } from "lucide-react";
import { toast } from "sonner";
import { TIMEZONES } from "@smartreach/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@smartreach/ui";
import { createSender, testSenderConnection } from "@/lib/actions";
import { formatSenderWarmup } from "@/lib/sender-warmup";

type ConnResult = {
  smtp: { ok: boolean; message: string; latencyMs?: number };
  imap: { ok: boolean; message: string; latencyMs?: number };
};

export function SenderForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<ConnResult | null>(null);
  const [warmupEnabled, setWarmupEnabled] = useState(true);
  const [warmupDaily, setWarmupDaily] = useState(20);
  const [warmupRate, setWarmupRate] = useState(40);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const runTest = () => {
    setTest(null);
    if (!f.smtpHost || !f.smtpUsername || !f.smtpPassword) {
      toast.error("Fill in SMTP host, username and password first");
      return;
    }
    setTesting(true);
    testSenderConnection({
      smtpHost: f.smtpHost,
      smtpPort: Number(f.smtpPort ?? 587),
      smtpUsername: f.smtpUsername,
      smtpPassword: f.smtpPassword,
      smtpSecurity: (f.smtpSecurity as "tls" | "ssl" | "none") ?? "tls",
      imapHost: f.imapHost ?? "",
      imapPort: Number(f.imapPort ?? 993),
      imapUsername: f.imapUsername ?? "",
      imapPassword: f.imapPassword ?? "",
    })
      .then((res) => {
        if (res.ok && res.data) setTest(res.data);
        else if (!res.ok) toast.error(res.error);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Test failed"))
      .finally(() => setTesting(false));
  };

  const submit = (testOnly: boolean) =>
    start(async () => {
      setTest(null);
      if (testOnly) {
        runTest();
        return;
      }
      const res = await createSender({
        senderName: f.senderName ?? "",
        email: f.email ?? "",
        smtpHost: f.smtpHost ?? "",
        smtpPort: Number(f.smtpPort ?? 587),
        smtpUsername: f.smtpUsername ?? "",
        smtpPassword: f.smtpPassword ?? "",
        smtpSecurity: (f.smtpSecurity as "tls" | "ssl" | "none") ?? "tls",
        imapHost: f.imapHost ?? "",
        imapPort: Number(f.imapPort ?? 993),
        imapUsername: f.imapUsername ?? "",
        imapPassword: f.imapPassword ?? "",
        dailyLimit: Number(f.dailyLimit ?? 50),
        hourlyLimit: Number(f.hourlyLimit ?? 20),
        fromName: f.fromName ?? f.senderName ?? "",
        replyTo: f.replyTo ?? "",
        timezone: f.timezone ?? "UTC",
        signature: formatSenderWarmup(f.signature ?? "", {
          enabled: warmupEnabled,
          dailyLimit: warmupDaily,
          replyRate: warmupRate,
        }),
      });
      if (res.ok) {
        toast.success("Sender added");
        router.push("/senders");
      } else {
        toast.error(res.error);
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-8"
    >
      {/* Identity */}
      <Section title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sender name" required><Input id="senderName" name="senderName" value={f.senderName ?? ""} onChange={set("senderName")} placeholder="Krish Shah" /></Field>
          <Field label="Email address" required><Input id="email" name="email" type="email" value={f.email ?? ""} onChange={set("email")} placeholder="krish@yourdomain.com" /></Field>
          <Field label="From name"><Input id="fromName" name="fromName" value={f.fromName ?? ""} onChange={set("fromName")} placeholder="Krish from SmartReach" /></Field>
          <Field label="Reply-To"><Input id="replyTo" name="replyTo" type="email" value={f.replyTo ?? ""} onChange={set("replyTo")} placeholder="replies@yourdomain.com" /></Field>
        </div>
      </Section>

      {/* SMTP */}
      <Section title="SMTP (sending)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SMTP host" required><Input id="smtpHost" name="smtpHost" value={f.smtpHost ?? ""} onChange={set("smtpHost")} placeholder="smtp.gmail.com" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Port"><Input id="smtpPort" name="smtpPort" type="number" value={f.smtpPort ?? "587"} onChange={set("smtpPort")} /></Field>
            <Field label="Security">
              <Select value={f.smtpSecurity ?? "tls"} onValueChange={(v) => setF((p) => ({ ...p, smtpSecurity: v }))}>
                <SelectTrigger id="smtpSecurity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">TLS (STARTTLS)</SelectItem>
                  <SelectItem value="ssl">SSL</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Username" required><Input id="smtpUsername" name="smtpUsername" value={f.smtpUsername ?? ""} onChange={set("smtpUsername")} placeholder="krish@yourdomain.com" /></Field>
          <Field label="Password / App password" required><Input id="smtpPassword" name="smtpPassword" type="password" value={f.smtpPassword ?? ""} onChange={set("smtpPassword")} placeholder="••••••••" /></Field>
        </div>
      </Section>

      {/* IMAP */}
      <Section title="IMAP (reply detection)" hint="Optional, but required to detect replies and auto-stop follow-ups.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="IMAP host"><Input id="imapHost" name="imapHost" value={f.imapHost ?? ""} onChange={set("imapHost")} placeholder="imap.gmail.com" /></Field>
          <Field label="IMAP port"><Input id="imapPort" name="imapPort" type="number" value={f.imapPort ?? "993"} onChange={set("imapPort")} /></Field>
          <Field label="IMAP username"><Input id="imapUsername" name="imapUsername" value={f.imapUsername ?? ""} onChange={set("imapUsername")} placeholder="krish@yourdomain.com" /></Field>
          <Field label="IMAP password"><Input id="imapPassword" name="imapPassword" type="password" value={f.imapPassword ?? ""} onChange={set("imapPassword")} placeholder="••••••••" /></Field>
        </div>
      </Section>

      {/* Limits & meta */}
      <Section title="Limits & settings">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Daily limit"><Input type="number" min={1} value={f.dailyLimit ?? "50"} onChange={set("dailyLimit")} /></Field>
          <Field label="Hourly limit"><Input type="number" min={1} value={f.hourlyLimit ?? "20"} onChange={set("hourlyLimit")} /></Field>
          <Field label="Timezone">
            <Select value={f.timezone ?? "UTC"} onValueChange={(v) => setF((p) => ({ ...p, timezone: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(TIMEZONES as readonly string[]).map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Signature" hint="Appended to every email if your template includes {{signature}}.">
          <Textarea rows={3} value={f.signature ?? ""} onChange={set("signature")} placeholder={"—\nKrish Shah\nFounder, SmartReach"} />
        </Field>
      </Section>

      <Section title="Automated Peer Warm-up Pool" hint="Exchange peer warm-up emails with other mailboxes in your pool to boost sender reputation.">
        <div className="space-y-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Flame className="size-4 text-amber-400 shrink-0" />
              <div>
                <Label className="text-sm font-semibold">Enroll in Warm-up Pool</Label>
                <p className="text-xs text-muted-foreground">Automatically warm up this mailbox with peer inboxes.</p>
              </div>
            </div>
            <Switch checked={warmupEnabled} onCheckedChange={setWarmupEnabled} />
          </div>

          {warmupEnabled && (
            <div className="grid gap-4 sm:grid-cols-2 pt-3 border-t border-border/40">
              <Field label="Daily warm-up emails" hint="Target sent peer messages per day">
                <Input
                  type="number"
                  min={5}
                  max={100}
                  value={warmupDaily}
                  onChange={(e) => setWarmupDaily(Number(e.target.value))}
                />
              </Field>
              <Field label={`Target reply rate (${warmupRate}%)`} hint="Percentage of peer emails that trigger replies">
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={warmupRate}
                    onChange={(e) => setWarmupRate(Number(e.target.value))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="text-xs font-bold tabular-nums w-10 text-right">{warmupRate}%</span>
                </div>
              </Field>
            </div>
          )}
        </div>
      </Section>

      {test && (
        <Alert variant={test.smtp.ok ? "success" : "destructive"}>
          <AlertTitle className="flex items-center gap-4">
            <span className={`flex items-center gap-1.5 ${test.smtp.ok ? "" : "text-destructive"}`}>
              {test.smtp.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              SMTP {test.smtp.ok ? `working${test.smtp.latencyMs != null ? ` · ${test.smtp.latencyMs}ms` : ""}` : "failed"}
            </span>
            <span className={`flex items-center gap-1.5 ${test.imap.ok ? "" : "text-muted-foreground"}`}>
              {test.imap.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              IMAP {test.imap.ok ? `working${test.imap.latencyMs != null ? ` · ${test.imap.latencyMs}ms` : ""}` : f.imapHost ? "failed" : "not configured"}
            </span>
          </AlertTitle>
          <AlertDescription>
            {test.smtp.message}
            {test.smtp.message && test.imap.message ? " · " : ""}
            {test.imap.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button type="submit" disabled={pending}>
          {pending && !test ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save sender
        </Button>
        <Button type="button" variant="outline" disabled={pending || testing} onClick={() => submit(true)}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Credentials are encrypted before they're stored. Never sent back to the browser.
        </p>
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
