#!/usr/bin/env node
/**
 * Deploy preflight: make sure the web app, the worker and the migration step
 * all talk to the same database, and that the web app and the worker share
 * the secrets that must match.
 *
 *   node scripts/check-deploy-env.mjs --app-dir /home/ubuntu/chad-gtm [--expect-db chadgtm] [--pm2-jlist -]
 *
 * Each process resolves its environment differently, and dotenv never
 * overrides a value that is already set, so the first file that defines a key
 * wins:
 *
 *   web (next start, cwd apps/web): process env, apps/web/.env.production.local,
 *        apps/web/.env.local, apps/web/.env.production, apps/web/.env
 *   worker (packages/email-engine/src/load-env.ts): process env,
 *        packages/email-engine/.env, apps/web/.env.local, .env
 *   migrate (apps/web/scripts/migrate.ts) and scripts/backup-db.sh: process env,
 *        apps/web/.env.local, .env, .env.production.local
 *
 * "process env" for a PM2 app is the deploy shell's environment (pm2 reload
 * --update-env pushes it) and, below that, the env PM2 stored when the app was
 * first started. Pass `pm2 jlist` on stdin with --pm2-jlist - to include it.
 *
 * Never prints a value: only key names, file names and database names.
 * Exit 0 = consistent, 1 = refuse to deploy, 2 = usage error.
 */
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";

const WEB_APP = "chadgtm-web";
const WORKER_APP = "chadgtm-worker";
/** Must be identical for web and worker (sessions, unsubscribe HMAC, encrypted secrets, links). */
const SHARED_KEYS = ["BETTER_AUTH_SECRET", "ENCRYPTION_KEY", "APP_URL"];

