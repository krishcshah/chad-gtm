import { describe, expect, it } from "vitest";
import { expandLoopbackOrigins, resolveTrustedOrigins } from "../auth-trusted-origins";

describe("resolveTrustedOrigins", () => {
  it("expands localhost to 127.0.0.1 twin (with port)", () => {
    const o = expandLoopbackOrigins("http://localhost:3000");
    expect(o).toContain("http://localhost:3000");
    expect(o).toContain("http://127.0.0.1:3000");
  });

  it("expands 127.0.0.1 to localhost twin", () => {
    const o = expandLoopbackOrigins("http://127.0.0.1:3000");
    expect(o).toContain("http://localhost:3000");
    expect(o).toContain("http://127.0.0.1:3000");
  });

  it("merges APP_URL + BETTER_AUTH_URL + CSV", () => {
    const o = resolveTrustedOrigins({
      appUrl: "http://localhost:3000",
      betterAuthUrl: "http://localhost:3000",
      extraCsv: "https://app.example.com",
    });
    expect(o).toContain("http://127.0.0.1:3000");
    expect(o).toContain("https://app.example.com");
  });

  it("production without includeDevLoopback does not invent localhost", () => {
    const o = resolveTrustedOrigins({
      appUrl: "https://mail.example.com",
      betterAuthUrl: "https://mail.example.com",
      includeDevLoopback: false,
    });
    expect(o).toEqual(["https://mail.example.com"]);
  });

  it("dev loopback flag adds both hosts", () => {
    const o = resolveTrustedOrigins({
      appUrl: "https://mail.example.com",
      betterAuthUrl: "https://mail.example.com",
      includeDevLoopback: true,
    });
    expect(o).toContain("http://localhost:3000");
    expect(o).toContain("http://127.0.0.1:3000");
    expect(o).toContain("https://mail.example.com");
  });
});
