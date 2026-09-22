import { describe, expect, it } from "vitest";
import {
  expandSuppressionImportLines,
  parseSuppressionToken,
  suppressionImportSchema,
  suppressionListQuerySchema,
} from "../index";

describe("suppressionListQuerySchema (F15a)", () => {
  it("defaults limit to 50 and accepts search + kind", () => {
    const parsed = suppressionListQuerySchema.safeParse({
      search: "blocked",
      kind: "domain",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(50);
      expect(parsed.data.search).toBe("blocked");
      expect(parsed.data.kind).toBe("domain");
    }
  });

  it("caps limit at 200", () => {
    const parsed = suppressionListQuerySchema.safeParse({ limit: 500 });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown kind", () => {
    const parsed = suppressionListQuerySchema.safeParse({ kind: "phone" });
    expect(parsed.success).toBe(false);
  });
});

describe("parseSuppressionToken (F15a import)", () => {
  it("parses emails", () => {
    expect(parseSuppressionToken("  Ada@Example.COM ")).toEqual({
      ok: true,
      value: "ada@example.com",
      kind: "email",
    });
  });

  it("parses @domain and bare domain", () => {
    expect(parseSuppressionToken("@Blocked.IO")).toEqual({
      ok: true,
      value: "@blocked.io",
      kind: "domain",
    });
    expect(parseSuppressionToken("spam.example.com")).toEqual({
      ok: true,
      value: "@spam.example.com",
      kind: "domain",
    });
  });

  it("rejects invalid tokens", () => {
    expect(parseSuppressionToken("").ok).toBe(false);
    expect(parseSuppressionToken("   ").ok).toBe(false);
    expect(parseSuppressionToken("not-an-email").ok).toBe(false);
    expect(parseSuppressionToken("@").ok).toBe(false);
    expect(parseSuppressionToken("a@").ok).toBe(false);
  });
});

describe("suppressionImportSchema + expand (F15a)", () => {
  it("accepts lines array", () => {
    const parsed = suppressionImportSchema.safeParse({
      lines: ["a@b.com", "@x.io"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const expanded = expandSuppressionImportLines(parsed.data);
      expect(expanded).toEqual({ ok: true, lines: ["a@b.com", "@x.io"] });
    }
  });

  it("splits text on newlines and commas", () => {
    const parsed = suppressionImportSchema.safeParse({
      text: "a@b.com\n@bad.io, spam.com\n",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const expanded = expandSuppressionImportLines(parsed.data);
      expect(expanded.ok).toBe(true);
      if (expanded.ok) {
        expect(expanded.lines).toEqual(["a@b.com", "@bad.io", "spam.com"]);
      }
    }
  });

  it("rejects more than 10k lines", () => {
    const lines = Array.from({ length: 10_001 }, (_, i) => `u${i}@x.com`);
    const parsed = suppressionImportSchema.safeParse({ lines });
    expect(parsed.success).toBe(false);
  });
});
