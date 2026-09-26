const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/leads.db');

const t0 = Date.now();
const rows = db.prepare(`
  SELECT id, first_name, last_name, full_name, job_title, company_name, industry, location, country, email, phone
  FROM leads
  WHERE industry IN ('Restaurants', 'Marketing And Advertising')
    AND country = 'United States'
    AND email != ''
    AND phone != ''
  ORDER BY id ASC
  LIMIT 20 OFFSET 0
`).all();

const count = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM leads
  WHERE industry IN ('Restaurants', 'Marketing And Advertising')
    AND country = 'United States'
    AND email != ''
    AND phone != ''
`).get();

console.log(`Query returned ${rows.length} rows (Total matching: ${count.cnt}) in ${Date.now() - t0}ms!`);
console.log('Sample result:', rows[0]);

db.close();
