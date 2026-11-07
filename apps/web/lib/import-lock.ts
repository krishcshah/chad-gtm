/**
 * Cross-tab lock for browser-run lead imports. Every open AutoGTM tab loads
 * the active import from IndexedDB and would resume it; the Web Locks API
 * lets only one tab process a given job, so chunks are not sent twice and the
 * counts stay right.
 */

export type ImportLockResult = "ran" | "busy";

/** The subset of the Web Locks API used here (navigator.locks). */
export interface ImportLockManager {
  request<T>(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown | null) => Promise<T> | T,
  ): Promise<T>;
}

export function importLockName(jobId: string): string {
  return `autogtm-import:${jobId}`;
}

function browserLocks(): ImportLockManager | undefined {
  if (typeof navigator === "undefined") return undefined;
  const locks = (navigator as Navigator & { locks?: ImportLockManager }).locks;
  return locks && typeof locks.request === "function" ? locks : undefined;
}

/**
 * Run `fn` while holding this job's lock. Returns 'busy' without running it
 * when another tab holds the lock. Without the Web Locks API it just runs
 * `fn` (imports are idempotent apart from the counts).
 */
export async function runWithImportLock(
  jobId: string,
  fn: () => Promise<void>,
  locks: ImportLockManager | undefined = browserLocks(),
): Promise<ImportLockResult> {
  if (!locks) {
    await fn();
    return "ran";
  }
  return locks.request(importLockName(jobId), { ifAvailable: true }, async (lock) => {
    if (!lock) return "busy" as const;
    await fn();
    return "ran" as const;
  });
}
