/**
 * Ask every Autopilot audience to walk the B2B directory again from the
 * first row (for example after swapping in a new directory whose
 * fingerprint did not change). Dry run by default.
 *
 *   DATABASE_URL=... npx tsx scripts/reopen-autopilot-audiences.ts            # dry run: what would change
 *   DATABASE_URL=... npx tsx scripts/reopen-autopilot-audiences.ts --apply    # request the rescan
 *   ... --campaign <campaign id>     only this campaign
 *   ... --skip-completed             leave completed campaigns completed
 *
 * The script only marks each audience (chad_gtm_runs.audience.fingerprint =
 * "rescan-requested:<time>"). The web app's audience top-up (every 5
 * minutes) then sees a directory it has not walked and, under its advisory
 * lock: resets every cursor, counts totals again, reopens the audience of
 * running/scheduled/paused campaigns (a paused one stays paused), and
 * searches again a campaign the engine completed only because its audience
 * ran out: it runs again only if someone new is found.
 * Archived and deleted campaigns are never touched. Nobody is emailed twice:
 * everyone already in a campaign stays out, and the 90-day cooldown applies.
 *
 * DATABASE_URL comes from the environment only and is never printed.
 */
import pg from "pg";

const USAGE =
  "Usage: npx tsx scripts/reopen-autopilot-audiences.ts [--apply] [--campaign <id>] [--skip-completed]";

interface Args {
  apply: boolean;
  campaignId: string | null;
  skipCompleted: boolean;
}

function parseArgs(argv: string[]): { ok: true; args: Args } | { ok: false; error: string } {
  const args: Args = { apply: false, campaignId: null, skipCompleted: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--dry-run") args.apply = false;
    else if (a === "--skip-completed") args.skipCompleted = true;
    else if (a === "--campaign") {
      const id = (argv[++i] ?? "").trim();
      if (!id) return { ok: false, error: "--campaign needs a campaign id." };
      args.campaignId = id;
    } else return { ok: false, error: `Unknown option: ${a}` };
  }
  return { ok: true, args };
}

/** Autopilot audiences of campaigns that are not archived or deleted. */
const FIND_SQL = `
  SELECT r.id AS run_id, c.id AS campaign_id, c.status, c.audience_open,
         r.audience->>'version' AS version,
         r.audience->>'exhausted' AS exhausted,
         r.audience->>'closedReason' AS closed_reason
    FROM chad_gtm_runs r
    JOIN campaigns c ON c.id = r.campaign_id
   WHERE c.deleted_at IS NULL
     AND c.status = ANY($1::text[])
     AND jsonb_typeof(r.audience) = 'object'
     AND r.audience ? 'tiers'
     AND ($2::text IS NULL OR c.id = $2::text)`;

const MARK_SQL = `
  UPDATE chad_gtm_runs
     SET audience = jsonb_set(audience, '{fingerprint}', to_jsonb($1::text)),
         updated_at = $2
   WHERE id = ANY($3::text[])`;

interface Row {
  run_id: string;
  campaign_id: string;
  status: string;
  audience_open: boolean;
  version: string | null;
  exhausted: string | null;
  closed_reason: string | null;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`[reopen-audiences] ${parsed.error}\n${USAGE}`);
    return 2;
  }
  const { args } = parsed;
  const url = (process.env.DATABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");
  if (!url) {
    console.error("[reopen-audiences] Refusing to run: set DATABASE_URL in the environment.");
    return 1;
  }
  const statuses = args.skipCompleted ? ["running", "scheduled", "paused"] : ["running", "scheduled", "paused", "completed"];
  const pool = new pg.Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<Row>(FIND_SQL, [statuses, args.campaignId]);
    const byStatus = new Map<string, number>();
    for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    // Completed campaigns are searched again only if the engine completed them because the
    // audience ran out (version 1 audiences: their exhausted flag), and run again only for someone new.
    const rerun = rows.filter((r) => r.status === "completed" && (r.closed_reason === "exhausted" || (!r.closed_reason && r.exhausted === "true")));
    console.log(`[reopen-audiences] ${rows.length} Autopilot audience(s) found.`);
    for (const [status, n] of byStatus) console.log(`  ${status}: ${n}`);
    console.log(`  completed campaigns that would be searched again (run again only if someone new is found): ${rerun.length}`);
    if (rows.length === 0) return 0;
    if (!args.apply) {
      console.log("[reopen-audiences] Dry run: nothing changed. Add --apply to request the rescan.");
      return 0;
    }
    const at = new Date().toISOString();
    const res = await pool.query(MARK_SQL, [`rescan-requested:${at}`, at, rows.map((r) => r.run_id)]);
    console.log(
      `[reopen-audiences] Marked ${res.rowCount ?? 0} audience(s). The web app's top-up applies it within about 5 minutes (it must be running, AUTOPILOT_TOPUP not "off").`,
    );
    return 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // pg errors can echo connection details; print only the class of failure.
    const code = (err as { code?: string })?.code;
    console.error(`[reopen-audiences] Failed${code ? ` (${code})` : ""}. Check DATABASE_URL and that migrations have run.`);
    process.exit(1);
  });
