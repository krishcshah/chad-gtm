import { describe, expect, it } from "vitest";
import { injectEmailTracking } from "@smartreach/email-engine/processor";
import {
  clickFallbackUrl,
  decodeHrefEntities,
  extractTrackableHrefs,
  resolveTrackedDestination,
} from "../click-tracking";

const BODY = `<p>Hi Maya,</p>
<p>Book here: <a href="https://cal.com/acme/intro?utm_source=x&amp;utm_medium=email">calendar</a></p>
<p>Site: <a class="l" href='https://acme.com/'>acme</a> or <a href="mailto:a@b.com">mail</a></p>`;

/** Simulate a recipient clicking a link in the email processor.ts actually sends. */
function clickParams(html: string, index: number) {
  const tracked = injectEmailTracking(html, "job_1", "https://autogtm.tech", { trackOpens: false });
  const hrefs = [...tracked.matchAll(/href=(["'])([^"']+)\1/g)].map((m) => m[2]);
  const trackedHrefs = hrefs.filter((h) => h.includes("/api/track/click"));
  const u = new URL(decodeHrefEntities(trackedHrefs[index]));
  return { jid: u.searchParams.get("jid"), url: u.searchParams.get("url") };
}

describe("extractTrackableHrefs", () => {
  it("finds http(s) links only", () => {
    expect(extractTrackableHrefs(BODY)).toEqual([
      "https://cal.com/acme/intro?utm_source=x&amp;utm_medium=email",
      "https://acme.com/",
    ]);
    expect(extractTrackableHrefs(null)).toEqual([]);
  });

  it("unwraps already-tracked links (dry-run bodies are stored tracked)", () => {
    const tracked = injectEmailTracking(BODY, "job_1", "https://autogtm.tech", { trackOpens: true });
    expect(extractTrackableHrefs(tracked)).toEqual(extractTrackableHrefs(BODY));
  });
});

describe("resolveTrackedDestination", () => {
  const job = { bodyHtml: BODY, bodyText: "" };

  it("redirects links that are part of the email, as processor.ts encodes them", () => {
    const first = clickParams(BODY, 0);
    expect(first.jid).toBe("job_1");
    expect(resolveTrackedDestination(first.url, job)).toBe(
      "https://cal.com/acme/intro?utm_source=x&utm_medium=email"
    );
    expect(resolveTrackedDestination(clickParams(BODY, 1).url, job)).toBe("https://acme.com/");
  });

  it("works for dry-run jobs whose stored body is already tracked", () => {
    const tracked = injectEmailTracking(BODY, "job_1", "https://autogtm.tech", { trackOpens: true });
    expect(resolveTrackedDestination(clickParams(BODY, 1).url, { bodyHtml: tracked })).toBe("https://acme.com/");
  });

  it("falls back to bodyText when bodyHtml is empty", () => {
    expect(resolveTrackedDestination("https://acme.com/", { bodyHtml: "", bodyText: BODY })).toBe("https://acme.com/");
  });

  it("rejects targets that are not in the email", () => {
    expect(resolveTrackedDestination("https://evil.example/", job)).toBeNull();
    expect(resolveTrackedDestination("https://acme.com", job)).toBeNull(); // not byte-identical
    expect(resolveTrackedDestination("https://acme.com/@evil.example", job)).toBeNull();
    expect(resolveTrackedDestination("javascript:alert(1)", job)).toBeNull();
    expect(resolveTrackedDestination("", job)).toBeNull();
    expect(resolveTrackedDestination(null, job)).toBeNull();
    expect(resolveTrackedDestination("https://acme.com/", null)).toBeNull();
  });

  it("rejects links with embedded credentials even if present in the body", () => {
    const body = `<a href="https://user:pw@acme.com/">x</a>`;
    expect(resolveTrackedDestination("https://user:pw@acme.com/", { bodyHtml: body })).toBeNull();
  });
});

describe("clickFallbackUrl", () => {
  it("prefers APP_URL", () => {
    expect(clickFallbackUrl("http://localhost:3005/api/track/click", "https://autogtm.tech/app")).toBe(
      "https://autogtm.tech/"
    );
  });
  it("uses the request origin when APP_URL is missing or invalid", () => {
    expect(clickFallbackUrl("https://x.test/api/track/click?u=1", "")).toBe("https://x.test/");
    expect(clickFallbackUrl("https://x.test/api/track/click", "javascript:alert(1)")).toBe("https://x.test/");
  });
});

describe("decodeHrefEntities", () => {
  it("decodes common entities", () => {
    expect(decodeHrefEntities("a&amp;b&#38;c&#x26;d&bogus;")).toBe("a&b&c&d&bogus;");
  });
});
