// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "../email-html";

describe("sanitizeEmailHtml", () => {
  it("strips scripts, iframes, event handlers, and javascript urls", () => {
    const dirty = [
      "<p onclick=\"alert(1)\">Hello</p>",
      "<script>alert(1)</script>",
      "<iframe src=\"https://evil.test\"></iframe>",
      "<a href=\"javascript:alert(1)\">click</a>",
      "<img src=\"x\" onerror=\"alert(1)\">",
    ].join("");
    const safe = sanitizeEmailHtml(dirty);
    const html = `${safe.main}${safe.quoted ?? ""}`;
    expect(html).toContain("Hello");
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("<iframe");
    expect(html.toLowerCase()).not.toContain("onerror");
    expect(html.toLowerCase()).not.toContain("onclick");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("collapses gmail quotes and rewrites raw unsubscribe href text", () => {
    const token = "z".repeat(60);
    const dirty = `<div><p>See you there</p><div class="gmail_quote">On Tue, Sep 1, 2026 at 9:00 AM Ada wrote:<blockquote>old thread</blockquote></div><p><a href="https://example.com/unsubscribe?token=${token}">https://example.com/unsubscribe?token=${token}</a></p></div>`;
    const safe = sanitizeEmailHtml(dirty);
    const doc = new DOMParser().parseFromString(safe.main, "text/html");
    expect(doc.body.textContent).toContain("See you there");
    expect(doc.body.textContent).toContain("Unsubscribe");
    expect(doc.body.textContent).not.toContain(token);
    expect(safe.quoted).toContain("old thread");
    expect(safe.main).not.toContain("old thread");
  });
});
