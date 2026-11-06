import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl, appUrlReadyForLiveSend, configuredAppUrl, engineBatchSize, resetEnvWarnings } from "../env";
import {
  HARD_MAX_PER_SENDER_PER_DAY,
  pickSenderIndex,
  rampedDailyCap,
  senderDailyCap,
} from "../rotation";
import { allocatePoolCapacity, withinPoolShare } from "../pool-allocation";
import { classifySmtpError, failureBlamesSender } from "../smtp-errors";
import { resolveStickySender } from "../scheduler";
import { buildOutgoingBodies, injectEmailTracking } from "../processor";
import { completeBodies, plainTextToHtml } from "../body-format";
import { heartbeatId, heartbeatStats, writeHeartbeat } from "../heartbeat";
import { stripWarmupMarker } from "../signature";
import { stripLeakageFromBody } from "../sync-replies";
import type { SenderRow } from "../db-port";

function sender(over: Partial<SenderRow> & { createdAt?: string; isSystemPool?: boolean } = {}): SenderRow {
  return {
    id: "s1",
    userId: "admin",
    senderName: "Alex Kim",
    email: "alex@pool.example",
    smtpHost: "h",
    smtpPort: 587,
    smtpUsername: "u",
    smtpPasswordEnc: "",
    smtpSecurity: "tls",
    imapHost: "",
    imapPort: 993,
    imapUsername: "",
    imapPasswordEnc: "",
    dailyLimit: 60,
    hourlyLimit: 10,
    fromName: "",
    replyTo: "",
    timezone: "UTC",
    signature: "",
    status: "active",
    health: 100,
    smtpStatus: "ok",
    imapStatus: "ok",
    lastSyncAt: null,
    repliedCount: 0,
    ...over,
  } as SenderRow;
}

/* ─── 1. APP_URL at call time ───────────────────────────────────────────── */

describe("appUrl (read at call time)", () => {
  const env = (e: Record<string, string>) => e;
  afterEach(() => resetEnvWarnings());

  it("uses APP_URL first and strips trailing slashes", () => {
    expect(appUrl(env({ APP_URL: "https://autogtm.tech/", BETTER_AUTH_URL: "https://other.example" }))).toBe(
      "https://autogtm.tech",
    );
    expect(appUrl(env({ BETTER_AUTH_URL: "https://autogtm.tech" }))).toBe("https://autogtm.tech");
  });

  it("never falls back to the old vercel host; dev fallback is localhost", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(appUrl(env({}))).toBe("http://localhost:3000");
    expect(appUrl(env({}))).not.toMatch(/vercel/);
    warn.mockRestore();
  });

  it("logs loudly (error) in production when unset", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    appUrl(env({ NODE_ENV: "production" }));
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/APP_URL is not set/));
    err.mockRestore();
  });

  it("follows process.env changes made after import", () => {
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://first.example";
    expect(appUrl()).toBe("https://first.example");
    process.env.APP_URL = "https://second.example";
    expect(appUrl()).toBe("https://second.example");
    if (prev === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prev;
  });

  it("live sends need a configured origin, https in production", () => {
    expect(appUrlReadyForLiveSend(env({}))).toBe(false);
    expect(appUrlReadyForLiveSend(env({ APP_URL: "http://localhost:3005" }))).toBe(true);
    expect(appUrlReadyForLiveSend(env({ NODE_ENV: "production", APP_URL: "http://autogtm.tech" }))).toBe(false);
    expect(appUrlReadyForLiveSend(env({ NODE_ENV: "production", APP_URL: "https://localhost" }))).toBe(false);
    expect(appUrlReadyForLiveSend(env({ NODE_ENV: "production", APP_URL: "https://autogtm.tech" }))).toBe(true);
    expect(configuredAppUrl(env({ APP_URL: "not a url" }))).toBeNull();
  });

  it("reads ENGINE_BATCH_SIZE at call time", () => {
    expect(engineBatchSize(env({}))).toBe(25);
    expect(engineBatchSize(env({ ENGINE_BATCH_SIZE: "7" }))).toBe(7);
    expect(engineBatchSize(env({ ENGINE_BATCH_SIZE: "nope" }))).toBe(25);
  });
});

/* ─── 8. Mailbox ramp ───────────────────────────────────────────────────── */

