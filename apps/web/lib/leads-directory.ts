import fs from "fs";
import path from "path";
import zlib from "zlib";
import { DatabaseSync } from "node:sqlite";

export interface DirectoryLead {
  id: number;
  leadId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  companyName: string;
  companyWebsite: string;
  linkedinUrl: string;
  location: string;
  city: string;
  state: string;
  country: string;
  industry: string;
  teamSize: string;
  revenueRange: string;
  email: string;
  emailStatus: string;
  phone: string;
  emailCount: number;
  phoneCount: number;
  sourceFile: string;
  rawAttributes: Record<string, string>;
  workEmail?: string;
  personalEmail?: string;
}

export interface DirectoryFacetItem {
  value: string;
  label: string;
  count: number;
}

export interface DirectoryFacets {
  totalLeads: number;
  industries: DirectoryFacetItem[];
  countries: DirectoryFacetItem[];
  revenueRanges: DirectoryFacetItem[];
  teamSizes: DirectoryFacetItem[];
}

export interface DirectorySearchParams {
  query?: string;
  industries?: string[];
  countries?: string[];
  jobTitles?: string[];
  companyName?: string;
  teamSizes?: string[];
  revenueRanges?: string[];
  hasEmail?: boolean;
  hasWorkEmail?: boolean;
  hasPersonalEmail?: boolean;
  hasPhone?: boolean;
  hasLinkedin?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: "default" | "name" | "company" | "team_size";
  sortOrder?: "asc" | "desc";
}

export interface DirectorySearchResult {
  leads: DirectoryLead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

let cachedDb: DatabaseSync | null = null;
let cachedFacets: DirectoryFacets | null = null;

function resolveDbPath(): string {
  // 1. Direct workspace data/leads.db
  const localDb = path.resolve(process.cwd(), "data", "leads.db");
  if (fs.existsSync(localDb)) {
    return localDb;
  }

  // 2. Monorepo root / relative data/leads.db
  const rootDb = path.resolve(process.cwd(), "..", "..", "data", "leads.db");
  if (fs.existsSync(rootDb)) {
    return rootDb;
  }

  // 3. Check for compressed data/leads.db.gz to decompress
  const gzPath = fs.existsSync(path.resolve(process.cwd(), "data", "leads.db.gz"))
    ? path.resolve(process.cwd(), "data", "leads.db.gz")
    : path.resolve(process.cwd(), "..", "..", "data", "leads.db.gz");

  if (fs.existsSync(gzPath)) {
    const targetDir = process.env.VERCEL ? "/tmp" : path.dirname(gzPath);
    const targetPath = path.join(targetDir, "leads.db");

    if (!fs.existsSync(targetPath)) {
      console.log(`[leads-directory] Decompressing ${gzPath} -> ${targetPath}...`);
      const gzBuffer = fs.readFileSync(gzPath);
      const unzipped = zlib.gunzipSync(gzBuffer);
      fs.writeFileSync(targetPath, unzipped);
      console.log(`[leads-directory] Extracted leads.db (${(unzipped.length / 1024 / 1024).toFixed(1)} MB)`);
    }
    return targetPath;
  }

  // 4. Temporary / fallback database
  const fallbackPath = path.join(process.env.VERCEL ? "/tmp" : "data", "leads.db");
  return fallbackPath;
}

export function getDirectoryDb(): DatabaseSync {
  if (cachedDb) return cachedDb;

  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Initialize schema if newly created
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT,
      first_name TEXT,
      last_name TEXT,
      full_name TEXT,
      job_title TEXT,
      company_name TEXT,
      company_website TEXT,
      linkedin_url TEXT,
      location TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      industry TEXT,
      team_size TEXT,
      revenue_range TEXT,
      email TEXT,
      email_status TEXT,
      phone TEXT,
      email_count INTEGER DEFAULT 0,
      phone_count INTEGER DEFAULT 0,
      source_file TEXT,
      raw_data TEXT,
      work_email TEXT,
      personal_email TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);
    CREATE INDEX IF NOT EXISTS idx_leads_country ON leads(country);
    CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_name);
    CREATE INDEX IF NOT EXISTS idx_leads_job_title ON leads(job_title);
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    CREATE INDEX IF NOT EXISTS idx_leads_work_email ON leads(work_email);
    CREATE INDEX IF NOT EXISTS idx_leads_personal_email ON leads(personal_email);
  `);

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN work_email TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE leads ADD COLUMN personal_email TEXT;`);
  } catch {}

  cachedDb = db;
  return db;
}

