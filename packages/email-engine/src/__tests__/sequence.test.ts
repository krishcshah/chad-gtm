import { describe, expect, it } from "vitest";
import { expandSpintax, renderTemplate } from "@smartreach/database";
import { addCalendarDays } from "@smartreach/shared";
import { renderWithVarsAndSpintax } from "../sequence";

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