describe("mailbox ramp", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("starts at 10 and adds 5 per full day up to 30", () => {
    expect(rampedDailyCap("2026-11-10T08:00:00Z", now)).toBe(10);
    expect(rampedDailyCap("2026-11-09T11:00:00Z", now)).toBe(15);
    expect(rampedDailyCap("2026-11-08T11:00:00Z", now)).toBe(20);
    expect(rampedDailyCap("2026-11-07T11:00:00Z", now)).toBe(25);
    expect(rampedDailyCap("2026-11-06T11:00:00Z", now)).toBe(30);
    expect(rampedDailyCap("2026-11-01T00:00:00Z", now)).toBe(30);
  });
  it("leaves mailboxes without a usable creation time unaffected", () => {
    expect(rampedDailyCap(undefined, now)).toBe(HARD_MAX_PER_SENDER_PER_DAY);
    expect(rampedDailyCap("garbage", now)).toBe(HARD_MAX_PER_SENDER_PER_DAY);
  });
  it("is part of the sender's daily cap and of rotation", () => {
    const fresh = sender({ id: "new", createdAt: "2026-11-10T08:00:00Z" });
    const old = sender({ id: "old", createdAt: "2025-01-01T00:00:00Z" });
    expect(senderDailyCap(fresh as any, 60, now)).toBe(10);
    expect(senderDailyCap(old as any, 60, now)).toBe(30);
    const daily = new Map([["new", 10]]);
    const pick = pickSenderIndex([fresh, old], daily, new Map(), 1, 60, { now });
    expect(pick!.sender.id).toBe("old");
    expect(pickSenderIndex([fresh], daily, new Map(), 0, 60, { now })).toBeNull();
  });
});

/* ─── 6. Fair pool sharing ──────────────────────────────────────────────── */

function total(alloc: Map<string, Map<string, number>>, campaignId: string): number {
  return [...(alloc.get(campaignId)?.values() ?? [])].reduce((a, b) => a + b, 0);
}

describe("allocatePoolCapacity", () => {
  it("splits one mailbox evenly between two clients", () => {
    const a = allocatePoolCapacity(
      [{ id: "m1", capacity: 30 }],
      [
        { id: "c1", userId: "u1", senderIds: ["m1"], demand: 100 },
        { id: "c2", userId: "u2", senderIds: ["m1"], demand: 100 },
      ],
    );
    expect(total(a, "c1")).toBe(15);
    expect(total(a, "c2")).toBe(15);
  });

  it("shares by user first, so five campaigns do not outweigh one", () => {
    const a = allocatePoolCapacity(
      [
        { id: "m1", capacity: 30 },
        { id: "m2", capacity: 30 },
      ],
      [
        { id: "big1", userId: "big", senderIds: ["m1", "m2"], demand: 100 },
        { id: "big2", userId: "big", senderIds: ["m1", "m2"], demand: 100 },
        { id: "big3", userId: "big", senderIds: ["m1", "m2"], demand: 100 },
        { id: "small", userId: "small", senderIds: ["m1", "m2"], demand: 100 },
      ],
    );
    expect(total(a, "small")).toBe(30);
    expect(total(a, "big1") + total(a, "big2") + total(a, "big3")).toBe(30);
    expect(total(a, "big1")).toBe(10);
  });

  it("hands unused share to campaigns that still have work", () => {
    const a = allocatePoolCapacity(
      [{ id: "m1", capacity: 30 }],
      [
        { id: "c1", userId: "u1", senderIds: ["m1"], demand: 4 },
        { id: "c2", userId: "u2", senderIds: ["m1"], demand: 100 },
      ],
    );
    expect(total(a, "c1")).toBe(4);
    expect(total(a, "c2")).toBe(26);
  });

  it("balances across mailboxes when campaigns can use different subsets", () => {
    const a = allocatePoolCapacity(
      [
        { id: "m1", capacity: 30 },
        { id: "m2", capacity: 30 },
      ],
      [
        { id: "both", userId: "u1", senderIds: ["m1", "m2"], demand: 100 },
        { id: "m2only", userId: "u2", senderIds: ["m2"], demand: 100 },
      ],
    );
    expect(total(a, "both")).toBe(30);
    expect(total(a, "m2only")).toBe(30);
    expect(a.get("m2only")!.get("m2")).toBe(30);
  });

  it("never allocates more than a mailbox's capacity", () => {
    const a = allocatePoolCapacity(
      [{ id: "m1", capacity: 10 }],
      [1, 2, 3, 4, 5].map((i) => ({ id: `c${i}`, userId: `u${i}`, senderIds: ["m1"], demand: 50 })),
    );
    const sum = [1, 2, 3, 4, 5].reduce((acc, i) => acc + total(a, `c${i}`), 0);
    expect(sum).toBe(10);
    for (const i of [1, 2, 3, 4, 5]) expect(total(a, `c${i}`)).toBe(2);
  });

  it("withinPoolShare gates only pool mailboxes", () => {
    const plan = { quota: new Map([["m1", 2]]), used: new Map([["m1", 2]]) };
    expect(withinPoolShare(plan, sender({ id: "m1", isSystemPool: true }))).toBe(false);
    expect(withinPoolShare(plan, sender({ id: "own", isSystemPool: false }))).toBe(true);
    expect(withinPoolShare(undefined, sender({ id: "m1", isSystemPool: true }))).toBe(true);
    plan.used.set("m1", 1);
    expect(withinPoolShare(plan, sender({ id: "m1", isSystemPool: true }))).toBe(true);
  });
});

