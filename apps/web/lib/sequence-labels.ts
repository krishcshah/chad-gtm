/**
 * Labels for how a sequence step's copy is written. Pure and client-safe.
 *
 * Mirrors the engine (packages/email-engine/src/sequence.ts): AI rewrites an
 * email only when the variant has "Generate on the fly" on AND non-blank
 * instructions. With the toggle on and no instructions, everyone gets the
 * fixed copy, so the summaries must not claim the email is AI-written.
 */

export const AI_WRITTEN_LABEL = "Written by AI for each lead";
export const AI_NO_PROMPT_LABEL = "AI on, but no instructions: everyone gets this copy";

export type AiCopyState = "ai" | "ai_no_prompt" | "fixed";

export function aiCopyState(
  variants: ReadonlyArray<{ aiGenerateOnTheFly?: boolean; aiPrompt?: string | null }>,
): AiCopyState {
  const toggled = variants.filter((v) => v.aiGenerateOnTheFly);
  if (toggled.length === 0) return "fixed";
  return toggled.some((v) => (v.aiPrompt ?? "").trim().length > 0) ? "ai" : "ai_no_prompt";
}
