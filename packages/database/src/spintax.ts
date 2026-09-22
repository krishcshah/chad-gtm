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
