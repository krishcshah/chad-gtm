#!/usr/bin/env node
/**
 * Streaming B2B lead ingestion for data/leads.db.
 *
 * Usage:
 *   node scripts/ingest-leads.mjs --file C:\dumps\apollo.csv [--db data/leads.db]
 *   node scripts/ingest-leads.mjs --file dump.csv --chunk 2500 --rebuild-fts
 *
 * Design:
 *  - CSV is parsed as a stream; the file never lands in memory as one string.
 *  - Inserts are committed every `--chunk` rows (default 2,500).
 *  - Emails are lowercased and deduped against an indexed column.
 *  - WAL mode lets read queries continue while the import runs.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { DatabaseSync } from "node:sqlite";

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const filePath = arg("file");
const dbPath = path.resolve(arg("db", path.join(process.cwd(), "data", "leads.db")));
const chunkSize = Math.max(100, Number(arg("chunk", "2500")) || 2500);
const sourceName = path.basename(filePath || "import.csv");

if (!filePath) {
  console.error("Missing --file <csv>");
  process.exit(1);
}
if (!fs.existsSync(filePath)) {
  console.error(`CSV not found: ${filePath}`);
  process.exit(1);
}
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -128000;
  PRAGMA temp_store = MEMORY;
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT, first_name TEXT, last_name TEXT, full_name TEXT, job_title TEXT,
    company_name TEXT, company_website TEXT, linkedin_url TEXT, location TEXT,
    city TEXT, state TEXT, country TEXT, industry TEXT, team_size TEXT,
    revenue_range TEXT, email TEXT, email_status TEXT, phone TEXT,
    email_count INTEGER DEFAULT 0, phone_count INTEGER DEFAULT 0, source_file TEXT,
    raw_data TEXT, work_email TEXT, personal_email TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);
  CREATE INDEX IF NOT EXISTS idx_leads_country ON leads(country);
  CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_name);
  CREATE INDEX IF NOT EXISTS idx_leads_job_title ON leads(job_title);
  CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
`);

const insertStmt = db.prepare(`
  INSERT INTO leads (
    lead_id, first_name, last_name, full_name, job_title,
    company_name, company_website, linkedin_url, location,
    city, state, country, industry, team_size, revenue_range,
    email, email_status, phone, email_count, phone_count, source_file, raw_data,
    work_email, personal_email
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const existsStmt = db.prepare("SELECT 1 FROM leads WHERE email = ? LIMIT 1");

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]/g, "");
}

function buildMapper(header) {
  const normalized = header.map(normalizeHeader);
  const find = (...aliases) =>
    normalized.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
  return {
    id: find("lead_id", "id"),
    first: find("first_name", "firstname", "fname", "first"),
    last: find("last_name", "lastname", "lname", "last"),
    full: find("full_name", "fullname", "contact_name"),
    nameOnly: find("name"),
    title: find("job_title", "jobtitle", "title", "position", "role"),
    company: find("company_name", "company", "organization", "account"),
    website: find("company_website", "website", "domain", "url"),
    linkedin: find("linkedin_url", "linkedin"),
    location: find("location", "address", "full_location"),
    city: find("city", "town"),
    state: find("state", "province", "region"),
    country: find("country", "nation"),
    industry: find("industry", "sector", "category"),
    size: find("team_size", "company_size", "employees", "headcount"),
    revenue: find("revenue_range", "annual_revenue", "revenue", "arr"),
    email: find("email", "email_address", "work_email", "corporate_email", "primary_email"),
    emailStatus: find("email_status", "email_verification_status", "verification_status"),
    phone: find("phone", "direct_phone", "mobile", "telephone"),
  };
}

/** Parse a CSV row, honouring quoted commas, escaped quotes and newlines. */
function createCsvParser() {
  let inQuotes = false;
  let quotePending = false;
  let field = "";
  let row = [];

  function reset() {
    inQuotes = false;
    quotePending = false;
    field = "";
    row = [];
  }

  function endField() {
    row.push(field);
    field = "";
  }

  function endRow() {
    endField();
    const completed = row;
    reset();
    return completed;
  }

  return {
    pushChar(ch) {
      if (quotePending) {
        quotePending = false;
        if (ch === '"') {
          // Escaped quote inside a quoted field.
          field += '"';
          return null;
        }
        inQuotes = false;
        // Fall through and treat this char as a delimiter/character.
      }

      if (inQuotes) {
        if (ch === '"') {
          quotePending = true;
        } else {
          field += ch;
        }
        return null;
      }

      if (ch === '"') {
        inQuotes = true;
        return null;
      }
      if (ch === ",") {
        endField();
        return null;
      }
      if (ch === "\n") {
        return endRow();
      }
      if (ch !== "\r") field += ch;
      return null;
    },
    flush() {
      if (!field && row.length === 0) return null;
      return endRow();
    },
  };
}

/**
 * Streams parsed CSV rows without loading the file. `readline` splits physical
 * lines; the stateful parser re-joins quoted newlines correctly.
 */
