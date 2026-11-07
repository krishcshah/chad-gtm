/**
 * #78: the agent speaks for the same company the email footer names
 * (processor loadComplianceInfo): the workspace's, else the run's. A blank
 * workspace never borrows the legacy account-wide name (another client's).
 */
import { describe, expect, it } from "vitest";
import { agentSenderCompany } from "../reply-agent";

describe("agentSenderCompany", () => {
  it("uses the workspace's company name over the run's researched company", () => {
    expect(
      agentSenderCompany({
        settings: { companyName: "Brand B Ltd" },
        run: { companyName: "Researched Co" },
        grounding: { companyName: "Researched Co" },
      }),
    ).toBe("Brand B Ltd");
  });

  it("falls back to the run's company when the workspace has none, like the footer", () => {
    expect(
      agentSenderCompany({
        settings: { companyName: "  " },
        run: { companyName: "Researched Co" },
        grounding: { companyName: "Researched Co" },
      }),
    ).toBe("Researched Co");
  });

  it("never borrows the legacy account name when the workspace row exists but is blank", () => {
    // grounding carries the legacy workspace_settings name (Client A's) here.
    expect(
      agentSenderCompany({
        settings: { companyName: "" },
        run: null,
        grounding: { companyName: "Client A Inc" },
      }),
    ).toBe("");
  });

  it("uses the legacy account name only when the owner has no workspace row", () => {
    expect(
      agentSenderCompany({ settings: null, run: null, grounding: { companyName: "Legacy Co" } }),
    ).toBe("Legacy Co");
  });
});
