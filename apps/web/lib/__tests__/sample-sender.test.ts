import { describe, expect, it } from "vitest";
import { samplePersonaFor } from "../sample-sender";

const pool = [
  { fromName: "Dana Lee", senderName: null, signature: "Dana Lee\nGrowth" },
  { fromName: null, senderName: "sam ortiz", signature: "Sam<!--SR_WARMUP:{\"day\":3}-->" },
  { fromName: "Priya Nair", senderName: "Priya", signature: null },
];

describe("samplePersonaFor (#71)", () => {
  it("rotates personas across the pool by sample index", () => {
    expect(samplePersonaFor(pool, 0)).toMatchObject({ name: "Dana Lee", firstName: "Dana", poolSize: 3 });
    expect(samplePersonaFor(pool, 1)).toMatchObject({ name: "sam ortiz", firstName: "Sam", poolSize: 3 });
    expect(samplePersonaFor(pool, 2)).toMatchObject({ name: "Priya Nair", firstName: "Priya", signature: "" });
    // Wraps around, so adaptive batches (offset + idx) keep rotating.
    expect(samplePersonaFor(pool, 4).name).toBe("sam ortiz");
    expect(samplePersonaFor(pool, 12).name).toBe("Dana Lee");
  });

  it("strips the warm-up marker from the signature", () => {
    const persona = samplePersonaFor(pool, 1);
    expect(persona.signature).toBe("Sam");
    expect(persona.signature).not.toContain("SR_WARMUP");
    expect(samplePersonaFor(pool, 0).signature).toBe("Dana Lee\nGrowth");
  });

  it("returns poolSize 0 and the default first name for an empty pool", () => {
    expect(samplePersonaFor([], 5)).toEqual({ name: "", firstName: "Alex", signature: "", poolSize: 0 });
  });

  it("never exposes an address", () => {
    const persona = samplePersonaFor([{ fromName: "", senderName: "", signature: "" }], 0);
    expect(Object.keys(persona).sort()).toEqual(["firstName", "name", "poolSize", "signature"]);
  });
});
