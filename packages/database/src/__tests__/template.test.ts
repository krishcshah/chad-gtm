import { beforeAll, describe, expect, it } from "vitest";
import { extractVariables, renderTemplate, validateTemplateSyntax } from "../template";
import { decryptSecret, encryptSecret } from "../crypto";

describe("renderTemplate", () => {
  it("replaces simple variables", () => {
    expect(renderTemplate("Hi {{first_name}}!", { first_name: "Ada" })).toBe("Hi Ada!");
  });
  it("is case-insensitive and whitespace tolerant", () => {
    expect(renderTemplate("{{ First_Name }}", { first_name: "Ada" })).toBe("Ada");
  });
  it("uses fallbacks when the value is missing", () => {
    expect(renderTemplate("Hi {{first_name | \"there\"}}", {})).toBe("Hi there");
    expect(renderTemplate("Hi {{first_name | 'friend'}}", { first_name: "" })).toBe("Hi friend");
    expect(renderTemplate("Hi {{first_name | pal}}", {})).toBe("Hi pal");
  });
  it("renders unknown variables as empty string", () => {
    expect(renderTemplate("[{{unknown}}]", {})).toBe("[]");
  });
  it("renders custom fields", () => {
    expect(renderTemplate("{{icebreaker}} → {{company}}", { icebreaker: "nice post", company: "Acme" })).toBe(
      "nice post → Acme",
    );
  });
  it("collapses whitespace in values", () => {
    expect(renderTemplate("{{x}}", { x: "  a\n b  " })).toBe("a b");
  });
  it("interoperates between camelCase and snake_case variables", () => {
    expect(renderTemplate("Hi {{firstName}} at {{company}}!", { first_name: "Ada", company: "Acme" })).toBe("Hi Ada at Acme!");
    expect(renderTemplate("Hi {{first_name}}!", { firstName: "Ada" })).toBe("Hi Ada!");
  });
});

describe("extractVariables", () => {
  it("finds unique lowercase variables", () => {
    expect(extractVariables("{{First_Name}} x {{first_name}} y {{company | \"co\"}}")).toEqual([
      "first_name",
      "company",
    ]);
  });
});

describe("validateTemplateSyntax", () => {
  it("flags unbalanced braces", () => {
    expect(validateTemplateSyntax("{{oops")).not.toHaveLength(0);
    expect(validateTemplateSyntax("{{ok}}")).toHaveLength(0);
  });
});

describe("crypto", () => {
  // A stable key so the crypto round-trip is self-contained in CI/no-env runs.
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });
  it("round-trips a secret", () => {
    const enc = encryptSecret("super-secret-pw");
    expect(enc).not.toContain("super-secret-pw");
    expect(decryptSecret(enc)).toBe("super-secret-pw");
  });
  it("handles empty strings", () => {
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret("")).toBe("");
  });
});
