import { beforeEach, describe, expect, it, vi } from "vitest";

const { system } = vi.hoisted(() => ({
  system: {
    configured: false,
    sendSystemEmail: vi.fn(),
  },
}));

vi.mock("../system-mailer", () => ({
  isSystemMailerConfigured: () => system.configured,
  sendSystemEmail: system.sendSystemEmail,
}));

import { notifyClientOfRequest } from "../reply-agent";
import type { SenderRow } from "../db-port";

function fakeDb(owner: { email: string; name: string } | null) {
  const updates: any[] = [];
  const db: any = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (owner ? [owner] : []) }),
      }),
    }),
    update: () => ({
      set: (values: any) => ({
        where: async () => {
          updates.push(values);
          return [];
        },
      }),
    }),
  };
  return { db, updates };
}

const SENDER = { id: "s1", email: "pool@mailbox.com" } as unknown as SenderRow;
const NOW = new Date("2026-11-06T12:00:00.000Z");

describe("notifyClientOfRequest", () => {
  beforeEach(() => {
    system.configured = false;
    system.sendSystemEmail.mockReset();
  });

  it("uses the system mailer when configured and records notified_at", async () => {
    system.configured = true;
    system.sendSystemEmail.mockResolvedValue({ messageId: "m" });
    const poolSend = vi.fn();
    const { db, updates } = fakeDb({ email: "client@acme.com", name: "Dana Client" });

    await notifyClientOfRequest(db, SENDER, "u1", "Case study", "Do you have one?", "lead@x.com", {
      sendMail: poolSend,
      now: () => NOW,
    });

    expect(poolSend).not.toHaveBeenCalled();
    expect(system.sendSystemEmail).toHaveBeenCalledTimes(1);
    const msg = system.sendSystemEmail.mock.calls[0][0];
    expect(msg.to).toBe("client@acme.com");
    expect(msg.subject).toBe("Your agent needs you: Case study");
    expect(msg.text).toContain("Hi Dana");
    expect(updates).toEqual([{ notifiedAt: NOW.toISOString() }]);
  });

  it("falls back to the pool mailbox when the system mailer is not configured", async () => {
    const poolSend = vi.fn().mockResolvedValue({ messageId: "m" });
    const { db, updates } = fakeDb({ email: "client@acme.com", name: "" });

    await notifyClientOfRequest(db, SENDER, "u1", "Pricing", "How much?", "lead@x.com", {
      sendMail: poolSend,
      now: () => NOW,
    });

    expect(system.sendSystemEmail).not.toHaveBeenCalled();
    expect(poolSend).toHaveBeenCalledWith(SENDER, expect.objectContaining({ to: "client@acme.com" }));
    expect(updates).toHaveLength(1);
  });

  it("does not set notified_at when the send fails", async () => {
    system.configured = true;
    system.sendSystemEmail.mockRejectedValue(new Error("SMTP down"));
    const { db, updates } = fakeDb({ email: "client@acme.com", name: "Dana" });

    await expect(
      notifyClientOfRequest(db, SENDER, "u1", "t", "q", "lead@x.com", { now: () => NOW }),
    ).rejects.toThrow("SMTP down");
    expect(updates).toHaveLength(0);
  });

  it("does nothing when the owner has no email", async () => {
    system.configured = true;
    const { db, updates } = fakeDb(null);
    await notifyClientOfRequest(db, SENDER, "u1", "t", "q", "lead@x.com", {});
    expect(system.sendSystemEmail).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
