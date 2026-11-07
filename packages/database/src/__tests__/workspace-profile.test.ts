import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../schema";
import { effectiveBookingUrl, loadWorkspaceProfile, notificationRecipient } from "../workspace-profile";

/* #72: the sender identity (company name, postal address) is per workspace.
 * A workspace id that is not the user's never falls back to another row: the
 * blank postal address then holds the sends. */

const dialect = new PgDialect();

type Ws = Record<string, any> & { id: string; userId: string };

/** Fake Drizzle client: workspaces filtered by the where params, legacy rows by user id. */
function fakeDb(workspaces: Ws[], legacy: Array<{ userId: string; companyName: string; postalAddress: string }>) {
  const reads: unknown[] = [];
  const db = {
    select: (fields: Record<string, unknown>) => {
      let table: unknown;
      let where: any;
      let ordered = false;
      const q: any = {
        from: (t: unknown) => ((table = t), reads.push(t), q),
        where: (w: any) => ((where = w), q),
        orderBy: () => ((ordered = true), q),
        limit: () => q,
        then: (resolve: (v: any) => void, reject: (e: unknown) => void) => {
          try {
            const params = where ? dialect.sqlToQuery(where).params.map(String) : [];
            let rows: Record<string, any>[] = [];
            if (table === schema.workspaces) {
              rows = workspaces.filter((w) => params.every((p) => p === w.id || p === w.userId));
              if (ordered) {
                rows = [...rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.localeCompare(b.createdAt));
              }
              rows = rows.map((w) => ({ ...w, workspaceName: w.name }));
            } else if (table === schema.workspaceSettings) {
              rows = legacy.filter((l) => params.includes(l.userId));
            }
            // Only the selected keys, like Drizzle.
            resolve(rows.slice(0, 1).map((r) => Object.fromEntries(Object.keys(fields).map((k) => [k, r[k]]))));
          } catch (e) {
            reject(e);
          }
        },
      };
      return q;
    },
  };
  return { db, reads };
}

const wsA: Ws = {
  id: "wA",
  userId: "u1",
  name: "Client A",
  isDefault: true,
  createdAt: "2026-01-01",
  companyName: "Acme",
  postalAddress: "1 Main St, Springfield",
  bookingUrl: "https://cal.com/acme",
  notifyEmail: "",
  notifyEscalations: true,
  notifyReminders: false,
};
const wsB: Ws = {
  id: "wB",
  userId: "u1",
  name: "Client B",
  isDefault: false,
  createdAt: "2026-02-01",
  companyName: "Bolt",
  postalAddress: "9 Side Rd, Shelbyville",
  bookingUrl: null,
  notifyEmail: "ops@bolt.test",
  notifyEscalations: null,
  notifyReminders: undefined,
};
const otherUsers: Ws = { ...wsB, id: "wX", userId: "u2", name: "Other", companyName: "Other Co", postalAddress: "7 Elsewhere" };
const legacyRow = { userId: "u1", companyName: "Legacy Inc", postalAddress: "5 Old Rd" };

describe("loadWorkspaceProfile", () => {
  it("returns the given workspace's identity", async () => {
    const { db } = fakeDb([wsA, wsB, otherUsers], [legacyRow]);
    const p = await loadWorkspaceProfile(db, { userId: "u1", workspaceId: "wB" });
    expect(p).toMatchObject({
      workspaceId: "wB",
      workspaceName: "Client B",
      isDefault: false,
      companyName: "Bolt",
      postalAddress: "9 Side Rd, Shelbyville",
      bookingUrl: null,
      notifyEmail: "ops@bolt.test",
      source: "workspace",
    });
  });

  it("an unknown or another user's workspace id gives a blank profile, never another row", async () => {
    const { db, reads } = fakeDb([wsA, wsB, otherUsers], [legacyRow]);
    for (const workspaceId of ["missing", "wX"]) {
      const p = await loadWorkspaceProfile(db, { userId: "u1", workspaceId });
      expect(p.postalAddress).toBe("");
      expect(p.companyName).toBe("");
      expect(p.workspaceId).toBeNull();
      expect(p.source).toBe("none");
    }
    // Neither the default workspace nor the legacy row was consulted.
    expect(reads).not.toContain(schema.workspaceSettings);
  });

  it("null or 'primary-default' resolves the user's default workspace", async () => {
    const { db } = fakeDb([wsB, wsA], [legacyRow]);
    for (const workspaceId of [null, "primary-default", undefined]) {
      const p = await loadWorkspaceProfile(db, { userId: "u1", workspaceId });
      expect(p.workspaceId).toBe("wA");
      expect(p.companyName).toBe("Acme");
      expect(p.isDefault).toBe(true);
      expect(p.bookingUrl).toBe("https://cal.com/acme");
    }
  });

  it("falls back to the legacy account row only when the user has no workspace rows", async () => {
    const { db } = fakeDb([otherUsers], [legacyRow]);
    const p = await loadWorkspaceProfile(db, { userId: "u1", workspaceId: null });
    expect(p).toMatchObject({ workspaceId: null, companyName: "Legacy Inc", postalAddress: "5 Old Rd", source: "legacy" });

    const none = await loadWorkspaceProfile(fakeDb([], []).db, { userId: "u1", workspaceId: null });
    expect(none).toMatchObject({ postalAddress: "", source: "none" });
  });

  it("notification switches are on unless explicitly false", async () => {
    const { db } = fakeDb([wsA, wsB], []);
    const b = await loadWorkspaceProfile(db, { userId: "u1", workspaceId: "wB" });
    expect(b.notifyEscalations).toBe(true);
    expect(b.notifyReminders).toBe(true);
    const a = await loadWorkspaceProfile(db, { userId: "u1", workspaceId: "wA" });
    expect(a.notifyEscalations).toBe(true);
    expect(a.notifyReminders).toBe(false);
  });
});

describe("effectiveBookingUrl", () => {
  it("prefers the run's own link, then the workspace default, else null", () => {
    expect(effectiveBookingUrl("https://cal.com/run", { bookingUrl: "https://cal.com/ws" })).toBe("https://cal.com/run");
    expect(effectiveBookingUrl("  ", { bookingUrl: "https://cal.com/ws" })).toBe("https://cal.com/ws");
    expect(effectiveBookingUrl(null, { bookingUrl: null })).toBeNull();
    expect(effectiveBookingUrl(undefined, null)).toBeNull();
  });
});

describe("notificationRecipient", () => {
  it("uses the workspace notify address, else the owner's login email", () => {
    expect(notificationRecipient({ notifyEmail: " ops@bolt.test " }, "owner@x.test")).toBe("ops@bolt.test");
    expect(notificationRecipient({ notifyEmail: "" }, "owner@x.test")).toBe("owner@x.test");
    expect(notificationRecipient(null, "owner@x.test")).toBe("owner@x.test");
  });
});
