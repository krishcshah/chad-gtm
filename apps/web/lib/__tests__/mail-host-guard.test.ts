import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAIL_PORTS,
  mailHostError,
  mailHostSyntaxError,
  mailPortError,
  senderEndpointsError,
} from "../mail-host-guard";
import type { LookupAll } from "../url-guard";

const fakeDns: Record<string, string[]> = {
  "smtp.gmail.com": ["142.250.4.108"],
  "imap.gmail.com": ["142.250.4.109"],
  "rebind.example.com": ["127.0.0.1"],
  "meta.example.com": ["169.254.169.254"],
  "mixed.example.com": ["142.250.4.108", "192.168.1.1"],
};
const lookup: LookupAll = async (host) => {
  const ips = fakeDns[host];
  if (!ips) throw new Error("ENOTFOUND");
  return ips.map((address) => ({ address, family: 4 }));
};

describe("mail endpoint guard (pure)", () => {
  it("only standard mail ports", () => {
    for (const p of MAIL_PORTS.smtp) expect(mailPortError("smtp", p)).toBeNull();
    for (const p of MAIL_PORTS.imap) expect(mailPortError("imap", p)).toBeNull();
    for (const p of [22, 80, 443, 5432, 6379, 3005, 0, 70000, "x"]) expect(mailPortError("smtp", p)).not.toBeNull();
    expect(mailPortError("imap", 587)).not.toBeNull();
  });

  it("refuses internal hosts and non-host strings", () => {
    for (const h of [
      "127.0.0.1",
      "0x7f.1",
      "2130706433",
      "169.254.169.254",
      "10.1.2.3",
      "::1",
      "[::1]",
      "localhost",
      "db.internal",
      "intranet",
      "smtp.gmail.com:25",
      "http://smtp.gmail.com",
      "user@smtp.gmail.com",
      "",
    ]) {
      expect(mailHostSyntaxError("smtp", h), h).not.toBeNull();
    }
    expect(mailHostSyntaxError("smtp", "smtp.gmail.com")).toBeNull();
    expect(mailHostSyntaxError("smtp", "142.250.4.108")).toBeNull();
  });
});

describe("mail endpoint guard (DNS)", () => {
  it("refuses names that resolve to non-public addresses", async () => {
    expect(await mailHostError("smtp", "rebind.example.com", lookup)).toMatch(/public/);
    expect(await mailHostError("smtp", "meta.example.com", lookup)).toMatch(/public/);
    expect(await mailHostError("smtp", "mixed.example.com", lookup)).toMatch(/public/);
    expect(await mailHostError("smtp", "nx.example.com", lookup)).toMatch(/public/);
    expect(await mailHostError("smtp", "smtp.gmail.com", lookup)).toBeNull();
  });

  it("checks SMTP always and IMAP when configured", async () => {
    expect(await senderEndpointsError({ smtpHost: "smtp.gmail.com", smtpPort: 587, imapHost: "", imapPort: 993 }, lookup)).toBeNull();
    expect(
      await senderEndpointsError({ smtpHost: "smtp.gmail.com", smtpPort: 465, imapHost: "imap.gmail.com", imapPort: 993 }, lookup),
    ).toBeNull();
    expect(
      await senderEndpointsError({ smtpHost: "smtp.gmail.com", smtpPort: 587, imapHost: "meta.example.com", imapPort: 993 }, lookup),
    ).toMatch(/IMAP/);
    expect(await senderEndpointsError({ smtpHost: "smtp.gmail.com", smtpPort: 5432 }, lookup)).toMatch(/SMTP port/);
  });
});

/* testSenderConnection must refuse before any socket is opened. */

const st = vi.hoisted(() => ({ testConnection: vi.fn(async () => ({ smtp: { ok: true, message: "" }, imap: { ok: true, message: "" } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined })), headers: vi.fn() }));
vi.mock("../session", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "c@example.com", role: "user", emailVerified: true })),
  requireWorkspace: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../db", () => ({ getDb: () => ({}), ensureChadGtmTables: async () => undefined, ensureAgentTables: async () => undefined }));
vi.mock("@smartreach/email-engine/mailer", () => ({ testConnection: st.testConnection }));

import { testSenderConnection } from "../actions";

const base = {
  smtpHost: "142.250.4.108",
  smtpPort: 587,
  smtpUsername: "me",
  smtpPassword: "pw",
  smtpSecurity: "tls",
  imapHost: "",
  imapPort: 993,
  imapUsername: "",
  imapPassword: "",
};

describe("testSenderConnection", () => {
  beforeEach(() => st.testConnection.mockClear());

  it.each([
    [{ smtpHost: "127.0.0.1", smtpPort: 5432 }],
    [{ smtpHost: "127.0.0.1" }],
    [{ smtpPort: 5432 }],
    [{ imapHost: "169.254.169.254", imapPort: 80 }],
    [{ imapHost: "169.254.169.254" }],
    [{ smtpHost: "localhost" }],
  ])("refuses %o without connecting", async (patch) => {
    const r = await testSenderConnection({ ...base, ...patch });
    expect(r.ok).toBe(false);
    expect(st.testConnection).not.toHaveBeenCalled();
  });

  it("tests a public mail server", async () => {
    // Throwaway key generated per run: the action encrypts the password it passes on.
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    const r = await testSenderConnection(base);
    vi.unstubAllEnvs();
    expect(r).toMatchObject({ ok: true });
    expect(st.testConnection).toHaveBeenCalledTimes(1);
  });
});
