/**
 * Reply detection — poll INBOX over IMAP, find new replies, thread them to
 * leads (via In-Reply-To / References against our sent Message-IDs, falling
 * back to from-address matching) and stop future sends for replied leads.
 *
 * Bodies: store plain (`bodyText`) and HTML (`bodyHtml`) separately. Decode
 * quoted-printable as UTF-8 (never latin1 char codes) to avoid mojibake.
 */
import { schema } from "@smartreach/database";
import { parseSenderAddress } from "@smartreach/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { EngineDb, SenderRow } from "./db-port";
import { makeImapClient } from "./mailer";
import {
  classifyOptOut,
  detectAutoReply,
  parseDsn,
  parseHeaderBlock,
  type DsnResult,
  type HeaderMap,
  type OptOutKind,
} from "./inbound-classify";
import { flagSenderPolicyBlock, recordCampaignStop, recordHardBounce } from "./bounces";
import { addSuppression } from "./suppression";
import { attachReplyToOpenRequest, decideInboundAgentStatus, type InboundAgentDecision } from "./lead-conversations";
import { setLeadStatusForEmail, stopCandidatesAfterUnassignedReply, stopLeadAfterReply } from "./lead-outcomes";
import { isPoolSender } from "./pool-allocation";
import {
  DOMAIN_ROUTING_WINDOW_DAYS,
  domainOf,
  insertUnmatchedInbound,
  isOwnMailboxAddress,
  isTriageCandidate,
  loadAddressOwners,
  loadDomainOwners,
  pickUnambiguousOwner,
  routeUnmatched,
  type InboundOwner,
} from "./inbound-routing";
import { RETIRED_SYNC_GRACE_DAYS, shouldSyncMailbox } from "./mailbox-health";

export interface SyncResult {
  checked: number;
  repliesFound: number;
  /** Hard bounces recorded from delivery-status notifications. */
  bounces: number;
  errors: string[];
}

/** Headers fetched with every inbound message (bounce + autoresponder detection). */
const INBOUND_HEADERS = [
  "content-type",
  "auto-submitted",
  "x-autoreply",
  "x-autorespond",
  "x-autoresponse",
  "precedence",
  "x-failed-recipients",
  "x-auto-response-suppress",
  "return-path",
  "list-id",
  "list-unsubscribe",
];

/** Decode quoted-printable octets as UTF-8 (not latin1 / fromCharCode). */
export function decodeQuotedPrintable(input: string): string {
  const soft = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === "=" && i + 2 < soft.length && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(soft.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode common HTML entities (named + numeric) without double-encoding. */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
    })
    .replace(/&#(\d+);/g, (_m, d) => {
      const cp = parseInt(d, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
    })
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** Strip MIME boundary lines and Content-* header lines that leak into parts. */
export function stripMimeNoise(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n");
  // Mid-body MIME boundaries + their Content-* headers
  s = s.replace(/^\s*--[0-9A-Za-z=_-]{8,}.*$/gm, "");
  s = s.replace(/^\s*content-(?:type|transfer-encoding|disposition|id|description):[^\n]*\n/gim, "");
  // Leading header block before first blank line
  if (/^[A-Za-z-]+:\s/m.test(s.slice(0, 400))) {
    const firstBlank = s.search(/\n\n/);
    if (firstBlank > 0) s = s.slice(firstBlank + 2);
  }
  // Do not paste List-Unsubscribe header lines into body
  s = s.replace(/^\s*List-Unsubscribe(?:-Post)?:\s*[^\n]*\n?/gim, "");
  return s.trim();
}

/**
 * Remove compliance / staging leakage from stored reply bodies:
 * - bare unsubscribe token URLs (`/api/unsubscribe?token=` or `/unsubscribe?token=`)
 * - angle-bracketed List-Unsubscribe URLs
 * - trailing SmartReach postal / unsub footers (`-- physical address --`, data-sr-*)
 * Does not invent replacement content.
 */
