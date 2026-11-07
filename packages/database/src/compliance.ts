/**
 * CAN-SPAM / GDPR-oriented helpers: unsubscribe tokens, postal footer, suppression matching.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Secret new unsubscribe tokens are signed with. */
function tokenSecret(): string {
  return process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY || "dev-only-unsub-secret";
}

/**
 * Secrets a token may be verified against: the current one, then
 * UNSUBSCRIBE_SECRET_PREVIOUS (the old BETTER_AUTH_SECRET after a rotation),
 * so unsubscribe links already sent keep working.
 */
function verificationSecrets(): string[] {
  const current = tokenSecret();
  const previous = (process.env.UNSUBSCRIBE_SECRET_PREVIOUS ?? "").trim();
  return previous && previous !== current ? [current, previous] : [current];
}

/** Constant-time comparison of two base64url signatures. */
function signatureMatches(sig: string, expected: string): boolean {
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Normalize email for suppression matching. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Extract domain from email (lowercased). */
export function emailDomain(email: string): string {
  const n = normalizeEmail(email);
  const at = n.lastIndexOf("@");
  return at >= 0 ? n.slice(at + 1) : "";
}

/** Domain suppression value form: "@example.com". */
export function domainSuppressionValue(domain: string): string {
  const d = domain.replace(/^@/, "").trim().toLowerCase();
  return d ? `@${d}` : "";
}

/**
 * HMAC token: base64url(userId|email|exp)|sig
 * exp is unix seconds (default 1 year).
 */
export function createUnsubscribeToken(
  userId: string,
  email: string,
  ttlSec = 365 * 24 * 3600,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = Buffer.from(`${userId}|${normalizeEmail(email)}|${exp}`, "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { ok: true; userId: string; email: string } | { ok: false; error: string } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, error: "Malformed token" };
  // Check every accepted secret (no early exit) so timing doesn't reveal which matched.
  let valid = false;
  for (const secret of verificationSecrets()) {
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    if (signatureMatches(sig, expected)) valid = true;
  }
  if (!valid) return { ok: false, error: "Invalid signature" };
  let raw: string;
  try {
    raw = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return { ok: false, error: "Invalid payload" };
  }
  const [userId, email, expStr] = raw.split("|");
  if (!userId || !email || !expStr) return { ok: false, error: "Invalid payload" };
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Token expired" };
  }
  return { ok: true, userId, email: normalizeEmail(email) };
}

export function buildUnsubscribeUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "") || "http://localhost:3000";
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** HTTPS endpoint that accepts RFC 8058 one-click POST. */
export function buildUnsubscribeApiUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "") || "http://localhost:3000";
  return `${base}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click friendly headers. */
export function listUnsubscribeHeaders(unsubUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Collapse whitespace and drop tags so "already contains X" checks are robust. */
function flatten(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Lines of a postal address (newlines or commas in a single-line paste are kept as typed). */
function addressLines(address: string): string[] {
  return address
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** True when the body already shows this postal address (any whitespace / tags). */
export function hasPostalAddress(body: string, postalAddress: string): boolean {
  const addr = flatten(addressLines(postalAddress).join(" "));
  if (!addr) return false;
  return flatten(body).includes(addr);
}

/** True when the body already carries a working unsubscribe link. */
export function hasUnsubscribeLink(body: string, unsubUrl?: string): boolean {
  if (!body) return false;
  if (unsubUrl && body.includes(unsubUrl)) return true;
  // Token links resolved from {{unsubscribe_url}} (any base, page or one-click API).
  if (/\/(?:api\/)?unsubscribe\?token=[^\s"'<>]+/i.test(body)) return true;
  // HTML-escaped query separators ("&amp;") still contain the path.
  return /\/(?:api\/)?unsubscribe\?(?:[^"'\s<>]*&amp;)?token=/i.test(body);
}

export function ensurePostalFooter(
  body: string,
  opts: { postalAddress: string; companyName?: string; asHtml: boolean },
): string {
  const address = opts.postalAddress.trim();
  if (!address) return body;
  const company = (opts.companyName ?? "").trim();
  const lines = addressLines(address);
  if (opts.asHtml) {
    const marker = "data-sr-postal";
    if (body.includes(marker) || hasPostalAddress(body, address)) return body;
    const block = `<p ${marker}="1" style="margin-top:24px;font-size:12px;line-height:1.5;color:#666;">${
      company ? `${escapeHtml(company)}<br/>` : ""
    }${lines.map(escapeHtml).join("<br/>")}</p>`;
    return insertBeforeBodyEnd(body, block);
  }
  // Legacy marker from older footers: never append twice.
  if (body.includes("-- physical address --") || hasPostalAddress(body, address)) return body;
  return `${body.replace(/\s+$/, "")}\n\n--\n${company ? company + "\n" : ""}${lines.join("\n")}`;
}

export function ensureUnsubscribeFooter(
  body: string,
  opts: { unsubUrl: string; asHtml: boolean },
): string {
  const url = opts.unsubUrl;
  if (!url) return body;
  if (opts.asHtml) {
    const marker = "data-sr-unsub";
    if (body.includes(marker) || hasUnsubscribeLink(body, url)) return body;
    return insertBeforeBodyEnd(
      body,
      `<p ${marker}="1" style="margin-top:8px;font-size:12px;color:#666;">Don't want these emails? <a href="${escapeAttr(
        url,
      )}">Unsubscribe</a></p>`,
    );
  }
  if (hasUnsubscribeLink(body, url)) return body;
  return `${body.replace(/\s+$/, "")}\n\nDon't want these emails? Unsubscribe: ${url}`;
}

