const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/leads.db');

const t0 = Date.now();
const topInd = db.prepare(`SELECT industry, COUNT(*) as cnt FROM leads WHERE industry != '' GROUP BY industry ORDER BY cnt DESC LIMIT 25`).all();
console.log(`Top industries computed in ${Date.now() - t0}ms:`, topInd.length);

const t1 = Date.now();
const topCountries = db.prepare(`SELECT country, COUNT(*) as cnt FROM leads WHERE country != '' GROUP BY country ORDER BY cnt DESC LIMIT 25`).all();
console.log(`Top countries computed in ${Date.now() - t1}ms:`, topCountries.length);

const t2 = Date.now();
const topRev = db.prepare(`SELECT revenue_range, COUNT(*) as cnt FROM leads WHERE revenue_range != '' GROUP BY revenue_range ORDER BY cnt DESC LIMIT 10`).all();
console.log(`Top revenue ranges computed in ${Date.now() - t2}ms:`, topRev.length);

const t3 = Date.now();
const topSizes = db.prepare(`SELECT team_size, COUNT(*) as cnt FROM leads WHERE team_size != '' GROUP BY team_size ORDER BY cnt DESC LIMIT 10`).all();
console.log(`Top team sizes computed in ${Date.now() - t3}ms:`, topSizes.length);

db.close();