function readEnvFile(file) {
  try {
    return parseEnv(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw new Error(`cannot read ${file}: ${err.message}`);
  }
}

/** Resolve `key` the way dotenv does: first source that defines it wins. */
function resolveKey(key, sources) {
  for (const s of sources) {
    if (s.vars && Object.prototype.hasOwnProperty.call(s.vars, key)) {
      return { value: s.vars[key], source: s.label };
    }
  }
  return { value: undefined, source: "not set" };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** host/port/database of a Postgres URL, or an error string. Never returns the password. */
export function describeDatabaseUrl(raw) {
  if (raw === undefined || raw === "") return { error: "is not set" };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { error: "is not a valid URL" };
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    return { error: "is not a postgres:// URL" };
  }
  let host = u.searchParams.get("host") || u.hostname || "localhost";
  host = host.toLowerCase();
  if (LOOPBACK.has(host)) host = "loopback";
  const port = u.port || u.searchParams.get("port") || "5432";
  let database = "";
  try {
    database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return { error: "has an invalid database name" };
  }
  // libpq defaults the database name to the user name.
  if (!database) database = decodeURIComponent(u.username || "");
  return { host, port, database };
}

function pm2Env(jlist, name) {
  if (!Array.isArray(jlist)) return null;
  const proc = jlist.find((p) => p && p.name === name);
  if (!proc || !proc.pm2_env) return null;
  const out = {};
  const nested = proc.pm2_env.env && typeof proc.pm2_env.env === "object" ? proc.pm2_env.env : {};
  for (const key of ["DATABASE_URL", ...SHARED_KEYS]) {
    if (typeof nested[key] === "string") out[key] = nested[key];
    else if (typeof proc.pm2_env[key] === "string") out[key] = proc.pm2_env[key];
  }
  return out;
}

/** Parse `pm2 jlist` output, which may have warnings before the JSON array. */
export function parsePm2Jlist(text) {
  if (!text) return [];
  const i = text.search(/\[\s*(\{|\])/);
  try {
    const parsed = JSON.parse(i >= 0 ? text.slice(i) : text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Returns { ok, errors: string[], notes: string[] }. Messages never contain values.
 */
export function checkDeployEnv({ appDir, expectDb = "chadgtm", processEnv = process.env, pm2Jlist = [] }) {
  const errors = [];
  const notes = [];
  const rel = (...p) => path.join(...p);
  const file = (p) => ({ label: p, vars: readEnvFile(path.join(appDir, p)) });

  const shell = { label: "deploy shell environment", vars: processEnv };
  const pm2Source = (name) => ({ label: `pm2 stored env of ${name}`, vars: pm2Env(pm2Jlist, name) });

  const webLocal = rel("apps", "web", ".env.local");
  const engineEnv = rel("packages", "email-engine", ".env");
  if (!fs.existsSync(path.join(appDir, webLocal))) errors.push(`${webLocal} is missing`);
  if (!fs.existsSync(path.join(appDir, engineEnv))) {
    notes.push(`${engineEnv} does not exist; the worker uses ${webLocal}`);
  }

  const views = {
    web: [
      shell,
      pm2Source(WEB_APP),
      file(rel("apps", "web", ".env.production.local")),
      file(webLocal),
      file(rel("apps", "web", ".env.production")),
      file(rel("apps", "web", ".env")),
    ],
    worker: [shell, pm2Source(WORKER_APP), file(engineEnv), file(webLocal), file(".env")],
    migrate: [shell, file(webLocal), file(".env"), file(".env.production.local")],
  };

  // Database: same host, port and database name everywhere, and the expected name.
  const dbs = {};
  for (const [name, sources] of Object.entries(views)) {
    const { value, source } = resolveKey("DATABASE_URL", sources);
    const d = describeDatabaseUrl(value);
    if (d.error) {
      errors.push(`DATABASE_URL for ${name} ${d.error} (from ${source})`);
      continue;
    }
    dbs[name] = { ...d, source };
    if (expectDb && d.database !== expectDb) {
      errors.push(
        `DATABASE_URL for ${name} points at database '${d.database}', expected '${expectDb}' (from ${source})`,
      );
    }
  }
  const names = Object.keys(dbs);
  for (let i = 1; i < names.length; i++) {
    const a = dbs[names[0]];
    const b = dbs[names[i]];
    for (const part of ["host", "port", "database"]) {
      if (a[part] !== b[part]) {
        const shown = part === "database" ? ` ('${a.database}' vs '${b.database}')` : "";
        errors.push(
          `DATABASE_URL ${part} differs between ${names[0]} (from ${a.source}) and ${names[i]} (from ${b.source})${shown}`,
        );
      }
    }
  }

  // Secrets and the public origin must match between web and worker.
  for (const key of SHARED_KEYS) {
    const w = resolveKey(key, views.web);
    const e = resolveKey(key, views.worker);
    if (!w.value) errors.push(`${key} is not set for web (from ${w.source})`);
    if (!e.value) errors.push(`${key} is not set for worker (from ${e.source})`);
    if (w.value && e.value && w.value !== e.value) {
      errors.push(`${key} differs between web (from ${w.source}) and worker (from ${e.source})`);
    }
  }

  if (errors.length === 0 && names.length) {
    const d = dbs[names[0]];
    notes.push(
      `web, worker and migrations use database '${d.database}' on the same host and port; ${SHARED_KEYS.join(", ")} match`,
    );
  }
  return { ok: errors.length === 0, errors, notes };
}

function parseArgs(argv) {
  const args = { appDir: process.cwd(), expectDb: "chadgtm", pm2Stdin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--app-dir") args.appDir = argv[++i];
    else if (a === "--expect-db") args.expectDb = argv[++i];
    else if (a === "--pm2-jlist") {
      if (argv[++i] !== "-") throw new Error("--pm2-jlist only accepts '-' (stdin)");
      args.pm2Stdin = true;
    } else throw new Error(`unknown argument ${a}`);
  }
  if (!args.appDir) throw new Error("--app-dir needs a value");
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[env-check] ${err.message}`);
    process.exit(2);
  }
  const pm2Jlist = args.pm2Stdin ? parsePm2Jlist(fs.readFileSync(0, "utf8")) : [];
  let result;
  try {
    result = checkDeployEnv({ appDir: args.appDir, expectDb: args.expectDb, pm2Jlist });
  } catch (err) {
    console.error(`[env-check] ${err.message}`);
    process.exit(1);
  }
  for (const n of result.notes) console.log(`[env-check] ${n}`);
  for (const e of result.errors) console.error(`[env-check] !! ${e}`);
  if (!result.ok) {
    console.error("[env-check] refusing to deploy: fix the env files (docs/OPERATIONS.md, 'Environment variables')");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
