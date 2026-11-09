/**
 * Keeps every running Autopilot campaign supplied with new contacts.
 *
 * Launch loads the first batch of the audience (autopilot-audience.ts). This
 * job runs every few minutes in the web server process (directory queries run
 * in a worker thread) and, for each Autopilot campaign:
 *
 *  1. Notices a changed directory (compareDirectoryFingerprints: a content
 *     marker, so erasures and copies of the same file change nothing). A new
 *     build starts every cursor again from the first row and counts totals
 *     again; rows only appended keep the cursors. The audience of a running,
 *     scheduled or paused campaign reopens (a paused one stays paused). A
 *     campaign the engine completed only because its audience ran out is
 *     searched first, and runs again only when new people were actually
 *     found (they are added in the same pass); one the user archived or
 *     deleted is never touched.
 *  2. Refills a running campaign whose queue of not-yet-contacted leads is
 *     low with the next batch, strictly in priority order. Every batch passes
 *     the same gates as launch (work address, country, 90-day cooldown,
 *     suppression, not already in the list) and the campaign snapshot rules.
 *     When every tier is used up the audience is closed (closedReason
 *     "exhausted") and the campaign may complete normally.
 *  3. Counts tier totals that are pending or stale: never-counted first, then
 *     the oldest attempt; failures back off. The pass starts counts only in
 *     its first 2 minutes and stops counting after 5 (a COUNT is given only
 *     the time left); COUNTs that finished are kept and the next pass
 *     continues from them. Rows added to the directory only make totals stale
 *     for audiences that some new row can belong to.
 *
 * Every audience save is compare-and-set on the fingerprint read at the start
 * of the pass, so a rescan requested meanwhile
 * (scripts/reopen-autopilot-audiences.ts) is never overwritten.
 *
 * A Postgres advisory lock makes sure only one process runs it at a time.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { ensureCampaignLeadSnapshot } from "./campaign-drafts";
import { directoryLeadContactFields, launchDirectoryAccess, toContactableLeads } from "./gtm-launch";
import { directoryFileReplaced, directoryFingerprint } from "./leads-directory";
import { directoryQuery } from "./directory-worker";
import {
  applyPriorities,
  audienceGates,
  compareDirectoryFingerprints,
  countAudience,
  CountTimeUsedError,
  fingerprintHighId,
  newRowsQuery,
  withCountProgress,
  countDue,
  countOrder,
  directoryCountOn,
  directoryPageOn,
  insertAudienceLeads,
  parseAudienceState,
  pickNextLeads,
  refillTarget,
  reopenForNewRows,
  resetForNewDirectory,
  waitingNewLeads,
  withCountFailure,
  withoutClosedReason,
  withTotals,
  type AudienceState,
  type DirectoryCount,
  type DirectoryPage,
  type PickedLead,
} from "./autopilot-audience";

type Db = any;

const LOCK_KEY = 727_001;
const INTERVAL_MS = 5 * 60_000;
/** Full counts can take seconds each on a large directory: a few per pass. */
const MAX_COUNTS_PER_PASS = 3;
/** No new audience count starts after this long in one pass (the lock and the next tick wait on it). */
const COUNT_BUDGET_MS = 2 * 60_000;
/** One count may take this long before the worker stops it (it is retried later, with backoff). */
const COUNT_TIMEOUT_MS = 5 * 60_000;
/** All counting in one pass ends by this long after it started: a COUNT gets only the time left. */
const COUNT_PASS_MAX_MS = 5 * 60_000;

export interface TopUpResult {
  checked: number;
  refilled: number;
  added: number;
  closed: number;
  /** Audiences walked again from the start because the directory changed. */
  rescanned: number;
  /** Audiences reopened for rows added to the same directory (cursors kept). */
  grown: number;
  /** Audiences (and completed campaigns) opened again. */
  reopened: number;
  /** Completed campaigns searched again after a directory change (run again only if someone new was found). */
  rechecked: number;
  /** Audiences whose tier totals were counted. */
  counted: number;
  skipped: "locked" | null;
}

export interface TopUpOptions {
  page?: DirectoryPage;
  count?: DirectoryCount;
  /** Current directory fingerprint, or null when it can't be read (no rescans then). */
  fingerprint?: () => string | null;
  now?: () => Date;
  maxCounts?: number;
  /** Time budget for starting counts in one pass (ms). */
  countBudgetMs?: number;
  /** All counting in one pass ends after this (ms); a COUNT is given only the time left. */
  countPassMaxMs?: number;
  /**
   * Whether any row added after `afterId` can be in this audience (industries
   * and countries). Default: an indexed LIMIT 1 query on the background lane;
   * true when it can't be checked.
   */
  newRowsMatch?: (state: AudienceState, afterId: number) => Promise<boolean>;
}

