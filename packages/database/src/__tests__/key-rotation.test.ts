import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../crypto";
import {
  blockingProblems,
  classifyCell,
  decryptWithKey,
  deriveKey,
  encryptWithKey,
  ENCRYPTED_COLUMNS,
  mergePlans,
  planTableRotation,
  validateRotationKeys,
} from "../key-rotation";

const OLD_HEX = "a".repeat(64);
const NEW_HEX = "b".repeat(64);
const savedKey = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = savedKey;
});

describe("compatibility with crypto.ts", () => {
  it("decrypts what encryptSecret wrote with a 64-hex key", () => {
    process.env.ENCRYPTION_KEY = OLD_HEX;
    const payload = encryptSecret("smtp-pass");
    expect(decryptWithKey(payload, deriveKey(OLD_HEX))).toBe("smtp-pass");
  });

  it("derives non-hex keys the same way crypto.ts does", () => {
    process.env.ENCRYPTION_KEY = "some passphrase that is not hex";
    const payload = encryptSecret("imap-pass");
    expect(decryptWithKey(payload, deriveKey("some passphrase that is not hex"))).toBe("imap-pass");
  });

  it("writes values that decryptSecret reads with the new key", () => {
    const payload = encryptWithKey("ai-key", deriveKey(NEW_HEX));
    process.env.ENCRYPTION_KEY = NEW_HEX;
    expect(decryptSecret(payload)).toBe("ai-key");
  });

  it("tolerates quotes and whitespace copied from an env file", () => {
    expect(deriveKey(`"${OLD_HEX}"`).equals(deriveKey(OLD_HEX))).toBe(true);
    expect(deriveKey(` ${OLD_HEX}\n`).equals(deriveKey(OLD_HEX))).toBe(true);
  });
});

describe("validateRotationKeys", () => {
  it("requires both keys", () => {
    expect(() => validateRotationKeys("", NEW_HEX)).toThrow(/OLD_ENCRYPTION_KEY/);
    expect(() => validateRotationKeys(OLD_HEX, undefined)).toThrow(/NEW_ENCRYPTION_KEY/);
  });

  it("requires a 64-hex new key", () => {
    expect(() => validateRotationKeys(OLD_HEX, "short-passphrase")).toThrow(/64 hex/);
  });

  it("accepts a non-hex old key", () => {
    const { oldKey } = validateRotationKeys("legacy passphrase", NEW_HEX);
    expect(oldKey.length).toBe(32);
  });

  it("refuses identical keys, including case differences", () => {
    expect(() => validateRotationKeys(OLD_HEX, OLD_HEX.toUpperCase())).toThrow(/same key/);
  });
});

describe("classifyCell", () => {
  const oldKey = deriveKey(OLD_HEX);
  const newKey = deriveKey(NEW_HEX);

  it("treats null and empty values as empty", () => {
    expect(classifyCell(null, oldKey, newKey).outcome).toBe("empty");
    expect(classifyCell("", oldKey, newKey).outcome).toBe("empty");
  });

  it("re-encrypts a value under the new key", () => {
    const res = classifyCell(encryptWithKey("pw", oldKey), oldKey, newKey);
    expect(res.outcome).toBe("rotated");
    expect(decryptWithKey(res.value!, newKey)).toBe("pw");
    expect(() => decryptWithKey(res.value!, oldKey)).toThrow();
  });

  it("skips a value already under the new key", () => {
    expect(classifyCell(encryptWithKey("pw", newKey), oldKey, newKey).outcome).toBe("already_new");
  });

  it("fails a value encrypted with an unknown key", () => {
    const other = deriveKey("c".repeat(64));
    const res = classifyCell(encryptWithKey("pw", other), oldKey, newKey);
    expect(res.outcome).toBe("failed");
    expect(res.value).toBeUndefined();
  });

  it("fails a tampered value", () => {
    const payload = encryptWithKey("pw", oldKey);
    const tampered = payload.slice(0, -2) + (payload.endsWith("00") ? "11" : "00");
    expect(classifyCell(tampered, oldKey, newKey).outcome).toBe("failed");
  });

  it("marks placeholder values as malformed", () => {
    expect(classifyCell("enc_demo_smtp_sec", oldKey, newKey).outcome).toBe("malformed");
    expect(classifyCell(42, oldKey, newKey).outcome).toBe("malformed");
  });

  it("fails when the re-encrypted value does not verify", () => {
    const broken = () => "00:00:00";
    expect(classifyCell(encryptWithKey("pw", oldKey), oldKey, newKey, broken).outcome).toBe("failed");
  });
});

