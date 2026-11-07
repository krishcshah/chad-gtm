import { describe, expect, it } from "vitest";
import {
  ANALYSIS_LIMITS,
  AWAITING_APPROVAL_MESSAGE,
  DEFAULT_AUTOPILOT_TIMEZONE,
  LAUNCH_CLAIM_TTL_MS,
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
  launchClaimActive,
  matchIndustriesInText,
  parseAutopilotCountries,
  pickWorkAddress,
  readLaunchFailure,
  resolveAutopilotTimezone,
  resolveSpintax,
  guidedResumeStep,
  teamSizeValuesForBrackets,
  withChosenOfferFirst,
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

  it("shows a launch in progress as launching, ahead of blockers and failures (#50)", () => {
    const failure = { code: "error" as const, message: "x", at: "2026-11-06T00:00:00.000Z" };
    expect(deriveRunPhase({ ...base, status: "needs_input", campaignId: null, launchFailure: failure, launchInProgress: true })).toBe(
      "launching",
    );
    expect(
      deriveRunPhase({ ...base, status: "ready", campaignId: null, blockers: [{ kind: "approval", message: "x" }], launchInProgress: true }),
    ).toBe("launching");
    expect(deriveRunPhase({ ...base, autopilot: false, status: "reviewing", campaignId: null, launchInProgress: true })).toBe("launching");
    // Once a campaign is linked the claim no longer matters.
    expect(deriveRunPhase({ ...base, status: "active", campaignId: "c1", launchInProgress: true })).toBe("live");
  });
});