interface CampaignRow {
  campaignId: string;
  listId: string | null;
  userId: string;
  workspaceId: string | null;
  dailyLimit: number;
  status: string;
  audienceOpen: boolean;
  runId: string;
  audience: unknown;
}

/** The directory in use now; null when unreadable or swapped under the running app. */
export function currentDirectoryFingerprint(): string | null {
  try {
    if (directoryFileReplaced()) return null;
    return directoryFingerprint();
  } catch (err) {
    console.warn("[autopilot-topup] directory fingerprint unavailable", err);
    return null;
  }
}

async function defaultNewRowsMatch(state: AudienceState, afterId: number): Promise<boolean> {
  const q = newRowsQuery(state, afterId);
  if (!q) return true;
  try {
    const row = await directoryQuery<{ hit?: number } | null>(q.sql, q.bindings, "get", "background", { timeoutMs: 60_000 });
    return Boolean(row);
  } catch (err) {
    console.warn("[autopilot-topup] could not check the new rows; recounting", err);
    return true;
  }
}

/**
 * True when a completed campaign finished only because its audience ran out
 * (the engine completes a campaign once its audience is closed and nothing
 * is queued). Older states have no closedReason; their exhausted flag says it
 * (version 1 states carry it into closedReason when read).
 */
function completedByExhaustion(raw: unknown, state: AudienceState): boolean {
  if (state.closedReason === "exhausted") return true;
  return !state.closedReason && (raw as { exhausted?: unknown } | null)?.exhausted === true;
}

