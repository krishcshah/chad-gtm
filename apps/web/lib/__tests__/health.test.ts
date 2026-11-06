import { describe, expect, it } from "vitest";
import { ENGINE_STALE_MS, evaluateHealth, firstValue, isStrictRequest, parseTickTime } from "../health";

const now = new Date("2026-11-06T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe("evaluateHealth", () => {
  it("is healthy with a fresh engine tick", () => {
    const r = evaluateHealth({ dbOk: true, lastTickAt: minutesAgo(1), now, strict: true });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      db: true,
      engine: { lastTickAt: minutesAgo(1), ageSeconds: 60, stale: false },
    });
  });

  it("returns 503 when the database is down, strict or not", () => {
    for (const strict of [false, true]) {
      const r = evaluateHealth({ dbOk: false, lastTickAt: minutesAgo(1), now, strict });
      expect(r.status).toBe(503);
      expect(r.body.ok).toBe(false);
      expect(r.body.db).toBe(false);
      expect(r.body.engine.lastTickAt).toBeNull();
    }
  });

  it("reports a stale engine but stays 200 without strict", () => {
    const r = evaluateHealth({ dbOk: true, lastTickAt: minutesAgo(11), now, strict: false });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.engine.stale).toBe(true);
  });

  it("returns 503 for a stale engine with strict", () => {
    const r = evaluateHealth({ dbOk: true, lastTickAt: minutesAgo(11), now, strict: true });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
  });

  it("treats exactly the threshold as fresh and one second past as stale", () => {
    const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(evaluateHealth({ dbOk: true, lastTickAt: at(ENGINE_STALE_MS), now, strict: true }).status).toBe(200);
    expect(evaluateHealth({ dbOk: true, lastTickAt: at(ENGINE_STALE_MS + 1000), now, strict: true }).status).toBe(503);
  });

  it("treats a missing heartbeat as stale", () => {
    const r = evaluateHealth({ dbOk: true, lastTickAt: null, now, strict: true });
    expect(r.status).toBe(503);
    expect(r.body.engine).toEqual({ lastTickAt: null, ageSeconds: null, stale: true });
  });

  it("does not call a tick slightly in the future stale", () => {
    const future = new Date(now.getTime() + 5_000).toISOString();
    const r = evaluateHealth({ dbOk: true, lastTickAt: future, now, strict: true });
    expect(r.status).toBe(200);
    expect(r.body.engine.ageSeconds).toBe(0);
  });
});

describe("helpers", () => {
  it("parses strict flags", () => {
    expect(isStrictRequest(new URLSearchParams("strict=1"))).toBe(true);
    expect(isStrictRequest(new URLSearchParams("strict=true"))).toBe(true);
    expect(isStrictRequest(new URLSearchParams("strict=0"))).toBe(false);
    expect(isStrictRequest(new URLSearchParams(""))).toBe(false);
  });

  it("parses tick times from strings and dates, rejecting garbage", () => {
    expect(parseTickTime("2026-11-06T11:59:00.000Z")?.toISOString()).toBe("2026-11-06T11:59:00.000Z");
    expect(parseTickTime(now)?.getTime()).toBe(now.getTime());
    expect(parseTickTime("not a date")).toBeNull();
    expect(parseTickTime(null)).toBeNull();
    expect(parseTickTime("")).toBeNull();
  });

  it("reads the first value from node-postgres and neon-http results", () => {
    expect(firstValue({ rows: [{ last_tick_at: "x" }] })).toBe("x");
    expect(firstValue([{ last_tick_at: "y" }])).toBe("y");
    expect(firstValue({ rows: [] })).toBeUndefined();
    expect(firstValue(undefined)).toBeUndefined();
  });
});
