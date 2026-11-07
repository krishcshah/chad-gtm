/**
 * The AI provider/key/model used for research, copy and the reply agent.
 * AutoGTM manages the model; stored per-user keys are ignored. This is the
 * one resolver: the web app (apps/web/lib/ai.ts) imports it from here, so
 * web and engine always use the same model.
 */
import type { EngineDb } from "./db-port";
import type { AiEngineOptions } from "./ai";

/** The managed model, from the server's environment. */
export function systemAiOptions(): AiEngineOptions {
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  const openai = process.env.OPENAI_API_KEY || null;
  if (!gemini && openai) return { apiKey: openai, provider: "openai", model: "gpt-5-mini" };
  return { apiKey: gemini, provider: "google", model: "gemini-3.8-flash" };
}

/**
 * The options for a workspace owner's AI calls. AutoGTM manages the model:
 * any key, provider or model stored in workspace_settings is ignored, and the
 * db is not read. The signature stays for the existing callers.
 */
export async function loadEngineAiOptions(_db: EngineDb, _userId: string): Promise<AiEngineOptions> {
  return systemAiOptions();
}
