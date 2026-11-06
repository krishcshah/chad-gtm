/**
 * Classify an SMTP send failure so the processor punishes the right thing:
 *
 *   auth / connection → the MAILBOX is broken (lower health, maybe mark failed)
 *   recipient         → the ADDRESS was refused (fail the job only; 5.1.x is a
 *                       hard bounce and is suppressed globally)
 *   message           → the CONTENT was refused (fail the job only)
 *
 * A recipient-level rejection must never mark a pool mailbox failed: three bad
 * addresses would otherwise take a healthy mailbox out of rotation.
 */
export type SmtpFailureKind = "auth" | "connection" | "recipient" | "message" | "unknown";

export interface SmtpFailure {
  kind: SmtpFailureKind;
  /** Retrying the same message will not help. */
  permanent: boolean;
  /** The address does not exist / is disabled: suppress it. */
  hardBounce: boolean;
  code?: number;
  /** Enhanced status code such as "5.1.1". */
  enhanced?: string;
  message: string;
}

const CONNECTION_CODES = new Set([
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "EDNS",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETLS",
  "EGREETING",
]);

const CONNECTION_TEXT =
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EPIPE|socket hang up|Greeting never received|Connection (?:closed|timeout|timed out)|self[- ]signed certificate|certificate has expired|unable to verify the first certificate|wrong version number/i;
const AUTH_TEXT =
  /\bauth(?:entication)?\b.*\b(?:fail|failed|unsuccessful|required|invalid|rejected)|invalid (?:login|credentials)|username and password not accepted|AUTHENTICATIONFAILED|535[ -]/i;
const BAD_MAILBOX_TEXT =
  /user unknown|unknown user|no such (?:user|mailbox|recipient)|mailbox (?:unavailable|not found|does not exist)|recipient (?:address )?rejected|invalid recipient|unknown recipient|address (?:rejected|not found|does not exist)|does not exist|RecipientNotFound|account (?:has been )?disabled|account is disabled|unrouteable address/i;

export function classifySmtpError(err: unknown): SmtpFailure {
  const e = (err ?? {}) as {
    response?: string;
    message?: string;
    responseCode?: number;
    code?: string;
    command?: string;
  };
  const message = String(e.response || e.message || "Send failed");
  const code = typeof e.responseCode === "number" ? e.responseCode : undefined;
  const enhanced = message.match(/\b([245]\.\d{1,3}\.\d{1,3})\b/)?.[1];
  const errCode = String(e.code || "").toUpperCase();
  const command = String(e.command || "").toUpperCase();

  const base = { code, enhanced, message };

  if (errCode === "EAUTH" || code === 535 || code === 534 || (code === 530 && AUTH_TEXT.test(message)) || (code === 454 && /auth/i.test(message))) {
    return { ...base, kind: "auth", permanent: false, hardBounce: false };
  }
  if (CONNECTION_CODES.has(errCode) || (!code && CONNECTION_TEXT.test(message))) {
    return { ...base, kind: "connection", permanent: false, hardBounce: false };
  }

  const fivexx = code !== undefined ? code >= 500 && code < 600 : enhanced?.startsWith("5.") ?? false;
  const recipientLevel =
    command.startsWith("RCPT") ||
    errCode === "EENVELOPE" ||
    /^5\.1\.\d+$/.test(enhanced ?? "") ||
    enhanced === "5.2.1" ||
    BAD_MAILBOX_TEXT.test(message);

  if (recipientLevel) {
    const hardBounce =
      fivexx &&
      (/^5\.1\.[0-9]+$/.test(enhanced ?? "") || enhanced === "5.2.1" || (!enhanced?.startsWith("5.7") && BAD_MAILBOX_TEXT.test(message)));
    return { ...base, kind: "recipient", permanent: fivexx, hardBounce };
  }
  if (command === "DATA" || errCode === "EMESSAGE") {
    return { ...base, kind: "message", permanent: fivexx, hardBounce: false };
  }
  // Unknown 5xx: permanent except "service not available" style replies.
  const permanent = fivexx && code !== 521 && code !== 542;
  return { ...base, kind: "unknown", permanent, hardBounce: false };
}

/** Only broken mailboxes (bad credentials, unreachable server) count against the sender. */
export function failureBlamesSender(f: SmtpFailure): boolean {
  return f.kind === "auth" || f.kind === "connection";
}
