/**
 * Legacy warm-up marker: an earlier version stored warm-up counters as a
 * hidden `<!--SR_WARMUP:{json}-->` comment inside the sender signature. It
 * must never reach a recipient. Shared by the web app and the engine so both
 * strip it the same way.
 */
const WARMUP_MARKER_RE = /\s*<!--\s*SR_WARMUP:[\s\S]*?-->/g;

/** True when the signature still carries a legacy warm-up marker. */
export function hasWarmupMarker(signature: string | null | undefined): boolean {
  if (!signature) return false;
  return new RegExp(WARMUP_MARKER_RE.source).test(signature);
}

/** The signature without any warm-up marker (and the whitespace before it), trimmed. */
export function stripWarmupMarker(signature: string | null | undefined): string {
  if (!signature) return "";
  return String(signature).replace(WARMUP_MARKER_RE, "").trim();
}

/*
 * One sign-off, not two. Templates end "Best,\n{{sender_name}}" (the mailbox's
 * first name), and the sending mailbox then appends its own signature. When
 * that signature already starts with the sign-off name ("Dana Lee\nHead of
 * Growth" after "Dana"), the bare name line is dropped so the lead reads
 * "Best,\nDana Lee\nHead of Growth". Anything else keeps the old join.
 * Shared so the engine and the sample previews render the same email.
 */
const SIGN_OFF_NAME_RE = /^[\p{L}][\p{L}\p{M}.' -]{0,59}$/u;

function firstSignatureLine(signature: string): string {
  return (
    signature
      .replace(/<[^>]*>/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

function signatureStartsWithName(signature: string, name: string): boolean {
  if (!SIGN_OFF_NAME_RE.test(name)) return false;
  const line = firstSignatureLine(signature).toLowerCase();
  const n = name.toLowerCase();
  if (!line.startsWith(n)) return false;
  return line.length === n.length || !/[\p{L}\p{M}]/u.test(line.charAt(n.length));
}

/** The text body as it appears above the signature, and what goes between them. */
export function bodyAboveSignature(
  body: string,
  signature: string | null | undefined
): { body: string; separator: string } {
  const sig = stripWarmupMarker(signature);
  if (!sig) return { body, separator: "" };
  const trimmed = body.replace(/\s+$/, "");
  const cut = trimmed.lastIndexOf("\n");
  if (cut >= 0 && signatureStartsWithName(sig, trimmed.slice(cut + 1).trim())) {
    const before = trimmed.slice(0, cut);
    const rest = before.replace(/\s+$/, "");
    // A name on its own paragraph keeps the paragraph break; "Best,\nDana" a line break.
    if (rest) return { body: rest, separator: /\n[ \t\r]*$/.test(before) ? "\n\n" : "\n" };
  }
  return { body, separator: "\n\n" };
}

/** The text body with the signature appended (no signature: the body unchanged). */
export function joinSignature(body: string, signature: string | null | undefined): string {
  const sig = stripWarmupMarker(signature);
  if (!sig) return body;
  const above = bodyAboveSignature(body, sig);
  return `${above.body}${above.separator}${sig}`;
}

/** The HTML body with a trailing bare sign-off name removed when the signature starts with it. */
export function htmlAboveSignature(html: string, signature: string | null | undefined): string {
  const sig = stripWarmupMarker(signature);
  if (!sig) return html;
  const m = /(<br\s*\/?>|<p\b[^>]*>)([^<>]*)(<\/p>)?(\s*(?:<\/body>[\s\S]*)?)$/i.exec(html);
  if (!m || !signatureStartsWithName(sig, (m[2] ?? "").trim())) return html;
  const isParagraph = /^<p/i.test(m[1]!);
  return html.slice(0, m.index) + (isParagraph ? "" : m[3] ?? "") + (m[4] ?? "");
}
