import { describe, expect, it, vi } from "vitest";
import {
  MAX_POOL_MAILBOXES_PER_DOMAIN,
  POOL_ACTIVATION_NEEDS_TEST_ERROR,
  countPoolMailboxesByDomain,
  emailDomain,
  patchChangesCredentials,
  planPoolMailboxImport,
  poolActivationBlocker,
  testPoolMailbox,
  verdictFromConnectionTest,
} from "../pool-mailbox-import";

const ok = { ok: true, message: "ok" };
const bad = (message: string) => ({ ok: false, message });

describe("verdictFromConnectionTest", () => {
  it("activates only when SMTP and IMAP logins both pass", () => {
    expect(verdictFromConnectionTest({ smtp: ok, imap: ok })).toMatchObject({
      active: true,
      status: "active",
      smtpStatus: "ok",
      imapStatus: "ok",
      error: null,
    });
    const imapFail = verdictFromConnectionTest({ smtp: ok, imap: bad("IMAP failed: auth") });
    expect(imapFail).toMatchObject({ active: false, status: "failed", smtpStatus: "ok", imapStatus: "failed" });
    expect(imapFail.error).toContain("IMAP failed: auth");
    const both = verdictFromConnectionTest({ smtp: bad("SMTP failed"), imap: bad("IMAP failed") });
    expect(both.error).toBe("SMTP failed · IMAP failed");
  });

  it("turns a thrown tester error into an inactive verdict", async () => {
    const v = await testPoolMailbox({}, async () => {
      throw new Error("ETIMEDOUT");
    });
    expect(v).toMatchObject({ active: false, status: "failed", error: "ETIMEDOUT" });
  });
});

describe("planPoolMailboxImport", () => {
  const cand = (row: number, email: string) => ({ row, email });

  it("tests every new mailbox and keeps failures inactive with the error", async () => {
    const tester = vi.fn(async (c: { email: string }) =>
      c.email.startsWith("good") ? { smtp: ok, imap: ok } : { smtp: ok, imap: bad("IMAP failed: no login") },
    );
    const plan = await planPoolMailboxImport({
      candidates: [cand(1, "good@a.com"), cand(2, "broken@a.com")],
      existingEmails: new Set(),
      existingDomainCounts: new Map(),
      tester,
    });
    expect(tester).toHaveBeenCalledTimes(2);
    expect(plan.rejected).toEqual([]);
    expect(plan.toInsert.map((i) => [i.candidate.email, i.verdict.status])).toEqual([
      ["good@a.com", "active"],
      ["broken@a.com", "failed"],
    ]);
    expect(plan.toInsert[1].verdict.error).toContain("no login");
  });

  it(`allows at most ${MAX_POOL_MAILBOXES_PER_DOMAIN} pool mailboxes per domain, counting existing ones`, async () => {
    const tester = vi.fn(async () => ({ smtp: ok, imap: ok }));
    const plan = await planPoolMailboxImport({
      candidates: [cand(1, "a@x.com"), cand(2, "b@x.com"), cand(3, "c@X.com"), cand(4, "d@y.com")],
      existingEmails: new Set(["old@x.com"]),
      existingDomainCounts: new Map([["x.com", 1]]),
      tester,
    });
    expect(plan.toInsert.map((i) => i.candidate.email)).toEqual(["a@x.com", "b@x.com", "d@y.com"]);
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0].row).toBe(3);
    expect(plan.rejected[0].error).toMatch(/x\.com already has 3 shared mailboxes/);
    // The capped row is never tested (no login attempt).
    expect(tester).toHaveBeenCalledTimes(3);
  });

  it("skips the per-domain cap for dedicated mailboxes (enforceDomainCap: false) but still tests them", async () => {
    const tester = vi.fn(async () => ({ smtp: ok, imap: ok }));
    const candidates = [cand(1, "a@x.com"), cand(2, "b@x.com"), cand(3, "c@x.com"), cand(4, "d@x.com")];
    const dedicated = await planPoolMailboxImport({
      candidates,
      existingEmails: new Set(),
      existingDomainCounts: new Map(),
      tester,
      enforceDomainCap: false,
    });
    expect(dedicated.rejected).toEqual([]);
    expect(dedicated.toInsert.map((i) => i.candidate.email)).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    expect(tester).toHaveBeenCalledTimes(4);

    const pooled = await planPoolMailboxImport({
      candidates,
      existingEmails: new Set(),
      existingDomainCounts: new Map(),
      tester: vi.fn(async () => ({ smtp: ok, imap: ok })),
    });
    expect(pooled.toInsert).toHaveLength(3);
    expect(pooled.rejected.map((r) => r.row)).toEqual([4]);
  });

  it("dedicated imports still reject duplicates", async () => {
    const plan = await planPoolMailboxImport({
      candidates: [cand(1, "Old@x.com")],
      existingEmails: new Set(["old@x.com"]),
      existingDomainCounts: new Map(),
      tester: vi.fn(async () => ({ smtp: ok, imap: ok })),
      enforceDomainCap: false,
    });
    expect(plan.toInsert).toEqual([]);
    expect(plan.rejected.map((r) => r.row)).toEqual([1]);
  });

  it("rejects duplicates (existing and within the file) without testing them", async () => {
    const tester = vi.fn(async () => ({ smtp: ok, imap: ok }));
    const plan = await planPoolMailboxImport({
      candidates: [cand(1, "Old@x.com"), cand(2, "new@x.com"), cand(3, "NEW@x.com")],
      existingEmails: new Set(["old@x.com"]),
      existingDomainCounts: new Map(),
      tester,
    });
    expect(plan.toInsert.map((i) => i.candidate.email)).toEqual(["new@x.com"]);
    expect(plan.rejected.map((r) => r.row)).toEqual([1, 3]);
    expect(tester).toHaveBeenCalledTimes(1);
  });
});

describe("pool helpers", () => {
  it("extracts and counts domains", () => {
    expect(emailDomain("Jane@Mail.Example.COM")).toBe("mail.example.com");
    expect(emailDomain("nope")).toBe("");
    expect(countPoolMailboxesByDomain(["a@x.com", "b@X.com", "c@y.com"])).toEqual(
      new Map([
        ["x.com", 2],
        ["y.com", 1],
      ]),
    );
  });

  it("blocks manual activation of an untested pool mailbox", () => {
    expect(poolActivationBlocker({ isSystemPool: true, smtpStatus: "ok", imapStatus: "untested" })).toBe(
      POOL_ACTIVATION_NEEDS_TEST_ERROR,
    );
    expect(poolActivationBlocker({ isSystemPool: true, smtpStatus: "ok", imapStatus: "ok" })).toBeNull();
    expect(poolActivationBlocker({ isSystemPool: false, smtpStatus: "failed", imapStatus: "failed" })).toBeNull();
  });

  it("knows which patches change login details", () => {
    expect(patchChangesCredentials({ smtpPasswordEnc: "x" })).toBe(true);
    expect(patchChangesCredentials({ imapHost: "imap.x.com" })).toBe(true);
    expect(patchChangesCredentials({ fromName: "Jane", dailyLimit: 20 })).toBe(false);
  });
});