/** One pass over every Autopilot audience. */
export async function topUpAutopilotAudiences(db: Db, opts: TopUpOptions = {}): Promise<TopUpResult> {
  const result: TopUpResult = {
    checked: 0,
    refilled: 0,
    added: 0,
    closed: 0,
    rescanned: 0,
    grown: 0,
    reopened: 0,
    rechecked: 0,
    counted: 0,
    skipped: null,
  };
  const now = opts.now ?? (() => new Date());
  const page = opts.page ?? directoryPageOn("background");
  const count = opts.count ?? directoryCountOn("background", { timeoutMs: COUNT_TIMEOUT_MS });
  const newRowsMatch = opts.newRowsMatch ?? defaultNewRowsMatch;
  // One check per distinct audience targeting and old high id in a pass.
  const newRowsChecked = new Map<string, Promise<boolean>>();
  const lock = await db.execute(sql`select pg_try_advisory_lock(${LOCK_KEY}) as ok`);
  const ok = Boolean((lock?.rows ?? lock)?.[0]?.ok);
  if (!ok) return { ...result, skipped: "locked" };
  try {
    const fingerprint = (opts.fingerprint ?? currentDirectoryFingerprint)();
    const campaigns: CampaignRow[] = await db
      .select({
        campaignId: schema.campaigns.id,
        listId: schema.campaigns.leadListId,
        userId: schema.campaigns.userId,
        workspaceId: schema.campaigns.workspaceId,
        dailyLimit: schema.campaigns.dailyLimit,
        status: schema.campaigns.status,
        audienceOpen: schema.campaigns.audienceOpen,
        runId: schema.chadGtmRuns.id,
        audience: schema.chadGtmRuns.audience,
      })
      .from(schema.campaigns)
      .innerJoin(schema.chadGtmRuns, eq(schema.chadGtmRuns.campaignId, schema.campaigns.id))
      .where(
        and(
          inArray(schema.campaigns.status, ["running", "scheduled", "paused", "completed"]),
          isNull(schema.campaigns.deletedAt),
        ),
      );

    const toCount: Array<{ runId: string; state: AudienceState }> = [];
    for (const c of campaigns) {
      try {
        const live = c.status === "running" || c.status === "scheduled";
        // What every save of this pass compares against (a rescan requested meanwhile wins).
        const readFingerprint = storedFingerprint(c.audience);
        let state = parseAudienceState(c.audience);
        if (!state) {
          // Not an audience this job can read: close it instead of retrying forever.
          if (c.audienceOpen) {
            await closeAudience(db, c.campaignId);
            result.closed++;
          }
          continue;
        }
        // Version 1 states are rewritten as version 2.
        let dirty = (c.audience as { version?: unknown }).version !== state.version;
        const finishedByExhaustion = c.status === "completed" && completedByExhaustion(c.audience, state);

        // 1. Rows added to the same directory: carry on from the cursors. A new
        // directory (or a rescan requested by scripts/reopen-autopilot-audiences.ts):
        // walk it from the start. The same content (a copy, an erasure): nothing to do.
        if (fingerprint && state.fingerprint && state.fingerprint !== fingerprint) {
          const change = compareDirectoryFingerprints(state.fingerprint, fingerprint);
          if (change === "new") {
            state = resetForNewDirectory(state, fingerprint, now());
            result.rescanned++;
          } else if (change === "grown") {
            let matches = true;
            const oldHigh = fingerprintHighId(state.fingerprint);
            if (state.countedAt !== null && oldHigh !== null) {
              const key = JSON.stringify([state.industries, state.countries, oldHigh]);
              let check = newRowsChecked.get(key);
              if (!check) {
                check = newRowsMatch(state, oldHigh).catch(() => true);
                newRowsChecked.set(key, check);
              }
              matches = await check;
            }
            state = reopenForNewRows(state, fingerprint, now(), { matches });
            result.grown++;
          } else {
            state = { ...state, fingerprint };
          }
          dirty = true;
        } else if (fingerprint && !state.fingerprint) {
          state = { ...state, fingerprint };
          dirty = true;
        }

        let open = c.audienceOpen;
        if (!state.exhausted && !open && (live || c.status === "paused")) {
          // More contacts to find (new directory, or company size no longer
          // filters an older audience). A paused campaign stays paused.
          if (await reopenAudience(db, c.campaignId)) {
            open = true;
            state = withoutClosedReason(state);
            dirty = true;
            result.reopened++;
          }
        }

        const target = refillTarget(c.dailyLimit);
        const gatesFor = (listId: string) =>
          audienceGates(db, { userId: c.userId, listId, contactable: toContactableLeads });
        const addPicked = async (listId: string, picked: PickedLead[]) => {
          const access = await launchDirectoryAccess(db, c.userId);
          const tiers = await insertAudienceLeads(db, {
            picked,
            userId: c.userId,
            workspaceId: c.workspaceId,
            listId,
            contactFields: (dl) => directoryLeadContactFields(dl, access),
          });
          // Same snapshot rules as launch (status new, cooldown, not queued elsewhere).
          await ensureCampaignLeadSnapshot(db, c.campaignId, listId, { onlyMissing: true });
          await applyPriorities(db, c.campaignId, tiers);
          result.refilled++;
          result.added += picked.length;
        };

        // 2a. A campaign completed because its audience ran out, with rows to
        // search again: look first, and run it again only for someone new.
        if (finishedByExhaustion && !state.exhausted && c.listId) {
          result.rechecked++;
          const { picked, state: next } = await pickNextLeads(state, target.batch, gatesFor(c.listId), page);
          state = next;
          dirty = true;
          if (picked.length > 0) {
            await addPicked(c.listId, picked);
            if (await reopenCompletedCampaign(db, c.campaignId, c.runId)) {
              state = withoutClosedReason(state);
              open = true;
              result.reopened++;
            }
          } else if (state.exhausted) {
            // Nobody new: it stays completed, closed for the same reason.
            state = { ...state, closedReason: "exhausted", closedAt: state.closedAt ?? now().toISOString() };
          }
          // Otherwise the search continues from the saved cursors next pass.
        }

        // 2b. Refill a running campaign whose queue is low.
        if (live && open) {
          if (!c.listId) {
            await closeAudience(db, c.campaignId);
            result.closed++;
            continue;
          }
          result.checked++;
          if ((await waitingNewLeads(db, c.campaignId)) < target.low) {
            const { picked, state: next } = await pickNextLeads(state, target.batch, gatesFor(c.listId), page);
            if (picked.length) await addPicked(c.listId, picked);
            state = next;
            dirty = true;
          }
          if (state.exhausted) {
            state = { ...state, closedReason: "exhausted", closedAt: now().toISOString() };
            dirty = true;
            await closeAudience(db, c.campaignId);
            result.closed++;
          }
        }

        let saved = true;
        if (dirty) saved = await saveAudience(db, c.runId, state, readFingerprint);
        if (!saved) {
          console.warn("[autopilot-topup] audience changed during the pass (rescan requested?); left for the next pass", c.runId);
          continue;
        }
        if (c.status !== "completed" && countDue(state, now())) toCount.push({ runId: c.runId, state });
      } catch (err) {
        console.error("[autopilot-topup] campaign", c.campaignId, err);
      }
    }

    // 3. Pending and stale tier totals: oldest attempt first, a few per pass.
    // New counts start only within the budget, and all counting ends by the
    // pass maximum (each COUNT is given only the time left; finished COUNTs
    // are kept for the next pass).
    const started = Date.now();
    const budget = opts.countBudgetMs ?? COUNT_BUDGET_MS;
    const deadline = started + Math.max(budget, opts.countPassMaxMs ?? COUNT_PASS_MAX_MS);
    const queue = toCount.sort((a, b) => countOrder(a.state, b.state)).slice(0, opts.maxCounts ?? MAX_COUNTS_PER_PASS);
    for (const { runId, state } of queue) {
      if (Date.now() - started >= budget) break;
      const expect = state.fingerprint ?? null;
      try {
        const totals = await countAudience(state, count, {
          deadline,
          countTimeoutMs: COUNT_TIMEOUT_MS,
          progress: state.countProgress,
        });
        if (await saveAudience(db, runId, withTotals(state, totals, now()), expect)) result.counted++;
      } catch (err) {
        if (err instanceof CountTimeUsedError) {
          // Out of counting time for this pass: keep what was counted, no backoff.
          try {
            await saveAudience(db, runId, withCountProgress(state, err.progress), expect);
          } catch {}
          break;
        }
        console.warn("[autopilot-topup] count failed; will retry later", runId, err);
        try {
          await saveAudience(db, runId, withCountFailure(state, now()), expect);
        } catch {}
      }
    }
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${LOCK_KEY})`);
  }
  return result;
}

function storedFingerprint(raw: unknown): string | null {
  const f = (raw as { fingerprint?: unknown } | null)?.fingerprint;
  return typeof f === "string" ? f : null;
}

/**
 * Save the audience only if its stored fingerprint is still the one this pass
 * read (`expect`; null = none stored). A rescan marked meanwhile by
 * scripts/reopen-autopilot-audiences.ts changes it, and wins. True when saved.
 */
async function saveAudience(db: Db, runId: string, audience: AudienceState, expect: string | null): Promise<boolean> {
  const rows: Array<{ id: string }> = await db
    .update(schema.chadGtmRuns)
    .set({ audience, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.chadGtmRuns.id, runId),
        sql`coalesce(${schema.chadGtmRuns.audience}->>'fingerprint', '') = ${expect ?? ""}`,
      ),
    )
    .returning({ id: schema.chadGtmRuns.id });
  return rows.length > 0;
}

async function closeAudience(db: Db, campaignId: string) {
  await db
    .update(schema.campaigns)
    .set({ audienceOpen: false, updatedAt: new Date().toISOString() })
    .where(eq(schema.campaigns.id, campaignId));
}

/**
 * Opens the audience of a campaign that can still send. Guarded on status, so
 * a campaign the engine completed (or the user archived) meanwhile is left
 * alone. True when a row was updated.
 */
async function reopenAudience(db: Db, campaignId: string): Promise<boolean> {
  const rows: Array<{ id: string }> = await db
    .update(schema.campaigns)
    .set({ audienceOpen: true, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.campaigns.id, campaignId),
        inArray(schema.campaigns.status, ["running", "scheduled", "paused"]),
        isNull(schema.campaigns.deletedAt),
      ),
    )
    .returning({ id: schema.campaigns.id });
  return rows.length > 0;
}

/**
 * A campaign the engine completed because its audience ran out runs again.
 * Guarded on status, so one the user archived or deleted meanwhile stays.
 * True when the campaign was switched back to running.
 */
async function reopenCompletedCampaign(db: Db, campaignId: string, runId: string): Promise<boolean> {
  const at = new Date().toISOString();
  const rows: Array<{ id: string }> = await db
    .update(schema.campaigns)
    .set({ status: "running", audienceOpen: true, completedAt: null, updatedAt: at })
    .where(
      and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.status, "completed"), isNull(schema.campaigns.deletedAt)),
    )
    .returning({ id: schema.campaigns.id });
  if (rows.length === 0) return false;
  // The run mirrors the campaign (display only).
  await db
    .update(schema.chadGtmRuns)
    .set({ status: "active", updatedAt: at })
    .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.status, "completed")));
  return true;
}

/**
 * Starts the background loop once per server process. Called from the root
 * layout and the health route (cheap after the first call); never during a
 * build, in tests, or when AUTOPILOT_TOPUP=off.
 */
export function startAudienceTopUp(intervalMs = INTERVAL_MS) {
  const g = globalThis as { __autogtmTopUp?: ReturnType<typeof setInterval> };
  if (g.__autogtmTopUp) return;
  if (process.env.AUTOPILOT_TOPUP === "off" || process.env.VITEST || process.env.NEXT_PHASE === "phase-production-build") return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await import("./autopilot-advance").then((m) => m.retryApprovalLaunches()).catch((err) => console.error("[approval-retry] failed", err));
      const r = await topUpAutopilotAudiences(getDb());
      if (r.added || r.closed || r.reopened || r.rescanned || r.grown || r.rechecked || r.counted) {
        console.log("[autopilot-topup]", JSON.stringify(r));
      }
    } catch (err) {
      console.error("[autopilot-topup] tick failed", err);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60_000);
  g.__autogtmTopUp = setInterval(tick, intervalMs);
}
