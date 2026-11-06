/**
 * Deploy tooling: scripts/deploy-remote.sh, scripts/check-deploy-env.mjs,
 * scripts/backup-db.sh, the workflow bootstrap and migration 0012.
 *
 * deploy-remote.sh runs for real against a throwaway git checkout, with npm,
 * pm2, curl, pg_dump and pg_restore replaced by stubs. Nothing talks to a
 * database, a server or the network.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const scriptsDir = path.join(repoRoot, "scripts");
const hasBash = spawnSync("bash", ["--version"]).status === 0;
const hasGit = spawnSync("git", ["--version"]).status === 0;

/** A minimal, explicit child env (no inherited secrets); NODE_ENV is deliberately unset. */
const asEnv = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

const SECRET_PASSWORD = "pw-SECRET-123";
const WEB_ENV = [
  `DATABASE_URL="postgres://chad:${SECRET_PASSWORD}@127.0.0.1:5432/chadgtm"`,
  'BETTER_AUTH_SECRET="auth-secret-aaaaaaaaaaaaaaaaaaaaaaaa"',
  `ENCRYPTION_KEY="${"ab".repeat(32)}"`,
  'APP_URL="https://autogtm.tech"',
  "",
].join("\n");

function write(file: string, content: string, mode?: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (mode) fs.chmodSync(file, mode);
}

const STUBS: Record<string, string> = {
  npm: `#!/usr/bin/env bash
echo "npm $* PGOPTIONS=\${PGOPTIONS:-}" >> "$STUB_LOG"
case "$1" in
  ci)
    rm -rf node_modules apps/*/node_modules packages/*/node_modules
    mkdir -p node_modules && echo new > node_modules/new-marker
    [[ -n "\${FAIL_NPM_CI:-}" ]] && exit 1
    mkdir -p apps/web/node_modules && echo new > apps/web/node_modules/new-marker
    exit 0 ;;
  run)
    case "$2" in
      db:migrate) [[ -n "\${FAIL_MIGRATE:-}" ]] && exit 1; exit 0 ;;
      build)
        mkdir -p apps/web/.next
        find apps/web/.next -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} +
        echo new > apps/web/.next/BUILD_ID
        [[ -n "\${FAIL_BUILD:-}" ]] && exit 1
        exit 0 ;;
    esac ;;
esac
exit 0
`,
  pm2: `#!/usr/bin/env bash
echo "pm2 $*" >> "$STUB_LOG"
case "$1" in
  describe) [[ " \${PM2_KNOWN:-} " == *" $2 "* ]] && { echo "status online"; exit 0; }; exit 1 ;;
  jlist)
    if [[ -n "\${PM2_WORKER_DB:-}" ]]; then wenv="{\\"DATABASE_URL\\":\\"$PM2_WORKER_DB\\"}"; else wenv="{}"; fi
    echo "[{\\"name\\":\\"chadgtm-worker\\",\\"pm2_env\\":{\\"status\\":\\"online\\",\\"restart_time\\":0,\\"env\\":$wenv}},{\\"name\\":\\"chadgtm-web\\",\\"pm2_env\\":{\\"status\\":\\"online\\",\\"restart_time\\":0}}]" ;;
  logs) echo "SECRET-LOG-LINE lead@example.com params: token" ;;
esac
exit 0
`,
  curl: `#!/usr/bin/env bash
echo "curl $*" >> "$STUB_LOG"
[[ -n "\${FAIL_HEALTH:-}" ]] && exit 22
echo '{"ok":true,"db":true,"engine":{"stale":false}}'
`,
  pg_dump: `#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "pg_dump (PostgreSQL) 17.2"; exit 0; fi
echo "pg_dump" >> "$STUB_LOG"
for a in "$@"; do case "$a" in --file=*) echo dump > "\${a#--file=}" ;; esac; done
`,
  pg_restore: `#!/usr/bin/env bash
exit 0
`,
};

