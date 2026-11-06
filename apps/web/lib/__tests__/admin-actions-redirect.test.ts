import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("../session", () => ({ requireUser: () => requireUser() }));
vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../admin-analytics", () => ({ getUserDetailedActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { approveUserAction, revokeUserApprovalAction } from "../admin-actions";

function redirectError() {
  return Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
}

describe("admin approval actions with an expired session", () => {
  beforeEach(() => {
    requireUser.mockReset();
  });

  it("rethrows the login redirect instead of returning 'NEXT_REDIRECT' as an error", async () => {
    const err = redirectError();
    requireUser.mockRejectedValue(err);
    for (const action of [approveUserAction, revokeUserApprovalAction]) {
      let caught: unknown = null;
      let result: unknown = null;
      try {
        result = await action("usr_1");
      } catch (e) {
        caught = e;
      }
      expect(result).toBeNull();
      expect(caught).toBe(err);
    }
  });

  it("still returns non-admin access as an error result", async () => {
    requireUser.mockResolvedValue({ id: "u", email: "x@y.z", role: "user", emailVerified: true });
    expect(await approveUserAction("usr_1")).toEqual({ ok: false, error: "Unauthorized: Admin privileges required." });
  });
});
