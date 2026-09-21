import { describe, expect, it } from "vitest";
import {
  leadCreateSchema,
  leadListQuerySchema,
  leadListRenameSchema,
  leadUpdateSchema,
} from "../index";

describe("leadCreateSchema", () => {
  it("accepts only listId + email", () => {
    const parsed = leadCreateSchema.safeParse({
      listId: "list-1",
      email: "ada@example.com",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("ada@example.com");
      expect(parsed.data.listId).toBe("list-1");
      expect(parsed.data.customFields).toBeUndefined();
    }
  });

  it("fails when email is missing", () => {
    const parsed = leadCreateSchema.safeParse({ listId: "list-1" });
    expect(parsed.success).toBe(false);
  });

  it("accepts optional profile fields and customFields", () => {
    const parsed = leadCreateSchema.safeParse({
      listId: "list-1",
      email: "ada@example.com",
      firstName: "Ada",
      customFields: { source: "manual" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firstName).toBe("Ada");
      expect(parsed.data.customFields).toEqual({ source: "manual" });
    }
  });
});

describe("leadUpdateSchema", () => {
  it("allows all fields optional including email", () => {
    const parsed = leadUpdateSchema.safeParse({ firstName: "Ada" });
    expect(parsed.success).toBe(true);
  });

  it("accepts customFields patch with null (delete) values", () => {
    const parsed = leadUpdateSchema.safeParse({
      customFields: { keep: "yes", drop: null },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customFields).toEqual({ keep: "yes", drop: null });
    }
  });
});

describe("leadListRenameSchema (P02)", () => {
  it("trims and accepts name within 1..120", () => {
    const parsed = leadListRenameSchema.safeParse({ name: "  Prospects  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("Prospects");
  });

  it("rejects empty name", () => {
    const parsed = leadListRenameSchema.safeParse({ name: "   " });
    expect(parsed.success).toBe(false);
  });
});

describe("leadListQuerySchema search (P03)", () => {
  it("accepts optional search + listId", () => {
    const parsed = leadListQuerySchema.safeParse({
      search: "ada",
      listId: "list-1",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.search).toBe("ada");
      expect(parsed.data.listId).toBe("list-1");
    }
  });
});