type Ctx = { tmp: string; app: string; bin: string; log: string; backups: string; shaA: string; shaB: string };

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function setup(): Ctx {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-test-"));
  const app = path.join(tmp, "app");
  const bin = path.join(tmp, "bin");
  const log = path.join(tmp, "stub.log");
  const backups = path.join(tmp, "backups");
  for (const [name, body] of Object.entries(STUBS)) write(path.join(bin, name), body, 0o755);
  write(log, "");

  fs.mkdirSync(app, { recursive: true });
  git(app, "init", "-q", "-b", "main");
  write(path.join(app, ".gitignore"), "node_modules*\n.next*\ndata/\n.env\n.env.local\n");
  write(path.join(app, "package.json"), '{"name":"x","private":true}\n');
  write(path.join(app, "VERSION"), "A\n");
  write(path.join(app, "scripts", "backup-db.sh"), fs.readFileSync(path.join(scriptsDir, "backup-db.sh"), "utf8"));
  git(app, "add", "-A");
  git(app, "commit", "-q", "-m", "A");
  const shaA = git(app, "rev-parse", "HEAD");
  write(path.join(app, "VERSION"), "B\n");
  git(app, "commit", "-q", "-am", "B");
  const shaB = git(app, "rev-parse", "HEAD");
  git(app, "reset", "-q", "--hard", shaA);

  write(path.join(app, "apps/web/.env.local"), WEB_ENV);
  write(path.join(app, "packages/email-engine/.env"), "# engine-only overrides\n");
  write(path.join(app, "data/leads.db"), "sqlite");
  write(path.join(app, "node_modules/old-marker"), "old");
  write(path.join(app, "apps/web/node_modules/old-marker"), "old");
  write(path.join(app, "apps/web/.next/BUILD_ID"), "old\n");
  write(path.join(app, "apps/web/.next/server/page.js"), "old page\n");
  write(path.join(app, "apps/web/.next/cache/x"), "cache\n");
  return { tmp, app, bin, log, backups, shaA, shaB };
}

