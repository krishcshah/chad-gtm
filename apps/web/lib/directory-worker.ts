/**
 * Directory (SQLite) queries off the web server's main thread.
 *
 * node:sqlite is synchronous: a slow query run in the request thread freezes
 * every page of the site until it finishes. The Autopilot audience (launch
 * and the 5-minute top-up), the setup previews and the research industry list
 * send their SQL here instead. Each lane is one worker thread with its own
 * read-only connection to the same file:
 *
 *   interactive  launch (first batch), preview pages; a person is waiting
 *   counts       preview COUNTs (setup screens), so launch pages and preview
 *                rows never wait behind a slow count
 *   background   top-up pages and full audience counts, which can take minutes
 *
 * A query's time limit starts when its thread starts it; time spent waiting
 * in the queue has its own, longer limit (queueWaitMs).
 *
 * One query runs on a thread at a time; the rest wait in this client's queue.
 * A query that times out is stopped for real: the worker's connection has a
 * directory_alive() SQL function that the audience and preview SQL call on
 * every row (DIRECTORY_ALIVE_SQL), and it throws once the stop flag (a
 * SharedArrayBuffer shared with this thread) is set. node:sqlite in Node 22
 * has no progress handler or sqlite3_interrupt, so SQL without that call is
 * only stopped when its statement returns. The thread is then terminated and
 * the next query starts on a fresh one; the background lane waits for the old
 * thread to be gone first, so a stopped count never runs next to a new one.
 *
 * The worker is created from inline code (eval), so no separate file has to
 * survive the Next.js build. SQL and bindings are built on the main thread.
 *
 * Under vitest, or with DIRECTORY_WORKER=off, queries run synchronously on
 * the main thread through getDirectoryDb() (tests mock that module).
 */
import { Worker } from "node:worker_threads";
import type { DatabaseSync } from "node:sqlite";
import { directoryDbFile, getDirectoryDb } from "./leads-directory";

export type DirectoryLane = "interactive" | "counts" | "background";
export type DirectoryQueryMode = "all" | "get";

const DEFAULT_TIMEOUT_MS: Record<DirectoryLane, number> = {
  interactive: 30_000,
  counts: 30_000,
  background: 10 * 60_000,
};

/** How long a query may wait in its lane's queue before it starts. */
const DEFAULT_QUEUE_WAIT_MS: Record<DirectoryLane, number> = {
  interactive: 60_000,
  counts: 60_000,
  background: 30 * 60_000,
};

/* The worker: opens the file read-only, refuses a different file than the
 * main thread opened (a swapped file needs a restart), caches statements,
 * and stops a statement when the main thread sets the stop flag. */
