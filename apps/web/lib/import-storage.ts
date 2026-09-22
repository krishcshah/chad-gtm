/**
 * Client-side persistent storage for background lead import jobs using IndexedDB.
 * Falls back to in-memory storage when IndexedDB is unavailable (e.g., test runners / SSR).
 */

export interface StoredImportJob {
  id: string;
  listName: string;
  listId: string;
  fileName: string;
  totalRows: number;
  processedRows: number;
  imported: number;
  skipped: number;
  invalid: number;
  status: "running" | "completed" | "failed";
  error?: string | null;
  mapping: Record<string, string | null>;
  rows: Record<string, string>[];
  startedAt: number;
  updatedAt: number;
}

const DB_NAME = "smartreach_imports_db";
const STORE_NAME = "import_jobs";
const DB_VERSION = 1;

// In-memory fallback
let memoryStore: Record<string, StoredImportJob> = {};

function isIndexedDBAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error("IndexedDB not available"));
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveImportJob(job: StoredImportJob): Promise<void> {
  if (!isIndexedDBAvailable()) {
    memoryStore[job.id] = { ...job };
    return;
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(job);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("Failed to save import job to IndexedDB, using memory:", err);
    memoryStore[job.id] = { ...job };
  }
}

export async function getActiveImportJob(): Promise<StoredImportJob | null> {
  if (!isIndexedDBAvailable()) {
    const jobs = Object.values(memoryStore);
    return jobs.find((j) => j.status === "running") || jobs[jobs.length - 1] || null;
  }

  try {
    const db = await openDB();
    return await new Promise<StoredImportJob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const jobs = (req.result as StoredImportJob[]) || [];
        // Prioritize actively running job, else latest job
        const running = jobs.find((j) => j.status === "running");
        if (running) {
          resolve(running);
        } else {
          jobs.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(jobs[0] || null);
        }
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("Failed to get active import job from IndexedDB, using memory:", err);
    const jobs = Object.values(memoryStore);
    return jobs.find((j) => j.status === "running") || jobs[jobs.length - 1] || null;
  }
}

export async function deleteImportJob(id: string): Promise<void> {
  delete memoryStore[id];
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("Failed to delete import job from IndexedDB:", err);
  }
}

export async function clearAllImportJobs(): Promise<void> {
  memoryStore = {};
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("Failed to clear import jobs from IndexedDB:", err);
  }
}
