import { describe, expect, it } from "vitest";
import {
  ANALYSIS_LIMITS,
  AWAITING_APPROVAL_MESSAGE,
  DEFAULT_AUTOPILOT_TIMEZONE,
  RESEARCH_REFRESH_MESSAGE,
  analysisRateLimitError,
  assessTargeting,
  autopilotSendingWindow,
  complianceProblems,
  deriveRunPhase,
  fillMergeTokens,
  isAllowedCountry,
  isFreemailDomain,
  isWorkEmail,
  launchBlockers,
  matchIndustriesInText,
  parseAutopilotCountries,
  pickWorkAddress,
  readLaunchFailure,
  resolveAutopilotTimezone,
  resolveSpintax,
  type ReadinessInput,
} from "../autopilot-policy";

describe("freemail detection", () => {
  it.each([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.uk",
    "yahoo.com.br",
    "hotmail.fr",
    "live.com.mx",
    "live.nl",
    "outlook.com",
    "aol.com",
    "icloud.com",
    "me.com",
    "msn.com",
    "email.msn.com",
    "sbcglobal.net",
    "bellsouth.net",
    "cfl.rr.com",
    "rogers.com",
    "netscape.net",
    "GMAIL.COM",
  ])("treats %s as personal", (domain) => {
    expect(isFreemailDomain(domain)).toBe(true);
  });

  it.each(["acme.com", "wellsfargo.com", "newtrier.k12.il.us", "livenation.com", "yahooligans-design.io", "outlookgroup.co"])(
    "treats %s as a work domain",
    (domain) => {
      expect(isFreemailDomain(domain)).toBe(false);
    },
  );

  it("validates work email shape and domain", () => {
    expect(isWorkEmail("jane@acme.com")).toBe(true);
    expect(isWorkEmail("jane@gmail.com")).toBe(false);
    expect(isWorkEmail("not-an-email")).toBe(false);
    expect(isWorkEmail("")).toBe(false);
    expect(isWorkEmail(null)).toBe(false);
  });
});

describe("pickWorkAddress", () => {
  it("uses the directory work address, not a personal primary email", () => {
    expect(pickWorkAddress({ email: "equiknox@msn.com", workEmail: "knoxj@newtrier.k12.il.us" })).toBe(
      "knoxj@newtrier.k12.il.us",
    );
  });

  it("rejects leads whose only address is personal", () => {
    expect(pickWorkAddress({ email: "someone@gmail.com", workEmail: "" })).toBeNull();
    expect(pickWorkAddress({ email: "someone@acme.com", workEmail: null })).toBeNull();
  });

  it("rejects ISP mailboxes listed as work email", () => {
    expect(pickWorkAddress({ email: "x@bellsouth.net", workEmail: "x@bellsouth.net" })).toBeNull();
  });
});

describe("countries", () => {
  it("defaults to the United States", () => {
    expect(parseAutopilotCountries(undefined)).toEqual(["United States"]);
    expect(parseAutopilotCountries("  ,  ")).toEqual(["United States"]);
  });

  it("parses a comma list and de-duplicates", () => {
    expect(parseAutopilotCountries("United States, Canada,United States")).toEqual(["United States", "Canada"]);
  });

  it("matches country names case-insensitively and rejects blanks", () => {
    expect(isAllowedCountry("united states", ["United States"])).toBe(true);
    expect(isAllowedCountry("Germany", ["United States"])).toBe(false);
    expect(isAllowedCountry("", ["United States"])).toBe(false);
  });
});

describe("sending window", () => {
  it("is Monday-Friday 09:00-17:00 in America/New_York by default", () => {
    expect(autopilotSendingWindow({})).toEqual({
      businessDaysOnly: true,
      sendingTimezone: "America/New_York",
      sendingWindowStart: "09:00",
      sendingWindowEnd: "17:00",
    });
  });

  it("honours a valid AUTOPILOT_TIMEZONE and ignores an invalid one", () => {
    expect(autopilotSendingWindow({ AUTOPILOT_TIMEZONE: "America/Chicago" }).sendingTimezone).toBe("America/Chicago");
    expect(resolveAutopilotTimezone("Mars/Olympus")).toBe(DEFAULT_AUTOPILOT_TIMEZONE);
    expect(resolveAutopilotTimezone("")).toBe(DEFAULT_AUTOPILOT_TIMEZONE);
  });
});

