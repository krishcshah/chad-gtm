import { describe, expect, it } from "vitest";
import { LEAD_STATUS_VALUES, leadListQuerySchema, updateLeadStatusSchema } from "../index";

describe("F03d lead status", () => {
  it("updateLeadStatusSchema accepts enum values", () => {
    for (const status of LEAD_STATUS_VALUES) {
      expect(updateLeadStatusSchema.safeParse({ leadId: "l1", status }).success).toBe(true);
    }
    expect(updateLeadStatusSchema.safeParse({ leadId: "l1", status: "pending" }).success).toBe(false);
    expect(updateLeadStatusSchema.safeParse({ leadId: "", status: "new" }).success).toBe(false);
  });

  it("leadListQuerySchema filters by new enum", () => {
    expect(leadListQuerySchema.safeParse({ status: "contacted" }).success).toBe(true);
    expect(leadListQuerySchema.safeParse({ status: "sent" }).success).toBe(false);
  });
});
