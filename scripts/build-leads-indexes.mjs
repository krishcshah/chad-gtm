#!/usr/bin/env node
/**
 * Build the expensive, one-time SQLite read indexes for data/leads.db:
 *   - FTS5 index over name/title/company/email/industry
 *   - directory_facets_cache for the B2B browser
 *
 * Usage: node scripts/build-leads-indexes.mjs [--db data/leads.db] [--skip-fts]
 *
 * Safe to re-run. Readers stay available under WAL while the index builds.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}
const skipFts = process.argv.includes("--skip-fts");
const dbPath = path.resolve(arg("db", path.join(process.cwd(), "data", "leads.db")));

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -128000;
  PRAGMA temp_store = MEMORY;
`);

const count = Number(db.prepare("SELECT COUNT(*) AS cnt FROM leads").get()?.cnt || 0);
console.log(`[index] database: ${dbPath}`);
console.log(`[index] rows: ${count.toLocaleString()}`);

if (!skipFts) {
  const started = Date.now();
  console.log("[index] building FTS5 index...");
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
  console.log(`[index] FTS ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const facetsStarted = Date.now();
console.log("[index] rebuilding facet cache...");
db.exec(`
  CREATE TABLE IF NOT EXISTS directory_facets_cache (
    facet_type TEXT NOT NULL,
    facet_value TEXT NOT NULL,
    facet_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (facet_type, facet_value)
  );
  DELETE FROM directory_facets_cache;
  INSERT INTO directory_facets_cache (facet_type, facet_value, facet_count)
    SELECT 'industry', industry, COUNT(*) FROM leads
    WHERE industry IS NOT NULL AND industry != ''
    GROUP BY industry ORDER BY COUNT(*) DESC LIMIT 200;
  INSERT INTO directory_facets_cache (facet_type, facet_value, facet_count)
    SELECT 'country', country, COUNT(*) FROM leads
    WHERE country IS NOT NULL AND country != ''
    GROUP BY country ORDER BY COUNT(*) DESC LIMIT 100;
  INSERT INTO directory_facets_cache (facet_type, facet_value, facet_count)
    SELECT 'revenue_range', revenue_range, COUNT(*) FROM leads
    WHERE revenue_range IS NOT NULL AND revenue_range != ''
    GROUP BY revenue_range ORDER BY COUNT(*) DESC LIMIT 50;
  INSERT INTO directory_facets_cache (facet_type, facet_value, facet_count)
    SELECT 'team_size', team_size, COUNT(*) FROM leads
    WHERE team_size IS NOT NULL AND team_size != ''
    GROUP BY team_size ORDER BY COUNT(*) DESC LIMIT 50;
`);
console.log(`[index] facets ready in ${((Date.now() - facetsStarted) / 1000).toFixed(1)}s`);

const size = fs.statSync(dbPath).size;
console.log(`[index] done. file size: ${(size / 1024 / 1024 / 1024).toFixed(2)} GB`);
db.close();
