import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

/* Settings › Lead conversations › Notifications: a valid address (or empty
 * for the login email), and only the workspace's owner can change it. */

type Write = { table: unknown; set?: any; where?: any };

const st = vi.hoisted(() => ({
  writes: [] as Write[],
  /** Workspaces the update matches (the owner check is in its where clause). */
  ownedIds: ["w1"] as string[],
  row: null as Record<string, any> | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "owner@client.example", role: "user" })) }));
vi.mock("../db", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const chain = (resolve: () => any, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") {
            const p = Promise.resolve().then(resolve);
            return (p as any)[prop].bind(p);
          }
          return (...args: any[]) => {
            onCall?.(String(prop), args);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  return {
    getDb: () => ({
      select: () => chain(() => (st.row ? [st.row] : [])),
      update: (table: unknown) => {
        const w: Write = { table };
        st.writes.push(w);
        return chain(
          () => {
            // Matches only when the where clause names the signed-in user and a workspace they own.
            const params = w.where ? dialect.sqlToQuery(w.where).params : [];
            const id = st.ownedIds.find((owned) => params.includes(owned));
            return id && params.includes("u1") ? [{ id }] : [];
          },
          (prop, args) => {
            if (prop === "set") w.set = args[0];
            if (prop === "where") w.where = args[0];
          },
        );
      },
    }),
  };
});

import { saveNotificationSettingsAction, getNotificationSettingsAction } from "../workspace-profile-actions";

beforeEach(() => {
  st.writes = [];
  st.ownedIds = ["w1"];
  st.row = null;
});

describe("saveNotificationSettingsAction", () => {
  it("saves the address and both switches on the owner's workspace", async () => {
    const res = await saveNotificationSettingsAction({
      workspaceId: "w1",
      notifyEmail: "  sales@acme.com ",
      notifyEscalations: true,
      notifyReminders: false,
    });
    expect(res).toMatchObject({
      ok: true,
      data: { notifyEmail: "sales@acme.com", notifyEscalations: true, notifyReminders: false, notifyTo: "sales@acme.com" },
    });
    expect(st.writes).toHaveLength(1);
    expect(st.writes[0]!.table).toBe(schema.workspaces);
    expect(st.writes[0]!.set).toMatchObject({ notifyEmail: "sales@acme.com", notifyEscalations: true, notifyReminders: false });
  });

  it("an empty address means the login email", async () => {
    const res = await saveNotificationSettingsAction({ workspaceId: "w1", notifyEmail: "", notifyEscalations: true, notifyReminders: true });
    expect(res).toMatchObject({ ok: true, data: { notifyEmail: "", notifyTo: "owner@client.example" } });
  });

  it("rejects an invalid email and writes nothing", async () => {
    const res = await saveNotificationSettingsAction({
      workspaceId: "w1",
      notifyEmail: "sales at acme",
      notifyEscalations: true,
      notifyReminders: true,
    });
    expect(res).toEqual({ ok: false, error: "Enter a valid email address, or leave it empty to use your login email." });
    expect(st.writes).toHaveLength(0);
  });

  it("rejects another user's workspace", async () => {
    const res = await saveNotificationSettingsAction({
      workspaceId: "w-other",
      notifyEmail: "sales@acme.com",
      notifyEscalations: false,
      notifyReminders: false,
    });
    expect(res).toEqual({ ok: false, error: "Workspace not found." });
  });

  it("the update is conditional on the signed-in user owning the workspace", async () => {
    await saveNotificationSettingsAction({ workspaceId: "w1", notifyEmail: "", notifyEscalations: true, notifyReminders: true });
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const q = new PgDialect().sqlToQuery(st.writes[0]!.where);
    expect(q.sql).toContain('"workspaces"."user_id" = $');
    expect(q.params).toEqual(expect.arrayContaining(["w1", "u1"]));
  });
});

describe("getNotificationSettingsAction", () => {
  it("falls back to both on and the login email", async () => {
    const res = await getNotificationSettingsAction("w1");
    expect(res).toEqual({
      ok: true,
      data: { notifyEmail: "", notifyEscalations: true, notifyReminders: true, notifyTo: "owner@client.example" },
    });
  });

  it("reads the stored settings", async () => {
    st.row = { notifyEmail: "sales@acme.com", notifyEscalations: false, notifyReminders: true };
    const res = await getNotificationSettingsAction("w1");
    expect(res).toMatchObject({ ok: true, data: { notifyEscalations: false, notifyReminders: true, notifyTo: "sales@acme.com" } });
  });
});
