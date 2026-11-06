import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * A masked preview (level "none") shows name, title and company but hides the
 * email. Free-text search must then not match the email column, or the result
 * count confirms guessed addresses (and lets a caller extend a prefix).
 * Runs against a throwaway SQLite directory, both the LIKE and FTS paths.
 */

let dir: string;
let mod: typeof import("../leads-directory");

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "leads-dir-oracle-"));
  fs.mkdirSync(path.join(dir, "data"));
  fs.writeFileSync(path.join(dir, "data", "leads.db"), "");
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  vi.resetModules();
  mod = await import("../leads-directory");
  const db = mod.getDirectoryDb();
  const insert = db.prepare(
    "INSERT INTO leads (full_name, job_title, company_name, industry, location, country, email, work_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run("Jane Doe", "VP Sales", "Acme", "Software", "Austin, TX", "United States", "jdoe77@acme.com", "jdoe77@acme.com");
  insert.run("John Roe", "CTO", "Globex", "Software", "Boston, MA", "United States", "jroe@globex.com", "jroe@globex.com");
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function checks() {
  it("a guessed email (or prefix) matches nothing in the masked preview", () => {
    expect(mod.searchLeadsDirectoryForAccess({ companyName: "Acme", query: "jdoe77" }, "none").total).toBe(0);
    expect(mod.searchLeadsDirectoryForAccess({ query: "jdoe77" }, "none").total).toBe(0);
    expect(mod.searchLeadsDirectoryForAccess({ query: "jroe" }, "none").total).toBe(0);
  });

  it("entitled users can still search by email", () => {
    expect(mod.searchLeadsDirectoryForAccess({ query: "jdoe77" }, "paid").total).toBe(1);
    expect(mod.searchLeadsDirectoryForAccess({ query: "jdoe77" }, "admin").total).toBe(1);
  });

  it("the preview still searches the fields it shows", () => {
    const r = mod.searchLeadsDirectoryForAccess({ query: "Jane" }, "none");
    expect(r.total).toBe(1);
    expect(r.leads[0].email).toBe("j•••@acme.com");
    expect(mod.searchLeadsDirectoryForAccess({ query: "Globex" }, "none").total).toBe(1);
    expect(mod.searchLeadsDirectoryForAccess({ query: "VP Sales" }, "none").total).toBe(1);
  });
}

describe("directory email oracle: LIKE search", () => {
  beforeAll(() => {
    expect(mod.isDirectoryFtsReady()).toBe(false);
  });
  checks();
});

describe("directory email oracle: FTS search", () => {
  beforeAll(() => {
    mod.rebuildDirectoryFts();
    expect(mod.isDirectoryFtsReady()).toBe(true);
  });
  checks();
});
