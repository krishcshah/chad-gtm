/**
 * Keeps every running Autopilot campaign supplied with new contacts.
 *
 * Launch loads the first batch of the audience (autopilot-audience.ts). This
 * job runs every few minutes in the web server process and, for each running
 * campaign whose queue of not-yet-contacted leads is low, loads the next
 * batch from the current priority tier. Every batch passes the same gates as
 * launch (work address, country, 90-day cooldown, suppression, not already in
 * the list) and the campaign snapshot rules. When all tiers are exhausted the
 * campaign's audience is closed and it may complete normally.
 *
 * A Postgres advisory lock makes sure only one process runs it at a time.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { ensureCampaignLeadSnapshot } from "./campaign-drafts";
import { directoryLeadContactFields, launchDirectoryAccess, toContactableLeads } from "./gtm-launch";
import {
  applyPriorities,
  audienceGates,
  insertAudienceLeads,
  parseAudienceState,
  pickNextLeads,
  refillTarget,
  waitingNewLeads,
  type DirectoryPage,
} from "./autopilot-audience";

type Db = any;

const LOCK_KEY = 727_001;
const INTERVAL_MS = 5 * 60_000;

export interface TopUpResult {
  checked: number;
  refilled: number;
  added: number;
  closed: number;
  skipped: "locked" | null;
}

/** One pass over every open Autopilot audience. */
export async function topUpAutopilotAudiences(db: Db, opts: { page?: DirectoryPage } = {}): Promise<TopUpResult> {
  const result: TopUpResult = { checked: 0, refilled: 0, added: 0, closed: 0, skipped: null };
  const lock = await db.execute(sql`select pg_try_advisory_lock(${LOCK_KEY}) as ok`);
  const ok = Boolean((lock?.rows ?? lock)?.[0]?.ok);
  if (!ok) return { ...result, skipped: "locked" };
  try {
    const campaigns: Array<{
      campaignId: string;
      listId: string | null;
      userId: string;
      workspaceId: string | null;
      dailyLimit: number;
      runId: string;
      audience: unknown;
    }> = await db
      .select({
        campaignId: schema.campaigns.id,
        listId: schema.campaigns.leadListId,
        userId: schema.campaigns.userId,
        workspaceId: schema.campaigns.workspaceId,
        dailyLimit: schema.campaigns.dailyLimit,
        runId: schema.chadGtmRuns.id,
        audience: schema.chadGtmRuns.audience,
      })
      .from(schema.campaigns)
      .innerJoin(schema.chadGtmRuns, eq(schema.chadGtmRuns.campaignId, schema.campaigns.id))
      .where(
        and(
          eq(schema.campaigns.audienceOpen, true),
          inArray(schema.campaigns.status, ["running", "scheduled"]),
          isNull(schema.campaigns.deletedAt),
        ),
      );

    for (const c of campaigns) {
      result.checked++;
      try {
        const state = parseAudienceState(c.audience);
        if (!state || !c.listId) {
          await closeAudience(db, c.campaignId);
          result.closed++;
          continue;
        }
        const target = refillTarget(c.dailyLimit);
        if ((await waitingNewLeads(db, c.campaignId)) >= target.low) continue;

        const access = await launchDirectoryAccess(db, c.userId);
        const gates = audienceGates(db, { userId: c.userId, listId: c.listId, contactable: toContactableLeads });
        const { picked, state: next } = await pickNextLeads(state, target.batch, gates, opts.page);
        if (picked.length) {
          const tiers = await insertAudienceLeads(db, {
            picked,
            userId: c.userId,
            workspaceId: c.workspaceId,
            listId: c.listId,
            contactFields: (dl) => directoryLeadContactFields(dl, access),
          });
          // Same snapshot rules as launch (status new, cooldown, not queued elsewhere).
          await ensureCampaignLeadSnapshot(db, c.campaignId, c.listId, { onlyMissing: true });
          await applyPriorities(db, c.campaignId, tiers);
          result.refilled++;
          result.added += picked.length;
        }
        await db
          .update(schema.chadGtmRuns)
          .set({ audience: next, updatedAt: new Date().toISOString() })
          .where(eq(schema.chadGtmRuns.id, c.runId));
        if (next.exhausted) {
          await closeAudience(db, c.campaignId);
          result.closed++;
        }
      } catch (err) {
        console.error("[autopilot-topup] campaign", c.campaignId, err);
      }
    }
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${LOCK_KEY})`);
  }
  return result;
}

async function closeAudience(db: Db, campaignId: string) {
  await db
    .update(schema.campaigns)
    .set({ audienceOpen: false, updatedAt: new Date().toISOString() })
    .where(eq(schema.campaigns.id, campaignId));
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
      const r = await topUpAutopilotAudiences(getDb());
      if (r.added || r.closed) console.log("[autopilot-topup]", JSON.stringify(r));
    } catch (err) {
      console.error("[autopilot-topup] tick failed", err);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60_000);
  g.__autogtmTopUp = setInterval(tick, intervalMs);
}
