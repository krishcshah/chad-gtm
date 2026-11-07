/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { normalizePendingWebsite, savePendingWebsite, takePendingWebsite } from "../pending-website";

describe("pending website (landing → signup → autopilot)", () => {
  afterEach(() => localStorage.clear());

  it("accepts hosts and URLs, rejects junk", () => {
    expect(normalizePendingWebsite(" acme.com ")).toBe("acme.com");
    expect(normalizePendingWebsite("https://acme.co.uk/about")).toBe("https://acme.co.uk/about");
    expect(normalizePendingWebsite("not a site")).toBeNull();
    expect(normalizePendingWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizePendingWebsite("")).toBeNull();
    expect(normalizePendingWebsite(null)).toBeNull();
  });

  it("is read once, then forgotten", () => {
    savePendingWebsite("acme.com");
    expect(takePendingWebsite()).toBe("acme.com");
    expect(takePendingWebsite()).toBeNull();
  });

  it("ignores invalid values", () => {
    savePendingWebsite("<script>");
    expect(takePendingWebsite()).toBeNull();
  });
});
