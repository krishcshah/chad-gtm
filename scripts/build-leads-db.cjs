const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');

function parseCsvLine(text) {
  const result = [];
  let cur = '';
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
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'leads.db');
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new DatabaseSync(dbPath);

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
    raw_data TEXT
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
    email, email_status, phone, email_count, phone_count, source_file, raw_data
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?
  )
`);

console.log("=== INGESTING 183,791 LEADS INTO SQLITE DATABASE ===");
const startTime = Date.now();

const csvPath = 'E:\\Chrome Downloads\\LeadRocks_MASTER_valid.csv';
const stream = fs.createReadStream(csvPath);
const rl = readline.createInterface({ input: stream });

let count = 0;
let header = null;

db.exec("BEGIN TRANSACTION;");

rl.on('line', (line) => {
  if (!header) {
    header = parseCsvLine(line);
    return;
  }
  count++;

  const cols = parseCsvLine(line);
  const loc = cols[10] || '';
  const locParts = loc.split(',').map(s => s.trim());
  const country = locParts.length > 2 ? locParts[2] : (locParts.length > 1 ? locParts[1] : locParts[0] || '');
  const state = locParts.length > 2 ? locParts[1] : '';
  const city = locParts.length > 1 ? locParts[0] : '';

  const rawObj = {};
  const standardCols = new Set([
    'first_name', 'last_name', 'full_name', 'job_title', 'company_name',
    'company_website', 'linkedin_url', 'location', 'industry', 'team_size',
    'revenue_range', 'email_1', 'phone_1', 'lead_id'
  ]);

  for (let i = 0; i < header.length; i++) {
    const val = cols[i];
    const key = header[i];
    if (val && !standardCols.has(key)) {
      rawObj[key] = val;
    }
  }

  insertStmt.run(
    cols[0] || '',
    cols[1] || '',
    cols[2] || '',
    cols[3] || '',
    cols[4] || '',
    cols[5] || '',
    cols[6] || '',
    cols[8] || '',
    loc,
    city,
    state,
    country,
    cols[11] || '',
    cols[12] || '',
    cols[13] || '',
    cols[18] || '',
    cols[19] || '',
    cols[35] || '',
    parseInt(cols[34] || '0', 10) || 0,
    parseInt(cols[47] || '0', 10) || 0,
    'LeadRocks_MASTER_valid.csv',
    JSON.stringify(rawObj)
  );

  if (count % 25000 === 0) {
    db.exec("COMMIT;");
    db.exec("BEGIN TRANSACTION;");
    console.log(`Ingested ${count.toLocaleString()} leads... (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
  }
});

rl.on('close', () => {
  db.exec("COMMIT;");
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`Finished ingesting ${count.toLocaleString()} rows in ${elapsed.toFixed(1)}s!`);

  // Analyze file size
  const stat = fs.statSync(dbPath);
  console.log(`leads.db file size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);

  // Run test queries
  const t0 = Date.now();
  const test1 = db.prepare("SELECT COUNT(*) as cnt FROM leads WHERE industry = 'Restaurants'").get();
  console.log(`Count Restaurants: ${test1.cnt} in ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const test2 = db.prepare(`
    SELECT full_name, job_title, company_name, industry, country, email 
    FROM leads 
    WHERE industry = 'Restaurants' AND country = 'United States' 
    LIMIT 20 OFFSET 0
  `).all();
  console.log(`Query page 1 (20 items): ${test2.length} items in ${Date.now() - t1}ms`);

  db.close();
});
