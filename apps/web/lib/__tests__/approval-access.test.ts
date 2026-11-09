import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Row returned by the users lookup; `undefined` means unknown user. */
let userRow: Record<string, unknown> | undefined;
const setCalls: Array<Record<string, unknown>> = [];

function fakeDb() {
  const select = () => ({
    from: () => ({
      where: () => ({
        limit: async () => (userRow ? [userRow] : []),
      }),
    }),
  });
  const update = () => ({
    set: (values: Record<string, unknown>) => {
      setCalls.push(values);
      return {
        where: () => ({
          returning: async () => [{ id: "usr_target", email: "t@example.com", name: "T" }],
        }),
      };
    },
  });
  return { select, update };
}

vi.mock("../db", () => ({ getDb: () => fakeDb() }));
const requireUser = vi.fn();
vi.mock("../session", () => ({ requireUser: () => requireUser() }));
vi.mock("../admin-analytics", () => ({ getUserDetailedActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../autopilot-advance", () => ({
  beginApprovalLaunch: async () => ({ note: { kind: "none" }, holdUntil: null, notStarted: [], latestRunId: null, reapproved: false }),
  finishApprovalLaunch: async () => {},
}));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void task() }));
vi.mock("@smartreach/email-engine/system-mailer", () => ({
  isSystemMailerConfigured: () => false,
  sendSystemEmail: vi.fn(),
}));

import {
  APPROVAL_REQUIRED_ERROR,
  SENDING_REVOKED_ERROR,
  assertCanSend,
  getSendAccess,
  isApprovedToSend,
  isSendAccessError,
} from "../approval";
import { approveUserAction, revokeUserApprovalAction } from "../admin-actions";

const ORIGINAL = process.env.SIGNUP_APPROVAL_REQUIRED;

beforeEach(() => {
  userRow = undefined;
  setCalls.length = 0;
  delete process.env.SIGNUP_APPROVAL_REQUIRED;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SIGNUP_APPROVAL_REQUIRED;
  else process.env.SIGNUP_APPROVAL_REQUIRED = ORIGINAL;
});

describe("getSendAccess", () => {
  it("is approved for admins and for approved accounts", async () => {
    userRow = { role: "admin", approvedAt: null, approvalRevokedAt: null };
    expect(await getSendAccess("u1")).toBe("approved");
    userRow = { role: "user", approvedAt: new Date(), approvalRevokedAt: null };
    expect(await getSendAccess("u1")).toBe("approved");
    expect(await isApprovedToSend("u1")).toBe(true);
  });

  it("is revoked when approval was taken away", async () => {
    userRow = { role: "user", approvedAt: null, approvalRevokedAt: new Date() };
    expect(await getSendAccess("u1")).toBe("revoked");
    expect(await isApprovedToSend("u1")).toBe(false);
  });

  it("is pending for never-approved and unknown accounts", async () => {
    userRow = { role: "user", approvedAt: null, approvalRevokedAt: null };
    expect(await getSendAccess("u1")).toBe("pending");
    userRow = undefined;
    expect(await getSendAccess("missing")).toBe("pending");
  });

  it("is approved for everyone when approval is switched off", async () => {
    process.env.SIGNUP_APPROVAL_REQUIRED = "false";
    userRow = { role: "user", approvedAt: null, approvalRevokedAt: new Date() };
    expect(await getSendAccess("u1")).toBe("approved");
  });
});

describe("assertCanSend", () => {
  it("throws the revoked error for revoked accounts and the approval error for pending ones", async () => {
    userRow = { role: "user", approvedAt: null, approvalRevokedAt: new Date() };
    await expect(assertCanSend("u1")).rejects.toThrow(SENDING_REVOKED_ERROR);
    userRow = { role: "user", approvedAt: null, approvalRevokedAt: null };
    await expect(assertCanSend("u1")).rejects.toThrow(APPROVAL_REQUIRED_ERROR);
    userRow = { role: "user", approvedAt: new Date(), approvalRevokedAt: null };
    await expect(assertCanSend("u1")).resolves.toBeUndefined();
  });

  it("recognises both send-access errors", () => {
    expect(isSendAccessError(SENDING_REVOKED_ERROR)).toBe(true);
    expect(isSendAccessError(APPROVAL_REQUIRED_ERROR)).toBe(true);
    expect(isSendAccessError("Something else")).toBe(false);
    expect(SENDING_REVOKED_ERROR).toMatch(/Contact support/);
  });
});

describe("admin approval actions", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({ id: "usr_admin", email: "a@x.com", role: "admin", emailVerified: true });
  });

  it("revoking records when approval was revoked", async () => {
    const res = await revokeUserApprovalAction("usr_target");
    expect(res.ok).toBe(true);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]!.approvedAt).toBeNull();
    expect(setCalls[0]!.approvalRevokedAt).toBeInstanceOf(Date);
  });

  it("approving clears the revoked marker", async () => {
    const res = await approveUserAction("usr_target");
    expect(res.ok).toBe(true);
    expect(setCalls[0]!.approvedAt).toBeInstanceOf(Date);
    expect(setCalls[0]!.approvalRevokedAt).toBeNull();
  });
});