describe("targeting provenance", () => {
  it("blocks simulated targeting", () => {
    const t = assessTargeting({ industries: ["Restaurants"], targetingSource: "simulated", targetingGrounded: false });
    expect(t.grounded).toBe(false);
    expect(t.reason).toBeTruthy();
  });

  it("uses the stored client-facing issue when present", () => {
    const t = assessTargeting({ industries: ["X"], targetingSource: "simulated", targetingIssue: "Site blocked us." });
    expect(t.grounded).toBe(false);
    expect(t.reason).toBeTruthy();
    const t2 = assessTargeting({ industries: ["X"], targetingSource: "ai", targetingGrounded: false, targetingIssue: "Site blocked us." });
    expect(t2.reason).toBe("Site blocked us.");
  });

  it("allows AI and heuristic targeting", () => {
    expect(assessTargeting({ industries: ["Hospitals"], targetingSource: "ai" }).grounded).toBe(true);
    expect(assessTargeting({ industries: ["Hospitals"], targetingSource: "heuristic", targetingGrounded: true }).grounded).toBe(
      true,
    );
  });

  it("asks legacy runs without provenance to be re-researched, and never accepts empty industries", () => {
    const legacy = assessTargeting({ industries: ["Hospitals"] });
    expect(legacy.grounded).toBe(false);
    expect(legacy.reason).toBe(RESEARCH_REFRESH_MESSAGE);
    expect(assessTargeting({ industries: [], targetingSource: "ai" }).grounded).toBe(false);
    expect(assessTargeting(null).grounded).toBe(false);
  });
});

describe("matchIndustriesInText", () => {
  const industries = ["Restaurants", "Real Estate", "Hospital & Health Care", "Internet", "Logistics and Supply Chain"];

  it("finds multi-word industries named once and ranks by mentions", () => {
    const text = "We help real estate brokers. Real Estate teams love us. Also hospital and health care groups.";
    expect(matchIndustriesInText(text, industries)).toEqual(["Real Estate", "Hospital & Health Care"]);
  });

  it("needs two mentions for a single-word industry", () => {
    expect(matchIndustriesInText("Find us on the internet.", industries)).toEqual([]);
    expect(matchIndustriesInText("Internet companies. Built for internet scale.", industries)).toEqual(["Internet"]);
  });

  it("does not match inside other words and handles empty text", () => {
    expect(matchIndustriesInText("unrestaurantsy restaurantsville", industries)).toEqual([]);
    expect(matchIndustriesInText("", industries)).toEqual([]);
  });
});

describe("compliance identity", () => {
  it("requires a company name and a real postal address", () => {
    expect(complianceProblems({ companyName: "", postalAddress: "" })).toEqual({
      companyName: expect.any(String),
      postalAddress: expect.any(String),
    });
    expect(complianceProblems({ companyName: "Acme", postalAddress: "somewhere" }).postalAddress).toBeTruthy();
    expect(complianceProblems({ companyName: "Acme Inc.", postalAddress: "123 Market St, San Francisco, CA 94105" })).toEqual({});
  });
});

describe("launchBlockers", () => {
  const ready: ReadinessInput = {
    icpProfile: { industries: ["Hospitals"], targetingSource: "ai" },
    requireGroundedTargeting: true,
    bookingUrl: "https://cal.com/acme",
    requireBookingUrl: true,
    identity: { companyName: "Acme Inc.", postalAddress: "123 Market St, San Francisco, CA 94105" },
    approved: true,
  };

  it("is empty when everything is in place", () => {
    expect(launchBlockers(ready)).toEqual([]);
  });

  it("orders research, then details, then approval", () => {
    const blockers = launchBlockers({
      ...ready,
      icpProfile: { industries: ["Restaurants"], targetingSource: "simulated" },
      bookingUrl: null,
      identity: { companyName: "Acme", postalAddress: "" },
      approved: false,
    });
    expect(blockers.map((b) => b.kind)).toEqual(["research", "details", "approval"]);
    const details = blockers[1];
    expect(details?.kind === "details" && details.missing).toEqual(["bookingUrl", "postalAddress"]);
  });

  it("does not require grounded targeting or a booking link for guided runs", () => {
    expect(
      launchBlockers({
        ...ready,
        icpProfile: { industries: ["Restaurants"], targetingSource: "simulated" },
        requireGroundedTargeting: false,
        bookingUrl: null,
        requireBookingUrl: false,
      }),
    ).toEqual([]);
  });

  it("blocks unapproved accounts with a friendly message", () => {
    expect(launchBlockers({ ...ready, approved: false })).toEqual([{ kind: "approval", message: AWAITING_APPROVAL_MESSAGE }]);
  });
});

