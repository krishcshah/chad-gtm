/**
 * Directory reads that run in the directory worker thread (directory-worker.ts),
 * so a count over millions of rows never freezes the web server. Same SQL,
 * cache and masking as the synchronous search in leads-directory.ts. Under
 * vitest (or DIRECTORY_WORKER=off) the worker runs the SQL on this thread.
 */
import { directoryQuery, type DirectoryLane } from "./directory-worker";
import {
  DISTINCT_INDUSTRIES_SQL,
  applyDirectoryAccess,
  buildDirectoryWhereClause,
  cachedDirectoryCount,
  clampDirectorySearchParams,
  directorySearchPlan,
  leadMatcherSearchParams,
  LEAD_MATCHER_MAX_PAGE_SIZE,
  mapDirectoryRow,
  mapSearchRow,
  mergeSizedFirst,
  rememberDirectoryCount,
  DIRECTORY_ALIVE_SQL,
  type DirectoryAccessLevel,
  type DirectoryLead,
  type DirectorySearchOptions,
  type DirectorySearchParams,
  type DirectorySearchResult,
  type LeadMatcherFilters,
  type PreviewSearch,
} from "./leads-directory";

/**
 * COUNTs being run right now, by count key: two callers that need the same
 * total (the lead matcher's counts and its first page) share one query.
 */
const inflightCounts = new Map<string, Promise<number>>();

function directoryCountShared(countKey: string, countSql: string, bindings: unknown[], lane: DirectoryLane): Promise<number> {
  const cached = cachedDirectoryCount(countKey);
  if (cached !== null) return Promise.resolve(cached);
  let pending = inflightCounts.get(countKey);
  if (!pending) {
    // Preview counts get their own thread: launch pages and preview rows never wait behind them.
    const countLane: DirectoryLane = lane === "interactive" ? "counts" : lane;
    pending = directoryQuery<{ total: number } | null>(countSql, bindings, "get", countLane)
      .then((row) => {
        const total = Number(row?.total || 0);
        rememberDirectoryCount(countKey, total);
        return total;
      })
      .finally(() => inflightCounts.delete(countKey));
    inflightCounts.set(countKey, pending);
  }
  return pending;
}

/**
 * searchLeadsDirectory, off the main thread. count: false skips the COUNT.
 * A failed COUNT gives total 0 with countUnavailable (never a real zero); a
 * failed page gives no rows.
 */
export async function searchLeadsDirectoryAsync(
  params: DirectorySearchParams,
  lane: DirectoryLane = "interactive",
  opts: DirectorySearchOptions = {},
): Promise<DirectorySearchResult> {
  try {
    const { page, pageSize, offset, bindings, countKey, countSql, dataSql } = directorySearchPlan(params, { alive: true });
    const cached = cachedDirectoryCount(countKey);
    const needCount = cached === null && opts.count !== false;
    const [countResult, rows] = await Promise.all([
      needCount
        ? directoryCountShared(countKey, countSql, bindings, lane).then(
            (n) => ({ ok: true as const, n }),
            (err) => {
              console.error("[leads-directory] Count error:", err);
              return { ok: false as const, n: 0 };
            },
          )
        : Promise.resolve({ ok: true as const, n: cached ?? 0 }),
      directoryQuery<any[]>(dataSql, [...bindings, pageSize, offset], "all", lane),
    ]);
    const total = countResult.n;
    return {
      leads: (rows ?? []).map(mapSearchRow),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      ...(countResult.ok ? {} : { countUnavailable: true }),
    };
  } catch (err) {
    console.error("[leads-directory] Search error:", err);
    return {
      leads: [],
      total: 0,
      page: 1,
      pageSize: params.pageSize || 10,
      totalPages: 0,
      ...(opts.count !== false ? { countUnavailable: true } : {}),
    };
  }
}

/** searchLeadsDirectoryForAccess, off the main thread. */
export async function searchLeadsDirectoryForAccessAsync(
  params: DirectorySearchParams,
  level: DirectoryAccessLevel,
  opts: DirectorySearchOptions = {},
): Promise<DirectorySearchResult> {
  return applyDirectoryAccess(
    await searchLeadsDirectoryAsync(clampDirectorySearchParams(params, level), "interactive", opts),
    level,
  );
}

/**
 * searchLeadMatcherPreview, off the main thread: people at the run's sizes
 * first on page 1 (rows only for them: the total is everyone's).
 */
export async function searchLeadMatcherPreviewAsync(
  industries: string[],
  countries: string[],
  page = 1,
  pageSize = LEAD_MATCHER_MAX_PAGE_SIZE,
  filters: LeadMatcherFilters = {},
  search: PreviewSearch<Promise<DirectorySearchResult>> = (p, o) => searchLeadsDirectoryForAccessAsync(p, "none", o),
): Promise<DirectorySearchResult> {
  const params = leadMatcherSearchParams(industries, countries, page, pageSize, filters);
  const sizes = filters.teamSizes ?? [];
  if (sizes.length === 0 || (params.page ?? 1) > 1) return search(params, {});
  const [everyone, sized] = await Promise.all([search(params, {}), search({ ...params, teamSizes: sizes }, { count: false })]);
  return mergeSizedFirst(everyone, sized);
}

/**
 * getMatchingDirectoryLeadsForExport in the worker (id order, offset):
 * the plan sample lead and the guided-setup leads. An error gives [].
 */
export async function matchingDirectoryLeadsAsync(
  params: DirectorySearchParams,
  maxRows: number,
  offset: number,
): Promise<DirectoryLead[]> {
  try {
    const { whereSql, bindings } = buildDirectoryWhereClause(params);
    const alive = `(id % 64 <> 0 OR ${DIRECTORY_ALIVE_SQL})`;
    const where = whereSql ? `${whereSql} AND ${alive}` : `WHERE ${alive}`;
    const rows = await directoryQuery<any[]>(
      `SELECT * FROM leads ${where} ORDER BY id ASC LIMIT ? OFFSET ?`,
      [...bindings, Math.max(0, Math.floor(maxRows)), Math.max(0, Math.floor(offset))],
      "all",
      "interactive",
    );
    return (rows ?? []).map(mapDirectoryRow);
  } catch (err) {
    console.error("[leads-directory] Matching leads error:", err);
    return [];
  }
}

const INDUSTRY_LIST_TTL_MS = 30 * 60_000;
let industryList: { values: string[]; at: number } | null = null;

/**
 * Every distinct industry in the directory (a skip scan of the industry
 * index, in the worker), cached for 30 minutes. null when it can't be read.
 */
export async function directoryIndustriesAsync(
  query: (sql: string) => Promise<Array<{ industry?: unknown }>> = (sql) =>
    directoryQuery<Array<{ industry?: unknown }>>(sql, [], "all", "interactive"),
  now = Date.now(),
): Promise<string[] | null> {
  if (industryList && now - industryList.at < INDUSTRY_LIST_TTL_MS) return industryList.values;
  try {
    const rows = await query(DISTINCT_INDUSTRIES_SQL);
    const values = (rows ?? []).map((r) => String(r.industry ?? "")).filter((v) => v.trim() !== "");
    industryList = { values, at: now };
    return values;
  } catch (err) {
    console.warn("[leads-directory] Industry list unavailable:", err);
    return null;
  }
}

/** Test hook: forget the cached industry list. */
export function resetDirectoryIndustriesCache(): void {
  industryList = null;
}