async function* readCsvRows(file) {
  const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const parser = createCsvParser();

  for await (const line of rl) {
    for (const ch of line) {
      const row = parser.pushChar(ch);
      if (row) yield row;
    }
    const row = parser.pushChar("\n");
    if (row) yield row;
  }
  const last = parser.flush();
  if (last) yield last;
}

function pick(row, index) {
  if (index < 0) return "";
  return String(row[index] ?? "").trim();
}

const started = Date.now();
let header = null;
let mapper = null;
let inserted = 0;
let duplicates = 0;
let invalid = 0;
let inTransaction = false;

function begin() {
  if (!inTransaction) {
    db.exec("BEGIN TRANSACTION;");
    inTransaction = true;
  }
}

function commit() {
  if (inTransaction) {
    db.exec("COMMIT;");
    inTransaction = false;
  }
}

try {
  for await (const row of readCsvRows(filePath)) {
    if (!header) {
      header = row;
      mapper = buildMapper(header);
      continue;
    }
    if (row.every((cell) => !String(cell).trim())) continue;

    const email = pick(row, mapper.email).toLowerCase();
    if (!email || !email.includes("@") || email.length > 320) {
      invalid++;
      continue;
    }

    if (existsStmt.get(email)) {
      duplicates++;
      continue;
    }

    const firstName = pick(row, mapper.first);
    const lastName = pick(row, mapper.last);
    const fullName =
      pick(row, mapper.full) ||
      (!firstName && !lastName ? pick(row, mapper.nameOnly) : "") ||
      `${firstName} ${lastName}`.trim();
    const city = pick(row, mapper.city);
    const state = pick(row, mapper.state);
    const country = pick(row, mapper.country);
    const location =
      pick(row, mapper.location) || [city, state, country].filter(Boolean).join(", ");
    const phone = pick(row, mapper.phone);

    const raw = {};
    for (let i = 0; i < header.length; i++) {
      const value = String(row[i] ?? "").trim();
      if (value) raw[String(header[i]).trim()] = value;
    }

    begin();
    insertStmt.run(
      pick(row, mapper.id) || `lead_${crypto.randomUUID()}`,
      firstName,
      lastName,
      fullName,
      pick(row, mapper.title),
      pick(row, mapper.company),
      pick(row, mapper.website),
      pick(row, mapper.linkedin),
      location,
      city,
      state,
      country,
      pick(row, mapper.industry),
      pick(row, mapper.size),
      pick(row, mapper.revenue),
      email,
      pick(row, mapper.emailStatus) || "verified",
      phone,
      1,
      phone ? 1 : 0,
      sourceName,
      JSON.stringify(raw),
      email,
      ""
    );
    inserted++;

    if (inserted % chunkSize === 0) {
      commit();
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[ingest] inserted=${inserted.toLocaleString()} dupes=${duplicates.toLocaleString()} invalid=${invalid.toLocaleString()} elapsed=${elapsed}s`
      );
    }
  }
  commit();
} catch (err) {
  try {
    if (inTransaction) db.exec("ROLLBACK;");
  } catch {}
  console.error("[ingest] failed:", err);
  process.exit(1);
}

const total = db.prepare("SELECT COUNT(*) AS cnt FROM leads").get()?.cnt || 0;
console.log(
  `[ingest] done. inserted=${inserted.toLocaleString()} dupes=${duplicates.toLocaleString()} invalid=${invalid.toLocaleString()} total=${Number(total).toLocaleString()}`
);

if (hasFlag("rebuild-fts")) {
  console.log("[ingest] rebuilding FTS5 index (this can take a few minutes)...");
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS leads_fts USING fts5(
      full_name, job_title, company_name, email, industry,
      content='leads', content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS leads_fts_ai AFTER INSERT ON leads BEGIN
      INSERT INTO leads_fts(rowid, full_name, job_title, company_name, email, industry)
      VALUES (new.id, new.full_name, new.job_title, new.company_name, new.email, new.industry);
    END;
    CREATE TRIGGER IF NOT EXISTS leads_fts_ad AFTER DELETE ON leads BEGIN
      INSERT INTO leads_fts(leads_fts, rowid, full_name, job_title, company_name, email, industry)
      VALUES ('delete', old.id, old.full_name, old.job_title, old.company_name, old.email, old.industry);
    END;
    CREATE TRIGGER IF NOT EXISTS leads_fts_au AFTER UPDATE ON leads BEGIN
      INSERT INTO leads_fts(leads_fts, rowid, full_name, job_title, company_name, email, industry)
      VALUES ('delete', old.id, old.full_name, old.job_title, old.company_name, old.email, old.industry);
      INSERT INTO leads_fts(rowid, full_name, job_title, company_name, email, industry)
      VALUES (new.id, new.full_name, new.job_title, new.company_name, new.email, new.industry);
    END;
    CREATE TABLE IF NOT EXISTS directory_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
    INSERT INTO leads_fts(leads_fts) VALUES('rebuild');
    INSERT INTO directory_meta(key, value) VALUES('fts_built', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `);
  console.log("[ingest] FTS5 index rebuilt.");
}

db.close();