describe("launchClaimActive (#50)", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  it("is true within the TTL", () => {
    expect(launchClaimActive("2026-11-07T11:59:00.000Z", now)).toBe(true);
    expect(launchClaimActive(new Date(now.getTime() - LAUNCH_CLAIM_TTL_MS + 1000).toISOString(), now)).toBe(true);
  });
  it("is false after the TTL, when empty, or unparseable", () => {
    expect(launchClaimActive(new Date(now.getTime() - LAUNCH_CLAIM_TTL_MS).toISOString(), now)).toBe(false);
    expect(launchClaimActive("2026-11-07T10:00:00.000Z", now)).toBe(false);
    expect(launchClaimActive(null, now)).toBe(false);
    expect(launchClaimActive(undefined, now)).toBe(false);
    expect(launchClaimActive("not a date", now)).toBe(false);
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

describe("deriveRunPhase with a postal hold (#19)", () => {
  const base = { campaignId: "c1", autopilot: true, blockers: [] };
  it("an active run whose sends are held is 'held'", () => {
    expect(deriveRunPhase({ ...base, status: "active", postalHeld: true })).toBe("held");
  });
  it("is live without a hold", () => {
    expect(deriveRunPhase({ ...base, status: "active", postalHeld: false })).toBe("live");
    expect(deriveRunPhase({ ...base, status: "active" })).toBe("live");
  });
  it("paused and completed are unaffected", () => {
    expect(deriveRunPhase({ ...base, status: "paused", postalHeld: true })).toBe("paused");
    expect(deriveRunPhase({ ...base, status: "completed", postalHeld: true })).toBe("completed");
  });
});

describe("withChosenOfferFirst (#51)", () => {
  const offers = ["a", "b", "c", "d"];
  it("moves the chosen offer to the front and keeps the rest in order", () => {
    expect(withChosenOfferFirst(offers, 2)).toEqual(["c", "a", "b", "d"]);
    expect(offers).toEqual(["a", "b", "c", "d"]);
  });
  it("keeps the order for index 0 or an out-of-range index", () => {
    expect(withChosenOfferFirst(offers, 0)).toEqual(offers);
    expect(withChosenOfferFirst(offers, 9)).toEqual(offers);
    expect(withChosenOfferFirst(offers, -1)).toEqual(offers);
  });
});

describe("guidedResumeStep (#55)", () => {
  it("is 1 without offers", () => {
    expect(guidedResumeStep({ offers: [], approvedEmailSamples: [], calibrationProfile: {} })).toBe(1);
    expect(guidedResumeStep({ offers: null })).toBe(1);
  });
  it("is 2 with offers only", () => {
    expect(guidedResumeStep({ offers: [{ title: "Audit" }], approvedEmailSamples: [], calibrationProfile: {} })).toBe(2);
    expect(
      guidedResumeStep({ offers: [{ title: "Audit" }], approvedEmailSamples: [{ subject: "Hi" }], calibrationProfile: null }),
    ).toBe(2);
  });
  it("is 4 once the sample emails were reviewed", () => {
    expect(
      guidedResumeStep({
        offers: [{ title: "Audit" }],
        approvedEmailSamples: [{ subject: "Hi" }],
        calibrationProfile: { styleExemplars: [{ subject: "Hi" }] },
      }),
    ).toBe(4);
  });
});

describe("teamSizeValuesForBrackets (#57)", () => {
  it("keeps facet values that equal or fall inside a bracket", () => {
    expect(
      teamSizeValuesForBrackets(["11-50", "51-200"], ["0", "11", "11-50", "51", "51-200", "201", "1001-5000"]),
    ).toEqual(["11", "11-50", "51", "51-200"]);
  });
  it("handles open-ended brackets and never keeps unknown sizes", () => {
    expect(teamSizeValuesForBrackets(["1000+"], ["", "0", "999", "1001-5000", "10001+"])).toEqual([
      "1001-5000",
      "10001+",
    ]);
  });
  it("gives [] (no size filter) when no bracket parses", () => {
    expect(teamSizeValuesForBrackets(["small", "enterprise"], ["11", "11-50"])).toEqual([]);
    expect(teamSizeValuesForBrackets([], ["11"])).toEqual([]);
  });
});

import {
  AUTOPILOT_DAILY_DEFAULT,
  AUTOPILOT_DAILY_MAX,
  AUTOPILOT_DAILY_MIN,
  clampAutopilotDaily,
  deriveRunPhase as deriveRunPhaseForCampaign,
} from "../autopilot-policy";

describe("clampAutopilotDaily (#48: one range and one default)", () => {
  it("keeps a chosen 30, clamps to 30-500 and rounds", () => {
    expect([AUTOPILOT_DAILY_MIN, AUTOPILOT_DAILY_MAX, AUTOPILOT_DAILY_DEFAULT]).toEqual([30, 500, 60]);
    expect(clampAutopilotDaily(30)).toBe(30);
    expect(clampAutopilotDaily(5)).toBe(30);
    expect(clampAutopilotDaily(0)).toBe(30);
    expect(clampAutopilotDaily(2000)).toBe(500);
    expect(clampAutopilotDaily(120.6)).toBe(121);
    expect(clampAutopilotDaily("90")).toBe(90);
  });
  it("gives the default for anything unreadable", () => {
    expect(clampAutopilotDaily(NaN)).toBe(60);
    expect(clampAutopilotDaily(undefined)).toBe(60);
    expect(clampAutopilotDaily(null)).toBe(60);
    expect(clampAutopilotDaily("")).toBe(60);
    expect(clampAutopilotDaily("abc")).toBe(60);
  });
});

describe("deriveRunPhase follows the linked campaign (#53)", () => {
  const base = { campaignId: "c1", autopilot: true, blockers: [] };
  it("a completed campaign shows completed even when the run still says active", () => {
    expect(deriveRunPhaseForCampaign({ ...base, status: "active", campaignStatus: "completed" })).toBe("completed");
  });
  it("archived or deleted campaigns are completed too", () => {
    expect(deriveRunPhaseForCampaign({ ...base, status: "active", campaignStatus: "archived" })).toBe("completed");
    expect(
      deriveRunPhaseForCampaign({ ...base, status: "active", campaignStatus: "running", campaignDeleted: true }),
    ).toBe("completed");
  });
  it("running is live (held without a postal address); paused is paused whatever the run says", () => {
    expect(deriveRunPhaseForCampaign({ ...base, status: "paused", campaignStatus: "running" })).toBe("live");
    expect(deriveRunPhaseForCampaign({ ...base, status: "paused", campaignStatus: "running", postalHeld: true })).toBe(
      "held",
    );
    expect(deriveRunPhaseForCampaign({ ...base, status: "active", campaignStatus: "paused" })).toBe("paused");
  });
  it("without a campaign status the run status still decides", () => {
    expect(deriveRunPhaseForCampaign({ ...base, status: "active" })).toBe("live");
    expect(deriveRunPhaseForCampaign({ ...base, status: "completed" })).toBe("completed");
  });
});
