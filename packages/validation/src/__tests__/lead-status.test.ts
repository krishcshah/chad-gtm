import { describe, expect, it } from "vitest";
import {
  LEAD_PICKABLE_STATUS_VALUES,
  LEAD_STATUS_VALUES,
  leadListQuerySchema,
  updateLeadStatusSchema,
} from "../index";

describe("F03d lead status", () => {
  it("updateLeadStatusSchema accepts every funnel status", () => {
    expect([...LEAD_PICKABLE_STATUS_VALUES]).toEqual([
      "new",
      "contacted",
      "replied",
      "interested",
      "meeting_booked",
      "won",
      "lost",
    ]);
    for (const status of LEAD_PICKABLE_STATUS_VALUES) {
      expect(updateLeadStatusSchema.safeParse({ leadId: "l1", status }).success).toBe(true);
    }
    expect(updateLeadStatusSchema.safeParse({ leadId: "l1", status: "pending" }).success).toBe(false);
    expect(updateLeadStatusSchema.safeParse({ leadId: "", status: "new" }).success).toBe(false);
  });

  it("updateLeadStatusSchema rejects do-not-contact statuses (they come from the Blocklist)", () => {
    for (const status of ["blocked", "unsubscribed", "bounced"]) {
      expect(updateLeadStatusSchema.safeParse({ leadId: "l1", status }).success).toBe(false);
    }
  });

  it("leadListQuerySchema filters by every stored status", () => {
    for (const status of LEAD_STATUS_VALUES) {
      expect(leadListQuerySchema.safeParse({ status }).success).toBe(true);
    }
    expect(leadListQuerySchema.safeParse({ status: "blocked" }).success).toBe(true);
    expect(leadListQuerySchema.safeParse({ status: "contacted" }).success).toBe(true);
    expect(leadListQuerySchema.safeParse({ status: "sent" }).success).toBe(false);
  });
});
