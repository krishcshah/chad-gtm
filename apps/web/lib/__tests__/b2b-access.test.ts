import { describe, expect, it } from "vitest";
import { isAdminEmail } from "../admin";
import { getB2BCheckoutUrl, STRIPE_B2B_CHECKOUT_BASE } from "../b2b-access";

describe("B2B Database Access & Paywall Configuration", () => {
  it("matches admin emails only from ADMIN_EMAILS, case- and space-insensitively", () => {
    const env = { ADMIN_EMAILS: "ops@example.com" };
    expect(isAdminEmail("ops@example.com", env)).toBe(true);
    expect(isAdminEmail("OPS@EXAMPLE.COM", env)).toBe(true);
    expect(isAdminEmail("ops@example.com ", env)).toBe(true);
    expect(isAdminEmail("regular-user@gmail.com", env)).toBe(false);
    expect(isAdminEmail("ops@example.com", {})).toBe(false);
    expect(isAdminEmail("", env)).toBe(false);
    expect(isAdminEmail(undefined, env)).toBe(false);
  });

  it("constructs correct Stripe checkout link prefilled with $99.00 USD and user metadata", () => {
    const email = "founder@company.com";
    const userId = "usr_123456";
    const checkoutUrl = getB2BCheckoutUrl(email, userId);

    expect(checkoutUrl).toContain(STRIPE_B2B_CHECKOUT_BASE);
    const parsed = new URL(checkoutUrl);
    expect(parsed.searchParams.get("prefilled_amount")).toBe("9900");
    expect(parsed.searchParams.get("prefilled_email")).toBe(email);
    expect(parsed.searchParams.get("client_reference_id")).toBe(userId);
  });

  it("handles empty parameters gracefully in getB2BCheckoutUrl", () => {
    const url = getB2BCheckoutUrl();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("prefilled_amount")).toBe("9900");
    expect(parsed.searchParams.get("prefilled_email")).toBeNull();
    expect(parsed.searchParams.get("client_reference_id")).toBeNull();
  });
});
