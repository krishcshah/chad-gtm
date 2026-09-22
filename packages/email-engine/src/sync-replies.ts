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
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { EngineDb, SenderRow } from "./db-port";
import { makeImapClient } from "./mailer";

export interface SyncResult {
  checked: number;
  repliesFound: number;
  errors: string[];
}

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

function classifyPart(raw: string): { kind: "html" | "text" | "empty"; content: string } {
  if (!raw || !raw.trim()) return { kind: "empty", content: "" };
  let s = stripMimeNoise(raw);
  // Detect CTE before decoding if header leaked
  const cteMatch = raw.match(/content-transfer-encoding:\s*([^\r\n]+)/i);
  const cte = (cteMatch?.[1] ?? "").trim().toLowerCase();
  if (cte.includes("quoted-printable") || /=[0-9A-Fa-f]{2}/.test(s)) {
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

/** Sync one sender's inbox. Returns count of new replies recorded. */
export async function syncSenderReplies(db: EngineDb, sender: SenderRow): Promise<{ found: number; error?: string }> {
  if (!sender.imapHost || !sender.imapPasswordEnc) return { found: 0 };
  const client = makeImapClient(sender);
  let found = 0;
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    // Look back ~7 days or since last sync (whichever is newer)
    const since = sender.lastSyncAt
      ? new Date(Math.max(Date.parse(sender.lastSyncAt) - 3_600_000, Date.now() - 7 * 86_400_000))
      : new Date(Date.now() - 7 * 86_400_000);

    const uids = await client.search({ since }, { uid: true });
    const list = (Array.isArray(uids) ? uids : []).slice(-200); // cap per poll
    if (list.length > 0) {
      for await (const msg of client.fetch(
        list,
        // Fetch text + common multipart part numbers for text/html split
        { uid: true, envelope: true, bodyParts: ["text", "1", "1.1", "1.2", "2", "2.1", "2.2"] },
        { uid: true },
      )) {
        try {
          found += (await recordReplyIfNew(db, sender, msg)) ? 1 : 0;
        } catch (err) {
          console.error(`[sync] record reply failed for sender ${sender.id}`, err);
        }
      }
    }
    await client.logout();
    await db
      .update(schema.senderAccounts)
      .set({ lastSyncAt: new Date().toISOString(), imapStatus: "ok" })
      .where(eq(schema.senderAccounts.id, sender.id));
    return { found };
  } catch (err: any) {
    const message = String(err?.responseText || err?.message || "IMAP sync failed");
    await db
      .update(schema.senderAccounts)
      .set({ imapStatus: "failed" })
      .where(eq(schema.senderAccounts.id, sender.id));
    return { found, error: message };
  } finally {
    try {
      if (client.usable) await client.logout();
    } catch {
      /* noop */
    }
  }
}

async function recordReplyIfNew(db: EngineDb, sender: SenderRow, msg: any): Promise<boolean> {
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
  if (!lead) {
    const jobs: any[] = await db
      .select()
      .from(schema.emailJobs)
      .where(and(eq(schema.emailJobs.senderId, sender.id), eq(schema.emailJobs.toEmail, fromEmail), eq(schema.emailJobs.status, "sent")))
      .orderBy(desc(schema.emailJobs.sentAt))
      .limit(1);
    if (jobs[0]) {
      campaignId = jobs[0].campaignId;
      const rows = await db.select().from(schema.leads).where(eq(schema.leads.id, jobs[0].leadId)).limit(1);
      lead = rows[0];
    }
  }
  if (!lead) return false; // not a campaign recipient — ignore

  const { text, html } = extractTextAndHtml(msg);
  const { bodyText, bodyHtml, snippet } = prepareReplyBodies(text, html);
  const receivedAt = (env.date ? new Date(env.date) : new Date()).toISOString();
  const nowS = new Date().toISOString();

  try {
    await db.insert(schema.replies).values({
      id: crypto.randomUUID(),
      userId: sender.userId,
      senderId: sender.id,
      leadId: lead.id,
      campaignId,
      fromName: from.name || env.from?.[0]?.name || "",
      fromEmail,
      subject: env.subject ?? "",
      snippet,
      bodyText,
      bodyHtml,
      messageId,
      receivedAt,
    });
  } catch {
    return false; // unique constraint — already recorded concurrently
  }

  // Stop future sends & mark statuses
  await db
    .update(schema.campaignLeads)
    .set({ status: "replied", updatedAt: nowS })
    .where(eq(schema.campaignLeads.leadId, lead.id));
  await db
    .update(schema.emailJobs)
    .set({ status: "cancelled", lastError: "lead-replied", updatedAt: nowS })
    .where(and(eq(schema.emailJobs.leadId, lead.id), inArray(schema.emailJobs.status, ["pending", "retry", "processing"])));
  await db
    .update(schema.leads)
    .set({ status: "replied", updatedAt: nowS })
    .where(eq(schema.leads.id, lead.id));
  await db
    .update(schema.senderAccounts)
    .set({ repliedCount: sql`${schema.senderAccounts.repliedCount} + 1` })
    .where(eq(schema.senderAccounts.id, sender.id));
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId: sender.userId,
    type: "reply_received",
    message: `${fromEmail} replied via ${sender.email}`,
    campaignId,
  });
  return true;
}

/** Sync all senders that have IMAP configured and are not failed. */
export async function syncTick(db: EngineDb): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, repliesFound: 0, errors: [] };
  const senders: SenderRow[] = await db
    .select()
    .from(schema.senderAccounts)
    .where(sql`${schema.senderAccounts.deletedAt} is null and ${schema.senderAccounts.imapHost} != ''`);
  for (const s of senders) {
    result.checked++;
    const r = await syncSenderReplies(db, s);
    result.repliesFound += r.found;
    if (r.error) result.errors.push(`${s.email}: ${r.error}`);
  }
  return result;
}
