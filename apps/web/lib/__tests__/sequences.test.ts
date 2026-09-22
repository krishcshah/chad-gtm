import { describe, expect, it } from "vitest";
import { pickVariantEqualWeight, previewSequenceContent } from "../sequences";

describe("previewSequenceContent", () => {
  it("merges vars and expands spintax", () => {
    const result = previewSequenceContent({
      subject: "{Hi|Hi} {{first_name}}",
      bodyText: "About {{company}}",
      bodyHtml: "<p>About {{company}}</p>",
      sampleVars: { first_name: "Ada", company: "Acme" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data!.subject).toBe("Hi Ada");
      expect(result.data!.bodyText).toBe("About Acme");
      expect(result.data!.bodyHtml).toContain("Acme");
    }
  });
});

describe("pickVariantEqualWeight re-export", () => {
  it("returns null when all paused", () => {
    expect(
      pickVariantEqualWeight([
        { weight: 50, pausedAt: "x" },
        { weight: 50, pausedAt: "y" },
      ]),
    ).toBeNull();
  });
});
