import { describe, expect, it } from "vitest";
import { FIND_USER_SQL, MAKE_ADMIN_SQL, parseMakeAdminArgs } from "../make-admin";
import { ADMIN_BOOTSTRAP_COMMAND } from "../admin";

describe("make-admin script helpers", () => {
  it("parses --email in both forms and lower-cases it", () => {
    expect(parseMakeAdminArgs(["--email", " Ops@Example.com "])).toEqual({
      ok: true,
      email: "ops@example.com",
      dryRun: false,
      help: false,
    });
    expect(parseMakeAdminArgs(["--email=ops@example.com", "--dry-run"])).toMatchObject({ ok: true, dryRun: true });
  });

  it("rejects missing or malformed input and unknown flags", () => {
    expect(parseMakeAdminArgs([])).toEqual({ ok: false, error: "Missing --email." });
    expect(parseMakeAdminArgs(["--email"])).toMatchObject({ ok: false });
    expect(parseMakeAdminArgs(["--email", "not-an-email"])).toMatchObject({ ok: false });
    expect(parseMakeAdminArgs(["--email", "a@b.co", "--force"])).toMatchObject({ ok: false, error: /Unknown/ });
    expect(parseMakeAdminArgs(["--help"])).toEqual({ ok: true, help: true });
  });

  it("sets role admin and approved_at, by id, keeping an existing approval", () => {
    expect(MAKE_ADMIN_SQL).toMatch(/role = 'admin'/);
    expect(MAKE_ADMIN_SQL).toMatch(/approved_at = COALESCE\(approved_at, now\(\)\)/);
    expect(MAKE_ADMIN_SQL).toMatch(/WHERE id = \$1/);
    expect(FIND_USER_SQL).toMatch(/lower\(email\) = \$1/);
  });

  it("is the documented bootstrap command", () => {
    expect(ADMIN_BOOTSTRAP_COMMAND).toContain("scripts/make-admin.ts --email");
  });
});
