import type { BadgeProps } from "@smartreach/ui";

export type SmtpSecurity = "tls" | "ssl" | "none";

/** One mailbox as the list, table and detail sheet see it. Never carries passwords. */
export interface SenderRow {
  id: string;
  senderName: string;
  email: string;
  status: string;
  health: number;
  smtpStatus: string;
  imapStatus: string;
  dailyLimit: number;
  hourlyLimit: number;
  usedToday: number;
  repliedCount: number;
  lastSyncAt: string | null;
  signature: string;
  fromName: string;
  replyTo: string;
  timezone: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpSecurity: SmtpSecurity;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
}

/** Result of a live SMTP + IMAP check (testSenderConnection / retestSenderConnection). */
export interface ConnectionCheck {
  smtp: { ok: boolean; message: string; latencyMs?: number };
  imap: { ok: boolean; message: string; latencyMs?: number };
}

export const SECURITY_OPTIONS: { value: SmtpSecurity; label: string; port: number }[] = [
  { value: "tls", label: "STARTTLS (usually port 587)", port: 587 },
  { value: "ssl", label: "SSL/TLS (usually port 465)", port: 465 },
  { value: "none", label: "None (usually port 25)", port: 25 },
];

/** Plain-language summary of a mailbox's last connection test. */
export function connectionSummary(s: Pick<SenderRow, "smtpStatus" | "imapStatus" | "imapHost">): {
  label: string;
  variant: BadgeProps["variant"];
  detail: string;
} {
  if (s.smtpStatus === "failed") {
    return { label: "Can't send", variant: "destructive", detail: "The last test could not sign in to the SMTP server." };
  }
  if (s.smtpStatus !== "ok") {
    return { label: "Not tested", variant: "neutral", detail: "Run a connection test to check the login details." };
  }
  if (!s.imapHost) {
    return { label: "Sending only", variant: "neutral", detail: "No IMAP server, so replies are not detected." };
  }
  if (s.imapStatus === "ok") {
    return { label: "Connected", variant: "success", detail: "Sending and reply detection both work." };
  }
  if (s.imapStatus === "failed") {
    return { label: "Replies not detected", variant: "warning", detail: "Sending works, but the IMAP login failed." };
  }
  return { label: "Sending works", variant: "neutral", detail: "IMAP has not been tested yet." };
}

export function protocolLabel(status: string, configured = true) {
  if (!configured) return { label: "Not set up", variant: "outline" as const };
  if (status === "ok") return { label: "Working", variant: "success" as const };
  if (status === "failed") return { label: "Failed", variant: "destructive" as const };
  return { label: "Not tested", variant: "neutral" as const };
}

export function needsAttention(s: Pick<SenderRow, "status" | "smtpStatus">) {
  return s.status === "failed" || s.smtpStatus === "failed";
}

const PERMISSION_RE = /permission|forbidden|unauthorized|access denied/i;

export function isPermissionError(message: string) {
  return PERMISSION_RE.test(message);
}

/** Next.js redirects thrown from server actions must propagate. */
export function isNextRedirect(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT");
}

/** First message per field from a server action's zod field errors. */
export function firstFieldErrors(fieldErrors?: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fieldErrors ?? {})) if (v?.[0]) out[k] = v[0];
  return out;
}
