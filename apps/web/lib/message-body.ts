/**
 * Unibox message body preparation.
 * Prefer text/html when it is present (or embedded in a MIME dump).
 * Plain text keeps newlines, repairs common UTF-8-as-Latin-1 mojibake,
 * hides quoted replies, and never leaves raw unsubscribe / tracking URLs inline.
 */

const CP1252_TO_BYTE = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

const MOJIBAKE_MARK = /[\u00c2\u00c3\u00e2]/g;
const HTML_TAG =
  /<(?:!doctype|html|body|head|div|p|br|table|thead|tbody|span|a|blockquote|img|td|tr|h[1-6]|ul|ol|li|style|font|center|section|article)\b/i;
/** Gmail/Outlook attribution, full-line or mid-line: "On Tue, 22 Sept 2026, 02:22 Hello1, wrote:" */
const ON_WROTE_INLINE = /\bOn\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d)[\s\S]{0,240}?\bwrote:/i;

export interface TextSegment {
  type: "text" | "link";
  value: string;
  href?: string;
}

export interface PreparedMessage {
  kind: "html" | "plain";
  /** Sanitized later in the browser. Empty when kind is plain. */
  html: string;
  body: string;
  quoted: string | null;
  preview: string;
}

export function messagePreview(raw: string | null | undefined, max = 180): string {
  if (!raw?.trim()) return "";
  return prepareMessageBody({ text: raw }).preview.slice(0, max);
}

export function prepareMessageBody(input: { html?: string | null; text?: string | null }): PreparedMessage {
  const explicitHtml = stripBom(input.html ?? "").trim().slice(0, 250_000);
  const explicitText = stripBom(input.text ?? "").trim().slice(0, 250_000);

  if (explicitHtml) {
    const extracted = interpretRaw(explicitHtml);
    if (extracted.html && looksLikeHtml(extracted.html)) {
      return asHtml(extracted.html, extracted.text || explicitText);
    }
    if (!explicitText) return asPlain(extracted.text || explicitHtml);
  }

  if (explicitText) {
    const extracted = interpretRaw(explicitText);
    if (extracted.html && looksLikeHtml(extracted.html)) {
      return asHtml(extracted.html, extracted.text);
    }
    return asPlain(extracted.text || explicitText);
  }

  return { kind: "plain", html: "", body: "", quoted: null, preview: "" };
}

export function linkifyPlainText(text: string): TextSegment[] {
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const url = stripTrailingPunct(raw);
    const trailing = raw.slice(url.length);
    if (start > last) segments.push({ type: "text", value: text.slice(last, start) });
    const kind = classifyHttpUrl(url);
    if (kind === "unsub") {
      segments.push({ type: "link", value: "Unsubscribe", href: url });
    } else if (kind === "shorten") {
      segments.push({ type: "link", value: hostnameOf(url), href: url });
    } else if (kind === "keep") {
      segments.push({ type: "link", value: url, href: url });
    }
    if (trailing) segments.push({ type: "text", value: trailing });
    last = start + raw.length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

export function classifyHttpUrl(url: string): "unsub" | "strip" | "shorten" | "keep" {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    return "strip";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "strip";
  if (isUnsubUrl(url)) return "unsub";
  if (isTrackingUrl(url)) return "strip";
  if (isHugeQueryUrl(url)) return "shorten";
  return "keep";
}

export function fixMojibake(input: string): string {
  if (!input || !/[\u00c2\u00c3\u00e2]/.test(input)) return input;
  let cur = input;
  for (let pass = 0; pass < 2; pass++) {
    if (!/[\u00c2\u00c3\u00e2]/.test(cur)) break;
    const next = cur.replace(mojibakeRun(), (run) => {
      if (!/[\u00c2\u00c3\u00e2]/.test(run)) return run;
      return tryDecodeMojibake(run) ?? run;
    });
    if (next === cur) break;
    cur = next;
  }
  return cur.replace(/\u00c2(?=\s)/g, "");
}

export function threadDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Chat side for a thread row.
 * Operator (human) replies sit on the right. Campaign automation and inbound
 * replies sit on the left. The live contract always sends `direction`;
 * `fromRole`, `isOutbound`, and `folder` are best-effort fallbacks.
 * Unknown rows stay on the left so campaign mail is not placed as a human reply.
 */
export function resolveBubbleSide(message: {
  direction?: string | null;
  fromRole?: string | null;
  isOutbound?: boolean | null;
  folder?: string | null;
}): "left" | "right" {
  const direction = (message.direction ?? "").trim().toLowerCase();
  const role = (message.fromRole ?? "").trim().toLowerCase();
  const folder = (message.folder ?? "").trim().toLowerCase();

  if (direction === "operator" || role === "operator" || folder === "operator") return "right";
  if (
    direction === "campaign" ||
    direction === "inbound" ||
    role === "automation" ||
    role === "lead" ||
    folder === "inbox" ||
    folder === "campaign"
  ) {
    return "left";
  }
  if (message.isOutbound === true && folder === "sent" && role !== "lead") return "left";
  return "left";
}

export function threadDayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(d);
}

