import { describe, expect, it } from "vitest";
import { authorizeCronRequest, safeEqual, summarizeCounts } from "../cron-auth";

const prod = { NODE_ENV: "production", CRON_SECRET: "s3cret-value-xyz" };

describe("authorizeCronRequest", () => {
  it("refuses everything in production when CRON_SECRET is unset", () => {
    expect(authorizeCronRequest("Bearer anything", { NODE_ENV: "production" })).toMatchObject({ ok: false, status: 401 });
    expect(authorizeCronRequest(null, { NODE_ENV: "production", CRON_SECRET: "  " })).toMatchObject({ ok: false });
  });

  it("allows local dev without a secret", () => {
    expect(authorizeCronRequest(null, { NODE_ENV: "development" })).toEqual({ ok: true });
  });

  it("requires the exact bearer token", () => {
    expect(authorizeCronRequest("Bearer s3cret-value-xyz", prod)).toEqual({ ok: true });
    expect(authorizeCronRequest("bearer s3cret-value-xyz", prod)).toEqual({ ok: true });
    expect(authorizeCronRequest("Bearer s3cret-value-xy", prod)).toMatchObject({ ok: false, status: 401 });
    expect(authorizeCronRequest("s3cret-value-xyz", prod)).toMatchObject({ ok: false, status: 401 });
    expect(authorizeCronRequest("", prod)).toMatchObject({ ok: false, status: 401 });
    expect(authorizeCronRequest(null, prod)).toMatchObject({ ok: false, status: 401 });
  });

  it("enforces the token in dev too once a secret is set", () => {
    expect(authorizeCronRequest(null, { NODE_ENV: "development", CRON_SECRET: "x" })).toMatchObject({ ok: false });
  });

  it("ignores the vercel-cron User-Agent (only the Authorization header is read)", () => {
    // The helper only takes the Authorization header; a request with
    // User-Agent: vercel-cron/1.0 and no token presents `null` here.
    expect(authorizeCronRequest(null, prod)).toMatchObject({ ok: false, status: 401 });
  });
});

describe("safeEqual", () => {
  it("compares strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("summarizeCounts", () => {
  it("keeps only numbers and array lengths", () => {
    const result = {
      startedAt: "2026-11-06T00:00:00Z",
      sched: {
        started: 1,
        enqueued: 4,
        skipped: [{ campaign: "Secret Campaign", note: "no-senders" }],
      },
      proc: { sent: 2, failed: 1, lastError: "SMTP auth failed for bob@client.com" },
      sync: { checked: 3, repliesFound: 1, errors: ["imap bob@client.com: bad password"] },
      agent: null,
      flag: true,
    };
    const summary = summarizeCounts(result);
    expect(summary).toEqual({
      sched: { started: 1, enqueued: 4, skipped: 1 },
      proc: { sent: 2, failed: 1 },
      sync: { checked: 3, repliesFound: 1, errors: 1 },
    });
    expect(JSON.stringify(summary)).not.toMatch(/@|Secret|SMTP|password/);
  });

  it("handles non-objects", () => {
    expect(summarizeCounts(null)).toEqual({});
    expect(summarizeCounts("x")).toEqual({});
    expect(summarizeCounts([1, 2])).toEqual({});
  });
});
