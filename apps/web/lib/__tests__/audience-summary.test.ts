import { describe, expect, it } from "vitest";
import {
  audienceRunwayLine,
  campaignListTotal,
  campaignTotalLabel,
  describeSendingDays,
  launchSuccessMessage,
  sendingDaysLeft,
  summarizeAudience,
} from "../audience-summary";

const tier = (total: number | null, added = 0, exhausted = false, extra: Record<string, unknown> = {}) => ({
  total,
  added,
  exhausted,
  cursor: 0,
  ...extra,
});

const AUDIENCE = {
  version: 1,
  tiers: { "1": tier(1200, 200), "2": tier(3000), "3": tier(20000) },
  added: 200,
  exhausted: false,
  countedAt: "2026-11-01T00:00:00.000Z",
};

describe("summarizeAudience", () => {
  it("shows the whole audience, not the first batch", () => {
    const s = summarizeAudience(AUDIENCE, [{ priority: 1, loaded: 200, emailed: 50, waiting: 150 }]);
    expect(s.kind).toBe("tiers");
    expect(s.matching).toBe(24200);
    expect(s.emailed).toBe(50);
    // 150 loaded + 1,000 more Priority 1 + all of 2 and 3.
    expect(s.toCome).toBe(150 + 1000 + 3000 + 20000);
    expect(s.tiers.map((t) => [t.tier, t.matching, t.emailed, t.toCome])).toEqual([
      [1, 1200, 50, 1150],
      [2, 3000, 0, 3000],
      [3, 20000, 0, 20000],
    ]);
    expect(s.usedUp).toBe(false);
  });

  it("uses what was added once a tier is used up", () => {
    const s = summarizeAudience(
      { ...AUDIENCE, tiers: { ...AUDIENCE.tiers, "1": tier(1200, 900, true) } },
      [{ priority: 1, loaded: 900, emailed: 880, waiting: 20 }],
    );
    expect(s.tiers[0]).toMatchObject({ tier: 1, matching: 900, emailed: 880, toCome: 20, allAdded: true });
  });

  it("drops tiers that were never in scope (only these job titles)", () => {
    const s = summarizeAudience(
      { ...AUDIENCE, tiers: { "1": tier(500, 100), "2": tier(3000, 0, true), "3": tier(20000, 0, true) } },
      [{ priority: 1, loaded: 100, emailed: 0, waiting: 100 }],
    );
    expect(s.tiers.map((t) => t.tier)).toEqual([1]);
    expect(s.matching).toBe(500);
  });

  it("is counting when a total is missing or countedAt is null", () => {
    const missing = summarizeAudience({ ...AUDIENCE, tiers: { ...AUDIENCE.tiers, "3": tier(null) } }, []);
    expect(missing.counting).toBe(true);
    expect(missing.matching).toBeNull();
    expect(missing.tiers.find((t) => t.tier === 3)?.matching).toBeNull();
    const nullCounted = summarizeAudience({ ...AUDIENCE, countedAt: null }, []);
    expect(nullCounted.counting).toBe(true);
  });

  it("ignores fields it does not know", () => {
    const s = summarizeAudience(
      { ...AUDIENCE, passes: [{ cursor: 9 }], tiers: { ...AUDIENCE.tiers, "2": tier(3000, 0, false, { passCursor: 4 }) } },
      [],
    );
    expect(s.matching).toBe(24200);
  });

  it("is used up when everyone was added and emailed", () => {
    const s = summarizeAudience(
      { ...AUDIENCE, exhausted: true, tiers: { "1": tier(10, 8, true), "2": tier(5, 4, true), "3": tier(0, 0, true) } },
      [
        { priority: 1, loaded: 8, emailed: 8, waiting: 0 },
        { priority: 2, loaded: 4, emailed: 3, waiting: 0 },
      ],
    );
    expect(s.usedUp).toBe(true);
    expect(s.matching).toBe(12);
    expect(audienceRunwayLine(s, 60)).toMatch(/Everyone who matches has had the first email/);
  });

  it("falls back to loaded leads for runs without audience state", () => {
    const s = summarizeAudience({}, [{ priority: null, loaded: 300, emailed: 120, waiting: 170 }]);
    expect(s).toMatchObject({ kind: "batch", matching: 300, emailed: 120, waiting: 170, tiers: [] });
  });
});

