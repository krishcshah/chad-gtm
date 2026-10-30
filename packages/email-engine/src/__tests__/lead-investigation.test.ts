import { describe, expect, it } from "vitest";
import { investigateLeadDossier, type CampaignResearchContext } from "../lead-investigation";

const lead = {
  email: "maya@northstar.com",
  firstName: "Maya",
  lastName: "Chen",
  company: "Northstar Financial",
  jobTitle: "VP of Finance Operations",
  industry: "Financial Services",
  location: "Chicago, IL",
  website: "northstar.com",
};

const context: CampaignResearchContext = {
  companyName: "Ledgerline",
  companySummary: "Reconciliation automation for finance teams.",
  valueProposition: "Cut month-end close from 9 days to 3.",
  angle: "Acute Pain Relief",
  cta: "Worth a quick look?",
  painPoints: ["Controller time is consumed by manual tie-outs."],
  isOutboundInfrastructure: false,
};

describe("investigateLeadDossier campaign context", () => {
  it("serves the user's offer instead of AutoGTM's inbox pitch", async () => {
    const dossier = await investigateLeadDossier(
      lead,
      "Pitch Ledgerline reconciliation automation.",
      context
    );

    expect(dossier.contextualPromptNote).toContain("Ledgerline");
    expect(dossier.contextualPromptNote).toContain("Northstar Financial");
    expect(dossier.recommendedAngle).toBe("CAMPAIGN_VALUE_ANGLE");
    expect(`${dossier.humanObservation} ${dossier.frictionPoke}`).not.toMatch(
      /dns|mailbox|inbox warmup|deliverability/i
    );
    expect(dossier.lowFrictionCta).toBe("Worth a quick look?");
  });

  it("keeps the legacy DNS path when explicitly requested", async () => {
    const dossier = await investigateLeadDossier(lead, "pitch pre-warmed mailboxes", {
      ...context,
      companyName: "AutoGTM",
      isOutboundInfrastructure: true,
    });
    expect(dossier.recommendedAngle).not.toBe("CAMPAIGN_VALUE_ANGLE");
  });
});
