const fs = require('fs');
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

const dbPath = 'scripts/test_leads.db';
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE leads (
    id INTEGER PRIMARY KEY,
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
    email_count INTEGER,
    phone_count INTEGER,
    raw_data TEXT
  );
  CREATE INDEX idx_leads_industry ON leads(industry);
  CREATE INDEX idx_leads_country ON leads(country);
  CREATE INDEX idx_leads_company ON leads(company_name);
  CREATE INDEX idx_leads_job_title ON leads(job_title);
`);

const insertStmt = db.prepare(`
  INSERT INTO leads (
    lead_id, first_name, last_name, full_name, job_title,
    company_name, company_website, linkedin_url, location,
    city, state, country, industry, team_size, revenue_range,
    email, email_status, phone, email_count, phone_count, raw_data
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?
  )
`);

console.log("Starting ingestion test of first 20,000 rows...");
const startTime = Date.now();

const stream = fs.createReadStream('E:\\Chrome Downloads\\LeadRocks_MASTER_valid.csv');
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
  if (count > 20000) {
    rl.close();
    stream.destroy();
    return;
  }

  const cols = parseCsvLine(line);
  const loc = cols[10] || '';
  const locParts = loc.split(',').map(s => s.trim());
  const country = locParts.length > 2 ? locParts[2] : (locParts.length > 1 ? locParts[1] : locParts[0] || '');
  const state = locParts.length > 2 ? locParts[1] : '';
  const city = locParts.length > 1 ? locParts[0] : '';

  // Collect raw json for all other fields to make future CSVs 100% extensible
  const rawObj = {};
  for (let i = 0; i < header.length; i++) {
    if (cols[i]) rawObj[header[i]] = cols[i];
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
    JSON.stringify(rawObj)
  );
});

rl.on('close', () => {
  db.exec("COMMIT;");
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`Ingested ${count} rows in ${elapsed.toFixed(2)}s (${(count / elapsed).toFixed(0)} rows/sec)`);

  const queryStart = Date.now();
  const queryStmt = db.prepare(`
    SELECT * FROM leads 
    WHERE industry = 'Restaurants' AND country = 'United States'
    LIMIT 20 OFFSET 0
  `);
  const rows = queryStmt.all();
  const queryTime = Date.now() - queryStart;
  console.log(`Filtered query returned ${rows.length} rows in ${queryTime}ms!`);
  console.log("Sample lead:", rows[0]?.full_name, "at", rows[0]?.company_name, "email:", rows[0]?.email);

  db.close();
  fs.unlinkSync(dbPath);
});
