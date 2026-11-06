/**
 * SSRF guard for user-supplied SMTP/IMAP endpoints.
 *
 * The connection test (and the engine, for saved mailboxes) opens TCP
 * connections to whatever host and port a user typed, and reports back
 * success, error text and latency. Without a guard that is a port scanner and
 * banner oracle against loopback, the private network and the cloud metadata
 * service. A mail endpoint must therefore be a public hostname (or public IP
 * literal) on a standard mail port.
 *
 * Pure checks plus one DNS check; the DNS lookup is injectable for tests.
 */
import {
  checkUrlSyntax,
  resolvePublicAddresses,
  systemLookupAll,
  UnsafeUrlError,
  type LookupAll,
} from "./url-guard";

export type MailProtocol = "smtp" | "imap";

/** Standard submission/relay and IMAP ports. */
export const MAIL_PORTS: Record<MailProtocol, readonly number[]> = {
  smtp: [25, 465, 587, 2525],
  imap: [143, 993],
};

const LABEL: Record<MailProtocol, string> = { smtp: "SMTP", imap: "IMAP" };

export function mailPortError(kind: MailProtocol, port: unknown): string | null {
  const n = Number(port);
  if (Number.isInteger(n) && MAIL_PORTS[kind].includes(n)) return null;
  return `${LABEL[kind]} port must be one of ${MAIL_PORTS[kind].join(", ")}.`;
}

/** Host shape only (no DNS): a public hostname or public IP literal. */
export function mailHostSyntaxError(kind: MailProtocol, host: unknown): string | null {
  const h = typeof host === "string" ? host.trim() : "";
  if (!h) return `${LABEL[kind]} host is required.`;
  // A bare host name or IP: no scheme, path, credentials, port or spaces.
  if (/[\s/@?#\\]/.test(h) || (/:/.test(h) && !/^\[?[0-9a-f:.]+\]?$/i.test(h))) {
    return `${LABEL[kind]} host must be a plain host name like smtp.example.com.`;
  }
  const bracketed = h.includes(":") && !h.startsWith("[") ? `[${h}]` : h;
  const syntax = checkUrlSyntax(`https://${bracketed}/`);
  if (!syntax.ok) return `${LABEL[kind]} host must be a public mail server, not ${syntax.reason}.`;
  return null;
}

/** Host shape plus DNS: every address the name resolves to must be public. */
export async function mailHostError(
  kind: MailProtocol,
  host: unknown,
  lookup: LookupAll = systemLookupAll,
): Promise<string | null> {
  const syntaxError = mailHostSyntaxError(kind, host);
  if (syntaxError) return syntaxError;
  const h = String(host).trim().replace(/^\[|\]$/g, "");
  const syntax = checkUrlSyntax(`https://${h.includes(":") ? `[${h}]` : h}/`);
  if (syntax.ok && syntax.ip) return null; // public IP literal, already classified
  try {
    await resolvePublicAddresses(h.toLowerCase().replace(/\.$/, ""), lookup);
    return null;
  } catch (e) {
    const reason = e instanceof UnsafeUrlError ? e.message : "host does not resolve";
    return `${LABEL[kind]} host must be a public mail server (${reason}).`;
  }
}

export interface MailEndpoints {
  smtpHost: string;
  smtpPort: number;
  imapHost?: string | null;
  imapPort?: number | null;
}

/**
 * First problem with a sender's SMTP/IMAP endpoints, or null. IMAP is optional
 * (empty host = not configured).
 */
export async function senderEndpointsError(
  e: MailEndpoints,
  lookup: LookupAll = systemLookupAll,
): Promise<string | null> {
  const smtp = mailPortError("smtp", e.smtpPort) ?? (await mailHostError("smtp", e.smtpHost, lookup));
  if (smtp) return smtp;
  const imapHost = (e.imapHost ?? "").trim();
  if (!imapHost) return null;
  return mailPortError("imap", e.imapPort) ?? (await mailHostError("imap", imapHost, lookup));
}

/** Pure variant for patches: checks only the fields being changed. */
export function senderEndpointPatchError(patch: {
  smtpHost?: unknown;
  smtpPort?: unknown;
  imapHost?: unknown;
  imapPort?: unknown;
}): string | null {
  if (patch.smtpHost !== undefined) {
    const err = mailHostSyntaxError("smtp", patch.smtpHost);
    if (err) return err;
  }
  if (patch.smtpPort !== undefined) {
    const err = mailPortError("smtp", patch.smtpPort);
    if (err) return err;
  }
  if (patch.imapHost !== undefined && String(patch.imapHost).trim() !== "") {
    const err = mailHostSyntaxError("imap", patch.imapHost);
    if (err) return err;
  }
  if (patch.imapPort !== undefined) {
    const err = mailPortError("imap", patch.imapPort);
    if (err) return err;
  }
  return null;
}
