import { describe, expect, it } from "vitest";
import { ensureOutreachSpintax, expandSpintax, hasSpintax } from "../spintax";
import { pickVariantEqualWeight } from "../sequence-pick";

describe("expandSpintax", () => {
  it("picks one alternative deterministically with seeded rand", () => {
    expect(expandSpintax("{Hi|Hello|Hey}", () => 0)).toBe("Hi");
  });
  it("picks last when rand ~1", () => {
    expect(expandSpintax("{Hi|Hello|Hey}", () => 0.99)).toBe("Hey");
  });
  it("leaves non-spintax braces alone", () => {
    expect(expandSpintax("{alone}", () => 0)).toBe("{alone}");
  });
  it("supports nesting", () => {
    expect(expandSpintax("{A|{B|C}}", () => 0)).toBe("A");
  });
  it("hasSpintax detects groups", () => {
    expect(hasSpintax("{a|b}")).toBe(true);
    expect(hasSpintax("plain")).toBe(false);
  });
});

describe("ensureOutreachSpintax", () => {
  it("spins greetings, sign-offs and CTAs without touching merge vars", () => {
    const input = "Hi {{first_name}},\n\nQuick thought on your pipeline.\n\nWorth a quick look?\n\nBest,\nAlex";
    const out = ensureOutreachSpintax(input);
    expect(out).toContain("{Hi|Hey|Hello} {{first_name}},");
    expect(out).toContain("{Best|Thanks|Cheers},");
    expect(out).toContain("{Worth a|Open to a}");
    expect(out).not.toContain("{{first_name|");
    expect(hasSpintax(out)).toBe(true);
  });

  it("keeps HTML greeting markup intact", () => {
    const out = ensureOutreachSpintax("<p>Hello Sarah,</p><p>Open to a quick look?</p><p>Best,</p>");
    expect(out).toContain("<p>{Hi|Hey|Hello} Sarah,</p>");
    expect(out).toContain("{Best|Thanks|Cheers},");
  });

  it("is idempotent enough for a retry", () => {
    const once = ensureOutreachSpintax("Hi Sam,\n\nWorth a quick look?\n\nBest,");
    const twice = ensureOutreachSpintax(once);
    expect(twice.match(/\{Hi\|Hey\|Hello\}/g)?.length).toBe(1);
  });
});

describe("pickVariantEqualWeight", () => {
  it("returns sole active variant", () => {
    expect(pickVariantEqualWeight([{ weight: 50, id: "a" }], () => 0)?.id).toBe("a");
  });
  it("skips paused", () => {
    const v = pickVariantEqualWeight(
      [
        { weight: 50, id: "a", pausedAt: "2026-01-01T00:00:00.000Z" },
        { weight: 50, id: "b" },
      ],
      () => 0,
    );
    expect(v?.id).toBe("b");
  });
  it("50/50 picks A then B with seeded rand", () => {
    const variants = [
      { weight: 50, id: "A" },
      { weight: 50, id: "B" },
    ];
    expect(pickVariantEqualWeight(variants, () => 0.1)?.id).toBe("A");
    expect(pickVariantEqualWeight(variants, () => 0.9)?.id).toBe("B");
  });
});