describe("planTableRotation", () => {
  const oldKey = deriveKey(OLD_HEX);
  const newKey = deriveKey(NEW_HEX);
  const senders = ENCRYPTED_COLUMNS.find((t) => t.table === "sender_accounts")!;

  it("counts every outcome and produces updates only for rotated cells", () => {
    const rows = [
      { id: "s1", smtp_password_enc: encryptWithKey("a", oldKey), imap_password_enc: "" },
      { id: "s2", smtp_password_enc: encryptWithKey("b", oldKey), imap_password_enc: encryptWithKey("c", oldKey) },
      { id: "s3", smtp_password_enc: encryptWithKey("d", newKey), imap_password_enc: "enc_demo_imap_sec" },
    ];
    const plan = planTableRotation(senders, rows, oldKey, newKey);

    expect(plan.updates.map((u) => `${u.id}.${u.column}`)).toEqual([
      "s1.smtp_password_enc",
      "s2.smtp_password_enc",
      "s2.imap_password_enc",
    ]);
    expect(plan.updates.every((u) => u.idColumn === "id")).toBe(true);
    const smtp = plan.stats.find((s) => s.column === "smtp_password_enc")!;
    const imap = plan.stats.find((s) => s.column === "imap_password_enc")!;
    expect(smtp).toMatchObject({ rows: 3, rotated: 2, alreadyNew: 1, empty: 0, failed: 0, malformed: 0 });
    expect(imap).toMatchObject({ rows: 3, rotated: 1, empty: 1, malformed: 1, failed: 0 });
    expect(plan.problems).toEqual([
      { table: "sender_accounts", id: "s3", column: "imap_password_enc", outcome: "malformed", reason: expect.any(String) },
    ]);
  });

  it("never puts plaintext in updates or problems", () => {
    const secret = "super-secret-mailbox-password";
    const rows = [
      { id: "s1", smtp_password_enc: encryptWithKey(secret, oldKey), imap_password_enc: "" },
      { id: "s2", smtp_password_enc: encryptWithKey(secret, deriveKey("e".repeat(64))), imap_password_enc: "" },
    ];
    const plan = planTableRotation(senders, rows, oldKey, newKey);
    expect(JSON.stringify(plan)).not.toContain(secret);
  });

  it("uses the table's own id column", () => {
    const settings = ENCRYPTED_COLUMNS.find((t) => t.table === "workspace_settings")!;
    const plan = planTableRotation(
      settings,
      [{ user_id: "u1", ai_api_key_enc: encryptWithKey("key", oldKey) }, { user_id: "u2", ai_api_key_enc: null }],
      oldKey,
      newKey,
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ table: "workspace_settings", idColumn: "user_id", id: "u1" });
  });
});

describe("blockingProblems", () => {
  const oldKey = deriveKey(OLD_HEX);
  const newKey = deriveKey(NEW_HEX);
  const senders = ENCRYPTED_COLUMNS[0];
  const plan = mergePlans([
    planTableRotation(
      senders,
      [
        { id: "s1", smtp_password_enc: "placeholder", imap_password_enc: "" },
        { id: "s2", smtp_password_enc: encryptWithKey("x", deriveKey("f".repeat(64))), imap_password_enc: "" },
      ],
      oldKey,
      newKey,
    ),
  ]);

  it("blocks on malformed values unless they are explicitly left alone", () => {
    expect(blockingProblems(plan, false).map((p) => p.id)).toEqual(["s1", "s2"]);
    expect(blockingProblems(plan, true).map((p) => p.id)).toEqual(["s2"]);
  });

  it("covers every encryptSecret column in the schema", () => {
    expect(ENCRYPTED_COLUMNS.flatMap((t) => t.columns.map((c) => `${t.table}.${c}`))).toEqual([
      "sender_accounts.smtp_password_enc",
      "sender_accounts.imap_password_enc",
      "workspace_settings.ai_api_key_enc",
    ]);
  });
});
