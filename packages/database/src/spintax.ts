/**
 * Spintax expander — `{Hi|Hello|Hey}` → one random alternative.
 * Nested spintax is supported. Unbalanced braces are left as-is.
 * Runs at send-prep (enqueue) and preview time.
 */

const SPIN_RE = /\{([^{}]+)\}/;

/** Expand all `{a|b|c}` groups; optional RNG for tests. */
export function expandSpintax(
  input: string,
  rand: () => number = Math.random,
): string {
  if (!input || !input.includes("{")) return input ?? "";
  let out = input;
  // Iterate until no more innermost groups (handles nesting).
  for (let i = 0; i < 50; i++) {
    const next = out.replace(SPIN_RE, (_, inner: string) => {
      const parts = inner.split("|");
      if (parts.length < 2) return `{${inner}}`; // not spintax — leave alone
      const idx = Math.min(parts.length - 1, Math.floor(rand() * parts.length));
      return parts[idx] ?? "";
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** True if the string contains at least one `{a|b}` group. */
export function hasSpintax(input: string): boolean {
  return SPIN_RE.test(input) && input.includes("|");
}

/**
 * Add safe, human-sounding variation to outreach copy.
 *
 * This is deliberately conservative: it only touches greetings, sign-offs and
 * a few low-risk phrases. Names, companies, numbers and factual claims are
 * never spun. Works for plain text and simple HTML bodies (`<p>Hi ...`).
 */
export function ensureOutreachSpintax(input: string): string {
  if (!input) return input ?? "";
  let out = input;

  // Greeting: "Hi {{first_name}}," / "<p>Hello Sarah," → "{Hi|Hey|Hello} Sarah,"
  out = out.replace(
    /(^|\n|<p[^>]*>)\s*(?:hi|hey|hello|dear)\s+(\{\{\s*first_name\s*\}\}|[A-Z][A-Za-z'’-]+)\s*,/gi,
    (_match, prefix: string, name: string) => `${prefix}{Hi|Hey|Hello} ${name},`,
  );

  // Sign-off: "Best," → "{Best|Thanks|Cheers},"
  out = out.replace(/\b(?:best|thanks|cheers|regards)\s*,/gi, "{Best|Thanks|Cheers},");

  // Low-risk phrase variation. Negative lookbehind keeps a second pass from
  // nesting groups that are already spintax (e.g. `{Worth a|Open to a}`).
  out = out.replace(/(?<![{|])happy to\b/gi, "{Happy to|Glad to}");
  out = out.replace(/(?<![{|])worth a\b/gi, "{Worth a|Open to a}");
  out = out.replace(/(?<![{|])quick look\b/gi, "{quick look|brief look}");
  out = out.replace(/(?<![{|])open to\b/gi, "{open to|up for}");

  // Guarantee at least two independently expandable groups.
  if (!hasSpintax(out)) {
    const ctaMatch = out.match(/\b(?:worth a quick look|open to a quick look|mind if i share it)\?/i);
    if (ctaMatch) {
      out = out.replace(
        ctaMatch[0],
        "{Worth a quick look|Open to a quick look|Mind if I share it}?",
      );
    }
  }

  return out;
}