/* ─── 9. SMTP failure classification ────────────────────────────────────── */

describe("classifySmtpError", () => {
  it("bad credentials blame the mailbox", () => {
    const f = classifySmtpError({ code: "EAUTH", responseCode: 535, response: "535 5.7.8 Authentication failed" });
    expect(f.kind).toBe("auth");
    expect(failureBlamesSender(f)).toBe(true);
  });
  it("connection problems blame the mailbox and are retryable", () => {
    const f = classifySmtpError({ code: "ETIMEDOUT", message: "Connection timeout" });
    expect(f.kind).toBe("connection");
    expect(f.permanent).toBe(false);
    expect(failureBlamesSender(f)).toBe(true);
  });
  it("550 5.1.1 at RCPT TO is a hard bounce and never blames the mailbox", () => {
    const f = classifySmtpError({
      code: "EENVELOPE",
      command: "RCPT TO",
      responseCode: 550,
      response: "550 5.1.1 <x@y.com>: Recipient address rejected: User unknown",
    });
    expect(f).toMatchObject({ kind: "recipient", permanent: true, hardBounce: true, enhanced: "5.1.1" });
    expect(failureBlamesSender(f)).toBe(false);
  });
  it("a policy block on the recipient fails the job but is not a hard bounce", () => {
    const f = classifySmtpError({ command: "RCPT TO", responseCode: 550, response: "550 5.7.1 Relaying denied" });
    expect(f).toMatchObject({ kind: "recipient", permanent: true, hardBounce: false });
    expect(failureBlamesSender(f)).toBe(false);
  });
  it("content rejected at DATA is message-level", () => {
    const f = classifySmtpError({ command: "DATA", responseCode: 554, response: "554 5.7.1 Message rejected as spam" });
    expect(f).toMatchObject({ kind: "message", permanent: true, hardBounce: false });
    expect(failureBlamesSender(f)).toBe(false);
  });
  it("greylisting (4xx) is temporary", () => {
    const f = classifySmtpError({ command: "RCPT TO", responseCode: 450, response: "450 4.2.0 Greylisted" });
    expect(f.permanent).toBe(false);
    expect(failureBlamesSender(f)).toBe(false);
  });
  it("mailbox full is permanent for the job but not a hard bounce", () => {
    const f = classifySmtpError({ command: "RCPT TO", responseCode: 552, response: "552 5.2.2 Mailbox full" });
    expect(f).toMatchObject({ permanent: true, hardBounce: false });
  });
});

/* ─── 7. Sticky sender ──────────────────────────────────────────────────── */

describe("resolveStickySender", () => {
  const a = sender({ id: "a" });
  const b = sender({ id: "b" });
  const yes = () => true;
  it("step 1 always rotates", () => {
    expect(resolveStickySender({ stepPosition: 1, stickySenderId: "a", senders: [a, b], hasCapacity: yes }).kind).toBe(
      "rotate",
    );
  });
  it("follow-ups reuse the step-1 mailbox", () => {
    const d = resolveStickySender({ stepPosition: 2, stickySenderId: "b", senders: [a, b], hasCapacity: yes });
    expect(d).toEqual({ kind: "use", sender: b });
  });
  it("waits (does not switch) when the step-1 mailbox is only at capacity", () => {
    const d = resolveStickySender({ stepPosition: 3, stickySenderId: "a", senders: [a, b], hasCapacity: () => false });
    expect(d.kind).toBe("defer");
  });
  it("switches only when the step-1 mailbox is gone or disabled", () => {
    expect(resolveStickySender({ stepPosition: 2, stickySenderId: "zz", senders: [a, b], hasCapacity: yes }).kind).toBe(
      "rotate",
    );
    const paused = sender({ id: "a", status: "paused" });
    const failed = sender({ id: "a", status: "failed" });
    expect(resolveStickySender({ stepPosition: 2, stickySenderId: "a", senders: [paused, b], hasCapacity: yes }).kind).toBe(
      "rotate",
    );
    expect(resolveStickySender({ stepPosition: 2, stickySenderId: "a", senders: [failed, b], hasCapacity: yes }).kind).toBe(
      "rotate",
    );
  });
});

/* ─── 2. Outgoing bodies + footer ───────────────────────────────────────── */

