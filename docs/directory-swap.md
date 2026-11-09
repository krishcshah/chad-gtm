# Swapping the B2B directory (`data/leads.db`)

How to replace the lead directory (for example with the 100M-row build)
without breaking running Autopilot campaigns or emailing anyone twice.

## What the app does with a new directory

Every Autopilot audience stores a **fingerprint** of the directory's content:
`highId|user_version|directory_version`. `highId` is the highest row id ever
used (`sqlite_sequence` for the `leads` table, which deleting rows never
lowers; erasures also keep a `directory_meta.id_high_water` mark), then
`PRAGMA user_version` and `directory_meta.directory_version`. Each is an
instant lookup at any size. The file itself (device and inode) is not part of
it: copying, restoring or moving the same file changes nothing, and erasing
people (data removal) changes nothing.

The audience top-up runs inside the web app every 5 minutes and compares the
fingerprint with the one each audience stored:

- **Same** (also a copy of the same file): nothing happens.
- **Grown** (same version, higher `highId`: rows added, for example an import
  through the app): every tier keeps its place and only looks past it. The
  totals stay on show and are recounted when the top-up has time.
- **New** (a different `directory_version` or `user_version`, a lower
  `highId`, or a requested rescan): every tier starts again from the first row
  (old row ids mean nothing in a new file) and the totals are counted again.

Then:

- the audience of running, scheduled and paused campaigns reopens (a paused
  campaign stays paused; it picks up new contacts when resumed);
- a campaign the engine **completed only because its audience ran out** is
  searched first, in the background. It runs again only if someone new is
  actually found; those people are added in the same pass. If nobody is
  found it stays completed. Campaigns the user archived or deleted are never
  touched.

Nobody is emailed twice: people already in a campaign are skipped (the
already-in-list check), and anyone contacted in the last 90 days is skipped
across all customers.

## Why the web app must be restarted

The directory is a SQLite file in WAL mode, opened by the web app (main
thread plus two reader threads). Replacing it under a running process is
unsafe: the old `leads.db-wal` / `leads.db-shm` files would be paired with the
new file. So the running app keeps reading the file it opened, logs
"The directory file was replaced while the app was running", and does not
rescan anything until it is restarted. Only the web app opens the directory;
the email engine (`chadgtm-worker`) does not.

## Steps

1. Build and index the new file somewhere else (not over the live one):

   ```bash
   node scripts/ingest-leads.mjs --file /path/to/dump.csv --db /data/leads-new.db
   npm run leads:index -- --db /data/leads-new.db
   ```

2. Check it has its own version. `scripts/ingest-leads.mjs` (and
   `build-leads-db.cjs`) stamp a fresh `directory_meta.directory_version` when
   they create a new file, so a fresh build reads as **new** on its own. A file
   built some other way, or by an older copy of the script, has none: stamp
   one by hand, or a larger new file looks like rows were appended and
   audiences keep their old places in it.

   ```bash
   sqlite3 /data/leads-new.db "SELECT value FROM directory_meta WHERE key='directory_version'"
   # empty? stamp one:
   node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/data/leads-new.db');db.exec(\"INSERT INTO directory_meta(key,value) VALUES('directory_version','$(date -u +%Y%m%d%H%M)') ON CONFLICT(key) DO UPDATE SET value=excluded.value\");db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close()"
   ```

3. Stop the web app so the old file is closed cleanly:

   ```bash
   pm2 stop chadgtm-web
   ```

4. Swap the file. Keep the old one as a backup; remove the old WAL side files
   only now that nothing has the file open:

   ```bash
   mv data/leads.db data/leads-old.db
   rm -f data/leads.db-wal data/leads.db-shm
   mv /data/leads-new.db data/leads.db
   ```

5. Start the web app:

   ```bash
   pm2 start chadgtm-web --update-env
   ```

6. Within about 5 minutes the log shows the top-up rescanning, for example
   `[autopilot-topup] {"rescanned":12,"reopened":3,...}`:

   ```bash
   pm2 logs chadgtm-web --lines 200 | grep autopilot-topup
   ```

## Forcing a rescan

If the swap was done without a new version (or to rescan for any other reason), mark
every audience and let the next top-up pass do the rest. Dry run by default:

```bash
DATABASE_URL=... npx tsx scripts/reopen-autopilot-audiences.ts            # shows what would change
DATABASE_URL=... npx tsx scripts/reopen-autopilot-audiences.ts --apply    # requests the rescan
```

Options: `--campaign <id>` for one campaign, `--skip-completed` to leave
completed campaigns completed (otherwise they are searched again and run
again only if someone new is found).

## Notes

- Tier totals are counted by the top-up in a background thread: never-counted
  audiences first, then the oldest attempt, at most 3 per pass and no new
  count after 2 minutes in a pass. A count that fails or takes over 5 minutes
  is stopped and tried again later, waiting 10 minutes, then 20, and so on up
  to a day. On a very large directory totals can take a while to appear; the
  run page shows them as still counting until then.
- A directory query that times out is really stopped: the audience and
  preview SQL calls `directory_alive()` on every row, which ends the statement
  once the worker is told to stop (Node 22's `node:sqlite` has no interrupt
  call). The background lane never starts a new query while a stopped one is
  still running.
- Each tier is read in id order. For a niche industry the read is driven by
  that industry's full-text entries (only its rows are read); for broad
  audiences without job titles the country index drives. A saved place works
  with either.
- After a big import, `INSERT INTO leads_fts(leads_fts) VALUES('optimize')`
  (on the new file, before the swap) merges the full-text index and keeps job
  title lookups fast.
