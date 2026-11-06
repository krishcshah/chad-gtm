/**
 * Pure helpers for rotating ENCRYPTION_KEY (see scripts/rotate-encryption-key.ts).
 *
 * The cipher format and key derivation must stay byte-for-byte identical to
 * ./crypto.ts ("<iv_hex>:<authTag_hex>:<ciphertext_hex>", AES-256-GCM, a
 * 64-hex key used as-is, any other non-empty key hashed with SHA-256). The
 * tests check that compatibility against crypto.ts itself.
 *
 * Nothing here touches a database or process.env, and nothing returned ever
 * contains a plaintext secret except the re-encrypted value to write back.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Every column written with encryptSecret() anywhere in the repo. */
export interface EncryptedColumnTarget {
  table: string;
  idColumn: string;
  columns: string[];
}

export const ENCRYPTED_COLUMNS: EncryptedColumnTarget[] = [
  // apps/web/lib/actions.ts, senders.ts, admin-gtm-actions.ts
  { table: "sender_accounts", idColumn: "id", columns: ["smtp_password_enc", "imap_password_enc"] },
  // apps/web/lib/actions.ts (Settings → AI key)
  { table: "workspace_settings", idColumn: "user_id", columns: ["ai_api_key_enc"] },
];

const HEX_KEY = /^[0-9a-fA-F]{64}$/;
const PAYLOAD = /^[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+$/;

/** Same derivation as crypto.ts getKey(), but for an explicit key string. */
export function deriveKey(raw: string): Buffer {
  const value = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (HEX_KEY.test(value)) return Buffer.from(value, "hex");
  if (value.length > 0) return createHash("sha256").update(value).digest();
  throw new Error("Encryption key is empty");
}

export function encryptWithKey(plaintext: string, key: Buffer): string {
  if (!plaintext) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptWithKey(payload: string, key: Buffer): string {
  if (!payload) return "";
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString(
    "utf8",
  );
}

/** True when a stored value has the shape encryptSecret() produces. */
export function looksEncrypted(value: string): boolean {
  return PAYLOAD.test(value);
}

/**
 * Validate the two keys before touching any data. The new key must be the
 * canonical 64-hex form, because apps/web/lib/env.ts rejects anything else in
 * production.
 */
export function validateRotationKeys(
  oldRaw: string | undefined,
  newRaw: string | undefined,
): { oldKey: Buffer; newKey: Buffer } {
  const oldValue = (oldRaw ?? "").trim().replace(/^["']|["']$/g, "");
  const newValue = (newRaw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!oldValue) throw new Error("OLD_ENCRYPTION_KEY is not set");
  if (!newValue) throw new Error("NEW_ENCRYPTION_KEY is not set");
  if (!HEX_KEY.test(newValue)) {
    throw new Error(
      "NEW_ENCRYPTION_KEY must be 64 hex characters. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const oldKey = deriveKey(oldValue);
  const newKey = deriveKey(newValue);
  if (oldKey.equals(newKey)) throw new Error("OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY are the same key");
  return { oldKey, newKey };
}

export type CellOutcome = "empty" | "rotated" | "already_new" | "malformed" | "failed";

export interface ColumnStats {
  table: string;
  column: string;
  rows: number;
  empty: number;
  rotated: number;
  alreadyNew: number;
  malformed: number;
  failed: number;
}

export interface CellUpdate {
  table: string;
  idColumn: string;
  id: string;
  column: string;
  /** New ciphertext under the new key. Never a plaintext. */
  value: string;
}

export interface CellProblem {
  table: string;
  id: string;
  column: string;
  outcome: "malformed" | "failed";
  reason: string;
}

export interface RotationPlan {
  updates: CellUpdate[];
  stats: ColumnStats[];
  problems: CellProblem[];
}

export function classifyCell(
  value: unknown,
  oldKey: Buffer,
  newKey: Buffer,
  encrypt: (plaintext: string, key: Buffer) => string = encryptWithKey,
): { outcome: CellOutcome; value?: string; reason?: string } {
  if (value === null || value === undefined || value === "") return { outcome: "empty" };
  if (typeof value !== "string") return { outcome: "malformed", reason: "not a string" };
  if (!looksEncrypted(value)) return { outcome: "malformed", reason: "not in iv:tag:ciphertext form" };

  let plaintext: string;
  try {
    plaintext = decryptWithKey(value, oldKey);
  } catch {
    try {
      decryptWithKey(value, newKey);
      return { outcome: "already_new" };
    } catch {
      return { outcome: "failed", reason: "does not decrypt with the old or the new key" };
    }
  }

  const rotated = encrypt(plaintext, newKey);
  let roundTrip: string | null = null;
  try {
    roundTrip = decryptWithKey(rotated, newKey);
  } catch {
    roundTrip = null;
  }
  if (roundTrip !== plaintext) {
    return { outcome: "failed", reason: "re-encrypted value did not verify under the new key" };
  }
  return { outcome: "rotated", value: rotated };
}

/**
 * Decide, for every encrypted cell of one table, what the rotation would do.
 * Rows are plain objects keyed by column name (as returned by node-postgres).
 */
export function planTableRotation(
  target: EncryptedColumnTarget,
  rows: Array<Record<string, unknown>>,
  oldKey: Buffer,
  newKey: Buffer,
  encrypt: (plaintext: string, key: Buffer) => string = encryptWithKey,
): RotationPlan {
  const stats: ColumnStats[] = target.columns.map((column) => ({
    table: target.table,
    column,
    rows: rows.length,
    empty: 0,
    rotated: 0,
    alreadyNew: 0,
    malformed: 0,
    failed: 0,
  }));
  const updates: CellUpdate[] = [];
  const problems: CellProblem[] = [];

  for (const row of rows) {
    const id = String(row[target.idColumn]);
    target.columns.forEach((column, i) => {
      const s = stats[i];
      const result = classifyCell(row[column], oldKey, newKey, encrypt);
      switch (result.outcome) {
        case "empty":
          s.empty++;
          break;
        case "already_new":
          s.alreadyNew++;
          break;
        case "rotated":
          s.rotated++;
          updates.push({ table: target.table, idColumn: target.idColumn, id, column, value: result.value! });
          break;
        case "malformed":
        case "failed":
          if (result.outcome === "malformed") s.malformed++;
          else s.failed++;
          problems.push({ table: target.table, id, column, outcome: result.outcome, reason: result.reason ?? "" });
          break;
      }
    });
  }
  return { updates, stats, problems };
}

export function mergePlans(plans: RotationPlan[]): RotationPlan {
  return {
    updates: plans.flatMap((p) => p.updates),
    stats: plans.flatMap((p) => p.stats),
    problems: plans.flatMap((p) => p.problems),
  };
}

/**
 * Whether the plan may be applied. Any cell that does not decrypt blocks the
 * rotation; malformed (never-encrypted) values block it too unless the
 * operator explicitly chose to leave them untouched.
 */
export function blockingProblems(plan: RotationPlan, leaveMalformed: boolean): CellProblem[] {
  return plan.problems.filter((p) => p.outcome === "failed" || !leaveMalformed);
}