/**
 * Get aggregated filter facets (industries, countries, revenue, sizes)
 * with real count badges.
 */
export function getDirectoryFacets(): DirectoryFacets {
  if (cachedFacets) return cachedFacets;

  try {
    const db = getDirectoryDb();

    const totalRow = db.prepare("SELECT COUNT(*) as cnt FROM leads").get() as { cnt: number };
    const totalLeads = totalRow?.cnt || 0;

    const indRows = db.prepare(`
      SELECT industry, COUNT(*) as cnt 
      FROM leads 
      WHERE industry IS NOT NULL AND industry != '' 
      GROUP BY industry 
      ORDER BY cnt DESC 
      LIMIT 30
    `).all() as Array<{ industry: string; cnt: number }>;

    const countryRows = db.prepare(`
      SELECT country, COUNT(*) as cnt 
      FROM leads 
      WHERE country IS NOT NULL AND country != '' 
      GROUP BY country 
      ORDER BY cnt DESC 
      LIMIT 30
    `).all() as Array<{ country: string; cnt: number }>;

    const revRows = db.prepare(`
      SELECT revenue_range, COUNT(*) as cnt 
      FROM leads 
      WHERE revenue_range IS NOT NULL AND revenue_range != '' 
      GROUP BY revenue_range 
      ORDER BY cnt DESC 
      LIMIT 12
    `).all() as Array<{ revenue_range: string; cnt: number }>;

    const sizeRows = db.prepare(`
      SELECT team_size, COUNT(*) as cnt 
      FROM leads 
      WHERE team_size IS NOT NULL AND team_size != '' 
      GROUP BY team_size 
      ORDER BY cnt DESC 
      LIMIT 12
    `).all() as Array<{ team_size: string; cnt: number }>;

    cachedFacets = {
      totalLeads,
      industries: indRows.map((r) => ({ value: r.industry, label: r.industry, count: r.cnt })),
      countries: countryRows.map((r) => ({ value: r.country, label: r.country, count: r.cnt })),
      revenueRanges: revRows.map((r) => ({ value: r.revenue_range, label: r.revenue_range, count: r.cnt })),
      teamSizes: sizeRows.map((r) => ({ value: r.team_size, label: r.team_size, count: r.cnt })),
    };

    return cachedFacets;
  } catch (err) {
    console.error("[leads-directory] Failed to compute facets:", err);
    return {
      totalLeads: 0,
      industries: [],
      countries: [],
      revenueRanges: [],
      teamSizes: [],
    };
  }
}

/**
 * Build reusable SQL WHERE clause and bindings for directory leads.
 */
