import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jobMaxAttempts, sendingSettingsPatch } from "../campaign-settings";
import { ScheduleCard } from "../../app/(app)/campaigns/[id]/overview-cards";

describe("sendingSettingsPatch", () => {
  it("clamps the per-mailbox limit to the engine's 1-30", () => {
    expect(sendingSettingsPatch({ maxEmailsPerSenderPerDay: 50 })).toEqual({ maxEmailsPerSenderPerDay: 30 });
    expect(sendingSettingsPatch({ maxEmailsPerSenderPerDay: 0 })).toEqual({ maxEmailsPerSenderPerDay: 1 });
    expect(sendingSettingsPatch({ maxEmailsPerSenderPerDay: 12 })).toEqual({ maxEmailsPerSenderPerDay: 12 });
  });

  it("drops values that are not numbers", () => {
    expect(sendingSettingsPatch({ maxEmailsPerSenderPerDay: "lots", retryCount: Number.NaN })).toEqual({});
    expect(sendingSettingsPatch({ maxEmailsPerSenderPerDay: null as unknown as number })).toEqual({});
  });

  it("keeps retryFailed only when it is a boolean", () => {
    expect(sendingSettingsPatch({ retryFailed: false })).toEqual({ retryFailed: false });
    expect(sendingSettingsPatch({ retryFailed: "yes" })).toEqual({});
  });

  it("clamps the retry count to 0-10", () => {
    expect(sendingSettingsPatch({ retryCount: 25 })).toEqual({ retryCount: 10 });
    expect(sendingSettingsPatch({ retryCount: -2 })).toEqual({ retryCount: 0 });
    expect(sendingSettingsPatch({ retryCount: 3 })).toEqual({ retryCount: 3 });
  });

  it("returns nothing for an empty input", () => {
    expect(sendingSettingsPatch({})).toEqual({});
  });
});

describe("jobMaxAttempts", () => {
  it("is one attempt when retries are off", () => {
    expect(jobMaxAttempts(false, 3)).toBe(1);
    expect(jobMaxAttempts(true, 3)).toBe(3);
  });
});

describe("ScheduleCard", () => {
  const base = {
    dailyLimit: 100,
    windowStart: "09:00",
    windowEnd: "17:00",
    timezone: "UTC",
    businessDaysOnly: true,
    minDelaySec: 5,
    maxDelaySec: 600,
    stopOnReply: true,
    trackOpens: false,
    capacity: { perDay: 30, limitedBy: "mailboxes" as const },
  };

  it("shows the per-mailbox limit, retries and where to change them", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleCard, { ...base, maxEmailsPerSenderPerDay: 50, retryFailed: true, retryCount: 1 }),
    );
    expect(html).toContain("Per mailbox limit");
    expect(html).toContain("30 a day");
    expect(html).toContain("Retry failed emails");
    expect(html).toContain("On, up to 1 attempt");
    expect(html).toContain("Change these with the Settings button above.");
    // The gap shown is the one the engine uses (45 s floor).
    expect(html).toContain("Gap between emails (per mailbox)");
    expect(html).toContain("45s");
  });

  it("says Off when retries are off", () => {
    const html = renderToStaticMarkup(createElement(ScheduleCard, { ...base, retryFailed: false, retryCount: 3 }));
    expect(html).toMatch(/Retry failed emails.*?Off/s);
  });
});
