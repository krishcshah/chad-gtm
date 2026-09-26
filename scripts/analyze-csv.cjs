const fs = require('fs');
const readline = require('readline');

// Quick CSV line parser that respects quotes
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

const stream = fs.createReadStream('E:\\Chrome Downloads\\LeadRocks_MASTER_valid.csv');
const rl = readline.createInterface({ input: stream });

let header = null;
let sampleRow = null;
const industries = new Map();
const countries = new Map();
const revenueRanges = new Map();
const teamSizes = new Map();
let rowCount = 0;

rl.on('line', (line) => {
  if (!header) {
    header = parseCsvLine(line);
    return;
  }
  rowCount++;
  const fields = parseCsvLine(line);
  if (!sampleRow) {
    sampleRow = {};
    header.forEach((h, idx) => {
      sampleRow[h] = fields[idx] || '';
    });
  }

  // Find index of industry and location
  const indIdx = header.indexOf('industry');
  const locIdx = header.indexOf('location');
  const revIdx = header.indexOf('revenue_range');
  const sizeIdx = header.indexOf('team_size');

  if (indIdx >= 0 && fields[indIdx]) {
    const ind = fields[indIdx];
    industries.set(ind, (industries.get(ind) || 0) + 1);
  }
  if (locIdx >= 0 && fields[locIdx]) {
    const loc = fields[locIdx];
    // Usually "City, State, Country"
    const parts = loc.split(',').map(s => s.trim());
    const country = parts[parts.length - 1] || 'Unknown';
    countries.set(country, (countries.get(country) || 0) + 1);
  }
  if (revIdx >= 0 && fields[revIdx]) {
    const rev = fields[revIdx];
    revenueRanges.set(rev, (revenueRanges.get(rev) || 0) + 1);
  }
  if (sizeIdx >= 0 && fields[sizeIdx]) {
    const sz = fields[sizeIdx];
    teamSizes.set(sz, (teamSizes.get(sz) || 0) + 1);
  }
});

rl.on('close', () => {
  console.log('=== CSV ANALYSIS ===');
  console.log('Total Rows:', rowCount);
  console.log('Header Columns (' + header.length + '):');
  header.forEach((h, i) => console.log(`  [${i}] ${h}: "${sampleRow[h]}"`));

  console.log('\nTop 15 Industries:');
  const topInd = [...industries.entries()].sort((a,b) => b[1] - a[1]).slice(0, 15);
  topInd.forEach(([k, v]) => console.log(`  - ${k}: ${v.toLocaleString()} leads`));

  console.log('\nTop 15 Countries:');
  const topCountries = [...countries.entries()].sort((a,b) => b[1] - a[1]).slice(0, 15);
  topCountries.forEach(([k, v]) => console.log(`  - ${k}: ${v.toLocaleString()} leads`));

  console.log('\nRevenue Ranges:');
  const topRev = [...revenueRanges.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);
  topRev.forEach(([k, v]) => console.log(`  - ${k}: ${v.toLocaleString()} leads`));

  console.log('\nTeam Sizes:');
  const topSize = [...teamSizes.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);
  topSize.forEach(([k, v]) => console.log(`  - ${k}: ${v.toLocaleString()} leads`));
});