export function buildDirectoryWhereClause(params: DirectorySearchParams): { whereSql: string; bindings: any[] } {
  const whereClauses: string[] = [];
  const bindings: any[] = [];

  // General text search
  if (params.query && params.query.trim()) {
    const q = `%${params.query.trim().toLowerCase()}%`;
    whereClauses.push(`(
      LOWER(full_name) LIKE ? OR 
      LOWER(job_title) LIKE ? OR 
      LOWER(company_name) LIKE ? OR 
      LOWER(email) LIKE ? OR 
      LOWER(location) LIKE ?
    )`);
    bindings.push(q, q, q, q, q);
  }

  // Company name filter
  if (params.companyName && params.companyName.trim()) {
    whereClauses.push(`LOWER(company_name) LIKE ?`);
    bindings.push(`%${params.companyName.trim().toLowerCase()}%`);
  }

  // Industries filter
  if (params.industries && params.industries.length > 0) {
    const placeholders = params.industries.map(() => "?").join(",");
    whereClauses.push(`industry IN (${placeholders})`);
    bindings.push(...params.industries);
  }

  // Countries filter
  if (params.countries && params.countries.length > 0) {
    const placeholders = params.countries.map(() => "?").join(",");
    whereClauses.push(`country IN (${placeholders})`);
    bindings.push(...params.countries);
  }

  // Job Titles filter
  if (params.jobTitles && params.jobTitles.length > 0) {
    const titleClauses = params.jobTitles.map(() => `LOWER(job_title) LIKE ?`).join(" OR ");
    whereClauses.push(`(${titleClauses})`);
    params.jobTitles.forEach((t) => bindings.push(`%${t.trim().toLowerCase()}%`));
  }

  // Team sizes filter
  if (params.teamSizes && params.teamSizes.length > 0) {
    const placeholders = params.teamSizes.map(() => "?").join(",");
    whereClauses.push(`team_size IN (${placeholders})`);
    bindings.push(...params.teamSizes);
  }

  // Revenue ranges filter
  if (params.revenueRanges && params.revenueRanges.length > 0) {
    const placeholders = params.revenueRanges.map(() => "?").join(",");
    whereClauses.push(`revenue_range IN (${placeholders})`);
    bindings.push(...params.revenueRanges);
  }

  // Quality switches
  if (params.hasEmail) {
    whereClauses.push(`email IS NOT NULL AND email != ''`);
  }
  if (params.hasWorkEmail) {
    whereClauses.push(`work_email IS NOT NULL AND work_email != ''`);
  }
  if (params.hasPersonalEmail) {
    whereClauses.push(`personal_email IS NOT NULL AND personal_email != ''`);
  }
  if (params.hasPhone) {
    whereClauses.push(`phone IS NOT NULL AND phone != ''`);
  }
  if (params.hasLinkedin) {
    whereClauses.push(`linkedin_url IS NOT NULL AND linkedin_url != ''`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  return { whereSql, bindings };
}

/**
 * Filter & paginate leads from the directory.
 */
export function searchLeadsDirectory(params: DirectorySearchParams): DirectorySearchResult {
  try {
    const db = getDirectoryDb();
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(5, params.pageSize || 10));
    const offset = (page - 1) * pageSize;

    const { whereSql, bindings } = buildDirectoryWhereClause(params);

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM leads ${whereSql}`;
    const countRow = db.prepare(countSql).get(...bindings) as { total: number };
    const total = countRow?.total || 0;

    // Sorting
    let orderSql = "ORDER BY id ASC";
    if (params.sortBy === "name") {
      orderSql = `ORDER BY full_name ${params.sortOrder === "desc" ? "DESC" : "ASC"}`;
    } else if (params.sortBy === "company") {
      orderSql = `ORDER BY company_name ${params.sortOrder === "desc" ? "DESC" : "ASC"}`;
    } else if (params.sortBy === "team_size") {
      orderSql = `ORDER BY CAST(team_size AS INTEGER) ${params.sortOrder === "desc" ? "DESC" : "ASC"}`;
    }

    // Data query
    const dataSql = `
      SELECT * FROM leads 
      ${whereSql} 
      ${orderSql} 
      LIMIT ? OFFSET ?
    `;

    const rawRows = db.prepare(dataSql).all(...bindings, pageSize, offset) as any[];

    const leads: DirectoryLead[] = rawRows.map((r) => {
      let rawAttrs: Record<string, string> = {};
      try {
        if (r.raw_data) {
          rawAttrs = JSON.parse(r.raw_data);
        }
      } catch {}

      return {
        id: r.id,
        leadId: r.lead_id || String(r.id),
        firstName: r.first_name || "",
        lastName: r.last_name || "",
        fullName: r.full_name || `${r.first_name || ""} ${r.last_name || ""}`.trim(),
        jobTitle: r.job_title || "",
        companyName: r.company_name || "",
        companyWebsite: r.company_website || "",
        linkedinUrl: r.linkedin_url || "",
        location: r.location || "",
        city: r.city || "",
        state: r.state || "",
        country: r.country || "",
        industry: r.industry || "",
        teamSize: r.team_size || "",
        revenueRange: r.revenue_range || "",
        email: r.email || "",
        emailStatus: r.email_status || "",
        phone: r.phone || "",
        emailCount: r.email_count || 0,
        phoneCount: r.phone_count || 0,
        sourceFile: r.source_file || "",
        rawAttributes: rawAttrs,
        workEmail: r.work_email || "",
        personalEmail: r.personal_email || "",
      };
    });

    const totalPages = Math.ceil(total / pageSize);

    return {
      leads,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (err) {
    console.error("[leads-directory] Search error:", err);
    return {
      leads: [],
      total: 0,
      page: 1,
      pageSize: params.pageSize || 10,
      totalPages: 0,
    };
  }
}

/**
 * Fetch all matching leads from directory for bulk operations (like CSV export).
 * Default cap at 25,000 to maintain optimal memory and response time.
 */
export function getMatchingDirectoryLeadsForExport(params: DirectorySearchParams, maxRows = 25000): DirectoryLead[] {
  try {
    const db = getDirectoryDb();
    const { whereSql, bindings } = buildDirectoryWhereClause(params);
    const dataSql = `SELECT * FROM leads ${whereSql} ORDER BY id ASC LIMIT ?`;
    const rawRows = db.prepare(dataSql).all(...bindings, maxRows) as any[];

    return rawRows.map((r) => {
      let rawAttrs: Record<string, string> = {};
      try {
        if (r.raw_data) {
          rawAttrs = JSON.parse(r.raw_data);
        }
      } catch {}

      return {
        id: r.id,
        leadId: r.lead_id || `lead_${r.id}`,
        firstName: r.first_name || "",
        lastName: r.last_name || "",
        fullName: r.full_name || `${r.first_name || ""} ${r.last_name || ""}`.trim(),
        jobTitle: r.job_title || "",
        companyName: r.company_name || "",
        companyWebsite: r.company_website || "",
        linkedinUrl: r.linkedin_url || "",
        location: r.location || "",
        city: r.city || "",
        state: r.state || "",
        country: r.country || "",
        industry: r.industry || "",
        teamSize: r.team_size || "",
        revenueRange: r.revenue_range || "",
        email: r.email || "",
        emailStatus: r.email_status || (r.email ? "verified" : "unknown"),
        phone: r.phone || "",
        emailCount: r.email_count || (r.email ? 1 : 0),
        phoneCount: r.phone_count || (r.phone ? 1 : 0),
        sourceFile: r.source_file || "",
        rawAttributes: rawAttrs,
        workEmail: r.work_email || "",
        personalEmail: r.personal_email || "",
      };
    });
  } catch (err) {
    console.error("[leads-directory] Export error:", err);
    return [];
  }
}

/**
 * Universal CSV Parser helper that correctly parses CSV lines with quotes.
 */
export function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Universal Ingestion Engine:
 * Ingests any arbitrary CSV file into the leads directory.
 * Automatically detects standard headers and bundles any non-standard
 * or extra columns into raw_data JSON for 100% schema flexibility.
 */
export async function ingestCsvContent(
  csvText: string,
  fileName: string = "uploaded_leads.csv"
): Promise<{ inserted: number; totalInDb: number }> {
  const db = getDirectoryDb();
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV file must contain a header row and at least one data row.");
  }

  const rawHeader = parseCsvLine(lines[0]);
  const header = rawHeader.map((h) => h.toLowerCase().trim().replace(/[\s-]+/g, "_"));

  // Auto-map column indices
  const findCol = (...aliases: string[]) => {
    return header.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
  };

  const idIdx = findCol("lead_id", "id");
  const firstIdx = findCol("first_name", "firstname", "first", "fname");
  const lastIdx = findCol("last_name", "lastname", "last", "lname");
  const fullIdx = findCol("full_name", "fullname", "name", "contact_name");
  const titleIdx = findCol("job_title", "jobtitle", "title", "position", "role");
  const compIdx = findCol("company_name", "company", "organization", "account");
  const webIdx = findCol("company_website", "website", "domain", "url");
  const linkedinIdx = findCol("linkedin_url", "linkedin");
  const locIdx = findCol("location", "address", "full_location");
  const cityIdx = findCol("city", "town");
  const stateIdx = findCol("state", "province", "region");
  const countryIdx = findCol("country", "nation");
  const indIdx = findCol("industry", "sector", "category");
  const sizeIdx = findCol("team_size", "company_size", "employees", "headcount");
  const revIdx = findCol("revenue_range", "revenue", "arr");
  const emailIdx = findCol("email_1", "email", "work_email", "primary_email");
  const emailStatusIdx = findCol("email_verification_status", "email_status", "status");
  const phoneIdx = findCol("phone_1", "phone", "mobile", "direct_phone", "telephone");

  const insertStmt = db.prepare(`
    INSERT INTO leads (
      lead_id, first_name, last_name, full_name, job_title,
      company_name, company_website, linkedin_url, location,
      city, state, country, industry, team_size, revenue_range,
      email, email_status, phone, email_count, phone_count, source_file, raw_data
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
  `);

  db.exec("BEGIN TRANSACTION;");
  let inserted = 0;

  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    if (!cols.some((c) => c.length > 0)) continue;

    const loc = locIdx >= 0 ? cols[locIdx] || "" : "";
    let city = cityIdx >= 0 ? cols[cityIdx] || "" : "";
    let state = stateIdx >= 0 ? cols[stateIdx] || "" : "";
    let country = countryIdx >= 0 ? cols[countryIdx] || "" : "";

    // Parse location parts if city/state/country weren't in dedicated columns
    if (loc && (!country || !city)) {
      const parts = loc.split(",").map((s) => s.trim());
      if (!country && parts.length > 0) country = parts[parts.length - 1];
      if (!state && parts.length > 2) state = parts[parts.length - 2];
      if (!city && parts.length > 1) city = parts[0];
    }

    const firstName = firstIdx >= 0 ? cols[firstIdx] || "" : "";
    const lastName = lastIdx >= 0 ? cols[lastIdx] || "" : "";
    const fullName =
      fullIdx >= 0
        ? cols[fullIdx] || `${firstName} ${lastName}`.trim()
        : `${firstName} ${lastName}`.trim();

    // Preserve all extra/unmapped columns in raw_data JSON
    const rawAttrs: Record<string, string> = {};
    for (let c = 0; c < rawHeader.length; c++) {
      const colName = rawHeader[c];
      const val = cols[c];
      if (val && val.trim().length > 0) {
        rawAttrs[colName] = val;
      }
    }

    const email = emailIdx >= 0 ? cols[emailIdx] || "" : "";
    const phone = phoneIdx >= 0 ? cols[phoneIdx] || "" : "";

    insertStmt.run(
      idIdx >= 0 ? cols[idIdx] || "" : "",
      firstName,
      lastName,
      fullName,
      titleIdx >= 0 ? cols[titleIdx] || "" : "",
      compIdx >= 0 ? cols[compIdx] || "" : "",
      webIdx >= 0 ? cols[webIdx] || "" : "",
      linkedinIdx >= 0 ? cols[linkedinIdx] || "" : "",
      loc,
      city,
      state,
      country,
      indIdx >= 0 ? cols[indIdx] || "" : "",
      sizeIdx >= 0 ? cols[sizeIdx] || "" : "",
      revIdx >= 0 ? cols[revIdx] || "" : "",
      email,
      emailStatusIdx >= 0 ? cols[emailStatusIdx] || (email ? "VALID" : "") : "",
      phone,
      email ? 1 : 0,
      phone ? 1 : 0,
      fileName,
      JSON.stringify(rawAttrs)
    );

    inserted++;
  }

  db.exec("COMMIT;");

  // Invalidate facet cache so new industries/countries immediately show up
  cachedFacets = null;

  const totalRow = db.prepare("SELECT COUNT(*) as cnt FROM leads").get() as { cnt: number };
  return {
    inserted,
    totalInDb: totalRow?.cnt || inserted,
  };
}

/**
 * Invalidate cached facets so newly imported leads immediately reflect in UI.
 */
export function invalidateDirectoryFacetsCache(): void {
  cachedFacets = null;
}

export interface IngestionResult {
  totalParsed: number;
  inserted: number;
  duplicatesSkipped: number;
  invalidRows: number;
  totalInDb: number;
}

/**
 * Fast admin bulk ingestion service with header normalization,
 * batch transactions, email deduplication, and facet cache invalidation.
 */
export async function importDirectoryLeadsFromCsv(
  records: Record<string, string>[],
  sourceName = "admin_bulk_import.csv"
): Promise<IngestionResult> {
  const db = getDirectoryDb();
  let inserted = 0;
  let duplicatesSkipped = 0;
  let invalidRows = 0;

  const checkEmailStmt = db.prepare("SELECT 1 FROM leads WHERE LOWER(email) = ? LIMIT 1");
  const insertStmt = db.prepare(`
    INSERT INTO leads (
      lead_id, first_name, last_name, full_name, job_title,
      company_name, company_website, linkedin_url, location,
      city, state, country, industry, team_size, revenue_range,
      email, email_status, phone, email_count, phone_count, source_file, raw_data,
      work_email, personal_email
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?
    )
  `);

  const seenInBatch = new Set<string>();
  const CHUNK_SIZE = 1000;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    db.exec("BEGIN TRANSACTION;");
    try {
      for (const raw of chunk) {
        const getVal = (...aliases: string[]) => {
          for (const alias of aliases) {
            const lowerAlias = alias.toLowerCase().replace(/[\s_-]+/g, "");
            for (const [k, v] of Object.entries(raw)) {
              const lowerK = k.toLowerCase().replace(/[\s_-]+/g, "");
              if (lowerK === lowerAlias) return (v || "").trim();
            }
          }
          return "";
        };

        const email = getVal("email", "work_email", "email_address", "corporate_email", "email1", "primary_email");
        if (!email || !email.includes("@")) {
          invalidRows++;
          continue;
        }

        const normalizedEmail = email.toLowerCase().trim();
        if (seenInBatch.has(normalizedEmail)) {
          duplicatesSkipped++;
          continue;
        }

        const existing = checkEmailStmt.get(normalizedEmail);
        if (existing) {
          duplicatesSkipped++;
          seenInBatch.add(normalizedEmail);
          continue;
        }

        seenInBatch.add(normalizedEmail);

        const firstName = getVal("first_name", "firstname", "first", "fname");
        const lastName = getVal("last_name", "lastname", "last", "lname");
        const fullName = getVal("full_name", "fullname", "name", "contact_name") || `${firstName} ${lastName}`.trim();
        const jobTitle = getVal("job_title", "title", "position", "role");
        const companyName = getVal("company_name", "company", "account_name", "organization");
        const companyWebsite = getVal("company_website", "website", "domain", "url");
        const linkedinUrl = getVal("linkedin_url", "linkedin", "person_linkedin_url", "profile_url");
        const industry = getVal("industry", "primary_industry", "sector", "category");
        const country = getVal("country", "nation");
        const city = getVal("city", "town");
        const state = getVal("state", "region", "province");
        const teamSize = getVal("team_size", "employees", "company_size", "headcount", "# employees");
        const revenueRange = getVal("revenue_range", "annual_revenue", "revenue", "estimated_revenue", "arr");
        const phone = getVal("phone", "direct_phone", "mobile_phone", "telephone", "phone1");
        const location = [city, state, country].filter(Boolean).join(", ") || getVal("location", "address");

        insertStmt.run(
          `lead_${crypto.randomUUID()}`,
          firstName,
          lastName,
          fullName,
          jobTitle,
          companyName,
          companyWebsite,
          linkedinUrl,
          location,
          city,
          state,
          country,
          industry,
          teamSize,
          revenueRange,
          normalizedEmail,
          "verified",
          phone,
          1,
          phone ? 1 : 0,
          sourceName,
          JSON.stringify(raw),
          normalizedEmail,
          ""
        );
        inserted++;
      }
      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      console.error("[leads-directory] Error in batch transaction:", err);
      throw err;
    }
  }

  // Invalidate facet cache immediately so counts refresh
  cachedFacets = null;

  const totalRow = db.prepare("SELECT COUNT(*) as cnt FROM leads").get() as { cnt: number };
  return {
    totalParsed: records.length,
    inserted,
    duplicatesSkipped,
    invalidRows,
    totalInDb: totalRow?.cnt || 0,
  };
}

/**
 * Get live database metrics for the admin telemetry view.
 */
export function getDirectoryStats(): {
  totalLeads: number;
  distinctIndustries: number;
  distinctCountries: number;
  verifiedEmailCount: number;
  verifiedEmailPct: number;
  fileSizeBytes: number;
} {
  try {
    const db = getDirectoryDb();
    const totalRow = db.prepare("SELECT COUNT(*) as cnt FROM leads").get() as { cnt: number };
    const totalLeads = totalRow?.cnt || 0;

    const indRow = db.prepare("SELECT COUNT(DISTINCT industry) as cnt FROM leads WHERE industry IS NOT NULL AND industry != ''").get() as { cnt: number };
    const countryRow = db.prepare("SELECT COUNT(DISTINCT country) as cnt FROM leads WHERE country IS NOT NULL AND country != ''").get() as { cnt: number };
    const emailRow = db.prepare("SELECT COUNT(*) as cnt FROM leads WHERE email IS NOT NULL AND email != ''").get() as { cnt: number };

    const emailCount = emailRow?.cnt || 0;
    const verifiedEmailPct = totalLeads > 0 ? Math.round((emailCount / totalLeads) * 100) : 0;

    const dbPath = resolveDbPath();
    let fileSizeBytes = 0;
    try {
      if (fs.existsSync(dbPath)) {
        fileSizeBytes = fs.statSync(dbPath).size;
      }
    } catch {}

    return {
      totalLeads,
      distinctIndustries: indRow?.cnt || 0,
      distinctCountries: countryRow?.cnt || 0,
      verifiedEmailCount: emailCount,
      verifiedEmailPct,
      fileSizeBytes,
    };
  } catch (err) {
    console.error("[leads-directory] Failed to get stats:", err);
    return {
      totalLeads: 0,
      distinctIndustries: 0,
      distinctCountries: 0,
      verifiedEmailCount: 0,
      verifiedEmailPct: 0,
      fileSizeBytes: 0,
    };
  }
}

