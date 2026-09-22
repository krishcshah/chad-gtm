/**
 * Quoted prior for Unibox outbound SMTP only.
 * The client sends new text. Attribution and the prior message are appended here.
 * The operator bubble and unibox_messages row stay that new text (F11c).
 * This builder does not set Message-ID, In-Reply-To, or References.
 */

export interface PriorOutboundMessage {
  fromName: string;
  fromEmail: string;
  /** ISO-8601 receive/send time of the message being replied to. */
  sentAt: string;
  bodyText: string;
  bodyHtml: string;
}

export interface UniboxOutboundMime {
  /** text/plain: new text, then `On … wrote:` and `>` lines. */
  text: string;
  /** text/html: new text, then a Gmail-style quote block. */
  html: string;
  /** Persisted / in-app operator body. Includes quote so UI displays thread via EmailBody. */
  storedBodyText: string;
  storedBodyHtml: string;
}

/** SMTP fields for sendMail. */
export interface UniboxReplyMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  storedBodyText: string;
  storedBodyHtml: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function composeUniboxOutbound(newText: string, prior: PriorOutboundMessage): UniboxOutboundMime {
  const freshText = newText.replace(/\r\n/g, "\n").trim();
  const attribution = formatReplyAttribution(prior);
  const plainPrior = priorPlain(prior);
  const quote = plainPrior ? `${attribution}\n${quotePlainText(plainPrior)}` : "";
  const text = quote ? `${freshText}\n\n${quote}\n` : freshText;
  const html = buildHtml(freshText, attribution, prior, plainPrior);
  return {
    text,
    html,
    storedBodyText: text,
    storedBodyHtml: html,
  };
}

/** Body quote for sendUniboxReply. `newText` is the client payload; the prior is loaded server-side. */
export function uniboxReplyMail(input: {
  to: string;
  subject: string;
  newText: string;
  prior: PriorOutboundMessage;
}): UniboxReplyMail {
  const mime = composeUniboxOutbound(input.newText, input.prior);
  return {
    to: input.to,
    subject: input.subject,
    text: mime.text,
    html: mime.html,
    storedBodyText: mime.storedBodyText,
    storedBodyHtml: mime.storedBodyHtml,
  };
}

/** `On Tue, Sep 22, 2026 at 3:18 AM Name <email> wrote:` */
export function formatReplyAttribution(prior: Pick<PriorOutboundMessage, "fromName" | "fromEmail" | "sentAt">): string {
  const when = formatWhen(prior.sentAt);
  const who = formatWho(prior.fromName, prior.fromEmail);
  return when ? `On ${when} ${who} wrote:` : `On ${who} wrote:`;
}

export function quotePlainText(body: string): string {
  const normalized = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
}

function formatWhen(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const raw = iso.trim();
    return raw || null;
  }
  const day = WEEKDAYS[d.getUTCDay()];
  const month = MONTHS[d.getUTCMonth()];
  let hour = d.getUTCHours();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day}, ${month} ${d.getUTCDate()}, ${d.getUTCFullYear()} at ${hour}:${minute} ${ampm}`;
}

function formatWho(name: string, email: string): string {
  const safeName = name.replace(/[<>"]/g, "").replace(/\s+/g, " ").trim();
  const safeEmail = email.replace(/[<>\s"]/g, "").trim();
  if (safeName && safeEmail) return `${safeName} <${safeEmail}>`;
  if (safeEmail) return `<${safeEmail}>`;
  if (safeName) return safeName;
  return "the sender";
}

function priorPlain(prior: PriorOutboundMessage): string {
  const text = (prior.bodyText ?? "").replace(/\r\n/g, "\n").trim();
  if (text) return text;
  const html = (prior.bodyHtml ?? "").trim();
  return html ? htmlToPlain(html) : "";
}

function priorHtmlFragment(prior: PriorOutboundMessage, plain: string): string {
  const html = (prior.bodyHtml ?? "").trim();
  if (html && /<[a-z!/]/i.test(html)) return fragmentHtml(html);
  return plain ? textToHtml(plain) : "";
}

function buildHtml(newText: string, attribution: string, prior: PriorOutboundMessage, plainPrior: string): string {
  const fresh = `<div dir="ltr">${textToHtml(newText)}</div>`;
  const quoted = priorHtmlFragment(prior, plainPrior);
  if (!quoted) return fresh;
  return (
    `${fresh}<br><div class="gmail_quote gmail_quote_container">` +
    `<div dir="ltr" class="gmail_attr">${escapeHtml(attribution)}<br></div>` +
    `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">` +
    `${quoted}</blockquote></div>`
  );
}

function fragmentHtml(html: string): string {
  return html
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?(?:html|body)\b[^>]*>/gi, "")
    .trim();
}

function textToHtml(text: string): string {
  return escapeHtml(text.replace(/\r\n/g, "\n")).replace(/\n/g, "<br>");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
