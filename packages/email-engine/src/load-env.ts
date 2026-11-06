/**
 * Load the engine's .env files. Imported (and called) by run.ts before any
 * module that reads configuration is loaded.
 *
 * Order: engine package .env, then apps/web/.env.local (so BETTER_AUTH_SECRET
 * and ENCRYPTION_KEY match the web app), then the repo root .env. dotenv never
 * overrides a variable that is already set, so the process env (PM2) wins.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadEngineEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Package root whether we run from src/ (tsx) or dist/
  const pkgRoot = path.resolve(here, "..");
  const repoRoot = path.resolve(pkgRoot, "..", "..");
  config({ path: path.join(pkgRoot, ".env") });
  config({ path: path.join(repoRoot, "apps", "web", ".env.local") });
  config({ path: path.join(repoRoot, ".env") });
}
