/**
 * Pure classifiers for inbound mail seen by IMAP sync:
 *
 *   parseDsn          — delivery-status notifications (bounces). Never a reply.
 *   detectAutoReply   — out-of-office / autoresponders (RFC 3834 headers + subjects).
 *   classifyOptOut    — explicit "remove me" / spam complaints in a real reply.
 *
 * Everything here is string-in / data-out so it is unit-tested with realistic
 * fixtures (Gmail, Outlook, Exim) in __tests__/inbound-classify.test.ts.
 */

export type HeaderMap = Record<string, string>;

/** Parse an RFC 5322 header block (folded lines unfolded, keys lowercased, repeats joined). */
export function parseHeaderBlock(raw: string | Buffer | null | undefined): HeaderMap {
  const text = (Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw ?? "")).replace(/\r\n/g, "\n");
  const end = text.search(/\n\s*\n/);
  const block = end >= 0 ? text.slice(0, end) : text;
  const out: HeaderMap = {};
  let key = "";
  for (const line of block.split("\n")) {
    if (/^[ \t]/.test(line) && key) {
      out[key] += ` ${line.trim()}`;
      continue;
    }
    const m = line.match(/^([!-9;-~]+):\s*(.*)$/);
    if (!m) {
      key = "";
      continue;
    }
    key = m[1]!.toLowerCase();
    out[key] = out[key] !== undefined ? `${out[key]}, ${m[2]!.trim()}` : m[2]!.trim();
  }
  return out;
}

/* ─── Delivery-status notifications ─────────────────────────────────────── */

export interface DsnRecipient {
  email: string;
  /** Enhanced status code, e.g. "5.1.1". */
  status: string;
  action?: string;
  diagnostic?: string;
  /** 5.x.x and not merely delayed: the address is dead. */
  permanent: boolean;
}

export interface DsnResult {
  recipients: DsnRecipient[];
  /** Message-IDs of the original (bounced) message found in the report. */
  originalMessageIds: string[];
}

const DSN_SENDER_RE = /^(?:mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/i;
const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const ENHANCED_RE = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/;
const DSN_SUBJECT_RE =
  /\b(?:undeliver(?:able|ed)|delivery status notification|delivery (?:has )?failed|mail delivery (?:failed|failure|subsystem)|returned mail|failure notice|could not be delivered|non[- ]?delivery report)\b/i;

/** Is this inbound message a delivery-status notification (bounce)? */
export function isDeliveryStatusNotification(input: {
  fromEmail: string;
  subject?: string;
  headers: HeaderMap;
}): boolean {
  const ct = (input.headers["content-type"] ?? "").toLowerCase();
  if (/multipart\/report/.test(ct) && /report-type\s*=\s*"?delivery-status/.test(ct)) return true;
  if (input.headers["x-failed-recipients"]) return true;
  if (DSN_SENDER_RE.test(input.fromEmail.trim())) return true;
  // Some MTAs send bounces from a no-reply address: require a bounce subject AND an auto header.
  const auto = (input.headers["auto-submitted"] ?? "").toLowerCase();
  return Boolean(auto && auto !== "no" && DSN_SUBJECT_RE.test(input.subject ?? ""));
}

function cleanAddress(raw: string): string {
  const m = raw.match(EMAIL_RE);
  return m ? m[0].toLowerCase().replace(/\.$/, "") : "";
}

function statusFromText(text: string): string | null {
  const enh = text.match(ENHANCED_RE);
  if (enh) return `${enh[1]}.${enh[2]}.${enh[3]}`;
  if (/\bpermanent(?:ly)? (?:error|failure|fatal)|permanent error/i.test(text)) return "5.0.0";
  const basic = text.match(/\b(5[05][0-4]|4[25][0-2])\b/);
  if (basic) return basic[1]!.startsWith("5") ? "5.0.0" : "4.0.0";
  if (/\btemporar(?:y|ily)|delayed|will (?:retry|try again)/i.test(text)) return "4.0.0";
  return null;
}

/** Fields of each per-recipient group in a message/delivery-status part. */
function parseDeliveryStatusGroups(body: string): DsnRecipient[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: DsnRecipient[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i]!.match(/^\s*(?:Final|Original)-Recipient:\s*(.*)$/i);
    if (!m) {
      i++;
      continue;
    }
    // Collect this group: until a blank line.
    const fields: HeaderMap = {};
    let key = "";
    for (; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.trim()) break;
      if (/^[ \t]/.test(line) && key) {
        fields[key] += ` ${line.trim()}`;
        continue;
      }
      const f = line.match(/^\s*([A-Za-z-]+):\s*(.*)$/);
      if (!f) continue;
      key = f[1]!.toLowerCase();
      if (fields[key] === undefined) fields[key] = f[2]!.trim();
    }
    const email = cleanAddress(fields["final-recipient"] ?? fields["original-recipient"] ?? "");
    if (!email) continue;
    const action = (fields["action"] ?? "").toLowerCase().split(/\s/)[0] || undefined;
    const diagnostic = fields["diagnostic-code"]?.replace(/^smtp;\s*/i, "").trim();
    const status =
      fields["status"]?.match(ENHANCED_RE)?.[0] ?? statusFromText(diagnostic ?? "") ?? (action === "failed" ? "5.0.0" : "4.0.0");
    if (action === "delivered" || action === "relayed" || action === "expanded") continue;
    out.push({
      email,
      status,
      action,
      diagnostic,
      permanent: status.startsWith("5.") && action !== "delayed",
    });
  }
  return out;
}

