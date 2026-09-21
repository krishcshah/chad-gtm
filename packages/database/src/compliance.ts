/**
 * CAN-SPAM / GDPR-oriented helpers: unsubscribe tokens, postal footer, suppression matching.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function tokenSecret(): string {
  return process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY || "dev-only-unsub-secret";
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
  const expected = createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "Invalid signature" };
    }
  } catch {
    return { ok: false, error: "Invalid signature" };
  }
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

export function ensurePostalFooter(
  body: string,
  opts: { postalAddress: string; companyName?: string; asHtml: boolean },
): string {
  const address = opts.postalAddress.trim();
  if (!address) return body;
  const company = (opts.companyName ?? "").trim();
  if (opts.asHtml) {
    const marker = "data-sr-postal";
    if (body.includes(marker)) return body;
    const block = `<p ${marker}="1" style="margin-top:24px;font-size:12px;color:#666;">${
      company ? `${escapeHtml(company)}<br/>` : ""
    }${escapeHtml(address).replace(/\n/g, "<br/>")}</p>`;
    return `${body}\n${block}`;
  }
  const marker = "-- physical address --";
  if (body.includes(marker)) return body;
  return `${body}\n\n${marker}\n${company ? company + "\n" : ""}${address}`;
}

export function ensureUnsubscribeFooter(
  body: string,
  opts: { unsubUrl: string; asHtml: boolean },
): string {
  const url = opts.unsubUrl;
  if (!url) return body;
  if (opts.asHtml) {
    const marker = "data-sr-unsub";
    if (body.includes(marker)) return body;
    return `${body}\n<p ${marker}="1" style="margin-top:16px;font-size:12px;color:#666;"><a href="${escapeAttr(
      url,
    )}">Unsubscribe</a></p>`;
  }
  const marker = "Unsubscribe:";
  if (body.includes(marker)) return body;
  return `${body}\n\n${marker} ${url}`;
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
