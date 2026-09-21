/**
 * Dry-run vs live queue isolation.
 *
 * Live workers (ENGINE_DRY_RUN unset/0/false) only claim/process live jobs.
 * Dry-run workers (ENGINE_DRY_RUN=1/true) only claim/process dry-run jobs.
 */

export function isEngineDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = String(env.ENGINE_DRY_RUN ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true";
}

/** Whether a job stamped with `jobDryRun` belongs to this worker's queue. */
export function workerOwnsJob(
  jobDryRun: boolean,
  workerDryRun: boolean = isEngineDryRun(),
): boolean {
  return Boolean(jobDryRun) === Boolean(workerDryRun);
}
