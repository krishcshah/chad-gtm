import { describe, expect, it } from "vitest";
import { expandSpintax, renderTemplate } from "@smartreach/database";
import { addCalendarDays } from "@smartreach/shared";
import { parseAiPromptPayload, renderWithVarsAndSpintax } from "../sequence";

describe("renderWithVarsAndSpintax", () => {
  it("expands spintax then merges vars", () => {
    const out = renderWithVarsAndSpintax("{Hi|Hello} {{first_name}}", {
      first_name: "Ada",
    });
    expect(out === "Hi Ada" || out === "Hello Ada").toBe(true);
  });
  it("resolves vars inside a spin (vars first, then spintax)", () => {
    const out = renderWithVarsAndSpintax("{Hey {{first_name}}|Yo}", {
      first_name: "Ada",
    });
    // vars-first → "{Hey Ada|Yo}" → expand → "Hey Ada" (rand=not seeded; both branches ok if Yo)
    expect(out === "Hey Ada" || out === "Yo").toBe(true);
    // prove pipeline pieces
    const afterVars = renderTemplate("{Hey {{first_name}}|Yo}", { first_name: "Ada" });
    expect(afterVars).toBe("{Hey Ada|Yo}");
    expect(expandSpintax(afterVars, () => 0)).toBe("Hey Ada");
  });
});

describe("addCalendarDays", () => {
  it("adds N calendar days in UTC", () => {
    const d = new Date("2026-09-22T10:00:00.000Z");
    expect(addCalendarDays(d, 3).toISOString()).toBe("2026-09-25T10:00:00.000Z");
    expect(addCalendarDays(d, 0).toISOString()).toBe("2026-09-22T10:00:00.000Z");
  });
});

describe("parseAiPromptPayload", () => {
  it("reads the structured campaign envelope", () => {
    const payload = parseAiPromptPayload(
      JSON.stringify({
        instruction: "Write a first touch.",
        context: { companyName: "Acme", valueProposition: "Close faster" },
        styleExamples: [{ subject: "close speed", bodyText: "Hi Sam,..." }],
        negativeConstraints: ["No fluff"],
        requireSpintax: true,
      })
    );
    expect(payload.instruction).toBe("Write a first touch.");
    expect(payload.campaignContext?.companyName).toBe("Acme");
    expect(payload.styleExamples?.[0]?.subject).toBe("close speed");
    expect(payload.requireSpintax).toBe(true);
  });

  it("infers context from a legacy plain-text prompt", () => {
    const payload = parseAiPromptPayload(
      "Product/Company: Acme. Core Value Offer: Close books faster. Call to Action: Worth a look?"
    );
    expect(payload.campaignContext?.companyName).toBe("Acme");
    expect(payload.campaignContext?.valueProposition).toBe("Close books faster");
    expect(payload.campaignContext?.isOutboundInfrastructure).toBe(false);
  });

  it("flags legacy infrastructure prompts so the DNS path is preserved", () => {
    const payload = parseAiPromptPayload(
      "Product/Company: AutoGTM. Value Offer: pre-warmed mailboxes and DNS setup."
    );
    expect(payload.campaignContext?.isOutboundInfrastructure).toBe(true);
  });
});
