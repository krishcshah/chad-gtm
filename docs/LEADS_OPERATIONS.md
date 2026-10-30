# Lead Directory & Crawler Operations

## One-time index build (SQLite)

After loading a new `data/leads.db` (or after a very large import), build the
read indexes once:

```bash
npm run leads:index -- --db data/leads.db
```

This creates:

- `leads_fts` — FTS5 index over name, title, company, email, industry.
- `directory_facets_cache` — industry/country/revenue/team-size counts.
- A `fts_built` marker in `directory_meta`. Search only uses FTS after this
  marker exists, so a partially built index can never hide old leads.

The build runs inside SQLite under WAL; web reads continue while it runs.

## Streaming CSV ingestion

```bash
# Load any Apollo / ZoomInfo / Clay CSV dump
node scripts/ingest-leads.mjs --file /path/to/dump.csv --db data/leads.db

# Then refresh indexes
npm run leads:index -- --db data/leads.db
```

- Streams the file; never loads the whole CSV into memory.
- Commits every 2,500 rows (`--chunk`).
- Lowercases and deduplicates emails against the indexed `email` column.
- Preserves unmapped columns in `raw_data` JSON.
- Safe to stop and re-run; duplicates are skipped.

## Headless crawler fallback

The crawler first uses a fast static fetch + Cheerio. When the HTML is an empty
client-rendered shell, it re-renders the page with `puppeteer-core`.

On an Ubuntu VM, install a headless browser once:

```bash
bash scripts/setup-oracle-browser.sh
```

The crawler auto-detects `/usr/bin/google-chrome`, `/usr/bin/chromium`, and
`/snap/bin/chromium`. You can also set:

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

Then restart the web process:

```bash
pm2 restart chadgtm-web --update-env
```

If no browser is available, the crawler still returns the static content and
logs a warning; analysis never hard-fails because of the fallback.

## Verification

```bash
# Types, tests, production build
npm run typecheck
npm test
npm run build --workspace=@smartreach/web
```

Live directory query check (after the FTS build):

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/leads.db');console.log(db.prepare('SELECT COUNT(*) c FROM leads WHERE id IN (SELECT rowid FROM leads_fts WHERE leads_fts MATCH ?)').get('\"vp\"* AND \"sales\"*'))"
```
