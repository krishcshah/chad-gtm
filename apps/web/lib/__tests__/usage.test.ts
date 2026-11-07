import { describe, expect, it } from "vitest";
import { EMAILS_PER_LEAD, costCents, forecastFromDailyVolume, formatCents, monthBounds, PRICE_CENTS_PER_EMAIL } from "../usage";

describe("usage and cost", () => {
  it("charges every email, follow-ups included", () => {
    expect(PRICE_CENTS_PER_EMAIL).toBe(5);
    expect(costCents(6000)).toBe(30000);
    expect(formatCents(30000)).toBe("$300.00");
  });

  it("6,000 emails reach about 2,000 leads", () => {
    // Three emails per lead: outreach and two follow-ups.
    expect(Math.round(6000 / EMAILS_PER_LEAD)).toBe(2000);
  });

  it("forecasts a month from a daily volume", () => {
    expect(forecastFromDailyVolume(100)).toEqual({
      emailsPerMonth: 2200,
      newLeadsPerDay: 33,
      leadsPerMonth: 733,
      costCentsPerMonth: 11000,
    });
  });

  it("uses calendar-month UTC bounds", () => {
    expect(monthBounds(new Date("2026-11-07T12:00:00Z"))).toEqual({
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-12-01T00:00:00.000Z",
    });
  });
});
