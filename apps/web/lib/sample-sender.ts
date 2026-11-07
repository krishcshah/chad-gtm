/**
 * Which pool mailbox persona a sample email is shown as sent from.
 *
 * Real autopilot emails rotate across the shared AutoGTM mailbox pool, one
 * persona per lead, so samples rotate the same way instead of all showing one
 * name. Only pool mailboxes are ever passed in: a client's own mailbox name
 * must never appear in another client's samples. No address is returned.
 */
import { extractSenderFirstName } from "@smartreach/email-engine";
import { stripWarmupMarker } from "./sender-warmup";

export interface PoolPersonaRow {
  fromName: string | null;
  senderName: string | null;
  signature: string | null;
}

export interface SamplePersona {
  /** Display name the lead sees ("Dana Lee"); '' when the pool is empty. */
  name: string;
  /** First name used to sign the sample body. */
  firstName: string;
  /** The mailbox signature, warm-up marker removed. */
  signature: string;
  /** How many pool mailboxes real emails rotate across. */
  poolSize: number;
}

export function samplePersonaFor(pool: PoolPersonaRow[], index: number): SamplePersona {
  const n = pool.length;
  if (n === 0) {
    return { name: "", firstName: extractSenderFirstName(null), signature: "", poolSize: 0 };
  }
  const i = ((Math.floor(index) % n) + n) % n;
  const row = pool[i]!;
  const name = (row.fromName || row.senderName || "").trim();
  return {
    name,
    firstName: extractSenderFirstName({ fromName: row.fromName, senderName: row.senderName }),
    signature: stripWarmupMarker(row.signature || ""),
    poolSize: n,
  };
}
