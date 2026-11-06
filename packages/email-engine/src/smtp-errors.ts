/**
 * Classify an SMTP send failure so the processor punishes the right thing:
 *
 *   auth / connection → the MAILBOX is broken (lower health, maybe mark failed)
 *   sender            → the MAILBOX was refused as a sender (MAIL FROM stage,
 *                       "Sender address rejected", relay denied, daily sending
 *                       quota). Never the lead's fault: the lead is handed to
 *                       another mailbox or retried later, never failed.
 *   recipient         → the ADDRESS was refused (fail the job only). Only a
 *                       dead address (5.1.1/5.1.2/5.1.3/5.1.6/5.1.10/5.2.1 or
 *                       clear "user unknown" wording) is a hard bounce and is
 *                       suppressed globally. Policy blocks (5.7.x) and mailbox
 *                       full (5.2.2) only stop this lead in this campaign.
 *   message           → the CONTENT was refused (fail the job only)
 *
 * A recipient-level rejection must never mark a pool mailbox failed: three bad
 * addresses would otherwise take a healthy mailbox out of rotation.
 *
 * The same "is this address dead?" rule (isDeadAddress) is used for
 * delivery-status notifications, so the SMTP and DSN paths agree.
 */
export type SmtpFailureKind = "auth" | "connection" | "sender" | "recipient" | "message" | "unknown";

export interface SmtpFailure {
  kind: SmtpFailureKind;
  /** Retrying the same message will not help. */
  permanent: boolean;
  /** The address does not exist / is disabled: suppress it. */
  hardBounce: boolean;
  /** The mailbox hit its own sending quota (try again later, the lead is fine). */
  senderQuota?: boolean;
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
export const BAD_MAILBOX_TEXT =
  /user unknown|unknown user|no such (?:user|mailbox|recipient)|mailbox (?:unavailable|not found|does not exist)|recipient (?:address )?rejected|invalid recipient|unknown recipient|address (?:rejected|not found|does not exist)|does not exist|RecipientNotFound|account (?:has been )?disabled|account is disabled|unrouteable address/i;
/** The SENDING mailbox / domain was refused (not the recipient). */
const SENDER_TEXT =
  /sender address rejected|sender (?:address|domain) (?:is )?(?:invalid|unknown|not (?:found|allowed|owned|permitted|verified))|not owned by (?:the )?(?:authenticated )?user|relay(?:ing)? (?:access )?(?:denied|not (?:permitted|allowed))|sender verify failed|domain of sender address .{0,80} does not exist/i;
/** The sending mailbox hit its own provider quota (Gmail 5.4.5 and similar). */
const SENDING_QUOTA_TEXT =
  /daily (?:user )?sending (?:quota|limit)|user sending (?:quota|limit)|sending (?:quota|limit) (?:exceeded|reached)|message (?:rate|sending) limit|too many (?:messages|emails) (?:sent|today)/i;
/** Spam / policy / authentication wording: never proof that the address is dead. */
const POLICY_TEXT =
  /spam|block(?:ed|list)|blacklist|policy|reputation|dmarc|\bspf\b|dkim|unauthenticated|not authenticated|content rejected|rejected (?:due to|because)|denied/i;

/** Enhanced statuses that mean the recipient address itself is dead. */
export const DEAD_ADDRESS_STATUSES: ReadonlySet<string> = new Set(["5.1.1", "5.1.2", "5.1.3", "5.1.6", "5.1.10", "5.2.1"]);
/** Enhanced statuses that blame the SENDER address (bad sender syntax/domain, sending quota). */
const SENDER_STATUSES = new Set(["5.1.7", "5.1.8", "5.4.5"]);

/**
 * Is this permanent failure proof that the ADDRESS is dead (hard bounce →
 * global suppression)? Specific enhanced codes decide; a generic or missing
 * code needs clear bad-mailbox wording with no policy/spam/sender wording.
 */
export function isDeadAddress(status: string | null | undefined, text: string = ""): boolean {
  const s = String(status ?? "").trim();
  if (s && !s.startsWith("5.")) return false;
  if (DEAD_ADDRESS_STATUSES.has(s)) return true;
  if (s && s !== "5.0.0") return false; // a specific non-dead status (5.7.x policy, 5.2.2 full, ...)
  return BAD_MAILBOX_TEXT.test(text) && !POLICY_TEXT.test(text) && !SENDER_TEXT.test(text);
}

/** A 5.7.x status: policy / spam / authentication (DMARC, SPF) refusal. */
export function isPolicyStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().startsWith("5.7.");
}

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
  const deadStatus = enhanced !== undefined && DEAD_ADDRESS_STATUSES.has(enhanced);

  // The mailbox itself was refused as a sender (MAIL FROM stage, sender
  // address/domain rejected, relay denied, daily sending quota).
  const senderQuota = enhanced === "5.4.5" || SENDING_QUOTA_TEXT.test(message);
  const senderLevel =
    command.startsWith("MAIL") ||
    (!deadStatus &&
      (SENDER_STATUSES.has(enhanced ?? "") || SENDER_TEXT.test(message) || (senderQuota && enhanced !== "5.2.2")));
  if (senderLevel) {
    // A quota is temporary for the mailbox; anything else is permanent for this mailbox.
    const quota = senderQuota && enhanced !== "5.2.2";
    return { ...base, kind: "sender", permanent: fivexx && !quota, hardBounce: false, senderQuota: quota };
  }

  const recipientLevel =
    command.startsWith("RCPT") ||
    (command !== "DATA" &&
      errCode !== "EMESSAGE" &&
      (/^5\.1\.\d+$/.test(enhanced ?? "") || /^5\.2\.\d+$/.test(enhanced ?? "") || BAD_MAILBOX_TEXT.test(message)));

  if (recipientLevel) {
    const hardBounce = fivexx && isDeadAddress(enhanced ?? (fivexx ? "5.0.0" : undefined), message);
    return { ...base, kind: "recipient", permanent: fivexx, hardBounce };
  }
  if (command === "DATA" || errCode === "EMESSAGE") {
    return { ...base, kind: "message", permanent: fivexx, hardBounce: false };
  }
  // Unknown 5xx: permanent except "service not available" style replies.
  const permanent = fivexx && code !== 521 && code !== 542;
  return { ...base, kind: "unknown", permanent, hardBounce: false };
}

/** Broken mailboxes (bad credentials, unreachable server, refused as sender) count against the sender. */
export function failureBlamesSender(f: SmtpFailure): boolean {
  return f.kind === "auth" || f.kind === "connection" || (f.kind === "sender" && !f.senderQuota);
}
