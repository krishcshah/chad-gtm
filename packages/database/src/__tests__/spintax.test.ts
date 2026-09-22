import { describe, expect, it } from "vitest";
import { expandSpintax, hasSpintax } from "../spintax";
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
