import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { deleteDirectoryLeadsByEmail, directoryCountByEmail, ensureDirectoryFts } from "../leads-directory";

function directory() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT, job_title TEXT, company_name TEXT, industry TEXT,
    email TEXT, work_email TEXT, personal_email TEXT
  );`);
  ensureDirectoryFts(db);
  const insert = db.prepare(
    "INSERT INTO leads (full_name, job_title, company_name, industry, email, work_email, personal_email) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  insert.run("Pat Lee", "Owner", "Acme", "Retail", "Pat@Acme.com", "", "");
  insert.run("Pat Lee", "Owner", "Acme", "Retail", "other@acme.com", "PAT@acme.com", "");
  insert.run("Pat Lee", "Owner", "Acme", "Retail", "", "", "pat@acme.com");
  insert.run("Sam Roe", "CEO", "Beta", "Retail", "sam@beta.com", "", "");
  db.exec("INSERT INTO leads_fts(leads_fts) VALUES('rebuild');");
  return db;
}

describe("directory erasure", () => {
  it("counts and deletes every row with the address in any email column, ignoring case", () => {
    const db = directory();
    expect(directoryCountByEmail(" PAT@acme.com ", db)).toBe(3);
    expect(deleteDirectoryLeadsByEmail("pat@acme.com", db)).toBe(3);
    expect(directoryCountByEmail("pat@acme.com", db)).toBe(0);
    const left = db.prepare("SELECT email FROM leads").all() as { email: string }[];
    expect(left.map((r) => r.email)).toEqual(["sam@beta.com"]);
    // The FTS index no longer finds the deleted person.
    const hits = db.prepare("SELECT rowid FROM leads_fts WHERE leads_fts MATCH ?").all('"pat"*');
    expect(hits).toEqual([]);
  });

  it("does nothing for an empty address", () => {
    const db = directory();
    expect(deleteDirectoryLeadsByEmail("  ", db)).toBe(0);
    expect(directoryCountByEmail("", db)).toBe(0);
  });
});