function asHtml(html: string, altText: string): PreparedMessage {
  const fixed = fixMojibake(html);
  const plain = formatPlain(htmlToText(fixed) || fixMojibake(altText || ""));
  return {
    kind: "html",
    html: fixed,
    body: plain.body,
    quoted: plain.quoted,
    preview: plainPreview(plain.body),
  };
}

function asPlain(text: string): PreparedMessage {
  const plain = formatPlain(fixMojibake(text));
  return {
    kind: "plain",
    html: "",
    body: plain.body,
    quoted: plain.quoted,
    preview: plainPreview(plain.body),
  };
}

function formatPlain(text: string): { body: string; quoted: string | null } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  const cleaned = stripFooterNoise(normalized);
  return splitQuotedPlain(cleaned);
}

function plainPreview(body: string): string {
  return linkifyPlainText(body)
    .map((s) => s.value)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function interpretRaw(raw: string): { html: string; text: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (looksLikeMime(normalized)) return extractMime(normalized);
  const out = { html: "", text: "" };
  assignLoose(normalized, out);
  return out;
}

function looksLikeMime(raw: string): boolean {
  const head = raw.slice(0, 20_000);
  if (/content-type:\s*multipart\//i.test(head)) return true;
  if (/^mime-version\s*:/im.test(head)) return true;
  return /content-type:\s*text\/(?:html|plain)/i.test(head) && /content-transfer-encoding\s*:/i.test(head);
}

function extractMime(raw: string): { html: string; text: string } {
  const out = { html: "", text: "" };
  collectPart(raw, out, 0);
  return out;
}

function collectPart(raw: string, out: { html: string; text: string }, depth: number) {
  if (depth > 8) return;
  const split = splitHeaderBody(raw.trim());
  if (!split) {
    assignLoose(raw, out);
    return;
  }
  const headers = parseHeaders(split.headers);
  const ct = headers.get("content-type") || "";
  const disp = headers.get("content-disposition") || "";
  if (/attachment/i.test(disp)) return;
  if (/multipart\//i.test(ct)) {
    const boundary = boundaryOf(ct);
    if (!boundary) {
      assignLoose(split.body, out);
      return;
    }
    for (const part of splitMultipart(split.body, boundary)) collectPart(part, out, depth + 1);
    return;
  }
  const decoded = decodeTransfer(split.body, headers.get("content-transfer-encoding"), headerCharset(ct)).trim();
  if (/text\/html/i.test(ct)) {
    if (!out.html) out.html = fixMojibake(decoded);
    return;
  }
  if (/text\/plain/i.test(ct)) {
    if (!out.text) out.text = fixMojibake(decoded);
    return;
  }
  assignLoose(decoded, out);
}

function assignLoose(raw: string, out: { html: string; text: string }) {
  let s = raw.trim();
  if (!s) return;
  if (looksQuotedPrintable(s)) s = decodeBytes(decodeQuotedPrintableBytes(s), "utf-8").trim();
  s = maybeDecodeEntities(s);
  s = fixMojibake(s);
  if (looksLikeHtml(s)) {
    if (!out.html) out.html = s;
  } else if (!out.text) {
    out.text = s;
  }
}

function looksLikeHtml(s: string): boolean {
  return HTML_TAG.test(s);
}

function looksQuotedPrintable(body: string): boolean {
  if (/=\r?\n/.test(body)) return true;
  const matches = body.match(/=[0-9A-Fa-f]{2}/g);
  return (matches?.length ?? 0) >= 3 && !looksLikeHtml(body);
}

function splitHeaderBody(raw: string): { headers: string; body: string } | null {
  const idx = raw.indexOf("\n\n");
  if (idx < 0) return null;
  const headers = raw.slice(0, idx);
  if (!/^[A-Za-z][A-Za-z0-9-]*\s*:/.test(headers)) return null;
  return { headers, body: raw.slice(idx + 2) };
}

function parseHeaders(block: string): Map<string, string> {
  const map = new Map<string, string>();
  const unfolded = block.replace(/\n[ \t]+/g, " ");
  for (const line of unfolded.split("\n")) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    map.set(m[1].toLowerCase(), m[2].trim());
  }
  return map;
}

function boundaryOf(contentType: string): string {
  const m = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  return (m?.[1] || m?.[2] || "").trim();
}

function headerCharset(contentType: string): string {
  const m = contentType.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  return (m?.[1] || "utf-8").toLowerCase();
}

function splitMultipart(body: string, boundary: string): string[] {
  const parts: string[] = [];
  for (let chunk of body.split(`--${boundary}`)) {
    if (chunk.startsWith("--")) continue;
    if (chunk.startsWith("\n")) chunk = chunk.slice(1);
    chunk = chunk.replace(/\n$/, "");
    if (chunk.trim()) parts.push(chunk);
  }
  return parts;
}

function decodeTransfer(body: string, encoding: string | undefined, charset: string): string {
  const enc = (encoding || "").toLowerCase();
  if (enc.includes("base64")) {
    try {
      return decodeBytes(bytesFromBinaryString(atob(body.replace(/\s/g, ""))), charset);
    } catch {
      return body;
    }
  }
  if (enc.includes("quoted-printable") || looksQuotedPrintable(body)) {
    return decodeBytes(decodeQuotedPrintableBytes(body), charset);
  }
  if (charset && charset !== "utf-8" && charset !== "utf8" && charset !== "us-ascii") {
    return decodeBytes(bytesFromBinaryString(body), charset);
  }
  return body;
}

function decodeQuotedPrintableBytes(input: string): Uint8Array {
  const s = input.replace(/=\r?\n/g, "").replace(/=\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /[0-9A-Fa-f]{2}/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (s[i] !== "\r") {
      const code = s.charCodeAt(i);
      bytes.push(code <= 0xff ? code : 0x3f);
    }
  }
  return new Uint8Array(bytes);
}

function bytesFromBinaryString(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  const label = charset === "utf8" ? "utf-8" : charset;
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

function maybeDecodeEntities(s: string): string {
  if (!/&lt;\s*\/?[a-z]/i.test(s) || looksLikeHtml(s)) return s;
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, "&");
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitQuotedPlain(text: string): { body: string; quoted: string | null } {
  const normalized = text.replace(/\r\n/g, "\n");
  const cut = indexOfQuotedReply(normalized);
  if (cut < 0) return { body: normalized.trim(), quoted: null };
  const body = normalized.slice(0, cut).trim();
  let quoted = normalized.slice(cut).trim();
  if (!quoted) return { body: normalized.trim(), quoted: null };
  quoted = dropTrailingReplyDuplicate(body, quoted);
  return { body, quoted: quoted || null };
}

/**
 * Index of the first quoted region in plain text.
 * Cuts at a Gmail/Outlook "On … wrote:" attribution (even mid-line) and at
 * the usual banner / ">" quote markers. Everything from the index onward is quoted.
 */
export function indexOfQuotedReply(text: string): number {
  let best = -1;
  const consider = (i: number) => {
    if (i >= 0 && (best < 0 || i < best)) best = i;
  };

  const inline = text.match(ON_WROTE_INLINE);
  if (inline?.index !== undefined) consider(inline.index);

  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(trimmed)) consider(offset);
    else if (/^-{2,}\s*forwarded message\s*-{2,}$/i.test(trimmed)) consider(offset);
    else if (/^begin forwarded message:\s*$/i.test(trimmed)) consider(offset);
    else if (/^_{10,}$/.test(trimmed)) {
      const window = lines.slice(i + 1, i + 5).map((l) => l.trim());
      if (window.some((l) => /^from:\s/i.test(l))) consider(offset);
    } else if (/^\s*>/.test(line) && isMostlyQuoted(lines, i)) consider(offset);
    offset += line.length + 1;
  }
  return best;
}

