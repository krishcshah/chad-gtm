import { describe, expect, it, vi } from "vitest";
import { importLockName, runWithImportLock, type ImportLockManager } from "../import-lock";

/** Fake navigator.locks: one holder per name; ifAvailable gets null when held. */
function fakeLocks(): ImportLockManager & { held: Set<string> } {
  const held = new Set<string>();
  return {
    held,
    async request(name, options, callback) {
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        throw new Error("fake only supports ifAvailable");
      }
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}

describe("runWithImportLock", () => {
  it("lets only one tab process a job at a time", async () => {
    const locks = fakeLocks();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fn = vi.fn(() => gate);

    const first = runWithImportLock("j1", fn, locks);
    const second = runWithImportLock("j1", fn, locks);
    expect(await second).toBe("busy");
    release();
    expect(await first).toBe("ran");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(locks.held.size).toBe(0);
  });

  it("uses one lock per job", async () => {
    const locks = fakeLocks();
    const fn = vi.fn(async () => {
      expect(locks.held.has(importLockName("j1"))).toBe(true);
      expect(await runWithImportLock("j2", async () => {}, locks)).toBe("ran");
    });
    expect(await runWithImportLock("j1", fn, locks)).toBe("ran");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("releases the lock when the import throws", async () => {
    const locks = fakeLocks();
    await expect(runWithImportLock("j1", async () => Promise.reject(new Error("boom")), locks)).rejects.toThrow("boom");
    expect(await runWithImportLock("j1", async () => {}, locks)).toBe("ran");
  });

  it("just runs the import when navigator.locks is unavailable", async () => {
    const fn = vi.fn(async () => {});
    expect(await runWithImportLock("j1", fn, undefined)).toBe("ran");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("falls back to running when the browser has no Web Locks API", async () => {
    vi.stubGlobal("navigator", { userAgent: "old-browser" });
    try {
      const fn = vi.fn(async () => {});
      expect(await runWithImportLock("j1", fn)).toBe("ran");
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses navigator.locks by default when the browser has it", async () => {
    const locks = fakeLocks();
    locks.held.add(importLockName("j1")); // another tab holds it
    vi.stubGlobal("navigator", { locks });
    try {
      const fn = vi.fn(async () => {});
      expect(await runWithImportLock("j1", fn)).toBe("busy");
      expect(fn).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
