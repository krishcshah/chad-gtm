import { describe, expect, it, vi } from "vitest";

/* #70: "Check for new replies" reads the mailboxes behind the user's
 * campaigns (shared pool included), not only mailboxes the user owns. */

vi.mock("../db", () => ({ getDb: vi.fn() }));

import {
  MAX_MAILBOXES_PER_CHECK,
  foundForUser,
  pickMailboxesToCheck,
  withSyncTimeout,
  type MailboxCandidate,
} from "../inbox-sync";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function box(id: string, over: Partial<MailboxCandidate> & Record<string, unknown> = {}): MailboxCandidate {
  return {
    id,
    imapHost: "imap.example.com",
    imapPasswordEnc: "enc",
    imapStatus: "ok",
    imapFailCount: 0,
    imapAttemptedAt: null,
    deletedAt: null,
    lastSyncAt: ago(10 * 60_000),
    lastUsedAt: ago(60 * 60_000),
    ...over,
  };
}

describe("pickMailboxesToCheck", () => {
  it("keeps a pool mailbox and a paused mailbox", () => {
    const pool = box("pool-1", { isSystemPool: true, userId: "admin" } as any);
    const paused = box("paused-1", { status: "paused" } as any);
    const { toSync, recentlyChecked } = pickMailboxesToCheck([pool, paused], NOW);
    expect(toSync.map((s) => s.id).sort()).toEqual(["paused-1", "pool-1"]);
    expect(recentlyChecked).toBe(0);
  });

  it("skips a mailbox synced 30s ago but counts it as checked", () => {
    const { toSync, recentlyChecked } = pickMailboxesToCheck([box("fresh", { lastSyncAt: ago(30_000) }), box("stale")], NOW);
    expect(toSync.map((s) => s.id)).toEqual(["stale"]);
    expect(recentlyChecked).toBe(1);
  });

  it("skips an IMAP-failed mailbox inside its back-off, and reads it once the back-off passed", () => {
    const failed = box("failed", { imapStatus: "failed", imapFailCount: 1, imapAttemptedAt: ago(5 * 60_000) });
    expect(pickMailboxesToCheck([failed], NOW)).toEqual({ toSync: [], recentlyChecked: 0 });
    const retry = box("failed", { imapStatus: "failed", imapFailCount: 1, imapAttemptedAt: ago(20 * 60_000) });
    expect(pickMailboxesToCheck([retry], NOW).toSync.map((s) => s.id)).toEqual(["failed"]);
  });

  it("skips mailboxes without an inbox and ones retired for longer than the grace period", () => {
    const noInbox = box("no-inbox", { imapHost: "" });
    const retired = box("retired", { deletedAt: ago(40 * 86_400_000) });
    const recentlyRetired = box("recently-retired", { deletedAt: ago(2 * 86_400_000) });
    expect(pickMailboxesToCheck([noInbox, retired, recentlyRetired], NOW).toSync.map((s) => s.id)).toEqual([
      "recently-retired",
    ]);
  });

  it("caps at 25, most recently used first", () => {
    const rows = Array.from({ length: 30 }, (_, i) => box(`s${String(i).padStart(2, "0")}`, { lastUsedAt: ago((i + 1) * 60_000) }));
    rows.push(box("own-unused", { lastUsedAt: null }));
    const { toSync } = pickMailboxesToCheck(rows.reverse(), NOW);
    expect(toSync).toHaveLength(MAX_MAILBOXES_PER_CHECK);
    expect(toSync[0]!.id).toBe("s00");
    expect(toSync[24]!.id).toBe("s24");
    expect(toSync.some((s) => s.id === "own-unused")).toBe(false);
  });

  it("reads a mailbox listed twice only once", () => {
    expect(pickMailboxesToCheck([box("a"), box("a")], NOW).toSync).toHaveLength(1);
  });
});

describe("withSyncTimeout", () => {
  it("gives up on a mailbox that takes too long", async () => {
    const r = await withSyncTimeout(() => new Promise(() => {}), 5);
    expect(r.found).toBe(0);
    expect(r.error).toMatch(/timeout/);
  });

  it("turns a thrown error into an error result", async () => {
    expect(await withSyncTimeout(async () => Promise.reject(new Error("login failed")))).toEqual({
      found: 0,
      error: "login failed",
    });
  });

  it("returns the sync result", async () => {
    expect(await withSyncTimeout(async () => ({ found: 2 }))).toEqual({ found: 2 });
  });

  it("keeps the per-customer split", async () => {
    const r = await withSyncTimeout(async () => ({ found: 3, foundByOwner: { u1: 1, u2: 2 } }));
    expect(r.foundByOwner).toEqual({ u1: 1, u2: 2 });
  });
});

describe("foundForUser (#70)", () => {
  it("counts only the replies filed under this user on a shared pool mailbox", () => {
    expect(foundForUser({ found: 5, foundByOwner: { me: 1, other: 4 } }, "me")).toBe(1);
  });

  it("another customer's replies are never reported", () => {
    expect(foundForUser({ found: 4, foundByOwner: { other: 4 } }, "me")).toBe(0);
  });

  it("claims nothing when the result has no per-customer split (timeout, error)", () => {
    expect(foundForUser({ found: 0, error: "IMAP sync timeout (10s)" }, "me")).toBe(0);
    expect(foundForUser({ found: 2 }, "me")).toBe(0);
  });
});
