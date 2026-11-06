import { beforeEach, describe, expect, it, vi } from "vitest";

const grantRows: { current: Array<{ id: string; status: string }> } = { current: [] };

vi.mock("../db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => grantRows.current,
  };
  return {
    getDb: () => ({
      execute: async () => undefined,
      select: () => chain,
    }),
  };
});

import { getDirectoryAccessLevel, hasB2BAccess } from "../b2b-access";

describe("hasB2BAccess / getDirectoryAccessLevel (user object, verified admins only)", () => {
  const prevAdmins = process.env.ADMIN_EMAILS;
  beforeEach(() => {
    grantRows.current = [];
    process.env.ADMIN_EMAILS = "ops@example.com";
    return () => {
      process.env.ADMIN_EMAILS = prevAdmins;
    };
  });

  it("does not grant access to an UNVERIFIED address listed in ADMIN_EMAILS", async () => {
    const user = { id: "u1", email: "ops@example.com", role: "user", emailVerified: false };
    expect(await hasB2BAccess(user)).toBe(false);
    expect(await getDirectoryAccessLevel(user)).toBe("none");
  });

  it("grants access to a verified ADMIN_EMAILS address and to the admin role", async () => {
    expect(await hasB2BAccess({ id: "u1", email: "ops@example.com", emailVerified: true })).toBe(true);
    expect(await hasB2BAccess({ id: "u2", email: "x@example.com", role: "admin" })).toBe(true);
    expect(await getDirectoryAccessLevel({ id: "u2", email: "x@example.com", role: "admin" })).toBe("admin");
  });

  it("grants access via an active grant row", async () => {
    grantRows.current = [{ id: "g1", status: "active" }];
    const user = { id: "u3", email: "buyer@example.com", role: "user", emailVerified: true };
    expect(await hasB2BAccess(user)).toBe(true);
    expect(await getDirectoryAccessLevel(user)).toBe("paid");
  });
});
