import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, close, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  const close = vi.fn();
  const createTransport = vi.fn(() => ({ sendMail, close }));
  return { sendMail, close, createTransport };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));

import {
  isSystemMailerConfigured,
  readSystemMailerConfig,
  sendSystemEmail,
  systemTransportOptions,
} from "../system-mailer";

const BASE = {
  SYSTEM_SMTP_HOST: "smtp.example.com",
  SYSTEM_SMTP_USER: "notify@example.com",
  SYSTEM_SMTP_PASS: "secret",
  SYSTEM_EMAIL_FROM: "AutoGTM <notify@example.com>",
};

describe("readSystemMailerConfig", () => {
  it("is null without host or from", () => {
    expect(readSystemMailerConfig({})).toBeNull();
    expect(readSystemMailerConfig({ SYSTEM_SMTP_HOST: "smtp.example.com" })).toBeNull();
    expect(readSystemMailerConfig({ SYSTEM_EMAIL_FROM: "a@b.c" })).toBeNull();
    expect(isSystemMailerConfigured({})).toBe(false);
  });

  it("defaults to port 587 with STARTTLS", () => {
    const c = readSystemMailerConfig(BASE)!;
    expect(c.port).toBe(587);
    expect(c.secure).toBe(false);
    expect(isSystemMailerConfigured(BASE)).toBe(true);
  });

  it("infers implicit TLS from port 465 and honours SYSTEM_SMTP_SECURE", () => {
    expect(readSystemMailerConfig({ ...BASE, SYSTEM_SMTP_PORT: "465" })!.secure).toBe(true);
    expect(readSystemMailerConfig({ ...BASE, SYSTEM_SMTP_PORT: "465", SYSTEM_SMTP_SECURE: "false" })!.secure).toBe(false);
    expect(readSystemMailerConfig({ ...BASE, SYSTEM_SMTP_PORT: "2525", SYSTEM_SMTP_SECURE: "true" })!.secure).toBe(true);
  });

  it("rejects an invalid port and half-configured auth", () => {
    expect(readSystemMailerConfig({ ...BASE, SYSTEM_SMTP_PORT: "abc" })).toBeNull();
    expect(readSystemMailerConfig({ ...BASE, SYSTEM_SMTP_PASS: "" })).toBeNull();
  });

  it("allows an unauthenticated relay", () => {
    const c = readSystemMailerConfig({ SYSTEM_SMTP_HOST: "relay", SYSTEM_EMAIL_FROM: "a@b.c" })!;
    expect(c.user).toBeUndefined();
    expect(systemTransportOptions(c).auth).toBeUndefined();
  });
});

describe("systemTransportOptions", () => {
  it("always verifies certificates and requires TLS before AUTH", () => {
    const opts = systemTransportOptions(readSystemMailerConfig(BASE)!);
    expect(opts.tls.rejectUnauthorized).toBe(true);
    expect(opts.requireTLS).toBe(true);
    expect(opts.auth).toEqual({ user: "notify@example.com", pass: "secret" });
  });
});

describe("sendSystemEmail", () => {
  beforeEach(() => {
    sendMail.mockReset();
    close.mockReset();
    createTransport.mockClear();
  });

  it("sends from SYSTEM_EMAIL_FROM and closes the transport", async () => {
    sendMail.mockResolvedValue({ messageId: "<m1@example.com>" });
    const res = await sendSystemEmail(
      { to: " client@acme.com ", subject: "Hi", text: "Body", html: "<p>Body</p>" },
      BASE,
    );
    expect(res.messageId).toBe("<m1@example.com>");
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      from: "AutoGTM <notify@example.com>",
      to: "client@acme.com",
      subject: "Hi",
      text: "Body",
      html: "<p>Body</p>",
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("throws when not configured, without creating a transport", async () => {
    await expect(sendSystemEmail({ to: "a@b.c", subject: "s", text: "t" }, {})).rejects.toThrow(/not configured/);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("propagates SMTP failures and still closes the transport", async () => {
    sendMail.mockRejectedValue(new Error("535 auth failed"));
    await expect(sendSystemEmail({ to: "a@b.c", subject: "s", text: "t" }, BASE)).rejects.toThrow("535");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