/** Exim / qmail plain-text bounces: "The following address(es) failed:" + indented addresses. */
function parsePlainTextFailures(body: string): string[] {
  const text = body.replace(/\r\n/g, "\n");
  const m = text.match(
    /(?:following (?:address(?:\(es\))?|recipients?)[^\n]*?failed|could not be delivered to[^\n]*|I'm afraid I wasn't able to deliver[^\n]*|delivery to the following recipients? failed[^\n]*)[:.]?\s*\n([\s\S]{0,2000})/i,
  );
  if (!m) return [];
  const found: string[] = [];
  for (const line of m[1]!.split("\n")) {
    if (/^-{3,}|^\s*-+\s*This is a copy/i.test(line)) break;
    const addr = line.match(/^\s*<?([^\s<>@]+@[^\s<>:]+)>?:?\s*$/) ?? line.match(/^\s{1,8}<?([^\s<>@]+@[^\s<>:]+?)>?:?(?:\s|$)/);
    if (addr) {
      const a = cleanAddress(addr[1]!);
      if (a && !found.includes(a)) found.push(a);
    }
  }
  return found;
}

/** Message-IDs inside the returned original (message/rfc822 or text/rfc822-headers part). */
function originalIds(body: string): string[] {
  const ids: string[] = [];
  const re = /^\s*(?:X-Original-)?Message-ID:\s*(<[^>\s]+>)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) if (!ids.includes(m[1]!)) ids.push(m[1]!);
  return ids;
}

/**
 * Parse a delivery-status notification. Returns null when the message is not
 * a DSN. A DSN with no recognizable recipient still returns a result (with no
 * recipients) so the caller never treats it as a reply.
 */
export function parseDsn(input: {
  fromEmail: string;
  subject?: string;
  headers: HeaderMap;
  body: string;
}): DsnResult | null {
  if (!isDeliveryStatusNotification(input)) return null;
  const body = input.body ?? "";
  let recipients = parseDeliveryStatusGroups(body);

  const xFailed = (input.headers["x-failed-recipients"] ?? "")
    .split(/[,\s]+/)
    .map(cleanAddress)
    .filter(Boolean);
  const fallbackStatus = statusFromText(body) ?? "5.0.0";
  for (const email of [...xFailed, ...parsePlainTextFailures(body)]) {
    if (recipients.some((r) => r.email === email)) continue;
    // Look for a status near the address first, then anywhere in the report.
    const at = body.toLowerCase().indexOf(email);
    const near = at >= 0 ? statusFromText(body.slice(at, at + 600)) : null;
    const status = near ?? fallbackStatus;
    recipients.push({ email, status, permanent: status.startsWith("5.") });
  }
  recipients = recipients.filter((r, i, a) => a.findIndex((x) => x.email === r.email) === i);
  return { recipients, originalMessageIds: originalIds(body) };
}

/* ─── Auto-replies ──────────────────────────────────────────────────────── */