/** A bare copy of the new reply after the quote block is not part of the prior mail. */
function dropTrailingReplyDuplicate(body: string, quoted: string): string {
  const reply = body.trim();
  if (!reply) return quoted;
  const lines = quoted.split("\n");
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last) {
      lines.pop();
      continue;
    }
    if (/^>/.test(last)) break;
    if (last === reply) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n").trim();
}

function isMostlyQuoted(lines: string[], start: number): boolean {
  const rest = lines.slice(start);
  if (rest.length === 0) return false;
  const quoted = rest.filter((l) => !l.trim() || /^\s*>/.test(l)).length;
  return quoted / rest.length >= 0.6;
}

function stripFooterNoise(text: string): string {
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push("");
      continue;
    }
    if (isBareTokenLine(trimmed)) continue;
    const unsubLead = trimmed.match(/^unsubscribe\b[\s:—–-]*(https?:\/\/\S+)$/i);
    if (unsubLead) {
      kept.push(stripTrailingPunct(unsubLead[1]));
      continue;
    }
    const only = trimmed.match(/^(https?:\/\/\S+)$/i);
    if (only) {
      const url = stripTrailingPunct(only[1]);
      const kind = classifyHttpUrl(url);
      if (kind === "strip") continue;
      kept.push(url);
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isBareTokenLine(line: string): boolean {
  if (line.length < 80 || /^https?:\/\//i.test(line)) return false;
  if (/^[A-Za-z0-9._~+/=-]{80,}$/.test(line)) return true;
  return /^(?:token|unsub|sig|signature)=[A-Za-z0-9._~%]{40,}$/i.test(line);
}

function isUnsubUrl(url: string): boolean {
  return /unsubscribe|unsub(?:scribe)?|opt[-_]?out|email-preferences|manage[-_\s]?preferences|list-unsubscribe/i.test(url);
}

function isTrackingUrl(url: string): boolean {
  return /\/(?:track|open|beacon|pixel)(?:\/|$|\?)|click\.|ct\.sendgrid|list-manage\.com\/track|\/wf\/open/i.test(url);
}

function isHugeQueryUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.search.length >= 48) return true;
    if (/\/[A-Za-z0-9_-]{48,}(?:\/|$)/.test(u.pathname)) return true;
  } catch {
    return url.length > 140;
  }
  return url.length > 180;
}

function stripTrailingPunct(url: string): string {
  return url.replace(/[.,;:!?]+$/g, "");
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function markerCount(s: string): number {
  return (s.match(MOJIBAKE_MARK) || []).length;
}

function mojibakeRun(): RegExp {
  return /[\u0000-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]{4,}/g;
}

function tryDecodeMojibake(input: string): string | null {
  const bytes: number[] = [];
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff) return null;
    const mapped = CP1252_TO_BYTE.get(code);
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    return null;
  }
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    if (!decoded || decoded === input) return null;
    if (markerCount(decoded) >= markerCount(input)) return null;
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}
