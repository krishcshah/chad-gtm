/**
 * SMTP/IMAP helpers built on nodemailer + IMAPFlow.
 * Everything network-related is isolated here so scheduler/processor stay pure.
 */
import { decryptSecret } from "@smartreach/database/crypto";
import type { TestConnectionResult } from "@smartreach/shared";
import { ImapFlow } from "imapflow";
import nodemailer, { type Transporter } from "nodemailer";
import type { SenderRow } from "./db-port";

export function makeTransport(sender: SenderRow): Transporter {
  const secure = sender.smtpSecurity === "ssl" || sender.smtpPort === 465;
  return nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure,
    requireTLS: sender.smtpSecurity === "tls" && !secure,
    auth: {
      user: sender.smtpUsername,
      pass: decryptSecret(sender.smtpPasswordEnc),
    },
    connectionTimeout: 12_000,
    socketTimeout: 20_000,
    greetingTimeout: 10_000,
    tls: { rejectUnauthorized: false },
  } as any);
}

export interface SendParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}

export async function sendMail(
  sender: SenderRow,
  params: SendParams,
): Promise<{ messageId: string }> {
  const transporter = makeTransport(sender);
  try {
    const from = sender.fromName
      ? `"${sender.fromName.replace(/"/g, "")}" <${sender.email}>`
      : sender.email;
    const info = await transporter.sendMail({
      from,
      to: params.to,
      replyTo: sender.replyTo || undefined,
      subject: params.subject,
      text: params.text || undefined,
      html: params.html || undefined,
      inReplyTo: params.inReplyTo || undefined,
      references: params.references || undefined,
    });
    return { messageId: String(info.messageId ?? "") };
  } finally {
    transporter.close();
  }
}

export async function testSmtp(sender: SenderRow): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  const transporter = makeTransport(sender);
  try {
    await transporter.verify();
    return { ok: true, message: "SMTP working", latencyMs: Date.now() - start };
  } catch (err: any) {
    const msg: string = err?.response || err?.message || "Connection failed";
    const hint = /auth|credentials|535/i.test(String(msg))
      ? " — check username/password (use an app password for Gmail/Outlook)"
      : /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout/i.test(String(msg))
        ? " — check host/port and firewall"
        : /certificate|SSL|TLS/i.test(String(msg))
          ? " — try switching the security mode (SSL ↔ TLS)"
          : "";
    return { ok: false, message: `SMTP failed: ${msg}${hint}` };
  } finally {
    transporter.close();
  }
}

export function makeImapClient(sender: SenderRow): ImapFlow {
  return new ImapFlow({
    host: sender.imapHost,
    port: sender.imapPort || 993,
    secure: (sender.imapPort || 993) === 993,
    auth: {
      user: sender.imapUsername || sender.email,
      pass: decryptSecret(sender.imapPasswordEnc),
    },
    logger: false,
    socketTimeout: 10_000,
  } as any);
}

export async function testImap(sender: SenderRow): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  if (!sender.imapHost) return { ok: false, message: "IMAP not configured (reply detection disabled)" };
  const start = Date.now();
  const client = makeImapClient(sender);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    await client.logout();
    return { ok: true, message: "IMAP working", latencyMs: Date.now() - start };
  } catch (err: any) {
    const msg: string = err?.responseText || err?.message || "Connection failed";
    const hint = /auth|credentials|AUTHENTICATIONFAILED/i.test(String(msg))
      ? " — check IMAP username/password (enable IMAP access in the mailbox settings)"
      : "";
    return { ok: false, message: `IMAP failed: ${msg}${hint}` };
  } finally {
    try {
      if (client.usable) await client.logout();
    } catch {
      /* noop */
    }
  }
}

export async function testConnection(sender: SenderRow): Promise<TestConnectionResult> {
  const [smtp, imap] = await Promise.all([testSmtp(sender), testImap(sender)]);
  return { smtp, imap };
}