export function stripLeakageFromBody(body: string): string {
  let s = body;
  // Angle-bracketed List-Unsubscribe style URLs
  s = s.replace(/<https?:\/\/[^>\s]*unsubscribe[^>\s]*>/gi, "");
  // Bare token URLs (staging + prod paths)
  s = s.replace(/https?:\/\/[^\s<>"']*\/api\/unsubscribe\?token=[^\s<>"']+/gi, "");
  s = s.replace(/https?:\/\/[^\s<>"']*\/unsubscribe\?token=[^\s<>"']+/gi, "");
  // Relative token URLs that sometimes leak
  s = s.replace(/(?:^|\s)\/api\/unsubscribe\?token=[^\s<>"']+/gim, "");
  s = s.replace(/(?:^|\s)\/unsubscribe\?token=[^\s<>"']+/gim, "");
  // Compliance footer lines ("Don't want these emails? Unsubscribe: <url>")
  s = s.replace(/Don'?t want these emails\?\s*Unsubscribe:?[^\n]*/gi, "");
  // "Unsubscribe: <url>" plaintext footer line
  s = s.replace(/\n*Unsubscribe:\s*\S*/gi, "");
  // HTML SmartReach unsub / postal blocks
  s = s.replace(/<p[^>]*data-sr-unsub[^>]*>[\s\S]*?<\/p>/gi, "");
  s = s.replace(/<p[^>]*data-sr-postal[^>]*>[\s\S]*?<\/p>/gi, "");
  // Plaintext postal marker + trailing lines until end (auto-appended pattern)
  s = s.replace(/\n*-- physical address --[\s\S]*$/i, "");
  // Collapse leftover blank runs
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/** Convert HTML to plain text for bodyText/snippet when no text part exists. */
export function htmlToPlainText(html: string): string {
  let s = html;
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<blockquote\b[^>]*>/gi, "\n");
  s = s.replace(/<\/blockquote>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeHtmlEntities(s);
  s = s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/**
 * Real markup only. Angle-bracketed addresses (`<hello@krishshah.work>`) are
 * not HTML — treating them as tags made Gmail text/plain win as bodyHtml.
 */
const REAL_HTML =
  /<(?:!doctype|html|body|head|div|p|br|table|thead|tbody|span|a|blockquote|img|td|tr|h[1-6]|ul|ol|li|style|font|center|section|article|meta|b|em|strong|u|pre)\b/i;

function looksLikeHtml(s: string): boolean {
  return REAL_HTML.test(s);
}

const ON_WROTE_LINE = /^On[ \t]+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d).{0,300}\bwrote:\s*$/i;
const INLINE_ATTR = /\bOn[ \t]+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d)[\s\S]{0,400}?\bwrote:/i;
const VOID_TAGS = new Set(["br", "hr", "img", "meta", "link", "input", "source", "wbr"]);

function quoteTail(tail: string): boolean {
  const t = tail.replace(/^(?:\s|<br\s*\/?>|&nbsp;)+/gi, "");
  return t.startsWith(">") || /^&gt;/i.test(t);
}

function looksLikeMailAttribution(attr: string): boolean {
  return /\bwrote:\s*$/i.test(attr) && /\d/.test(attr);
}

/** Drop a Gmail attribution glued onto the reply (`Yes? On Tue … wrote: > yoo >`). */
function stripInlineGluedQuote(text: string): string {
  const m = INLINE_ATTR.exec(text);
  if (!m || m.index == null) return text;
  const before = text.slice(0, m.index).trim();
  const tail = text.slice(m.index + m[0].length);
  if (!before) return text;
  const quoted = quoteTail(tail) || (tail.trim() === "" && looksLikeMailAttribution(m[0]));
  if (!quoted) return text;
  return before;
}

function isQuoteLine(line: string): boolean {
  const t = line.trim();
  return (
    /^>/.test(t) ||
    ON_WROTE_LINE.test(t) ||
    /^-{2,}\s*original message\s*-{2,}$/i.test(t) ||
    /^-{2,}\s*forwarded message\s*-{2,}$/i.test(t) ||
    /^begin forwarded message:\s*$/i.test(t)
  );
}

function isMostlyQuoted(lines: string[], start: number): boolean {
  const rest = lines.slice(start);
  if (rest.length === 0) return false;
  const quoted = rest.filter((l) => !l.trim() || /^\s*>/.test(l) || ON_WROTE_LINE.test(l.trim())).length;
  return quoted / rest.length >= 0.6;
}

function findQuoteStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (ON_WROTE_LINE.test(line)) return i;
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(line)) return i;
    if (/^-{2,}\s*forwarded message\s*-{2,}$/i.test(line)) return i;
    if (/^begin forwarded message:\s*$/i.test(line)) return i;
    if (/^\s*>/.test(lines[i]) && isMostlyQuoted(lines, i)) return i;
  }
  return -1;
}

/**
 * New reply only. Standard `On … wrote:` / `>` quotes and the screenshot shape
 * (reply duplicated around a one-line quote) both reduce to the reply.
 * Quote-only input is left intact so a forward is not stored blank.
 */
function stripQuotedFromPlain(input: string): string {
  const text = input.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
  if (!text) return "";
  const lines = text.split("\n");
  const cut = findQuoteStart(lines);
  if (cut > 0) {
    const body = stripInlineGluedQuote(lines.slice(0, cut).join("\n")).trim();
    return body || text;
  }
  if (cut === 0) {
    const kept: string[] = [];
    let inQuote = true;
    for (const line of lines) {
      if (inQuote) {
        if (!line.trim() || isQuoteLine(line)) continue;
        inQuote = false;
      }
      kept.push(line);
    }
    const bottom = stripInlineGluedQuote(kept.join("\n")).trim();
    return bottom || text;
  }
  const inline = stripInlineGluedQuote(text).trim();
  return inline || text;
}

function findStructuredQuoteStart(html: string): number {
  const re =
    /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>|<blockquote\b|<div\b[^>]*\bid\s*=\s*["'](?:divRplyFwdMsg|appendonsend)["'][^>]*>/i;
  return re.exec(html)?.index ?? -1;
}

function closeDangling(fragment: string): string {
  let s = fragment.replace(/<[^>]*$/, "");
  const open: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const tag = m[1].toLowerCase();
    const token = m[0];
    if (token.startsWith("</")) {
      const idx = open.lastIndexOf(tag);
      if (idx >= 0) open.splice(idx, 1);
    } else if (!token.endsWith("/>") && !VOID_TAGS.has(tag)) {
      open.push(tag);
    }
  }
  while (open.length) s += `</${open.pop()}>`;
  return s;
}

function isQuotePreamble(pre: string): boolean {
  return INLINE_ATTR.test(pre) || /(^|\n)[ \t]*>/.test(pre);
}

/**
 * bodyHtml is what Unibox prefers for the bubble. Drop a text/plain quote
 * chain that was concatenated in front of the HTML part, and cut a glued
 * `On … wrote:` out of the reply fragment. Keep the structured quote block
 * (`gmail_quote` / blockquote) so "Show quoted text" still has the prior mail.
 */
function cleanReplyHtml(html: string): string {
  if (!html || !looksLikeHtml(html)) return "";
  let s = html.replace(/\r\n/g, "\n");
  const tagAt = REAL_HTML.exec(s)?.index ?? -1;
  if (tagAt > 0) {
    const pre = s.slice(0, tagAt);
    const rest = s.slice(tagAt);
    const preReply = stripQuotedFromPlain(pre).replace(/\s+/g, " ").trim();
    const headEnd = findStructuredQuoteStart(rest);
    const head = headEnd > 0 ? rest.slice(0, headEnd) : rest;
    const htmlReply = stripQuotedFromPlain(htmlToPlainText(head)).replace(/\s+/g, " ").trim();
    if (isQuotePreamble(pre) || (preReply.length > 0 && preReply === htmlReply)) s = rest;
  }
  const q = findStructuredQuoteStart(s);
  if (q > 0) {
    const head = closeDangling(stripInlineGluedQuote(s.slice(0, q)).trimEnd());
    return `${head}${s.slice(q)}`.trim();
  }
  if (INLINE_ATTR.test(s)) return closeDangling(stripInlineGluedQuote(s).trim());
  return s.trim();
}

function getRawPart(msg: any, ...keys: string[]): string {
  for (const k of keys) {
    const buf = msg.bodyParts?.get?.(k);
    if (!buf) continue;
    // QP/base64 payloads are ASCII; utf8 is safe. Already-decoded UTF-8 parts stay correct.
    const v = typeof buf === "string" ? buf : Buffer.isBuffer(buf) ? buf.toString("utf8") : buf.toString?.("utf8") ?? buf.toString?.() ?? "";
    if (v) return v;
  }
  return "";
}

/**
 * QP soft line breaks: an "=" at the end of a line that is at the encoder's
 * wrap width (75/76 chars). Plain text rarely ends a long line with "=".
 */
export function hasQpSoftBreaks(s: string): boolean {
  const lines = s.replace(/\r\n/g, "\n").split("\n");
  let hits = 0;
  for (const line of lines) {
    if (line.endsWith("=") && line.length >= 70 && line.length <= 77) hits++;
  }
  return hits > 0;
}

function classifyPart(raw: string): { kind: "html" | "text" | "empty"; content: string } {
  if (!raw || !raw.trim()) return { kind: "empty", content: "" };
  let s = stripMimeNoise(raw);
  // Detect CTE before decoding if header leaked
  const cteMatch = raw.match(/content-transfer-encoding:\s*([^\r\n]+)/i);
  const cte = (cteMatch?.[1] ?? "").trim().toLowerCase();
  if (cte.includes("quoted-printable") || /=[0-9A-Fa-f]{2}/.test(s) || hasQpSoftBreaks(s)) {
    s = decodeQuotedPrintable(s);
  } else if (cte.includes("base64")) {
    try {
      s = Buffer.from(s.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      /* keep as-is */
    }
  }
  s = stripMimeNoise(s);
  // Keep HTML entities in markup. Decoding `&lt;user@host&gt;` turns the address into a tag.
  if (looksLikeHtml(s)) return { kind: "html", content: s };
  return { kind: "text", content: decodeHtmlEntities(s) };
}

function splitHeaderBody(raw: string): { headers: string; body: string } | null {
  const normalized = raw.replace(/\r\n/g, "\n");
  const idx = normalized.indexOf("\n\n");
  if (idx < 0) return null;
  const headers = normalized.slice(0, idx);
  if (!/^(?:content-type|content-transfer-encoding|content-disposition|mime-version)\s*:/im.test(headers)) return null;
  return { headers, body: normalized.slice(idx + 2) };
}

function boundaryToken(line: string): string | null {
  let core = line.trim();
  if (core.endsWith("--") && core.length > 4) {
    const withoutClose = core.slice(0, -2);
    if (withoutClose.startsWith("--")) core = withoutClose;
  }
  const m = core.match(/^--([A-Za-z0-9'()_+,./:=?-]{6,70})$/);
  return m ? m[1] : null;
}

/** BODY[TEXT] starts at the first MIME boundary and does not include the top headers. */
function detectTopBoundary(raw: string): string | null {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const first = lines.find((l) => l.trim().length > 0);
  if (!first) return null;
  const boundary = boundaryToken(first);
  if (!boundary) return null;
  let count = 0;
  for (const line of lines) {
    if (boundaryToken(line) === boundary) count++;
  }
  return count >= 2 ? boundary : null;
}

function splitByBoundary(raw: string, boundary: string): string[] {
  const marker = `--${boundary}`;
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let buf: string[] | null = null;
  for (const line of lines) {
    if (boundaryToken(line) === boundary) {
      if (buf && buf.some((l) => l.trim())) parts.push(buf.join("\n"));
      buf = line.trim() === `${marker}--` ? null : [];
      continue;
    }
    if (buf) buf.push(line);
  }
  if (buf && buf.some((l) => l.trim())) parts.push(buf.join("\n"));
  return parts;
}

function decodeLeaf(raw: string): { contentType: string; content: string } {
  const split = splitHeaderBody(raw);
  if (!split) return { contentType: "", content: raw.trim() };
  const contentType = (split.headers.match(/content-type:\s*([^;\n]+)/i)?.[1] ?? "").trim().toLowerCase();
  const cte = (split.headers.match(/content-transfer-encoding:\s*([^\n]+)/i)?.[1] ?? "").trim().toLowerCase();
  let body = split.body;
  if (cte.includes("quoted-printable")) body = decodeQuotedPrintable(body);
  else if (cte.includes("base64")) {
    try {
      body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      /* keep as-is */
    }
  }
  return { contentType, content: body.trim() };
}

/**
 * imapflow `bodyParts: ["text"]` is BODY[TEXT]: the whole multipart body, plain
 * then html, with no top-level Content-Type. Classifying that blob as one HTML
 * part prepends the text/plain quote chain onto the reply div.
 */
function absorbMime(raw: string, into: { text: string; html: string }, depth: number) {
  if (depth > 6 || !raw.trim() || (into.text && into.html)) return;
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  const split = splitHeaderBody(normalized);
  const topCt = split ? (split.headers.match(/content-type:\s*([^;\n]+)/i)?.[1] ?? "").trim().toLowerCase() : "";
  const boundaryParam = split?.headers.match(/boundary\s*=\s*"?([^";\s]+)"?/i)?.[1];

  if (boundaryParam && topCt.includes("multipart/")) {
    for (const part of splitByBoundary(split ? split.body : normalized, boundaryParam)) {
      absorbMime(part, into, depth + 1);
      if (into.text && into.html) return;
    }
    return;
  }

  const topBoundary = detectTopBoundary(normalized);
  if (topBoundary) {
    for (const part of splitByBoundary(normalized, topBoundary)) {
      absorbMime(part, into, depth + 1);
      if (into.text && into.html) return;
    }
    return;
  }

  const leaf = decodeLeaf(normalized);
  if (leaf.contentType.includes("text/html")) {
    if (!into.html) into.html = leaf.content;
    return;
  }
  if (leaf.contentType.includes("text/plain")) {
    if (!into.text) into.text = leaf.content;
    return;
  }
  if (leaf.contentType && !leaf.contentType.startsWith("text/")) return;

  const classified = classifyPart(leaf.content);
  if (classified.kind === "html" && !into.html) into.html = classified.content;
  else if (classified.kind === "text" && !into.text) into.text = classified.content;
}

/**
 * Pull text + html body parts separately from an imapflow message.
 * Leaf MIME parts win over BODY[TEXT]. A multipart blob is split, never stored whole.
 */
export function extractTextAndHtml(msg: any): { text: string; html: string } {
  const into = { text: "", html: "" };

  // Single-part messages: BODY[TEXT] has no MIME headers, so the transfer
  // encoding only exists in the BODYSTRUCTURE. Decode with it when present.
  const bs = msg.bodyStructure;
  if (bs && !Array.isArray(bs.childNodes) && typeof bs.type === "string" && bs.type.startsWith("text/")) {
    const raw = getRawPart(msg, "text", "1");
    if (raw) {
      const enc = String(bs.encoding || "").toLowerCase();
      let body = raw;
      if (enc === "quoted-printable") body = decodeQuotedPrintable(raw);
      else if (enc === "base64") {
        try {
          body = Buffer.from(raw.replace(/\s+/g, ""), "base64").toString("utf8");
        } catch {
          body = raw;
        }
      }
      if (bs.type === "text/html") into.html = body.trim();
      else into.text = decodeHtmlEntities(body).trim();
      if (into.text || into.html) return into;
    }
  }

  // Numbered leaves before "text" (BODY[TEXT]), which is the raw multipart body.
  for (const key of ["1.1", "1.2", "1.1.1", "1.1.2", "2.1", "2.2", "1", "2", "text"]) {
    const raw = getRawPart(msg, key);
    if (!raw) continue;
    absorbMime(raw, into, 0);
    if (into.text && into.html) break;
  }
  return into;
}

export interface PreparedBodies {
  bodyText: string;
  bodyHtml: string;
  snippet: string;
}

/**
 * Normalize, strip leakage, keep the new reply in the fields Unibox shows.
 * `bodyText` / snippet are the reply only (list preview collapses whitespace,
 * so a quoted chain here becomes the glued bubble string). `bodyHtml` keeps a
 * structured quote block for "Show quoted text" and does not repeat the reply
 * around that quote.
 */
export function prepareReplyBodies(rawText: string, rawHtml: string): PreparedBodies {
  const leakedText = stripLeakageFromBody(rawText.trim());
  const leakedHtml = stripLeakageFromBody(rawHtml.trim());
  const bodyHtml = (looksLikeHtml(leakedHtml) ? cleanReplyHtml(leakedHtml) : "").slice(0, 100_000);
  let bodyText = leakedText;
  if (!bodyText && leakedHtml) bodyText = stripLeakageFromBody(htmlToPlainText(leakedHtml));
  bodyText = stripQuotedFromPlain(bodyText).slice(0, 50_000);
  const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 280);
  return { bodyText, bodyHtml, snippet };
}

/**
 * Sync one sender's inbox. Returns count of new replies recorded; on a shared
 * pool mailbox those belong to many customers, so `foundByOwner` splits the
 * count by the customer each reply was filed under (#70).
 */
export async function syncSenderReplies(
  db: EngineDb,
  sender: SenderRow,
): Promise<{ found: number; foundByOwner: Record<string, number>; bounces?: number; error?: string }> {
  const foundByOwner: Record<string, number> = {};
  if (!sender.imapHost || !sender.imapPasswordEnc) return { found: 0, foundByOwner };
  let found = 0;
  let bounces = 0;
  const countOwner = (ownerId: string) => {
    foundByOwner[ownerId] = (foundByOwner[ownerId] ?? 0) + 1;
  };
  let client: any = null;
  let closed = false;
  try {
    client = makeImapClient(sender);
    await client.connect();
    await client.mailboxOpen("INBOX");

    // Look back since last sync (minus an hour), up to 30 days, so replies
    // that arrived during a longer outage are still read (dedup is by
    // sender + Message-ID).
    const since = sender.lastSyncAt
      ? new Date(Math.max(Date.parse(sender.lastSyncAt) - 3_600_000, Date.now() - 30 * 86_400_000))
      : new Date(Date.now() - 7 * 86_400_000);

    const uids = await client.search({ since }, { uid: true });
    const list = (Array.isArray(uids) ? uids : []).slice(-200); // cap per poll
    if (list.length > 0) {
      for await (const msg of client.fetch(
        list,
        // Fetch text + common multipart part numbers for text/html split
        {
          uid: true,
          envelope: true,
          bodyStructure: true,
          headers: INBOUND_HEADERS,
          bodyParts: ["text", "1", "1.1", "1.2", "2", "2.1", "2.2"],
        },
        { uid: true },
      )) {
        try {
          const outcome = await processInboundMessage(db, sender, msg, countOwner);
          if (outcome === "reply") found++;
          else if (outcome === "bounce") bounces++;
        } catch (err) {
          console.error(`[sync] record reply failed for sender ${sender.id}`, err);
        }
      }
    }
    await client.logout();
    closed = true;
    const syncedAt = new Date().toISOString();
    await db
      .update(schema.senderAccounts)
      .set({ lastSyncAt: syncedAt, imapStatus: "ok", imapFailCount: 0, imapAttemptedAt: syncedAt })
      .where(eq(schema.senderAccounts.id, sender.id));
    return { found, foundByOwner, bounces };
  } catch (err: any) {
    const message = String(err?.responseText || err?.message || "IMAP sync failed");
    const isAuthFailure = /auth|login|credential|AUTHENTICATIONFAILED/i.test(message);
    // A failed login is retried with backoff (shouldSyncMailbox), never dropped for good.
    await db
      .update(schema.senderAccounts)
      .set({
        imapStatus: isAuthFailure ? "failed" : "error",
        imapFailCount: (Number(sender.imapFailCount) || 0) + 1,
        imapAttemptedAt: new Date().toISOString(),
      })
      .where(eq(schema.senderAccounts.id, sender.id));
    return { found, foundByOwner, bounces, error: message };
  } finally {
    if (!closed && client) {
      try {
        if (client.usable) {
          await client.logout();
        } else if (typeof client.close === "function") {
          client.close();
        }
      } catch {
        /* noop */
      }
    }
  }
}

export type InboundSentimentTag = "out_of_office" | "not_interested" | "interested" | null;

export function classifyReplyTag(subject: string, bodyText: string): InboundSentimentTag {
  const combined = `${subject || ""}\n${bodyText || ""}`.toLowerCase();

  // 1. Out-of-office / auto-responder detection
  if (
    /out of (?:the )?office/i.test(combined) ||
    /\bauto(?:-)?reply\b/i.test(combined) ||
    /\bautomatic reply\b/i.test(combined) ||
    /\baway from (?:my |the )?desk\b/i.test(combined) ||
    /\bon vacation\b/i.test(combined) ||
    /\bon leave\b/i.test(combined) ||
    /\bwill return (?:on|by)\b/i.test(combined) ||
    /\bback in (?:the )?office\b/i.test(combined) ||
    /\blimited access to (?:my )?email\b/i.test(combined)
  ) {
    return "out_of_office";
  }

  // 2. Negative sentiment / unsubscribe / opt-out
  if (
    /\bunsubscribe\b/i.test(combined) ||
    /\bremove me\b/i.test(combined) ||
    /\bdo not contact\b/i.test(combined) ||
    /\bdon't contact\b/i.test(combined) ||
    /\bstop emailing\b/i.test(combined) ||
    /\bstop contacting\b/i.test(combined) ||
    /\bnot interested\b/i.test(combined) ||
    /\btake me off\b/i.test(combined) ||
    /\bno thanks\b/i.test(combined) ||
    /\bno thank you\b/i.test(combined) ||
    /\bplease remove\b/i.test(combined) ||
    /\bspam\b/i.test(combined) ||
    /\blose my (?:number|email)\b/i.test(combined) ||
    /\bcease and desist\b/i.test(combined)
  ) {
    return "not_interested";
  }

  // 3. Positive sentiment / interested / meeting
  if (
    /\binterested\b/i.test(combined) ||
    /\blet's talk\b/i.test(combined) ||
    /\blet's chat\b/i.test(combined) ||
    /\bschedule a call\b/i.test(combined) ||
    /\bbook a call\b/i.test(combined) ||
    /\bsounds good\b/i.test(combined) ||
    /\bsend more info\b/i.test(combined) ||
    /\bdemo\b/i.test(combined) ||
    /\bpricing\b/i.test(combined) ||
    /\bavailable (?:at|on|tomorrow|next week|monday|tuesday|wednesday|thursday|friday)\b/i.test(combined) ||
    /\bcalendly\.com\b/i.test(combined)
  ) {
    return "interested";
  }

  return null;
}

/**
 * Tag and opt-out for one inbound message. Autoresponders (detected from
 * headers) are always out_of_office and never an opt-out, so boilerplate
 * can't unsubscribe anyone. For a message a person wrote, opt-out wording
 * wins over "on leave"/"on vacation": "I'm on leave, please remove me" is an
 * opt-out, not an out-of-office.
 */
export function resolveInboundClassification(input: {
  auto: boolean;
  subject: string;
  body: string;
}): { tag: InboundSentimentTag; optOut: OptOutKind } {
  if (input.auto) return { tag: "out_of_office", optOut: null };
  const optOut = classifyOptOut(input.subject ?? "", input.body ?? "");
  if (optOut) return { tag: "not_interested", optOut };
  return { tag: classifyReplyTag(input.subject ?? "", input.body ?? ""), optOut: null };
}

/** Raw BODY[TEXT] (whole body, all MIME parts) for report parsing. */
function rawBodyText(msg: any): string {
  return getRawPart(msg, "text", "1", "2");
}

export type InboundOutcome = "reply" | "bounce" | "ignored";

/**
 * Handle one inbound message: bounces are recorded as bounces (never as a
 * reply, never sent to the agent, never held against the mailbox); everything
 * else goes through reply recording.
 */
async function processInboundMessage(
  db: EngineDb,
  sender: SenderRow,
  msg: any,
  onRecorded?: (ownerId: string) => void,
): Promise<InboundOutcome> {
  const env = msg.envelope ?? {};
  const fromEmail = String(env.from?.[0]?.address ?? "").toLowerCase();
  if (!fromEmail || fromEmail === sender.email.toLowerCase()) return "ignored"; // skip self
  const headers = parseHeaderBlock(msg.headers);
  const dsn = parseDsn({ fromEmail, subject: env.subject ?? "", headers, body: rawBodyText(msg) });
  if (dsn) return (await handleDsn(db, sender, env, dsn)) ? "bounce" : "ignored";
  return (await recordReplyIfNew(db, sender, msg, headers, onRecorded)) ? "reply" : "ignored";
}

/**
 * Record permanent failures from a DSN. Transient (4.x.x / delayed) reports
 * are ignored. Only a dead address (DsnRecipient.hardBounce) is suppressed
 * globally; other permanent refusals stop the lead in that campaign only.
 */
export async function handleDsn(db: EngineDb, sender: SenderRow, env: any, dsn: DsnResult): Promise<boolean> {
  const refs: string[] = [...dsn.originalMessageIds];
  if (env.inReplyTo) refs.push(env.inReplyTo);
  if (typeof env.references === "string") refs.push(...env.references.split(/\s+/).filter(Boolean));
  let recorded = false;
  for (const r of dsn.recipients) {
    if (!r.permanent) continue;
    let job: any | undefined;
    if (refs.length > 0) {
      const rows: any[] = await db
        .select()
        .from(schema.emailJobs)
        .where(and(eq(schema.emailJobs.senderId, sender.id), inArray(schema.emailJobs.messageId, refs)))
        .limit(5);
      job = rows.find((j) => String(j.toEmail).toLowerCase() === r.email);
    }
    if (!job) {
      const rows: any[] = await db
        .select()
        .from(schema.emailJobs)
        .where(
          and(
            eq(schema.emailJobs.senderId, sender.id),
            eq(schema.emailJobs.toEmail, r.email),
            inArray(schema.emailJobs.status, ["sent", "bounced"]),
          ),
        )
        .orderBy(desc(schema.emailJobs.sentAt))
        .limit(1);
      job = rows[0];
    }
    if (!job) continue; // not one of ours
    const leads: any[] = await db.select().from(schema.leads).where(eq(schema.leads.id, job.leadId)).limit(1);
    const lead = leads[0];
    if (!r.hardBounce) {
      // Permanent but not a dead address (5.7.x policy/spam/DMARC, 5.2.2
      // mailbox full, generic 5.0.0): stop this lead in this campaign only,
      // never a global suppression. Policy blocks count against the mailbox.
      const fresh = await recordCampaignStop(db, {
        email: r.email,
        leadId: job.leadId,
        jobId: job.id,
        campaignId: job.campaignId,
        ownerUserId: lead?.userId || sender.userId,
        status: r.status,
        diagnostic: r.diagnostic,
        via: "dsn",
      });
      if (fresh && r.policy) {
        await flagSenderPolicyBlock(db, {
          senderId: sender.id,
          senderUserId: sender.userId,
          senderEmail: sender.email,
          status: r.status,
          diagnostic: r.diagnostic,
          via: "dsn",
        });
      }
      recorded = true;
      continue;
    }
    await recordHardBounce(db, {
      email: r.email,
      leadId: job.leadId,
      jobId: job.id,
      campaignId: job.campaignId,
      ownerUserId: lead?.userId || sender.userId,
      workspaceId: lead?.workspaceId ?? null,
      status: r.status,
      diagnostic: r.diagnostic,
      via: "dsn",
    });
    recorded = true;
  }
  return recorded;
}

/**
 * The workspace an inbound reply is filed under: the lead's, else (for a
 * dedicated mailbox only) the mailbox's. A shared pool mailbox's workspace is
 * never the customer's, so it is never used.
 */
export function replyOwnerWorkspaceId(
  lead: { workspaceId?: string | null } | null | undefined,
  sender: object,
): string | null {
  const s = sender as { isSystemPool?: boolean | null; workspaceId?: string | null };
  return lead?.workspaceId || (s.isSystemPool ? null : s.workspaceId) || null;
}

/**
 * `onRecorded` is told which customer a recorded reply was filed under, so a
 * shared pool mailbox's sync can report each customer only their own (#70).
 */
export async function recordReplyIfNew(
  db: EngineDb,
  sender: SenderRow,
  msg: any,
  headers: HeaderMap = {},
  onRecorded?: (ownerId: string) => void,
): Promise<boolean> {
  const env = msg.envelope ?? {};
  const fromRaw: string = env.from?.[0]?.address ?? "";
  const from = parseSenderAddress(fromRaw ? `${env.from?.[0]?.name ?? ""} <${fromRaw}>` : "");
  const fromEmail = (env.from?.[0]?.address ?? from.email ?? "").toLowerCase();
  if (!fromEmail || fromEmail === sender.email.toLowerCase()) return false; // skip self

  const messageId: string | null = env.messageId ?? null;
  if (messageId) {
    const dup: { id: string }[] = await db
      .select({ id: schema.replies.id })
      .from(schema.replies)
      .where(and(eq(schema.replies.senderId, sender.id), eq(schema.replies.messageId, messageId)))
      .limit(1);
    if (dup.length > 0) return false;
  }

  // Thread to a lead: In-Reply-To/References → our sent job's messageId → lead;
  // else fall back to "we sent this address something from this sender".
  const refs: string[] = [];
  if (env.inReplyTo) refs.push(env.inReplyTo);
  if (typeof env.references === "string") refs.push(...env.references.split(/\s+/));

  let lead: any | undefined;
  let campaignId: string | null = null;

  if (refs.length > 0) {
    const jobs: any[] = await db
      .select()
      .from(schema.emailJobs)
      .where(and(eq(schema.emailJobs.senderId, sender.id), inArray(schema.emailJobs.messageId, refs)))
      .orderBy(desc(schema.emailJobs.sentAt))
      .limit(1);
    if (jobs[0]) {
      campaignId = jobs[0].campaignId;
      const rows = await db.select().from(schema.leads).where(eq(schema.leads.id, jobs[0].leadId)).limit(1);
      lead = rows[0];
    }
  }

  const { text, html } = extractTextAndHtml(msg);
  const bodies = prepareReplyBodies(text, html);
  const receivedAt = (env.date ? new Date(env.date) : new Date()).toISOString();
  const subject: string = env.subject ?? "";
  const fromName: string = from.name || env.from?.[0]?.name || "";
  const isPool = isPoolSender(sender);
  const unmatched = {
    senderId: sender.id,
    messageId,
    fromEmail,
    fromName,
    subject,
    snippet: bodies.snippet,
    bodyText: bodies.bodyText,
    bodyHtml: bodies.bodyHtml,
    receivedAt,
  };

  if (!lead) {
    // From fallback: a customer who sent this exact address mail from this
    // mailbox. Pool mailboxes send for every customer, so it is used only
    // when exactly one customer did (#69); otherwise an admin decides.
    const owners = await loadAddressOwners(db, sender.id, fromEmail);
    const owner = pickUnambiguousOwner(owners);
    if (owner) {
      campaignId = owner.campaignId;
      const rows = owner.leadId
        ? await db.select().from(schema.leads).where(eq(schema.leads.id, owner.leadId)).limit(1)
        : [];
      lead = rows[0];
    } else if (owners.length > 1) {
      // Never guess between customers, but the opt-out and stop guards
      // still apply now, before an admin picks one (fail closed).
      let guardError: unknown = null;
      try {
        await guardUnassignedReply(db, { owners, fromEmail, headers, subject, bodyText: bodies.bodyText });
      } catch (err) {
        guardError = err;
      }
      if (isPool) {
        await insertUnmatchedInbound(db, {
          ...unmatched,
          candidateUserIds: owners.map((o) => o.userId),
          reason: "ambiguous_owner",
        });
      }
      if (guardError) throw guardError;
      return false;
    }
  }
  if (!lead) {
    if (!isPool) return false; // not a campaign recipient — ignore
    // A new contact on a pool mailbox (#68): route to the one customer who
    // emailed that company from this mailbox recently, else queue for triage.
    const autoReply = detectAutoReply(headers, subject);
    const candidate = isTriageCandidate({
      headers,
      subject,
      bodyText: bodies.bodyText,
      fromEmail,
      autoReply: autoReply.auto,
      isOwnMailbox: await isOwnMailboxAddress(db, fromEmail),
    });
    if (!candidate) return false;
    const domain = domainOf(fromEmail);
    const since = new Date(Date.now() - DOMAIN_ROUTING_WINDOW_DAYS * 86_400_000).toISOString();
    const route = routeUnmatched({ domain, owners: await loadDomainOwners(db, sender.id, domain, since) });
    if (route.kind === "triage") {
      await insertUnmatchedInbound(db, { ...unmatched, candidateUserIds: route.candidateUserIds, reason: "no_match" });
      return false;
    }
    const routed = await recordRoutedReply(db, {
      sender,
      ownerId: route.owner.userId,
      workspaceId: route.owner.workspaceId ?? null,
      campaignId: route.owner.campaignId ?? null,
      lead: null,
      from: { name: fromName, email: fromEmail },
      subject,
      bodies,
      messageId,
      receivedAt,
      headers,
      routed: "domain",
    });
    if (routed !== null) onRecorded?.(route.owner.userId);
    return routed !== null;
  }

  // Shared-pool mailboxes are owned by the platform admin, but the reply
  // belongs to whoever owns the lead/campaign. Attribute everything to the
  // lead owner so the client sees it in their UniBox (not the admin).
  const ownerId: string = (lead as any)?.userId || sender.userId;
  const recorded = await recordRoutedReply(db, {
    sender,
    ownerId,
    workspaceId: replyOwnerWorkspaceId(lead, sender),
    campaignId,
    lead,
    from: { name: fromName, email: fromEmail },
    subject,
    bodies,
    messageId,
    receivedAt,
    headers,
  });
  if (recorded !== null) onRecorded?.(ownerId);
  return recorded !== null;
}

/**
 * A reply from an address several customers emailed from this mailbox goes to
 * admin triage unrecorded (#69). Until then: "remove me" and spam complaints
 * are suppressed globally right away (one row per candidate, like any reply
 * opt-out), and every candidate's open sends to the person stop per Stop on
 * reply (all of them for an opt-out). Automatic replies and out-of-office
 * stop nothing, as for a recorded reply. Every step is attempted; the first
 * error is rethrown.
 */
export async function guardUnassignedReply(
  db: EngineDb,
  input: { owners: InboundOwner[]; fromEmail: string; headers: HeaderMap; subject: string; bodyText: string },
): Promise<void> {
  const autoReply = detectAutoReply(input.headers ?? {}, input.subject ?? "");
  const { tag, optOut } = resolveInboundClassification({
    auto: autoReply.auto,
    subject: input.subject ?? "",
    body: input.bodyText ?? "",
  });
  if (tag === "out_of_office") return;
  let failure: unknown = null;
  if (optOut === "unsubscribe" || optOut === "complaint") {
    const seen = new Set<string>();
    for (const owner of input.owners) {
      if (!owner.userId || seen.has(owner.userId)) continue;
      seen.add(owner.userId);
      try {
        await addSuppression(db, {
          userId: owner.userId,
          workspaceId: owner.workspaceId ?? null,
          email: input.fromEmail,
          source: optOut,
          reason: optOut === "unsubscribe" ? "Asked to be removed (reply)" : "Spam complaint (reply)",
        });
      } catch (err) {
        failure ??= err;
      }
    }
  }
  try {
    await stopCandidatesAfterUnassignedReply(db, {
      ownerIds: input.owners.map((o) => o.userId),
      email: input.fromEmail,
      optOut: optOut !== null,
      nowIso: new Date().toISOString(),
    });
  } catch (err) {
    failure ??= err;
  }
  if (failure) throw failure;
}

/** Shown on a reply from someone who wrote in fresh (not a lead's reply). */
export const NEW_CONTACT_AGENT_SUMMARY =
  "Wrote in without replying to an email we sent. The agent does not answer these; reply from the Inbox.";

export interface RoutedReplyInput {
  sender: SenderRow;
  /** The customer the message belongs to. */
  ownerId: string;
  workspaceId: string | null;
  campaignId: string | null;
  /** The lead it threads to; null for a new contact (routed only). */
  lead: { id: string; email?: string | null; userId?: string; workspaceId?: string | null } | null;
  from: { name: string; email: string };
  subject: string;
  bodies: PreparedBodies;
  messageId: string | null;
  receivedAt: string;
  headers?: HeaderMap;
  /**
   * Set when the message did not thread to one of our emails: routed by
   * domain (one customer emailed that company) or assigned by an admin. The
   * agent never answers these.
   */
  routed?: "domain" | "admin";
}

/**
 * Record an inbound message for its customer: the reply row, the Inbox copy,
 * opt-out suppression and (when it belongs to a lead) stopping that person's
 * campaigns. Returns null when it was already recorded.
 */
export async function recordRoutedReply(db: EngineDb, input: RoutedReplyInput): Promise<{ replyId: string } | null> {
  const { sender, ownerId, campaignId, messageId, receivedAt, routed } = input;
  const headers = input.headers ?? {};
  const fromEmail = String(input.from.email ?? "").trim().toLowerCase();
  const fromName = input.from.name ?? "";
  const subject = input.subject ?? "";
  const { bodyText, bodyHtml, snippet } = input.bodies;
  let lead = input.lead;
  if (!lead && routed) {
    // A known person writing in fresh: the owner may already have them as a lead.
    const rows: any[] = await db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.userId, ownerId),
          sql`lower(${schema.leads.email}) = ${fromEmail}`,
          isNull(schema.leads.deletedAt),
        ),
      )
      .orderBy(desc(schema.leads.createdAt))
      .limit(1);
    lead = rows[0] ?? null;
  }
  if (!lead && !routed) return null;
  const ownerWorkspaceId: string | null = (routed && lead?.workspaceId) || input.workspaceId || null;
  const nowS = new Date().toISOString();
  const replyId = crypto.randomUUID();
  // Autoresponders (RFC 3834 headers, OOO subjects) are tagged out_of_office
  // and never answered by the agent.
  const autoReply = detectAutoReply(headers, subject);
  // bodyText is already quote-stripped, so our own quoted email can't opt anyone out.
  const { tag: classifiedTag, optOut } = resolveInboundClassification({
    auto: autoReply.auto,
    subject,
    body: bodyText,
  });

  // Campaigns whose conversations the agent handles ("Lead conversations")
  // hand the message to the agent; automatic replies are recorded as skipped
  // and a message in a conversation waiting on you joins its open card.
  // Routed messages (no reply to our email) are never answered by the agent.
  const agentDecision: InboundAgentDecision =
    routed || !lead
      ? { agentStatus: "skipped", agentIntent: "new_contact", agentSummary: NEW_CONTACT_AGENT_SUMMARY }
      : await decideInboundAgentStatus(db, {
          campaignId,
          leadId: lead.id,
          autoReplyAuto: autoReply.auto,
          autoReason: autoReply.reason,
          classifiedTag,
        });
  const agentStatus = agentDecision.agentStatus;
  const agentSkip = agentDecision.agentSummary
    ? { agentIntent: agentDecision.agentIntent, agentSummary: agentDecision.agentSummary, agentHandledAt: nowS }
    : {};

  try {
    await db.insert(schema.replies).values({
      id: replyId,
      userId: ownerId,
      senderId: sender.id,
      leadId: lead?.id ?? null,
      campaignId,
      fromName,
      fromEmail,
      subject,
      snippet,
      bodyText,
      bodyHtml,
      messageId,
      receivedAt,
      tag: classifiedTag,
      agentStatus,
      ...agentSkip,
    });
  } catch {
    return null; // unique constraint — already recorded concurrently
  }
  if (agentDecision.attachToRequestId) {
    try {
      await attachReplyToOpenRequest(db, agentDecision.attachToRequestId, replyId, nowS);
    } catch {
      // non-fatal: the reply is escalated, so it still shows as waiting on you
    }
  }

  // Dual-write to unibox_messages for inbound record
  try {
    await db.insert(schema.uniboxMessages).values({
      id: crypto.randomUUID(),
      userId: ownerId,
      workspaceId: ownerWorkspaceId,
      replyId,
      leadId: lead?.id ?? null,
      campaignId,
      senderId: sender.id,
      direction: "inbound",
      fromRole: "lead",
      fromName,
      fromEmail,
      subject,
      bodyText,
      bodyHtml,
      sentAt: receivedAt,
    });
  } catch {
    // non-fatal
  }

  // If Out-Of-Office: do NOT stop the sequence or cancel pending jobs
  if (classifiedTag === "out_of_office") {
    await db.insert(schema.activityLogs).values({
      id: crypto.randomUUID(),
      userId: ownerId,
      type: "out_of_office_received",
      message: `${fromEmail} sent out-of-office auto-reply (sequence kept active)`,
      campaignId,
    });
    return { replyId };
  }

  // Opt-outs: "remove me" is an unsubscribe and a spam complaint is a
  // complaint — both global, so no client mails this person again. A plain
  // "not interested" only stops this client, and is labelled as such on the
  // Blocklist ('not_interested', not 'manual'). (optOut comes from
  // resolveInboundClassification above.)
  if (optOut) {
    try {
      await addSuppression(db, {
        userId: ownerId,
        workspaceId: ownerWorkspaceId,
        email: fromEmail,
        source: optOut,
        reason:
          optOut === "unsubscribe"
            ? "Asked to be removed (reply)"
            : optOut === "complaint"
              ? "Spam complaint (reply)"
              : "Replied not interested",
      });
    } catch {
      // non-fatal
    }
  }

  // Stop future sends & mark statuses for the person (every lead row of
  // theirs for this owner), per each campaign's "Stop on reply" (#30, #36).
  // A new contact has no lead and nothing to stop.
  if (lead) {
    await stopLeadAfterReply(db, {
      ownerId,
      email: lead.email || fromEmail,
      leadId: lead.id,
      campaignId,
      optOut: optOut !== null,
      nowIso: nowS,
    });
  }
  // "Remove me" and spam complaints: every lead row of this person for this
  // owner reads Unsubscribed, not Replied. The suppression row above is what
  // stops sends; this only tidies the status, so a failure is logged.
  if (optOut === "unsubscribe" || optOut === "complaint") {
    try {
      await setLeadStatusForEmail(db, {
        ownerId,
        email: lead?.email || fromEmail,
        status: "unsubscribed",
        nowIso: nowS,
      });
    } catch (err) {
      console.error("[sync-replies] marking the lead unsubscribed failed", fromEmail, err);
    }
  }
  await db
    .update(schema.senderAccounts)
    .set({ repliedCount: sql`${schema.senderAccounts.repliedCount} + 1` })
    .where(eq(schema.senderAccounts.id, sender.id));
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId: ownerId,
    type: "reply_received",
    message: lead
      ? `${fromEmail} replied via ${sender.email}`
      : `${fromEmail} wrote in to ${sender.email} (new contact)`,
    campaignId,
  });
  return { replyId };
}

/**
 * Read every mailbox with an inbox: paused ones too (their replies must still
 * stop sequences), retired ones for RETIRED_SYNC_GRACE_DAYS, and ones whose
 * login failed once the retry backoff has passed (shouldSyncMailbox).
 */
export async function syncTick(db: EngineDb, now: Date = new Date()): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, repliesFound: 0, bounces: 0, errors: [] };
  const retiredCutoff = new Date(now.getTime() - RETIRED_SYNC_GRACE_DAYS * 86_400_000).toISOString();
  const candidates: SenderRow[] = await db
    .select()
    .from(schema.senderAccounts)
    .where(
      sql`${schema.senderAccounts.imapHost} != '' and (${schema.senderAccounts.deletedAt} is null or ${schema.senderAccounts.deletedAt} > ${retiredCutoff})`
    );
  const senders = candidates.filter((s) => shouldSyncMailbox(s as SenderRow & { deletedAt?: string | null }, now));

  const syncWithTimeout = async (s: SenderRow) => {
    return Promise.race([
      syncSenderReplies(db, s),
      new Promise<{ found: number; bounces?: number; error?: string }>((_, reject) =>
        setTimeout(() => reject(new Error("IMAP sync timeout (10s)")), 10000)
      ),
    ]).catch((err): { found: number; bounces?: number; error?: string } => {
      return { found: 0, error: String(err?.message || err) };
    });
  };

  const outcomes = await Promise.allSettled(senders.map((s) => syncWithTimeout(s)));
  result.checked = senders.length;
  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    const s = senders[i];
    if (outcome.status === "fulfilled") {
      result.repliesFound += outcome.value.found;
      result.bounces += outcome.value.bounces ?? 0;
      if (outcome.value.error) result.errors.push(`${s.email}: ${outcome.value.error}`);
    } else {
      result.errors.push(`${s.email}: ${String((outcome as PromiseRejectedResult).reason?.message || (outcome as PromiseRejectedResult).reason)}`);
    }
  }
  return result;
}
