import { describe, expect, it } from "vitest";
import { prepareLeadDraft } from "../lead-form";

const base = {
  listId: "list-1",
  email: "ada@example.com",
  firstName: "",
  lastName: "",
  company: "",
  customFields: [] as { name: string; value: string }[],
};

describe("prepareLeadDraft create", () => {
  it("requires email and does not build a payload when it is empty", () => {
    const result = prepareLeadDraft("create", { ...base, email: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.email).toBe("Email is required");
    }
  });

  it("rejects an invalid email", () => {
    const result = prepareLeadDraft("create", { ...base, email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.email).toBe("Enter a valid email");
    }
  });

  it("sends email plus optional profile and custom fields", () => {
    const result = prepareLeadDraft("create", {
      ...base,
      firstName: "Ada",
      lastName: " Lovelace ",
      company: "Analytical Engines",
      customFields: [
        { name: "  ", value: "   " },
        { name: "source", value: "manual" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.mode === "create") {
      expect(result.input).toEqual({
        listId: "list-1",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        company: "Analytical Engines",
        customFields: { source: "manual" },
      });
    }
  });

  it("flags a custom field that has a value and no name", () => {
    const result = prepareLeadDraft("create", {
      ...base,
      customFields: [{ name: " ", value: "west" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["customFields.0.name"]).toBe("Field name is required");
    }
  });
});

describe("prepareLeadDraft edit", () => {
  it("sends null for a removed custom field and keeps the rest", () => {
    const result = prepareLeadDraft("edit", {
      ...base,
      firstName: "Ada",
      customFields: [{ name: "source", value: "event" }],
      originalCustomFields: { source: "manual", region: "west" },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.mode === "edit") {
      expect(result.input.customFields).toEqual({ source: "event", region: null });
      expect(result.savedCustomFields).toEqual({ source: "event" });
      expect(result.input.firstName).toBe("Ada");
      expect(result.input.lastName).toBeNull();
    }
  });

  it("nulls a renamed custom field key", () => {
    const result = prepareLeadDraft("edit", {
      ...base,
      customFields: [{ name: "origin", value: "manual" }],
      originalCustomFields: { source: "manual" },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.mode === "edit") {
      expect(result.input.customFields).toEqual({ origin: "manual", source: null });
    }
  });
});
