import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * The directory worker runs real SQL in a worker thread against a throwaway
 * directory file, the way launch and the top-up use it in production.
 */

let dir: string;
let ld: typeof import("../leads-directory");
let dw: typeof import("../directory-worker");
let au: typeof import("../autopilot-audience");
let da: typeof import("../directory-search-async");
let gl: typeof import("../gtm-launch");

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dir-worker-"));
  fs.mkdirSync(path.join(dir, "data"));
  fs.writeFileSync(path.join(dir, "data", "leads.db"), "");
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  vi.resetModules();
  ld = await import("../leads-directory");
  dw = await import("../directory-worker");
  au = await import("../autopilot-audience");
  da = await import("../directory-search-async");
  gl = await import("../gtm-launch");
  const db = ld.getDirectoryDb();
  const insert = db.prepare("INSERT INTO leads (job_title, industry, country, email, work_email) VALUES (?, ?, ?, ?, ?)");
  for (let i = 1; i <= 30; i++) {
    insert.run(i % 2 ? "Head of Operations" : "Driver", "Logistics", "United States", `p${i}@co${i}.com`, `p${i}@co${i}.com`);
  }
  ld.ensureDirectoryFts(db);
  ld.rebuildDirectoryFts();
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("directory worker", () => {
  it("runs keyset pages and counts in a worker thread", async () => {
    const client = dw.createDirectoryWorkerClient();
    try {
      const file = ld.directoryDbFile();
      const params = au.tierQueryParams(1, { industries: ["Logistics"], targetTitles: ["head of operations"], countries: ["United States"] })!;
      const page = au.audiencePageQuery(params, 0, 5);
      const rows = await client.query<any[]>(file, page.sql, page.bindings, "all", 5000);
      expect(rows.map((r) => r.id)).toEqual([1, 3, 5, 7, 9]);
      const next = au.audiencePageQuery(params, 9, 100);
      expect((await client.query<any[]>(file, next.sql, next.bindings, "all", 5000)).length).toBe(10);
      const count = au.audienceCountQuery(params);
      expect(await client.query<any>(file, count.sql, count.bindings, "get", 5000)).toEqual({ c: 15 });
    } finally {
      await client.close();
    }
  });

  it("stops a query that runs too long, and the next query still works", async () => {
    const client = dw.createDirectoryWorkerClient();
    try {
      const file = ld.directoryDbFile();
      const slow = "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 15000000) SELECT count(*) AS c FROM n";
      await expect(client.query(file, slow, [], "get", 100)).rejects.toThrow(/timed out/);
      expect(await client.query(file, "SELECT count(*) AS c FROM leads", [], "get", 5000)).toEqual({ c: 30 });
    } finally {
      await client.close();
    }
  });

  const cte = (n: number, alive = false) =>
    `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${n}${alive ? " AND directory_alive()" : ""}) SELECT count(*) AS c FROM n`;

  it("a timed-out query's thread exiting later never fails a query on the next thread", async () => {
    // Regression: one shared pending map let thread A's late exit reject query B on thread B.
    const client = dw.createDirectoryWorkerClient();
    try {
      const file = ld.directoryDbFile();
      const a = client.query(file, cte(15_000_000), [], "get", 100).catch((e: Error) => e);
      await new Promise((r) => setTimeout(r, 150));
      const b = client.query(file, cte(25_000_000), [], "get", 30_000);
      expect(await a).toBeInstanceOf(Error);
      expect(await b).toEqual({ c: 25_000_000 });
    } finally {
      await client.close();
    }
  }, 30_000);

  it("really stops a timed-out statement that calls directory_alive()", async () => {
    const client = dw.createDirectoryWorkerClient({ waitForStoppedThread: true });
    try {
      const file = ld.directoryDbFile();
      const started = Date.now();
      // About 10 s of work if nothing stopped it.
      await expect(client.query(file, cte(150_000_000, true), [], "get", 100)).rejects.toThrow(/timed out/);
      expect(client.stoppingThreads()).toBe(1);
      // The background lane waits for the stopped thread, which exits at its next row.
      expect(await client.query(file, "SELECT count(*) AS c FROM leads", [], "get", 5000)).toEqual({ c: 30 });
      expect(client.stoppingThreads()).toBe(0);
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("background lane: no new query starts while a stopped thread is still running", async () => {
    const client = dw.createDirectoryWorkerClient({ waitForStoppedThread: true });
    try {
      const file = ld.directoryDbFile();
      // No directory_alive(): this statement can only end on its own (about 1 s).
      await expect(client.query(file, cte(15_000_000), [], "get", 100)).rejects.toThrow(/timed out/);
      expect(client.stoppingThreads()).toBe(1);
      const next = client.query(file, "SELECT 1 AS one", [], "get", 30_000);
      await new Promise((r) => setTimeout(r, 50));
      expect(client.stoppingThreads()).toBe(1);
      expect(await next).toEqual({ one: 1 });
      expect(client.stoppingThreads()).toBe(0);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("a query timing out in the queue does not stop the one running", async () => {
    const client = dw.createDirectoryWorkerClient();
    try {
      const file = ld.directoryDbFile();
      const running = client.query(file, cte(8_000_000), [], "get", 30_000);
      await expect(client.query(file, "SELECT 1 AS one", [], "get", 50)).rejects.toThrow(/timed out/);
      expect(await running).toEqual({ c: 8_000_000 });
      expect(client.stoppingThreads()).toBe(0);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("a query's run time limit starts when its thread starts it, not when it was queued", async () => {
    // Regression: the timer started at enqueue, so a quick query queued behind a slow
    // one timed out without ever running.
    const client = dw.createDirectoryWorkerClient();
    try {
      const file = ld.directoryDbFile();
      const started = Date.now();
      const running = client.query(file, cte(8_000_000), [], "get", 30_000);
      const queued = client.query(file, "SELECT 1 AS one", [], "get", 50, 30_000);
      expect(await running).toEqual({ c: 8_000_000 });
      expect(await queued).toEqual({ one: 1 });
      expect(Date.now() - started).toBeGreaterThan(50);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("refuses to open a different file than the app opened", async () => {
    const client = dw.createDirectoryWorkerClient();
    try {
      const file = ld.directoryDbFile();
      await expect(client.query({ ...file, identity: "0:0" }, "SELECT 1 AS one", [], "get", 5000)).rejects.toThrow(/replaced/);
    } finally {
      await client.close();
    }
  });

  it("reports SQL errors without stopping the worker", async () => {
    const client = dw.createDirectoryWorkerClient();
    try {
      const file = ld.directoryDbFile();
      await expect(client.query(file, "SELECT nope FROM leads", [], "all", 5000)).rejects.toThrow(/no such column/);
      expect(await client.query(file, "SELECT 1 AS one", [], "get", 5000)).toEqual({ one: 1 });
    } finally {
      await client.close();
    }
  });

  it("runs on the main thread under tests", async () => {
    expect(dw.directoryWorkerEnabled()).toBe(false);
    expect(dw.directoryWorkerEnabled({})).toBe(true);
    expect(dw.directoryWorkerEnabled({ DIRECTORY_WORKER: "off" })).toBe(false);
    expect(await dw.directoryQuery("SELECT count(*) AS c FROM leads", [], "get")).toEqual({ c: 30 });
  });
});

describe("worker-run directory reads (same SQL as the worker, on this thread under tests)", () => {
  const targeting = { industries: ["Logistics"], countries: ["United States"] };

  it("setup preview counts the same Priority 1 people as the run page (whole phrases)", async () => {
    for (const titles of [["Head of Operations"], ["Head of Ops"]]) {
      const preview = await gl.launchAudienceCountsAsync({ ...targeting, titles });
      const tiers = await au.countAudience({ ...targeting, targetTitles: titles }, au.directoryCountOn("background"));
      expect(preview.roleMatches, titles[0]).toBe(tiers["1"]);
      expect(preview.roleMatches + preview.otherRoles).toBe(tiers["1"] + tiers["2"] + tiers["3"]);
    }
    // "Head of Ops" is not a phrase in "Head of Operations" (a prefix match would have counted 15).
    expect((await gl.launchAudienceCountsAsync({ ...targeting, titles: ["Head of Ops"] })).roleMatches).toBe(0);
  });

  it("reads the plan sample and guided-setup leads through the worker query", async () => {
    const leads = await gl.fetchTargetedLeadsAsync(["Logistics"], ["Head of Operations"], 3, 2, { countries: ["United States"] });
    expect(leads.map((l) => l.id)).toEqual([5, 7, 9]);
    expect(leads.every((l) => l.jobTitle === "Head of Operations")).toBe(true);
    const rows = await da.matchingDirectoryLeadsAsync({ industries: ["Logistics"], countries: ["United States"] }, 2, 28);
    expect(rows.map((r) => r.id)).toEqual([29, 30]);
  });

  it("lists every distinct industry with a skip scan, cached", async () => {
    da.resetDirectoryIndustriesCache();
    expect(await da.directoryIndustriesAsync()).toEqual(["Logistics"]);
    const query = vi.fn(async () => [{ industry: "Other" }]);
    expect(await da.directoryIndustriesAsync(query)).toEqual(["Logistics"]);
    expect(query).not.toHaveBeenCalled();
    da.resetDirectoryIndustriesCache();
    expect(await da.directoryIndustriesAsync(async () => Promise.reject(new Error("down")))).toBeNull();
  });
});

describe("new rows check (totals go stale only when added rows can be in the audience)", () => {
  it("finds added rows in the audience's industries and countries with an index seek", () => {
    const db = ld.getDirectoryDb();
    const run = (afterId: number, industries: string[], countries = ["United States"]) => {
      const q = au.newRowsQuery({ industries, countries }, afterId)!;
      return db.prepare(q.sql).get(...(q.bindings as any[]));
    };
    expect(run(0, ["Logistics"])).toBeTruthy();
    expect(run(10_000, ["Logistics"])).toBeUndefined();
    expect(run(0, ["Dentists"])).toBeUndefined();
    expect(run(0, ["Logistics"], ["Canada"])).toBeUndefined();
    const q = au.newRowsQuery({ industries: ["Logistics"], countries: ["United States"] }, 5)!;
    const plan = (db.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...(q.bindings as any[])) as Array<{ detail: string }>).map((r) => r.detail).join(" ");
    expect(plan).toMatch(/USING INDEX idx_leads_(industry|country)/);
    expect(au.newRowsQuery({ industries: [], countries: [] }, 0)).toBeNull();
  });
});

describe("directory fingerprint", () => {
  it("changes when rows are added or the version is bumped", () => {
    const db = ld.getDirectoryDb();
    const before = ld.directoryFingerprint();
    db.prepare("INSERT INTO leads (job_title, country) VALUES ('Driver', 'Canada')").run();
    const added = ld.directoryFingerprint();
    expect(added).not.toBe(before);
    // The file was created by the app, so it already carries its own build version.
    expect(added).toMatch(/^31\|0\|build-\d{14}-[a-z0-9]+$/);
    db.prepare("INSERT INTO directory_meta(key, value) VALUES('directory_version', 'v2') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    expect(ld.directoryFingerprint()).not.toBe(added);
    expect(ld.directoryFingerprint()).toBe("31|0|v2");
  });

  it("does not change when the newest row is erased (AUTOINCREMENT or not)", () => {
    const db = ld.getDirectoryDb();
    db.prepare("INSERT INTO leads (job_title, email, work_email) VALUES ('Owner', 'last@x.com', 'last@x.com')").run();
    const before = ld.directoryFingerprint();
    expect(ld.deleteDirectoryLeadsByEmail("last@x.com", db)).toBe(1);
    expect(ld.directoryFingerprint()).toBe(before);

    // A directory built without AUTOINCREMENT: the erasure keeps a high-water mark.
    const plain = new DatabaseSync(":memory:");
    plain.exec(`CREATE TABLE leads (id INTEGER PRIMARY KEY, email TEXT, work_email TEXT, personal_email TEXT);
      CREATE TABLE directory_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
      INSERT INTO leads (id, email) VALUES (1, 'a@x.com'), (2, 'b@x.com');`);
    const fp = ld.directoryFingerprint(plain);
    expect(fp).toBe("2|0|");
    expect(ld.deleteDirectoryLeadsByEmail("b@x.com", plain)).toBe(1);
    expect(ld.directoryFingerprint(plain)).toBe(fp);
    plain.close();
  });

  it("is the same for a copy of the file (different device:inode)", () => {
    const db = ld.getDirectoryDb();
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const copy = path.join(dir, "copy.db");
    fs.copyFileSync(ld.directoryDbFile().path, copy);
    const other = new DatabaseSync(copy, { readOnly: true });
    try {
      expect(ld.directoryFingerprint(other)).toBe(ld.directoryFingerprint());
    } finally {
      other.close();
    }
  });

  it("a larger, independently built file reads as a new directory, not rows added", async () => {
    // Regression: without a version, "8000000|0|" -> "100000000|0|" compared as "grown".
    const { execFileSync } = await import("node:child_process");
    const script = path.resolve(__dirname, "../../../../scripts/ingest-leads.mjs");
    const build = (name: string, rows: number) => {
      const csv = path.join(dir, `${name}.csv`);
      const lines = ["email,job_title,industry,country"];
      for (let i = 1; i <= rows; i++) lines.push(`p${i}@${name}${i}.com,Driver,Logistics,United States`);
      fs.writeFileSync(csv, lines.join("\n") + "\n");
      const file = path.join(dir, `${name}.db`);
      execFileSync(process.execPath, [script, "--file", csv, "--db", file], { stdio: "pipe" });
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        return ld.directoryFingerprint(db);
      } finally {
        db.close();
      }
    };
    const small = build("old-build", 3);
    const large = build("new-build", 8);
    expect(small).toMatch(/^3\|0\|build-/);
    expect(large).toMatch(/^8\|0\|build-/);
    expect(au.compareDirectoryFingerprints(small, large)).toBe("new");

    // Appending to an existing file keeps its version: rows added, cursors stay.
    const csv = path.join(dir, "more.csv");
    fs.writeFileSync(csv, "email,job_title\nextra@more.com,Driver\n");
    execFileSync(process.execPath, [script, "--file", csv, "--db", path.join(dir, "old-build.db")], { stdio: "pipe" });
    const db = new DatabaseSync(path.join(dir, "old-build.db"), { readOnly: true });
    try {
      expect(au.compareDirectoryFingerprints(small, ld.directoryFingerprint(db))).toBe("grown");
    } finally {
      db.close();
    }
  });

  it("stamps a version only on a new file, never over an existing one", () => {
    const fresh = new DatabaseSync(":memory:");
    const v = ld.stampNewDirectoryVersion(fresh, new Date("2026-11-09T10:00:00Z"));
    expect(v).toMatch(/^build-20261109100000-[a-z0-9]+$/);
    expect(ld.stampNewDirectoryVersion(fresh)).toBe(v);
    fresh.close();
  });

  it("notices a swapped file and keeps reading the open one", () => {
    expect(ld.directoryFileReplaced()).toBe(false);
    const file = ld.directoryDbFile().path;
    const fresh = path.join(dir, "data", "new.db");
    const other = new DatabaseSync(fresh);
    other.exec("CREATE TABLE leads (id INTEGER PRIMARY KEY); INSERT INTO leads (id) VALUES (999);");
    other.close();
    fs.renameSync(fresh, file);
    expect(ld.directoryFileReplaced()).toBe(true);
    // Still the file the app opened.
    expect(ld.directoryFingerprint()).toMatch(/^32\|0\|v2$/);
  });
});
