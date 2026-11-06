import { describe, expect, it } from "vitest";
import { getAdminEmails, isAdmin, isAdminEmail, requireAdmin } from "../admin";

const ENV = { ADMIN_EMAILS: " Ops@Example.com, second@example.com ,," };

describe("admin access", () => {
  it("parses ADMIN_EMAILS and has no hard-coded defaults", () => {
    expect(getAdminEmails(ENV)).toEqual(["ops@example.com", "second@example.com"]);
    expect(getAdminEmails({})).toEqual([]);
    expect(isAdminEmail("de.krish.shah@gmail.com", {})).toBe(false);
    expect(isAdminEmail("krish@leadskingdom.co", {})).toBe(false);
  });

  it("grants admin by role regardless of email", () => {
    expect(isAdmin({ role: "admin", email: "anyone@x.com", emailVerified: false }, {})).toBe(true);
  });

  it("grants admin by ADMIN_EMAILS only when the email is verified", () => {
    expect(isAdmin({ email: "ops@example.com", emailVerified: true, role: "user" }, ENV)).toBe(true);
    expect(isAdmin({ email: "ops@example.com", emailVerified: false, role: "user" }, ENV)).toBe(false);
    expect(isAdmin({ email: "ops@example.com" }, ENV)).toBe(false);
    expect(isAdmin({ email: "other@example.com", emailVerified: true }, ENV)).toBe(false);
  });

  it("rejects missing users", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(() => requireAdmin(null)).toThrow(/Admin privileges/);
    expect(() => requireAdmin({ role: "admin" })).not.toThrow();
  });
});
