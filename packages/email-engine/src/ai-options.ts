/**
 * Resolve the AI provider/key/model a workspace owner configured in Settings,
 * from inside the engine. Mirrors apps/web/lib/ai.ts#getWorkspaceAiOptions so
 * send-time generation and the reply agent use the same model the user picked.
 */
import { eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { decryptSecret } from "@smartreach/database/crypto";
import type { EngineDb } from "./db-port";
import type { AiEngineOptions } from "./ai";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: AiEngineOptions }>();

export function systemAiOptions(): AiEngineOptions {
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  const openai = process.env.OPENAI_API_KEY || null;
  if (!gemini && openai) return { apiKey: openai, provider: "openai", model: "gpt-5-mini" };
  return { apiKey: gemini, provider: "google", model: "gemini-3.8-flash" };
}

export async function loadEngineAiOptions(db: EngineDb, userId: string): Promise<AiEngineOptions> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let value: AiEngineOptions = systemAiOptions();
  try {
    const rows: any[] = await db
      .select({
        aiApiKeyEnc: schema.workspaceSettings.aiApiKeyEnc,
        aiProvider: schema.workspaceSettings.aiProvider,
        aiModel: schema.workspaceSettings.aiModel,
      })
      .from(schema.workspaceSettings)
      .where(eq(schema.workspaceSettings.userId, userId))
      .limit(1);
    const row = rows[0];
    if (row) {
      const provider = String(row.aiProvider || "google").toLowerCase() === "openai" ? "openai" : "google";
      let key: string | null = null;
      if (row.aiApiKeyEnc) {
        try {
          key = decryptSecret(row.aiApiKeyEnc);
        } catch {
          key = null;
        }
      }
      const envKey =
        provider === "openai"
          ? process.env.OPENAI_API_KEY || null
          : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
      if (key || envKey) {
        value = {
          apiKey: key || envKey,
          provider,
          model: row.aiModel || (provider === "openai" ? "gpt-5-mini" : "gemini-3.8-flash"),
        };
      }
    }
  } catch {
    // Settings table unavailable — keep system defaults.
  }
  cache.set(userId, { at: Date.now(), value });
  return value;
}