describe("deriveRunPhase", () => {
  const base = { autopilot: true, launchFailure: null, blockers: [] as ReturnType<typeof launchBlockers> };

  it("is live or paused only with a campaign", () => {
    expect(deriveRunPhase({ ...base, status: "active", campaignId: "c1" })).toBe("live");
    expect(deriveRunPhase({ ...base, status: "paused", campaignId: "c1" })).toBe("paused");
    expect(deriveRunPhase({ ...base, status: "completed", campaignId: "c1" })).toBe("completed");
  });

  it("never reports an autopilot run without a campaign as live", () => {
    expect(deriveRunPhase({ ...base, status: "active", campaignId: null })).toBe("launch_failed");
    expect(deriveRunPhase({ ...base, status: "reviewing", campaignId: null })).toBe("launch_failed");
  });

  it("maps blockers and failures", () => {
    const failure = { code: "no_senders" as const, message: "busy", at: "2026-11-06T00:00:00.000Z" };
    expect(deriveRunPhase({ ...base, status: "needs_input", campaignId: null, blockers: [{ kind: "research", message: "x" }] })).toBe(
      "needs_research",
    );
    expect(
      deriveRunPhase({
        ...base,
        status: "needs_input",
        campaignId: null,
        blockers: [{ kind: "details", missing: ["bookingUrl"], message: "x" }],
      }),
    ).toBe("needs_details");
    expect(deriveRunPhase({ ...base, status: "needs_input", campaignId: null, launchFailure: failure })).toBe("launch_failed");
    expect(deriveRunPhase({ ...base, status: "ready", campaignId: null, blockers: [{ kind: "approval", message: "x" }] })).toBe(
      "awaiting_approval",
    );
    expect(deriveRunPhase({ ...base, status: "ready", campaignId: null })).toBe("ready");
  });

  it("keeps guided drafts as drafts", () => {
    expect(deriveRunPhase({ ...base, autopilot: false, status: "reviewing", campaignId: null })).toBe("draft");
    expect(deriveRunPhase({ ...base, autopilot: false, status: "calibrating", campaignId: null })).toBe("draft");
  });
});

describe("readLaunchFailure", () => {
  it("reads a stored failure and normalizes unknown codes", () => {
    expect(readLaunchFailure({ launchFailure: { code: "no_leads", message: "m", at: "t" } })).toEqual({
      code: "no_leads",
      message: "m",
      at: "t",
    });
    expect(readLaunchFailure({ launchFailure: { code: "weird", message: "m" } })?.code).toBe("error");
    expect(readLaunchFailure({})).toBeNull();
    expect(readLaunchFailure(null)).toBeNull();
  });
});

describe("analysisRateLimitError", () => {
  it("allows under the limits", () => {
    expect(analysisRateLimitError({ lastHour: 9, lastDay: 29 })).toBeNull();
  });

  it("blocks at the hourly and daily limits", () => {
    expect(analysisRateLimitError({ lastHour: ANALYSIS_LIMITS.perHour, lastDay: 10 })).toMatch(/last hour/);
    expect(analysisRateLimitError({ lastHour: 0, lastDay: ANALYSIS_LIMITS.perDay })).toMatch(/24 hours/);
  });
});

describe("sample email rendering", () => {
  it("resolves spintax without touching merge tokens", () => {
    expect(resolveSpintax("{Hi|Hey} {{first_name}}, {a|b}", 0)).toBe("Hi {{first_name}}, b");
    expect(resolveSpintax("{Hi|Hey} there", 1)).toBe("Hey there");
  });

  it("fills known tokens and leaves unknown ones", () => {
    expect(fillMergeTokens("Hi {{first_name}} at {{ company }} — {{sender_name}}", { first_name: "Ana", company: "Acme" })).toBe(
      "Hi Ana at Acme — {{sender_name}}",
    );
  });
});