export interface ComplianceFooterOptions {
  /** Sender company (the client the email is sent on behalf of). */
  companyName?: string;
  /** Physical postal address (CAN-SPAM). Required: callers must not send without it. */
  postalAddress: string;
  /** Recipient-specific unsubscribe page URL. */
  unsubUrl: string;
}

/**
 * Add the visible compliance footer — company, postal address, unsubscribe
 * link — to BOTH parts of a cold email so text and HTML say the same thing.
 * Each piece is skipped when that part already contains it (e.g. a template
 * that resolved {{unsubscribe_url}}), so it never appears twice.
 */
export function applyComplianceFooter(
  parts: { text: string; html: string },
  opts: ComplianceFooterOptions,
): { text: string; html: string } {
  const postal = { postalAddress: opts.postalAddress, companyName: opts.companyName };
  let text = ensurePostalFooter(parts.text, { ...postal, asHtml: false });
  text = ensureUnsubscribeFooter(text, { unsubUrl: opts.unsubUrl, asHtml: false });
  let html = ensurePostalFooter(parts.html, { ...postal, asHtml: true });
  html = ensureUnsubscribeFooter(html, { unsubUrl: opts.unsubUrl, asHtml: true });
  return { text, html };
}

function insertBeforeBodyEnd(html: string, block: string): string {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}</body>`);
  return `${html}\n${block}`;
}

/**
 * Opt-outs that follow the PERSON, not the client: the pool mailboxes are
 * shared, so an unsubscribe, hard bounce, complaint or erasure request
 * recorded under any user (or under no user: the owner was deleted, or the
 * request came to the platform) blocks sends for every user. Manual, import
 * and "not interested" suppressions stay per user.
 */
export const GLOBAL_SUPPRESSION_SOURCES = ["unsubscribe", "bounce", "complaint", "erasure"] as const;

/** Every suppression source (mirrors the suppressions.source enum in schema.ts). */
export const SUPPRESSION_SOURCES = [
  "manual",
  "import",
  "unsubscribe",
  "bounce",
  "complaint",
  "erasure",
  "not_interested",
] as const;

export type SuppressionSource = (typeof SUPPRESSION_SOURCES)[number];

export function isGlobalSuppressionSource(source: string | null | undefined): boolean {
  return (GLOBAL_SUPPRESSION_SOURCES as readonly string[]).includes(String(source ?? ""));
}

/** Suppression values that could match an email: the address and its "@domain". */
export function suppressionCandidates(email: string): string[] {
  const n = normalizeEmail(email);
  const d = domainSuppressionValue(emailDomain(n));
  return d ? [n, d] : [n];
}

/** Rows that apply to `userId`: their own rows, plus everyone's global opt-outs. */
export function applicableSuppressionValues(
  // userId is null on rows whose owner was deleted: those apply only when global.
  rows: { value: string; userId: string | null; source?: string | null }[],
  userId: string,
): string[] {
  return rows.filter((r) => r.userId === userId || isGlobalSuppressionSource(r.source)).map((r) => r.value);
}

export type SuppressionVerdict = { level: "global" | "own"; source: string };

/**
 * One answer for "may `userId` email this person?" from rows that already
 * match the recipient. Only applicable rows count (the user's own, or anyone's
 * global opt-out). A global opt-out wins over the user's own block.
 */
export function suppressionVerdict(
  rows: { value: string; userId: string | null; source?: string | null }[],
  userId: string,
): SuppressionVerdict | null {
  const global = rows.find((r) => isGlobalSuppressionSource(r.source));
  if (global) return { level: "global", source: String(global.source) };
  const own = rows.find((r) => r.userId === userId);
  if (own) return { level: "own", source: String(own.source ?? "manual") };
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/** True if email matches an email or domain suppression value. */
export function matchesSuppression(email: string, values: string[]): boolean {
  const n = normalizeEmail(email);
  const domain = emailDomain(n);
  const domainVal = domainSuppressionValue(domain);
  for (const v of values) {
    const vv = v.trim().toLowerCase();
    if (!vv) continue;
    if (vv.startsWith("@")) {
      if (domainVal === vv || `@${domain}` === vv) return true;
    } else if (vv === n) {
      return true;
    }
  }
  return false;
}