function deploy(ctx: Ctx, extra: Record<string, string> = {}) {
  const env: Record<string, string> = {
    PATH: `${ctx.bin}:${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
    HOME: ctx.tmp,
    APP_DIR: ctx.app,
    DEPLOY_SCRIPTS_DIR: scriptsDir,
    TARGET_SHA: ctx.shaB,
    DEPLOY_LOCK_HELD: "1",
    HEALTH_ATTEMPTS: "2",
    HEALTH_INTERVAL_S: "0",
    STABILITY_WAIT_S: "0",
    BACKUP_DIR: ctx.backups,
    DEPLOY_MIN_FREE_MB: "1",
    STUB_LOG: ctx.log,
    PM2_KNOWN: "chadgtm-web chadgtm-worker",
    ...extra,
  };
  const r = spawnSync("bash", [path.join(scriptsDir, "deploy-remote.sh")], { cwd: ctx.app, env: asEnv(env), encoding: "utf8" });
  return {
    status: r.status,
    out: `${r.stdout}\n${r.stderr}`,
    log: fs.readFileSync(ctx.log, "utf8"),
    head: git(ctx.app, "rev-parse", "HEAD"),
  };
}

const read = (ctx: Ctx, p: string) => fs.readFileSync(path.join(ctx.app, p), "utf8");
const exists = (ctx: Ctx, p: string) => fs.existsSync(path.join(ctx.app, p));

describe.skipIf(!hasBash || !hasGit)("scripts/deploy-remote.sh", () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  });

  it("deploys, records the commit, uses a unique backup and a migration lock_timeout", () => {
    const r = deploy(ctx);
    expect(r.status, r.out).toBe(0);
    expect(r.head).toBe(ctx.shaB);
    expect(read(ctx, ".git/chadgtm-last-deployed").trim()).toBe(ctx.shaB);
    expect(exists(ctx, "node_modules.prev")).toBe(false);
    expect(exists(ctx, "apps/web/.next.prev")).toBe(false);
    expect(r.log).toMatch(/npm run db:migrate PGOPTIONS=-c lock_timeout=15s/);
    const dumps = fs.readdirSync(ctx.backups);
    expect(dumps).toHaveLength(1);
    expect(dumps[0]).toMatch(new RegExp(`^chadgtm-predeploy-${ctx.shaB.slice(0, 12)}-\\d{8}T\\d{6}Z\\.dump$`));
    // A reload does not change what pm2 resurrects: no daemon-wide save.
    expect(r.log).not.toMatch(/^pm2 save/m);
    expect(r.out).not.toContain(SECRET_PASSWORD);
  });

  it("saves the pm2 list only when it had to start a chadgtm process", () => {
    const r = deploy(ctx, { PM2_KNOWN: "" });
    expect(r.status, r.out).toBe(0);
    expect(r.log).toMatch(/^pm2 start .*--name chadgtm-web/m);
    expect(r.log).toMatch(/^pm2 save/m);
  });

  it("refuses before touching anything when the worker's .env points at another database", () => {
    write(
      path.join(ctx.app, "packages/email-engine/.env"),
      `DATABASE_URL=postgres://sr:${SECRET_PASSWORD}@127.0.0.1:5432/smartreach\n`,
    );
    const r = deploy(ctx);
    expect(r.status).not.toBe(0);
    expect(r.head).toBe(ctx.shaA);
    expect(r.log).not.toMatch(/^npm /m);
    expect(r.out).toContain("'smartreach'");
    expect(r.out).toContain("nothing was changed");
    expect(r.out).not.toContain(SECRET_PASSWORD);
  });

  it("refuses when pm2's stored env for the worker overrides the database", () => {
    const r = deploy(ctx, { PM2_WORKER_DB: "postgres://sr:x@10.0.0.9:5432/chadgtm" });
    expect(r.status).not.toBe(0);
    expect(r.head).toBe(ctx.shaA);
    expect(r.out).toMatch(/host differs between web .* and worker \(from pm2 stored env of chadgtm-worker\)/);
    expect(r.out).not.toContain("10.0.0.9");
  });

  it("restores the old checkout and node_modules when npm ci fails", () => {
    const r = deploy(ctx, { FAIL_NPM_CI: "1" });
    expect(r.status).not.toBe(0);
    expect(r.head).toBe(ctx.shaA);
    expect(read(ctx, "VERSION")).toBe("A\n");
    expect(read(ctx, "node_modules/old-marker")).toBe("old");
    expect(exists(ctx, "node_modules/new-marker")).toBe(false);
    expect(read(ctx, "apps/web/node_modules/old-marker")).toBe("old");
    expect(exists(ctx, "node_modules.prev")).toBe(false);
    expect(r.out).toContain("restored");
  });

  it("restores the old checkout, node_modules and .next when the build fails", () => {
    const r = deploy(ctx, { FAIL_BUILD: "1" });
    expect(r.status).not.toBe(0);
    expect(r.head).toBe(ctx.shaA);
    expect(read(ctx, "apps/web/.next/BUILD_ID")).toBe("old\n");
    expect(read(ctx, "apps/web/.next/server/page.js")).toBe("old page\n");
    expect(exists(ctx, "apps/web/.next/cache/x")).toBe(true);
    expect(read(ctx, "node_modules/old-marker")).toBe("old");
    expect(exists(ctx, "apps/web/node_modules/new-marker")).toBe(false);
    expect(r.log).not.toMatch(/^pm2 reload/m);
    expect(r.out).toMatch(/pre-deploy database backup: .*chadgtm-predeploy-/);
  });

  it("never prints application logs after a failed health check, and names the last good deploy", () => {
    write(path.join(ctx.app, ".git/chadgtm-last-deployed"), `${ctx.shaA}\n`);
    const r = deploy(ctx, { FAIL_HEALTH: "1" });
    expect(r.status).not.toBe(0);
    expect(r.log).not.toMatch(/^pm2 logs/m);
    expect(r.out).not.toContain("SECRET-LOG-LINE");
    expect(r.out).toContain("chadgtm-worker: status online, restarts 0");
    expect(r.out).toContain(`last successfully deployed commit: ${ctx.shaA.slice(0, 12)}`);
    // The new release is live; it is not rolled back behind pm2's back.
    expect(r.head).toBe(ctx.shaB);
    expect(read(ctx, ".git/chadgtm-last-deployed").trim()).toBe(ctx.shaA);
  });

  it("re-running a failed deploy of the same commit keeps the first pre-migration dump", async () => {
    const first = deploy(ctx, { FAIL_HEALTH: "1" });
    expect(first.status).not.toBe(0);
    const firstDumps = fs.readdirSync(ctx.backups);
    expect(firstDumps).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 1100));
    const second = deploy(ctx);
    expect(second.status, second.out).toBe(0);
    const dumps = fs.readdirSync(ctx.backups).sort();
    expect(dumps).toHaveLength(2);
    expect(dumps).toContain(firstDumps[0]);
  });
});