const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const stop = workerData && workerData.stop;
let db = null;
let openPath = null;
const stmts = new Map();
function identity(p) {
  const s = fs.statSync(p);
  return s.dev + ":" + s.ino;
}
function open(p, expected) {
  if (db && openPath === p) return db;
  if (db) { try { db.close(); } catch {} }
  db = null; stmts.clear();
  if (expected && identity(p) !== expected) {
    throw new Error("The directory file was replaced. Restart the web app to use the new file.");
  }
  db = new DatabaseSync(p, { readOnly: true });
  db.exec("PRAGMA cache_size = -64000; PRAGMA temp_store = MEMORY;");
  db.function("directory_alive", { deterministic: false }, () => {
    if (stop && Atomics.load(stop, 0) !== 0) throw new Error("Directory query stopped.");
    return 1;
  });
  openPath = p;
  return db;
}
parentPort.on("message", (m) => {
  try {
    const d = open(m.path, m.identity);
    let st = stmts.get(m.sql);
    if (!st) {
      st = d.prepare(m.sql);
      if (stmts.size > 64) stmts.clear();
      stmts.set(m.sql, st);
    }
    const result = m.mode === "get" ? st.get(...m.bindings) : st.all(...m.bindings);
    parentPort.postMessage({ id: m.id, ok: true, result: result === undefined ? null : result });
  } catch (err) {
    parentPort.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
  }
});
`;

export interface DirectoryWorkerClient {
  query<T = unknown>(
    file: { path: string; identity: string | null },
    sql: string,
    bindings: unknown[],
    mode: DirectoryQueryMode,
    /** Run time, counted from when the thread starts the query. */
    timeoutMs: number,
    /** Time it may wait in the queue first (default: timeoutMs). */
    queueWaitMs?: number,
  ): Promise<T>;
  close(): Promise<void>;
  /** Threads that were told to stop and have not exited yet (for tests and logs). */
  stoppingThreads(): number;
}

export interface DirectoryWorkerClientOptions {
  /**
   * Wait for a stopped thread to exit before the next query starts on a new
   * one (background lane: never two heavy scans at once). The interactive
   * lane does not wait: a person is waiting.
   */
  waitForStoppedThread?: boolean;
}

interface Job {
  id: number;
  msg: Record<string, unknown>;
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  timeoutMs: number;
  done: boolean;
}

/** One worker thread, its stop flag and the one query it is running. */
interface Thread {
  worker: Worker;
  stop: Int32Array;
  job: Job | null;
}

/**
 * A lane: one thread, one query at a time, a queue for the rest. Errors and
 * exits of a thread only fail the query that thread was running.
 */
export function createDirectoryWorkerClient(opts: DirectoryWorkerClientOptions = {}): DirectoryWorkerClient {
  let current: Thread | null = null;
  const stopping = new Set<Thread>();
  const queue: Job[] = [];
  let seq = 0;
  let closed = false;

  const settle = (job: Job, err: Error | null, value?: unknown) => {
    if (job.done) return;
    job.done = true;
    if (job.timer) clearTimeout(job.timer);
    if (err) job.reject(err);
    else job.resolve(value);
  };

  // Keep the process alive only while a query is running or waiting.
  const refresh = () => {
    if (!current) return;
    if (current.job || queue.length > 0) current.worker.ref();
    else current.worker.unref();
  };

  const start = (): Thread => {
    const stop = new Int32Array(new SharedArrayBuffer(4));
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { stop } });
    const t: Thread = { worker, stop, job: null };
    worker.on("message", (m: { id: number; ok: boolean; result?: unknown; error?: string }) => {
      const job = t.job;
      if (!job || job.id !== m.id) return;
      t.job = null;
      if (m.ok) settle(job, null, m.result);
      else settle(job, new Error(m.error || "directory query failed"));
      pump();
    });
    const gone = (err: Error) => {
      if (current === t) current = null;
      stopping.delete(t);
      const job = t.job;
      t.job = null;
      if (job) settle(job, err);
      pump();
    };
    worker.on("error", (err) => gone(err instanceof Error ? err : new Error(String(err))));
    worker.on("exit", (code) => gone(new Error(`The directory worker stopped (${code}).`)));
    return t;
  };

  /** Start the next waiting query when the thread is free. */
  function pump() {
    while (queue.length > 0 && queue[0]!.done) queue.shift();
    if (closed || queue.length === 0) return refresh();
    if (current?.job) return;
    if (opts.waitForStoppedThread && stopping.size > 0) return; // resumes on that thread's exit
    current ??= start();
    const job = queue.shift()!;
    current.job = job;
    // The run time limit starts now; the queue-wait timer is replaced.
    if (job.timer) clearTimeout(job.timer);
    job.timer = setTimeout(() => onTimeout(job, job.timeoutMs), job.timeoutMs);
    job.timer.unref?.();
    current.worker.postMessage(job.msg);
    refresh();
  }

  /** Stop the running statement (directory_alive() throws) and end its thread. */
  const stopThread = (t: Thread) => {
    Atomics.store(t.stop, 0, 1);
    t.job = null;
    if (current === t) current = null;
    stopping.add(t);
    t.worker.unref(); // a stopped thread never holds the process open
    void t.worker.terminate().catch(() => {});
  };

  const onTimeout = (job: Job, timeoutMs: number, queued = false) => {
    if (job.done) return;
    const limit = timeoutMs < 1000 ? `${timeoutMs}ms` : `${Math.round(timeoutMs / 1000)}s`;
    settle(
      job,
      new Error(
        queued
          ? `Directory query waited more than ${limit} to start (timed out).`
          : `Directory query timed out after ${limit}.`,
      ),
    );
    if (current && current.job === job) stopThread(current);
    pump();
  };

  return {
    query(file, sql, bindings, mode, timeoutMs, queueWaitMs = timeoutMs) {
      if (closed) return Promise.reject(new Error("The directory worker was closed."));
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const job: Job = {
          id,
          msg: { id, path: file.path, identity: file.identity, sql, bindings, mode },
          resolve,
          reject,
          timer: null,
          timeoutMs,
          done: false,
        };
        job.timer = setTimeout(() => onTimeout(job, queueWaitMs, true), queueWaitMs);
        job.timer.unref?.();
        queue.push(job);
        pump();
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      const err = new Error("The directory worker was closed.");
      for (const job of queue.splice(0)) settle(job, err);
      const t = current;
      current = null;
      // Stopped threads end on their own once their statement returns.
      for (const s of stopping) void s.worker.terminate().catch(() => 0);
      if (!t) return;
      const busy = t.job !== null;
      if (t.job) settle(t.job, err);
      t.job = null;
      Atomics.store(t.stop, 0, 1);
      const done = t.worker.terminate().catch(() => 0);
      // An idle thread exits at once; a busy one only when its statement returns, so don't wait for it.
      if (!busy) await done;
    },
    stoppingThreads: () => stopping.size,
  };
}

const g = globalThis as { __autogtmDirectoryWorkers?: Partial<Record<DirectoryLane, DirectoryWorkerClient>> };

function laneClient(lane: DirectoryLane): DirectoryWorkerClient {
  g.__autogtmDirectoryWorkers ??= {};
  return (g.__autogtmDirectoryWorkers[lane] ??= createDirectoryWorkerClient({
    waitForStoppedThread: lane === "background",
  }));
}

export function directoryWorkerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !env.VITEST && env.DIRECTORY_WORKER !== "off";
}

const withAlive = new WeakSet<object>();

/** The main-thread connection also knows directory_alive() (always 1), so the same SQL runs there. */
export function ensureDirectoryAliveFunction(db: Pick<DatabaseSync, "function"> | null | undefined): void {
  if (!db || typeof db.function !== "function" || withAlive.has(db)) return;
  try {
    db.function("directory_alive", { deterministic: false }, () => 1);
  } catch {
    // Already defined on this connection, or not a real connection (test fake).
  }
  withAlive.add(db);
}

/** Run one read-only directory statement; resolves with rows ("all") or one row ("get"). */
export async function directoryQuery<T = unknown>(
  sql: string,
  bindings: unknown[],
  mode: DirectoryQueryMode,
  lane: DirectoryLane = "interactive",
  opts: { timeoutMs?: number; queueWaitMs?: number } = {},
): Promise<T> {
  if (!directoryWorkerEnabled()) {
    const db = getDirectoryDb();
    ensureDirectoryAliveFunction(db as unknown as DatabaseSync);
    const stmt = db.prepare(sql);
    return (mode === "get" ? stmt.get(...(bindings as any[])) : stmt.all(...(bindings as any[]))) as T;
  }
  const file = directoryDbFile();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS[lane];
  return laneClient(lane).query<T>(file, sql, bindings, mode, timeoutMs, Math.max(timeoutMs, opts.queueWaitMs ?? DEFAULT_QUEUE_WAIT_MS[lane]));
}