describe("buildOutgoingBodies", () => {
  const footer = {
    companyName: "Acme",
    postalAddress: "500 Market St, San Francisco, CA 94105",
    unsubUrl: "https://autogtm.tech/unsubscribe?token=t1",
  };
  it("text-only step: HTML is derived and both parts carry the same footer", () => {
    const out = buildOutgoingBodies({ text: "Hi Dana,\n\nSee https://acme.com\n\nAlex", html: "", ...footer });
    expect(out.html).toContain("<p>Hi Dana,</p>");
    expect(out.html).toContain('<a href="https://acme.com">https://acme.com</a>');
    for (const part of [out.text, out.html]) {
      expect(part).toContain("Acme");
      expect(part).toContain("500 Market St, San Francisco, CA 94105");
      expect(part).toContain(footer.unsubUrl);
    }
  });
  it("HTML-only step: text is derived", () => {
    const out = buildOutgoingBodies({ text: "", html: "<p>Hi <b>Dana</b></p>", ...footer });
    expect(out.text.startsWith("Hi Dana")).toBe(true);
    expect(out.text).toContain(footer.unsubUrl);
  });
  it("tracking never wraps the unsubscribe link", () => {
    const out = buildOutgoingBodies({ text: "Hi", html: '<p>See <a href="https://acme.com">site</a></p>', ...footer });
    const tracked = injectEmailTracking(out.html, "job-1", "https://autogtm.tech");
    expect(tracked).toContain(`href="${footer.unsubUrl}"`);
    expect(tracked).toContain("/api/track/click?jid=job-1&url=https%3A%2F%2Facme.com");
  });
  it("completeBodies keeps both when present and escapes derived HTML", () => {
    expect(completeBodies("a", "<p>b</p>")).toEqual({ text: "a", html: "<p>b</p>" });
    expect(plainTextToHtml("1 < 2 & 3")).toBe("<p>1 &lt; 2 &amp; 3</p>");
  });
});

describe("signature + reply leakage", () => {
  it("strips the hidden warm-up marker from signatures", () => {
    expect(stripWarmupMarker('Alex\nAcme\n<!--SR_WARMUP:{"enabled":true}-->')).toBe("Alex\nAcme");
    expect(stripWarmupMarker(null)).toBe("");
  });
  it("strips our footer line from quoted replies so it is not read as an opt-out", () => {
    const body = "Sounds good.\n\nDon't want these emails? Unsubscribe: https://autogtm.tech/unsubscribe?token=x";
    expect(stripLeakageFromBody(body)).toBe("Sounds good.");
    expect(stripLeakageFromBody("Yes please\nDon't want these emails? Unsubscribe")).toBe("Yes please");
  });
});

/* ─── 11. Heartbeat ─────────────────────────────────────────────────────── */

describe("heartbeat", () => {
  it("flattens tick counts", () => {
    const stats = heartbeatStats({
      sched: { started: 1, enqueued: 4, completed: 0, skipped: ["a", "b"] },
      proc: { sent: 3, failed: 1, retried: 0, recovered: 0, skipped: 0, held: 2 },
      sync: { checked: 5, repliesFound: 1, bounces: 1, errors: [] },
      agent: { processed: 2, replied: 1, escalated: 1, failed: 0, retried: 0, gaveUp: 0 },
    });
    expect(stats).toMatchObject({ enqueued: 4, sent: 3, failed: 1, held: 2, bounces: 1, agentReplied: 1, campaignsSkipped: 2 });
    expect(heartbeatStats({ sched: null, proc: null, sync: null, agent: null }).sent).toBe(0);
  });

  it("upserts worker:<hostname>, keeping last_ok_at on failure", async () => {
    const calls: any[] = [];
    const db = {
      insert: () => ({
        values: (v: any) => ({
          onConflictDoUpdate: async (c: any) => {
            calls.push({ values: v, conflict: c });
          },
        }),
      }),
    };
    const now = new Date("2026-11-06T10:00:00Z");
    await writeHeartbeat(db, { ok: true, stats: { sent: 1 }, now, id: heartbeatId("vm-1") });
    await writeHeartbeat(db, { ok: false, error: "db down", now, id: heartbeatId("vm-1") });
    expect(calls[0].values).toMatchObject({ id: "worker:vm-1", lastTickAt: now.toISOString(), lastOkAt: now.toISOString() });
    expect(calls[0].conflict.set).toMatchObject({ lastOkAt: now.toISOString(), lastError: null, stats: { sent: 1 } });
    expect(calls[1].conflict.set).toEqual({ lastTickAt: now.toISOString(), lastError: "db down", updatedAt: now.toISOString() });
    expect(calls[1].conflict.set.lastOkAt).toBeUndefined();
  });

  it("never throws when the write fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { insert: () => { throw new Error("boom"); } };
    await expect(writeHeartbeat(db, { ok: true })).resolves.toBeUndefined();
    err.mockRestore();
  });
});