describe("older and newer stored audiences", () => {
  it("counts again for a version 1 audience that filtered by company size", () => {
    const v1 = { ...AUDIENCE, teamSizes: ["11-50"], exhausted: true, tiers: { "1": tier(300, 300, true), "2": tier(0, 0, true), "3": tier(900, 900, true) } };
    const s = summarizeAudience(v1, [{ priority: 1, loaded: 300, emailed: 300, waiting: 0 }]);
    expect(s.counting).toBe(true);
    expect(s.matching).toBeNull();
    expect(s.usedUp).toBe(false);
    expect(s.allAdded).toBe(false);
  });

  it("reads a version 1 audience without sizes as before", () => {
    expect(summarizeAudience(AUDIENCE, []).counting).toBe(false);
  });

  it("treats an unknown newer version as still counting", () => {
    expect(summarizeAudience({ ...AUDIENCE, version: 3 }, []).counting).toBe(true);
  });
});

describe("campaign lists", () => {
  it("show an Autopilot campaign's whole audience, not the contacts loaded so far", () => {
    expect(campaignListTotal(AUDIENCE, 1670)).toEqual({ total: 24200, counting: false, wholeAudience: true });
    expect(campaignTotalLabel({ total: 24200, wholeAudience: true })).toBe("24,200 matching contacts");
  });

  it("say the audience is being counted instead of showing the batch as the total", () => {
    const t = campaignListTotal({ ...AUDIENCE, countedAt: null }, 200);
    expect(t).toEqual({ total: 200, counting: true, wholeAudience: true });
    expect(campaignTotalLabel({ ...t, audienceCounting: t.counting })).toBe("Counting matching contacts");
  });

  it("keep a manual campaign's lead count", () => {
    expect(campaignListTotal({}, 12)).toEqual({ total: 12, counting: false, wholeAudience: false });
    expect(campaignTotalLabel({ total: 1 })).toBe("1 lead");
  });
});

describe("runway", () => {
  it("counts sending days at a third of the daily volume", () => {
    expect(sendingDaysLeft(1000, 60)).toBe(50);
    expect(sendingDaysLeft(1000, 0)).toBeNull();
    expect(sendingDaysLeft(null, 60)).toBeNull();
  });

  it("words days, weeks, months and years", () => {
    expect(describeSendingDays(1)).toBe("about a day");
    expect(describeSendingDays(6)).toBe("about 6 sending days");
    expect(describeSendingDays(20)).toBe("about 4 weeks");
    expect(describeSendingDays(220)).toBe("about 10 months");
    expect(describeSendingDays(2600)).toBe("about 10 years");
  });

  it("says when everyone will have had a first email", () => {
    const s = summarizeAudience(AUDIENCE, [{ priority: 1, loaded: 200, emailed: 50, waiting: 150 }]);
    expect(audienceRunwayLine(s, 60)).toBe("At about 20 new leads a day, everyone gets a first email in about 5 years.");
  });
});

describe("launchSuccessMessage", () => {
  it("names the whole audience", () => {
    expect(launchSuccessMessage(AUDIENCE)).toBe(
      "Outreach is live. AutoGTM will work through all 24,200 matching contacts, Priority 1 first.",
    );
  });

  it("never quotes a batch size, even right after launch (counted later by the top-up)", () => {
    // Launch stores tier totals of 0 and countedAt null (lib/autopilot-audience.ts newAudienceState).
    const atLaunch = { version: 2, tiers: { "1": tier(0, 200), "2": tier(0), "3": tier(0) }, added: 200, exhausted: false, countedAt: null };
    expect(launchSuccessMessage(atLaunch)).toBe("Outreach is live. AutoGTM will work through every matching contact, Priority 1 first.");
    expect(summarizeAudience(atLaunch, [{ priority: 1, loaded: 200, emailed: 0, waiting: 200 }])).toMatchObject({
      counting: true,
      matching: null,
    });
  });

  it("never quotes a batch size, even without audience state", () => {
    expect(launchSuccessMessage(null)).toBe(
      "Outreach is live. AutoGTM will work through every matching contact, Priority 1 first.",
    );
    expect(launchSuccessMessage({ ...AUDIENCE, countedAt: null })).toBe(
      "Outreach is live. AutoGTM will work through every matching contact, Priority 1 first.",
    );
  });
});
