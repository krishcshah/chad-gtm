import { describe, expect, it } from "vitest";
import { distillHtml, isPublicHttpUrl, normalizeTargetUrl } from "../gtm-crawler";

describe("isPublicHttpUrl", () => {
  it("allows normal public HTTPS URLs", () => {
    expect(isPublicHttpUrl("https://stripe.com/pricing")).toBe(true);
    expect(isPublicHttpUrl("http://example.com")).toBe(true);
  });

  it("blocks loopback, private ranges and non-HTTP schemes", () => {
    expect(isPublicHttpUrl("http://localhost:3000")).toBe(false);
    expect(isPublicHttpUrl("http://127.0.0.1")).toBe(false);
    expect(isPublicHttpUrl("http://10.0.0.5")).toBe(false);
    expect(isPublicHttpUrl("http://192.168.1.10")).toBe(false);
    expect(isPublicHttpUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isPublicHttpUrl("http://[::1]")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isPublicHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("normalizeTargetUrl", () => {
  it("adds https and strips www for the domain", () => {
    expect(normalizeTargetUrl("www.acme.io/pricing")).toEqual({
      normalizedUrl: "https://www.acme.io",
      domain: "acme.io",
    });
  });
});

describe("distillHtml", () => {
  const html = `
    <html>
      <head>
        <title>Acme — Workflow Automation</title>
        <meta name="description" content="Acme automates finance workflows." />
      </head>
      <body>
        <nav>Home Pricing Login</nav>
        <h1>Close the books faster</h1>
        <h2>Trusted by modern finance teams</h2>
        <p>Acme cuts month-end close time by 62% for mid-market finance teams.</p>
        <p>Unlike Ramp, Acme reconciles every ledger automatically.</p>
        <ul>
          <li>Automated three-way matching</li>
          <li>Audit-ready approval trails</li>
        </ul>
        <section class="pricing-card">
          <h3>Growth</h3>
          <div class="price">$49/mo</div>
          <ul><li>Up to 5 seats</li><li>Unlimited reconciliations</li></ul>
        </section>
      </body>
    </html>`;

  it("extracts positioning, proof, competitor contrast and pricing", () => {
    const page = distillHtml(html, "https://acme.io/");
    expect(page.title).toContain("Acme");
    expect(page.headings).toContain("Close the books faster");
    expect(page.caseStudySignals.join(" ")).toContain("62%");
    expect(page.competitorSignals.join(" ")).toContain("Ramp");
    expect(page.pricingTiers.length).toBeGreaterThan(0);
    expect(page.pricingTiers[0]?.name).toBe("Growth");
    expect(page.pricingTiers[0]?.price).toBe("$49/mo");
    expect(page.renderedWith).toBe("static");
  });
});
