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

  it("moves an inline Gmail attribution out of the main bubble", () => {
    const dirty = `<div>What? On Tue, 22 Sept 2026, 02:00 Hello1, wrote: &gt; YOOO &gt; What?</div>`;
    const safe = sanitizeEmailHtml(dirty);
    const main = new DOMParser().parseFromString(safe.main, "text/html").body.textContent?.replace(/\s+/g, " ").trim();
    expect(main).toBe("What?");
    expect(safe.main).not.toContain("YOOO");
    expect(safe.main).not.toContain("wrote:");
    expect(safe.quoted).toContain("On Tue, 22 Sept 2026, 02:00 Hello1, wrote:");
    const quotedText = new DOMParser().parseFromString(safe.quoted ?? "", "text/html").body.textContent ?? "";
    expect(quotedText).toContain("YOOO");
    expect(quotedText).not.toContain("What?");
    expect(quotedText).not.toMatch(/(?:^|>\s*)What\?\s*$/);
  });

  it("strips a flattened Gmail quote when the html quote is already collapsed", () => {
    const dirty = [
      `<div>Yes? On Tue, 22 Sept 2026, 02:22 Hello1, wrote: &gt; yoo &gt; Yes?</div>`,
      `<div class="gmail_quote">On Tue, 22 Sept 2026, 02:22 Hello1, &lt;<a href="mailto:hello1@krishshah.work">hello1@krishshah.work</a>&gt; wrote:<br>yoo</div>`,
    ].join("");
    const safe = sanitizeEmailHtml(dirty);
    const main = new DOMParser().parseFromString(safe.main, "text/html").body.textContent?.replace(/\s+/g, " ").trim();
    expect(main).toBe("Yes?");
    expect(safe.main).not.toContain("wrote:");
    expect(safe.main).not.toContain("yoo");
    expect(safe.quoted).toContain("yoo");
    expect(safe.quoted).toContain("hello1@krishshah.work");
  });

  it("splits a reply above a block-level On-wrote line", () => {
    const dirty = `<div>Yes?<br><br>On Tue, 22 Sept 2026, 02:22 Hello1, wrote:<br>&gt; yoo</div>`;
    const safe = sanitizeEmailHtml(dirty);
    const main = new DOMParser().parseFromString(safe.main, "text/html").body.textContent?.replace(/\s+/g, " ").trim();
    expect(main).toBe("Yes?");
    expect(safe.quoted).toContain("On Tue, 22 Sept 2026, 02:22 Hello1, wrote:");
    expect(safe.quoted).toContain("yoo");
    expect(safe.main).not.toContain("wrote:");
  });
});
