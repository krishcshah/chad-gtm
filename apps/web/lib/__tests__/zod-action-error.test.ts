import { describe, expect, it } from "vitest";
import { formatZodActionError } from "../zod-action-error";

describe("formatZodActionError", () => {
  it("names missing campaign fields instead of a generic banner", () => {
    const result = formatZodActionError([
      { path: ["leadListId"], message: "Required" },
      { path: ["senderIds"], message: "Expected array, received undefined" },
    ]);
    expect(result.fieldErrors.leadListId).toEqual(["Lead list is required"]);
    expect(result.fieldErrors.senderIds).toEqual(["Select at least one sender"]);
    expect(result.error).toBe("Lead list is required. Select at least one sender");
    expect(result.error).not.toMatch(/highlighted fields/i);
  });

  it("joins the first custom issue messages and keeps the rest counted", () => {
    const result = formatZodActionError([
      { path: ["leadListId"], message: "Lead list is required" },
      { path: ["senderIds"], message: "Select at least one sender" },
      { path: ["templateId"], message: "Choose a template" },
      { path: ["name"], message: "Give the campaign a name" },
    ]);
    expect(result.error).toBe(
      "Lead list is required. Select at least one sender. Choose a template (+1 more)",
    );
    expect(result.fieldErrors.name).toEqual(["Give the campaign a name"]);
  });
});
