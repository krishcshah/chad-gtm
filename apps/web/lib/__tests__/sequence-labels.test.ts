import { describe, expect, it } from "vitest";
import { AI_NO_PROMPT_LABEL, AI_WRITTEN_LABEL, aiCopyState } from "../sequence-labels";

describe("aiCopyState", () => {
  it("says 'ai_no_prompt' when the toggle is on but the instructions are empty or blank", () => {
    expect(aiCopyState([{ aiGenerateOnTheFly: true, aiPrompt: "" }])).toBe("ai_no_prompt");
    expect(aiCopyState([{ aiGenerateOnTheFly: true, aiPrompt: "   \n " }])).toBe("ai_no_prompt");
    expect(aiCopyState([{ aiGenerateOnTheFly: true, aiPrompt: null }])).toBe("ai_no_prompt");
    expect(aiCopyState([{ aiGenerateOnTheFly: true }])).toBe("ai_no_prompt");
  });

  it("says 'ai' only when the toggle is on and there are instructions (as the engine requires)", () => {
    expect(aiCopyState([{ aiGenerateOnTheFly: true, aiPrompt: "Mention their latest funding round." }])).toBe("ai");
  });

  it("says 'fixed' when the toggle is off, even with instructions", () => {
    expect(aiCopyState([{ aiGenerateOnTheFly: false, aiPrompt: "Write something" }])).toBe("fixed");
    expect(aiCopyState([{}])).toBe("fixed");
    expect(aiCopyState([])).toBe("fixed");
  });

  it("says 'ai' for a mixed A/B where only variant B has instructions", () => {
    expect(
      aiCopyState([
        { aiGenerateOnTheFly: true, aiPrompt: "" },
        { aiGenerateOnTheFly: true, aiPrompt: "Open with their job title." },
      ]),
    ).toBe("ai");
    expect(
      aiCopyState([
        { aiGenerateOnTheFly: false, aiPrompt: "" },
        { aiGenerateOnTheFly: true, aiPrompt: "Open with their job title." },
      ]),
    ).toBe("ai");
  });

  it("uses plain labels", () => {
    expect(AI_WRITTEN_LABEL).toBe("Written by AI for each lead");
    expect(AI_NO_PROMPT_LABEL).toBe("AI on, but no instructions: everyone gets this copy");
  });
});