describe.skipIf(!hasBash)("scripts/backup-db.sh", () => {
  it("refuses to overwrite an existing dump", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
    try {
      const bin = path.join(tmp, "bin");
      for (const name of ["pg_dump", "pg_restore"]) write(path.join(bin, name), STUBS[name], 0o755);
      const env = {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        HOME: tmp,
        BACKUP_DIR: path.join(tmp, "b"),
        DATABASE_URL: "postgres://u:p@127.0.0.1/chadgtm",
        STUB_LOG: path.join(tmp, "log"),
      };
      const run = () =>
        spawnSync("bash", [path.join(scriptsDir, "backup-db.sh"), "predeploy-abc"], { env: asEnv(env), encoding: "utf8" });
      expect(run().status).toBe(0);
      const target = path.join(tmp, "b", "chadgtm-predeploy-abc.dump");
      fs.writeFileSync(target, "first");
      const again = run();
      expect(again.status).not.toBe(0);
      expect(again.stderr).toContain("refusing to overwrite");
      expect(fs.readFileSync(target, "utf8")).toBe("first");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("scripts/check-deploy-env.mjs", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "envcheck-"));
    write(path.join(tmp, "apps/web/.env.local"), WEB_ENV);
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const check = (args: string[] = []) =>
    spawnSync(process.execPath, [path.join(scriptsDir, "check-deploy-env.mjs"), "--app-dir", tmp, ...args], {
      env: asEnv({ PATH: process.env.PATH ?? "" }),
      encoding: "utf8",
    });

  it("accepts a consistent setup and treats localhost and 127.0.0.1 as the same host", () => {
    write(path.join(tmp, "packages/email-engine/.env"), "DATABASE_URL=postgres://other:pw@localhost/chadgtm\n");
    const r = check();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("database 'chadgtm'");
  });

  it("rejects an empty KEY= in the engine .env (it hides the web value)", () => {
    write(path.join(tmp, "packages/email-engine/.env"), "ENCRYPTION_KEY=\n");
    const r = check();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("ENCRYPTION_KEY is not set for worker (from packages/email-engine/.env)");
  });

  it("rejects secrets or APP_URL that differ between web and worker, without printing them", () => {
    write(
      path.join(tmp, "packages/email-engine/.env"),
      'APP_URL="https://chadgtm.130-61-146-177.sslip.io"\nBETTER_AUTH_SECRET="other-secret-zzzzzzzzzzzzzzzz"\n',
    );
    const r = check();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("APP_URL differs between web");
    expect(r.stderr).toContain("BETTER_AUTH_SECRET differs between web");
    expect(r.stderr).not.toContain("sslip.io");
    expect(r.stderr).not.toContain("other-secret");
  });

  it("rejects a port mismatch and a wrong expected database", () => {
    write(path.join(tmp, "packages/email-engine/.env"), "DATABASE_URL=postgres://u:pw@127.0.0.1:6543/chadgtm\n");
    expect(check().stderr).toContain("DATABASE_URL port differs");
    write(path.join(tmp, "packages/email-engine/.env"), "");
    expect(check(["--expect-db", "smartreach"]).stderr).toContain("expected 'smartreach'");
  });
});

describe("deploy workflow bootstrap", () => {
  const yml = fs.readFileSync(path.join(repoRoot, ".github/workflows/deploy.yml"), "utf8");
  const py = fs.readFileSync(path.join(scriptsDir, "deploy_remote_chadgtm.py"), "utf8");

  it("is identical in deploy.yml and deploy_remote_chadgtm.py", () => {
    const fromYml = yml
      .split("bash -s <<'DEPLOY'\n")[1]
      .split(/\n\s*DEPLOY\n/)[0]
      .split("\n")
      .map((l) => l.replace(/^ {12}/, ""))
      .join("\n")
      .trim();
    const fromPy = py.split("BOOTSTRAP = r'''")[1].split("'''")[0].trim();
    expect(fromYml).toBe(fromPy);
  });

  it("fetches without moving the checkout, and waits for the lock well inside command_timeout", () => {
    expect(yml).not.toMatch(/git pull/);
    expect(yml).toMatch(/git fetch --quiet origin main/);
    const lockWait = Number(/flock -w (\d+) 9/.exec(yml)?.[1]);
    const timeoutMin = Number(/command_timeout: (\d+)m/.exec(yml)?.[1]);
    const jobMin = Number(/timeout-minutes: (\d+)/.exec(yml)?.[1]);
    // Leave at least 30 minutes for npm ci, backup, migrate, next build and checks.
    expect(timeoutMin - lockWait / 60).toBeGreaterThanOrEqual(30);
    expect(jobMin).toBeGreaterThan(timeoutMin);
  });
});

describe("migration 0012 foreign keys", () => {
  const sql = fs.readFileSync(
    path.join(repoRoot, "apps/web/drizzle/0012_schema_parity_and_reply_agent.sql"),
    "utf8",
  );

  it("skips every FK that already exists under another name", () => {
    const blocks = sql.split("--> statement-breakpoint").filter((b) => /FOREIGN KEY/.test(b));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const m =
        /ALTER TABLE "(\w+)" ADD CONSTRAINT "\w+" FOREIGN KEY \("(\w+)"\) REFERENCES "public"\."(\w+)"\("(\w+)"\) ON DELETE ([a-z ]+) ON UPDATE no action;/.exec(
          block,
        );
      expect(m, block).not.toBeNull();
      const [, table, col, ref, refCol, onDelete] = m!;
      const code = { cascade: "c", "set null": "n", "no action": "a", restrict: "r", "set default": "d" }[onDelete];
      const guard = /IF NOT EXISTS \(SELECT 1 FROM pg_constraint c (.*?)\) THEN/.exec(block)?.[1] ?? "";
      expect(guard, block).toContain(`c.conrelid = to_regclass('"${table}"')`);
      expect(guard).toContain(`c.confrelid = to_regclass('"public"."${ref}"')`);
      expect(guard).toContain(`a.attname = '${col}'`);
      expect(guard).toContain(`ra.attname = '${refCol}'`);
      expect(guard).toContain(`c.confdeltype = '${code}'`);
      expect(block.indexOf("IF NOT EXISTS")).toBeLessThan(block.indexOf("ADD CONSTRAINT"));
      expect(block).toContain("END IF;");
      expect(block).toContain("EXCEPTION WHEN duplicate_object THEN NULL;");
    }
  });
});

describe("operations docs", () => {
  const ops = fs.readFileSync(path.join(repoRoot, "docs/OPERATIONS.md"), "utf8");
  const example = fs.readFileSync(path.join(repoRoot, ".env.example"), "utf8");

  it("does not tell operators to trust the leaked auth secret for unsubscribe tokens", () => {
    expect(ops).not.toMatch(/set `UNSUBSCRIBE_SECRET_PREVIOUS`\s+to the \*\*old\*\*/);
    expect(ops).toMatch(/\*\*Do not\*\* set `UNSUBSCRIBE_SECRET_PREVIOUS` to\s+the old value/);
  });

  it("does not document variables the code no longer reads as working", () => {
    expect(example).not.toMatch(/^#?\s*ENGINE_SYNC_MS=/m);
    expect(ops).not.toMatch(/\| `ENGINE_SYNC_MS` \| engine/);
    // ADMIN_EMAIL is read again (alias of ADMIN_EMAILS, verified emails only).
    expect(ops).toMatch(/\| `ADMIN_EMAIL` \|.*verified/);
    expect(ops).toMatch(/scripts\/make-admin\.ts/);
  });
});