const AUTO_SUBJECT_RE =
  /^\s*(?:\[?auto(?:matic)?[\s-]*(?:reply|response|antwort)\]?|auto:|autoreply|out of (?:the )?office|ooo\b|away from (?:the )?office|on vacation|on leave|abwesenheit(?:snotiz)?|r[ée]ponse automatique|respuesta autom[áa]tica|risposta automatica|resposta autom[áa]tica|automatisch antwoord|afwezig|absence|i am (?:currently )?out of (?:the )?office|i'm (?:currently )?out of (?:the )?office|thank you for your (?:email|message)[\s.!]*$)/i;

export interface AutoReplyVerdict {
  auto: boolean;
  reason?: string;
}

/**
 * RFC 3834 and common de-facto autoresponder markers, plus OOO subjects.
 * `Auto-Submitted: no` is an explicit human message.
 */
export function detectAutoReply(headers: HeaderMap, subject: string): AutoReplyVerdict {
  const autoSubmitted = (headers["auto-submitted"] ?? "").trim().toLowerCase();
  if (autoSubmitted && !autoSubmitted.startsWith("no")) {
    return { auto: true, reason: `Auto-Submitted: ${autoSubmitted}` };
  }
  if (headers["x-autoreply"] !== undefined) return { auto: true, reason: "X-Autoreply" };
  if (headers["x-autorespond"] !== undefined) return { auto: true, reason: "X-Autorespond" };
  if (headers["x-autoresponse"] !== undefined) return { auto: true, reason: "X-Autoresponse" };
  const precedence = (headers["precedence"] ?? "").trim().toLowerCase();
  if (/^(?:auto_reply|auto-reply|bulk|junk)$/.test(precedence)) {
    return { auto: true, reason: `Precedence: ${precedence}` };
  }
  // Exchange marks its own OOO with this; regular mail rarely sets "OOF".
  if (/\boof\b/i.test(headers["x-auto-response-suppress"] ?? "") && /\bautoreply\b|\bauto\b/i.test(subject)) {
    return { auto: true, reason: "Exchange OOF" };
  }
  const subj = String(subject ?? "").replace(/^\s*(?:re|aw|sv|fw|fwd)\s*:\s*/i, "");
  if (AUTO_SUBJECT_RE.test(subj) || AUTO_SUBJECT_RE.test(subject ?? "")) {
    return { auto: true, reason: "Out-of-office subject" };
  }
  return { auto: false };
}

/* ─── Opt-outs in real replies ──────────────────────────────────────────── */

export type OptOutKind = "unsubscribe" | "complaint" | "not_interested" | null;

const UNSUBSCRIBE_RE =
  /\bunsubscribe\b|\bremove me\b|\bremove my (?:email|address|details|info)\b|\bplease remove\b|\btake me off\b|\bopt(?:-| )?out\b|\bdo not (?:contact|email|e-mail|message)\b|\bdon'?t (?:contact|email|e-mail|message)\b|\bstop (?:emailing|e-mailing|contacting|messaging|sending)\b|\bno more emails\b|\blose my (?:number|email)\b|\bcease and desist\b/i;
const COMPLAINT_RE =
  /\b(?:this is|that's|that is|you are|you're) spam(?:ming)?\b|\breport(?:ed|ing)? (?:you|this|it)? ?(?:as|for) spam\b|\bspammer\b|\breport(?:ed|ing)? (?:you )?(?:to|for) abuse\b|\bmark(?:ed|ing)? (?:this |it )?as spam\b/i;
const NOT_INTERESTED_RE = /\bnot interested\b|\bno thanks\b|\bno thank you\b|\bnot a fit\b|\bnot for us\b/i;

/**
 * What kind of no is this? Explicit opt-outs are recorded as source
 * 'unsubscribe' (global), spam complaints as 'complaint' (global); a plain
 * "not interested" only stops this client.
 */
export function classifyOptOut(subject: string, body: string): OptOutKind {
  const text = `${subject || ""}\n${body || ""}`;
  if (COMPLAINT_RE.test(text)) return "complaint";
  if (UNSUBSCRIBE_RE.test(text)) return "unsubscribe";
  if (NOT_INTERESTED_RE.test(text)) return "not_interested";
  return null;
}
