import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));

import {
  notifyAdminsOfSignup,
  notifyAdminsOfSignupInBackground,
  signupAlertRecipients,
  type SignupNotifyDeps,
} from "../signup-notify";
import { adminApprovalsUrl, buildSignupAlertEmail } from "../system-emails";

function deps(over: Partial<SignupNotifyDeps> = {}): SignupNotifyDeps & { send: ReturnType<typeof vi.fn> } {
  return {
    mailerConfigured: () => true,
    send: vi.fn(async () => undefined),
    adminRoleEmails: async () => ["owner@autogtm.tech"],
    approvalRequired: () => true,
    appUrl: "https://autogtm.tech/",
    env: { ADMIN_EMAILS: "ops@autogtm.tech, OWNER@autogtm.tech" },
    ...over,
  } as SignupNotifyDeps & { send: ReturnType<typeof vi.fn> };
}

const user = { email: "dana@client.test", name: "Dana Lee", role: "user" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("signup alert email", () => {
  it("names the person and links to the approvals page", () => {
    const mail = buildSignupAlertEmail({ name: "Dana <b>Lee</b>", email: "dana@client.test", appUrl: "https://autogtm.tech/" });
    expect(mail.subject).toBe("New AutoGTM signup: dana@client.test");
    expect(mail.text).toContain("Dana <b>Lee</b> (dana@client.test) just signed up");
    expect(mail.text).toContain("https://autogtm.tech/admin?tab=approvals");
    expect(mail.html).toContain('href="https://autogtm.tech/admin?tab=approvals"');
    expect(mail.html).not.toContain("<b>Lee</b>");
    expect(adminApprovalsUrl("")).toBe("");
    expect(buildSignupAlertEmail({ email: "x@y.test", website: "acme.com" }).text).toContain("Website: acme.com");
  });
});

describe("notifyAdminsOfSignup", () => {
  it("emails each admin once (ADMIN_EMAILS and admin-role users, de-duplicated)", async () => {
    const d = deps();
    expect(await notifyAdminsOfSignup(user, d)).toBe(2);
    expect(d.send.mock.calls.map((c) => c[0].to).sort()).toEqual(["ops@autogtm.tech", "owner@autogtm.tech"]);
    const mail = d.send.mock.calls[0]![0];
    expect(mail.subject).toContain("dana@client.test");
    expect(mail.text).toContain("Dana Lee");
    expect(mail.text).toContain("https://autogtm.tech/admin?tab=approvals");
  });

  it("does nothing without a system mailer", async () => {
    const d = deps({ mailerConfigured: () => false });
    expect(await notifyAdminsOfSignup(user, d)).toBe(0);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("does nothing when approval is not required", async () => {
    const d = deps({ approvalRequired: () => false });
    expect(await notifyAdminsOfSignup(user, d)).toBe(0);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("never alerts the new user about themselves, and skips admin sign-ups", async () => {
    const d = deps({ env: { ADMIN_EMAILS: "dana@client.test" }, adminRoleEmails: async () => [] });
    expect(await signupAlertRecipients(user, d)).toEqual([]);
    expect(await notifyAdminsOfSignup(user, d)).toBe(0);
    expect(await notifyAdminsOfSignup({ ...user, role: "admin" }, deps())).toBe(0);
  });

  it("skips users who are already approved (a changed address being verified)", async () => {
    const d = deps();
    expect(await notifyAdminsOfSignup({ ...user, approvedAt: new Date() }, d)).toBe(0);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("still uses ADMIN_EMAILS when the admin lookup fails, and survives a failed send", async () => {
    const d = deps({
      adminRoleEmails: async () => {
        throw new Error("db down");
      },
      env: { ADMIN_EMAILS: "a@autogtm.tech,b@autogtm.tech" },
    });
    d.send.mockRejectedValueOnce(new Error("smtp down"));
    expect(await notifyAdminsOfSignup(user, d)).toBe(1);
    expect(d.send).toHaveBeenCalledTimes(2);
  });
});

describe("notifyAdminsOfSignupInBackground (the better-auth hook)", () => {
  it("returns at once even when the send never finishes", () => {
    const d = deps({ send: vi.fn(() => new Promise(() => {})) });
    const started = Date.now();
    expect(notifyAdminsOfSignupInBackground(user, d)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(50);
  });

  it("never throws, even when everything fails", async () => {
    const d = deps({
      approvalRequired: () => {
        throw new Error("boom");
      },
    });
    expect(() => notifyAdminsOfSignupInBackground(user, d)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it("sends once per sign-up", async () => {
    const d = deps({ env: {}, adminRoleEmails: async () => ["owner@autogtm.tech"] });
    notifyAdminsOfSignupInBackground(user, d);
    await vi.waitFor(() => expect(d.send).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(d.send).toHaveBeenCalledTimes(1);
  });
});
