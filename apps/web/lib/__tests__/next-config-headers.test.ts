import { describe, expect, it } from "vitest";
import nextConfig, { SECURITY_HEADERS } from "../../next.config";

describe("next.config security headers", () => {
  it("applies the security headers to every path", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all?.headers).toEqual(SECURITY_HEADERS);
    const byKey = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]));
    expect(byKey["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Permissions-Policy"]).toContain("camera=()");
    expect(byKey["Content-Security-Policy"]).toBeUndefined();
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
