import { describe, expect, it } from "vitest";
import { GLOBAL_SUPPRESSION_SOURCES, schema } from "@smartreach/database";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  addSuppression,
  loadRecipientVerdict,
  recipientBlockMessage,
} from "../suppression";
import { conversationDb } from "./fixtures/conversation-db";

/** Fake insert chain that records which conflict handler addSuppression used. */
function insertDb() {
  const calls: { method: string; arg?: any; values?: any }[] = [];
  const db: any = {
    insert: () => ({
      values: (values: any) => ({
        onConflictDoNothing: async () => {
          calls.push({ method: "onConflictDoNothing", values });
        },
        onConflictDoUpdate: async (arg: any) => {
          calls.push({ method: "onConflictDoUpdate", arg, values });
        },
      }),
    }),
  };
  return { db, calls };
}

describe("addSuppression", () => {
  it("an unsubscribe upgrades a private row, but never overwrites any global source", async () => {
    const { db, calls } = insertDb();
    await addSuppression(db, { userId: "u1", email: "John@Acme.com", source: "unsubscribe", reason: "One-click unsubscribe" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("onConflictDoUpdate");
    expect(calls[0].values).toMatchObject({ value: "john@acme.com", source: "unsubscribe", userId: "u1" });
    expect(calls[0].arg.set).toMatchObject({ source: "unsubscribe" });
    const where = new PgDialect().sqlToQuery(calls[0].arg.setWhere as SQL);
    expect(where.sql).toMatch(/not in/i);
    for (const s of GLOBAL_SUPPRESSION_SOURCES) expect(where.params).toContain(s);
  });

  it("a manual row never overwrites an existing row", async () => {
    const { db, calls } = insertDb();
    await addSuppression(db, { userId: "u1", email: "john@acme.com", source: "manual", reason: "" });
    expect(calls.map((c) => c.method)).toEqual(["onConflictDoNothing"]);
  });
});

describe("loadRecipientVerdict", () => {
  const rows = (r: any[]) => conversationDb(new Map<unknown, any>([[schema.suppressions, () => r]])).db;

  it("is global for anyone's unsubscribe", async () => {
    const v = await loadRecipientVerdict(rows([{ value: "dana@acme.com", userId: "other", source: "unsubscribe" }]), "u1", "Dana@Acme.com");
    expect(v).toEqual({ level: "global", source: "unsubscribe" });
  });

  it("is own for the user's domain block, and ignores rows for another address", async () => {
    const v = await loadRecipientVerdict(
      rows([
        { value: "@acme.com", userId: "u1", source: "manual" },
        { value: "someone@acme.com", userId: "other", source: "bounce" },
      ]),
      "u1",
      "dana@acme.com",
    );
    expect(v).toEqual({ level: "own", source: "manual" });
  });

  it("is null when only another user's private row exists", async () => {
    expect(await loadRecipientVerdict(rows([{ value: "dana@acme.com", userId: "other", source: "manual" }]), "u1", "dana@acme.com")).toBeNull();
  });
});

describe("recipientBlockMessage", () => {
  it("explains each kind of block", () => {
    expect(recipientBlockMessage("a@b.com", { level: "global", source: "unsubscribe" })).toBe(
      "a@b.com unsubscribed or asked not to be contacted, so AutoGTM won't email them again.",
    );
    expect(recipientBlockMessage("a@b.com", { level: "global", source: "bounce" })).toBe(
      "a@b.com bounced, so this address can't receive email.",
    );
    expect(recipientBlockMessage("a@b.com", { level: "own", source: "manual" })).toBe("a@b.com is on your blocklist.");
  });
});
