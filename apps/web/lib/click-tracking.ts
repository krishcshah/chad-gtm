/**
 * Click-tracking redirect validation.
 *
 * packages/email-engine/src/processor.ts (injectEmailTracking) rewrites every
 * `<a href="http(s)://...">` in a job's HTML body to
 *   ${APP_URL}/api/track/click?jid=<jobId>&url=<encodeURIComponent(href)>
 * The job row keeps the HTML it was sent from (the untracked body for live
 * sends, the tracked body for dry runs). The click route only redirects when
 * the requested url is one of the links in that stored body, so the tracking
 * domain can't be used as an open redirect.
 */

// Same pattern processor.ts uses to find links to rewrite.
const HREF_PATTERN = /<a\b[^>]*?href=(["'])(https?:\/\/[^"'\s>]+)\1[^>]*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

/** Decode the HTML entities that can appear inside an href attribute. */
export function decodeHrefEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** If href is already one of our click-tracking links, return its inner url. */
function unwrapTrackedHref(href: string): string {
  if (!href.includes("/api/track/click")) return href;
  try {
    const inner = new URL(decodeHrefEntities(href)).searchParams.get("url");
    return inner ?? href;
  } catch {
    return href;
  }
}

/**
 * The raw href strings (as they appear in the source HTML, i.e. exactly what
 * processor.ts passes to encodeURIComponent) of every trackable link.
 */
export function extractTrackableHrefs(html: string | null | undefined): string[] {
  if (!html) return [];
  const out = new Set<string>();
  for (const match of html.matchAll(HREF_PATTERN)) {
    out.add(unwrapTrackedHref(match[2]));
  }
  return [...out];
}

function isHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Return the URL to redirect to, or null when `target` is not a link that was
 * part of this job's email. `target` is the already-decoded `url` query param.
 */
export function resolveTrackedDestination(
  target: string | null | undefined,
  job: { bodyHtml?: string | null; bodyText?: string | null } | null | undefined
): string | null {
  if (!target || !job) return null;
  const hrefs = new Set([
    ...extractTrackableHrefs(job.bodyHtml),
    // processor.ts falls back to bodyText as HTML when bodyHtml is empty.
    ...(job.bodyHtml ? [] : extractTrackableHrefs(job.bodyText)),
  ]);
  if (!hrefs.has(target)) return null;
  // The browser would have followed the entity-decoded href.
  const destination = decodeHrefEntities(target);
  const parsed = isHttpUrl(destination);
  return parsed ? parsed.toString() : null;
}

/** Harmless landing page for unknown or invalid click targets. */
export function clickFallbackUrl(requestUrl: string, appUrl = process.env.APP_URL): string {
  const base = appUrl?.trim();
  if (base) {
    const parsed = isHttpUrl(base);
    if (parsed) return new URL("/", parsed).toString();
  }
  return new URL("/", requestUrl).toString();
}
