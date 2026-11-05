import { describe, expect, it } from "vitest";
import {
  cleanBookingUrl,
  extractBookingLinks,
  isBookingUrl,
  normalizeClientBookingUrl,
  pickBestBookingUrl,
} from "../booking-links";

describe("isBookingUrl", () => {
  it("accepts common scheduling tools", () => {
    for (const u of [
      "https://calendly.com/acme/intro",
      "https://cal.com/acme/demo",
      "https://meetings.hubspot.com/dana",
      "https://savvycal.com/acme/chat",
      "https://calendar.app.google/abc123",
      "https://calendar.google.com/calendar/appointments/schedules/AcZssZ",
      "https://acme.chilipiper.com/book/demo",
    ]) {
      expect(isBookingUrl(u), u).toBe(true);
    }
  });

  it("rejects marketing homepages and unrelated links", () => {
    expect(isBookingUrl("https://calendly.com/")).toBe(false);
    expect(isBookingUrl("https://calendar.google.com/calendar/u/0/r")).toBe(false);
    expect(isBookingUrl("https://acme.com/contact")).toBe(false);
    expect(isBookingUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("extractBookingLinks", () => {
  it("finds hrefs, embeds, data attributes, and inline script urls", () => {
    const html = `
      <header><a href="https://calendly.com/acme/demo?utm_source=site">Book a demo</a></header>
      <div class="calendly-inline-widget" data-url="https://calendly.com/acme/sales-call"></div>
      <button data-cal-link="acme/intro">Talk to us</button>
      <script>Calendly.initPopupWidget({url: 'https://calendly.com/acme/popup'})</script>
      <a href="/pricing">Pricing</a>`;
    const links = extractBookingLinks(html, "https://acme.com");
    expect(links).toContain("https://calendly.com/acme/demo");
    expect(links).toContain("https://calendly.com/acme/sales-call");
    expect(links).toContain("https://cal.com/acme/intro");
    expect(links).toContain("https://calendly.com/acme/popup");
    expect(links.some((l) => l.includes("pricing"))).toBe(false);
  });
});

describe("helpers", () => {
  it("strips tracking params", () => {
    expect(cleanBookingUrl("https://calendly.com/a/b?utm_source=x&month=2026-11#top")).toBe("https://calendly.com/a/b");
  });

  it("prefers demo/sales events", () => {
    expect(pickBestBookingUrl(["https://calendly.com/a/15min", "https://calendly.com/a/demo"])).toBe(
      "https://calendly.com/a/demo",
    );
    expect(pickBestBookingUrl([])).toBeNull();
  });

  it("normalizes client-supplied links", () => {
    expect(normalizeClientBookingUrl("cal.com/me/intro")).toBe("https://cal.com/me/intro");
    expect(normalizeClientBookingUrl("not a url")).toBeNull();
    expect(normalizeClientBookingUrl("")).toBeNull();
  });
});
