import { describe, expect, it } from "vitest";
import {
  applicableSuppressionValues,
  applyComplianceFooter,
  ensurePostalFooter,
  ensureUnsubscribeFooter,
  hasPostalAddress,
  hasUnsubscribeLink,
  isGlobalSuppressionSource,
  matchesSuppression,
  suppressionCandidates,
} from "../compliance";

const UNSUB = "https://autogtm.tech/unsubscribe?token=abc.def";
const ADDRESS = "Acme Inc\n500 Market St, Suite 200\nSan Francisco, CA 94105";

describe("applyComplianceFooter", () => {
  it("adds company, postal address and unsubscribe link to both parts", () => {
    const out = applyComplianceFooter(
      { text: "Hi Dana,\n\nQuick idea.\n\nAlex", html: "<p>Hi Dana,</p><p>Quick idea.</p><p>Alex</p>" },
      { companyName: "Acme", postalAddress: ADDRESS, unsubUrl: UNSUB },
    );
    for (const part of [out.text, out.html]) {
      expect(part).toContain("Acme");
      expect(part).toContain("500 Market St, Suite 200");
      expect(part).toContain("San Francisco, CA 94105");
      expect(part).toContain(UNSUB);
    }
    expect(out.text).toMatch(/Unsubscribe: https:\/\/autogtm\.tech\/unsubscribe\?token=abc\.def$/);
    expect(out.html).toContain(`<a href="${UNSUB}">Unsubscribe</a>`);
    expect(out.html).toContain("500 Market St, Suite 200<br/>San Francisco");
  });

  it("is idempotent", () => {
    const opts = { companyName: "Acme", postalAddress: ADDRESS, unsubUrl: UNSUB };
    const once = applyComplianceFooter({ text: "Hello", html: "<p>Hello</p>" }, opts);
    expect(applyComplianceFooter(once, opts)).toEqual(once);
  });

  it("does not add a second unsubscribe link when the template already has one", () => {
    const existing = "https://autogtm.tech/unsubscribe?token=from-template";
    const out = applyComplianceFooter(
      { text: `Hi\n\nOpt out: ${existing}`, html: `<p>Hi</p><p><a href="${existing}">opt out</a></p>` },
      { companyName: "Acme", postalAddress: "1 Main St", unsubUrl: UNSUB },
    );
    expect(out.text).not.toContain(UNSUB);
    expect(out.html).not.toContain(UNSUB);
    expect(out.text).toContain("1 Main St");
    expect(out.html).toContain("1 Main St");
  });

  it("adds the link only to the part that lacks it", () => {
    const out = applyComplianceFooter(
      { text: `Hi ${UNSUB}`, html: "<p>Hi</p>" },
      { postalAddress: "1 Main St", unsubUrl: UNSUB },
    );
    expect(out.text.match(/unsubscribe\?token/g)).toHaveLength(1);
    expect(out.html).toContain(UNSUB);
  });

  it("puts the HTML footer before </body>", () => {
    const out = applyComplianceFooter(
      { text: "x", html: "<html><body><p>Hi</p></body></html>" },
      { postalAddress: "1 Main St", unsubUrl: UNSUB },
    );
    expect(out.html.endsWith("</body></html>")).toBe(true);
    expect(out.html.indexOf("1 Main St")).toBeLessThan(out.html.indexOf("</body>"));
  });

  it("escapes HTML in the company name and address", () => {
    const out = applyComplianceFooter(
      { text: "x", html: "<p>x</p>" },
      { companyName: "A&B <Labs>", postalAddress: "1 <Main> St", unsubUrl: UNSUB },
    );
    expect(out.html).toContain("A&amp;B &lt;Labs&gt;");
    expect(out.html).toContain("1 &lt;Main&gt; St");
  });

  it("skips the postal block when the address is already in the body", () => {
    const body = "Hi\n\nAcme · 1 Main St, Springfield";
    expect(ensurePostalFooter(body, { postalAddress: "1 Main St, Springfield", asHtml: false })).toBe(body);
    expect(hasPostalAddress("<p>1 Main St,<br/>Springfield</p>", "1 Main St,\nSpringfield")).toBe(true);
  });

  it("no-ops without a URL or address", () => {
    expect(ensureUnsubscribeFooter("x", { unsubUrl: "", asHtml: false })).toBe("x");
    expect(ensurePostalFooter("x", { postalAddress: "  ", asHtml: true })).toBe("x");
  });
});

describe("hasUnsubscribeLink", () => {
  it("recognises page and one-click token links", () => {
    expect(hasUnsubscribeLink("go to https://a.b/unsubscribe?token=x")).toBe(true);
    expect(hasUnsubscribeLink('<a href="https://a.b/api/unsubscribe?token=x">u</a>')).toBe(true);
    expect(hasUnsubscribeLink("reply 'unsubscribe' to stop")).toBe(false);
  });
});

describe("global vs per-user suppressions", () => {
  const rows = [
    { value: "a@x.com", userId: "u2", source: "unsubscribe" },
    { value: "b@x.com", userId: "u2", source: "bounce" },
    { value: "c@x.com", userId: "u2", source: "complaint" },
    { value: "d@x.com", userId: "u2", source: "manual" },
    { value: "@blocked.io", userId: "u2", source: "import" },
    { value: "e@x.com", userId: "u1", source: "manual" },
  ];

  it("unsubscribe/bounce/complaint apply to every user; manual/import only to their owner", () => {
    const forU1 = applicableSuppressionValues(rows, "u1");
    expect(forU1.sort()).toEqual(["a@x.com", "b@x.com", "c@x.com", "e@x.com"]);
    expect(matchesSuppression("d@x.com", forU1)).toBe(false);
    expect(matchesSuppression("z@blocked.io", forU1)).toBe(false);
    const forU2 = applicableSuppressionValues(rows, "u2");
    expect(matchesSuppression("z@blocked.io", forU2)).toBe(true);
    expect(matchesSuppression("e@x.com", forU2)).toBe(false);
  });

  it("classifies sources", () => {
    expect(isGlobalSuppressionSource("unsubscribe")).toBe(true);
    expect(isGlobalSuppressionSource("bounce")).toBe(true);
    expect(isGlobalSuppressionSource("complaint")).toBe(true);
    expect(isGlobalSuppressionSource("manual")).toBe(false);
    expect(isGlobalSuppressionSource("import")).toBe(false);
    expect(isGlobalSuppressionSource(null)).toBe(false);
  });

  it("builds email + domain candidates", () => {
    expect(suppressionCandidates(" Dana@Acme.COM ")).toEqual(["dana@acme.com", "@acme.com"]);
  });
});
