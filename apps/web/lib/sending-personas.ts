/**
 * The mailboxes an autopilot run's emails go out from, for the launch preview
 * and Mission Control (#66). Leads see each mailbox's own From name and
 * signature, so the client is shown those, never an invented sender.
 *
 * A launched campaign: the mailboxes attached to it. Before launch: the
 * shared AutoGTM pool, which launch attaches. Only pool mailboxes are read
 * before launch, so another client's own mailbox name never shows. No
 * address is selected.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";
import type { Db } from "./db";
import { samplePersonaFor, type PoolPersonaRow, type SamplePersona } from "./sample-sender";

export async function loadSendingPersonaRows(db: Db, campaignId?: string | null): Promise<PoolPersonaRow[]> {
  const columns = {
    fromName: schema.senderAccounts.fromName,
    senderName: schema.senderAccounts.senderName,
    signature: schema.senderAccounts.signature,
  };
  const live = and(eq(schema.senderAccounts.status, "active"), isNull(schema.senderAccounts.deletedAt));
  if (campaignId) {
    return db
      .select(columns)
      .from(schema.campaignSenders)
      .innerJoin(schema.senderAccounts, eq(schema.campaignSenders.senderId, schema.senderAccounts.id))
      .where(and(eq(schema.campaignSenders.campaignId, campaignId), live))
      .orderBy(asc(schema.senderAccounts.createdAt));
  }
  return db
    .select(columns)
    .from(schema.senderAccounts)
    .where(and(eq(schema.senderAccounts.isSystemPool, true), live))
    .orderBy(asc(schema.senderAccounts.createdAt));
}

/** One example persona (and the pool size), or null when there is no mailbox to show. */
export async function loadSendingPersona(db: Db, campaignId?: string | null): Promise<SamplePersona | null> {
  const rows = await loadSendingPersonaRows(db, campaignId).catch(() => [] as PoolPersonaRow[]);
  const persona = samplePersonaFor(rows, 0);
  return persona.poolSize > 0 ? persona : null;
}
