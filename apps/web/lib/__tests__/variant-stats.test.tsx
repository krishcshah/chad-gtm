import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EARLIER_VERSION_LABEL,
  MIN_SENDS_TO_CALL,
  summarizeVariantStats,
  type VariantStatRow,
} from "../variant-stats";
import { VariantResults } from "../../app/(app)/campaigns/[id]/variant-results";

function row(overrides: Partial<VariantStatRow>): VariantStatRow {
  return {
    stepPosition: 1,
    variantId: "va",
    label: "A",
    pausedAt: null,
    sent: 10,
    leads: 10,
    opened: 0,
    replied: 0,
    ...overrides,
  };
}

describe("summarizeVariantStats", () => {
  it("drops steps with a single variant", () => {
    const steps = summarizeVariantStats(
      [
        row({ stepPosition: 1, variantId: "a1" }),
        row({ stepPosition: 2, variantId: "a2", label: "A" }),
        row({ stepPosition: 2, variantId: "b2", label: "B" }),
      ],
      { trackOpens: true },
    );
    expect(steps.map((s) => s.stepPosition)).toEqual([2]);
    expect(steps[0]!.variants.map((v) => v.label)).toEqual(["A", "B"]);
  });

  it("computes rates per lead, not per email", () => {
    const [step] = summarizeVariantStats(
      [
        row({ variantId: "a", label: "A", sent: 40, leads: 20, opened: 10, replied: 5 }),
        row({ variantId: "b", label: "B", sent: 20, leads: 20, opened: 4, replied: 1 }),
      ],
      { trackOpens: true },
    );
    const a = step!.variants.find((v) => v.variantId === "a")!;
    expect(a.sent).toBe(40);
    expect(a.openRate).toBe(50);
    expect(a.replyRate).toBe(25);
    expect(step!.variants.find((v) => v.variantId === "b")!.replyRate).toBe(5);
  });

  it("does not name a leader while any variant has fewer than 50 leads", () => {
    const [step] = summarizeVariantStats(
      [
        row({ variantId: "a", label: "A", leads: MIN_SENDS_TO_CALL, replied: 10 }),
        row({ variantId: "b", label: "B", leads: MIN_SENDS_TO_CALL - 1, replied: 0 }),
      ],
      { trackOpens: true },
    );
    expect(step!.leader).toBeNull();
    expect(step!.tooEarly).toBe(true);
  });

  it("names the higher reply rate as leader at 50 or more leads each", () => {
    const [step] = summarizeVariantStats(
      [
        row({ variantId: "a", label: "A", leads: 50, replied: 2 }),
        row({ variantId: "b", label: "B", leads: 80, replied: 8 }),
      ],
      { trackOpens: true },
    );
    expect(step!.tooEarly).toBe(false);
    expect(step!.leader).toBe("b");
  });

  it("names no leader when the reply rates are equal", () => {
    const [step] = summarizeVariantStats(
      [
        row({ variantId: "a", label: "A", leads: 50, replied: 5 }),
        row({ variantId: "b", label: "B", leads: 100, replied: 10 }),
      ],
      { trackOpens: true },
    );
    expect(step!.tooEarly).toBe(false);
    expect(step!.leader).toBeNull();
  });

  it("leaves open rate empty when open tracking is off", () => {
    const [step] = summarizeVariantStats(
      [row({ variantId: "a", label: "A", opened: 5 }), row({ variantId: "b", label: "B", opened: 3 })],
      { trackOpens: false },
    );
    expect(step!.variants.every((v) => v.openRate === null)).toBe(true);
  });

  it("labels a deleted variant 'Earlier version' and lists it last", () => {
    const [step] = summarizeVariantStats(
      [row({ variantId: "gone", label: null }), row({ variantId: "a", label: "A", pausedAt: "2026-10-01" })],
      { trackOpens: true },
    );
    expect(step!.variants.map((v) => v.label)).toEqual(["A", EARLIER_VERSION_LABEL]);
    expect(EARLIER_VERSION_LABEL).toBe("Earlier version");
    expect(step!.variants[0]!.paused).toBe(true);
  });
});

describe("VariantResults", () => {
  it("renders nothing when no step has two variants", () => {
    expect(renderToStaticMarkup(<VariantResults steps={[]} />)).toBe("");
  });

  it("shows the table, a Paused badge, the leader and 'Not tracked' opens", () => {
    const steps = summarizeVariantStats(
      [
        row({ variantId: "a", label: "A", leads: 60, replied: 3, pausedAt: "2026-10-01" }),
        row({ variantId: "b", label: "B", leads: 60, replied: 9 }),
      ],
      { trackOpens: false },
    );
    const html = renderToStaticMarkup(<VariantResults steps={steps} />);
    expect(html).toContain("Variant results");
    expect(html).toContain("Reply rate");
    expect(html).toContain("Paused");
    expect(html).toContain("Ahead");
    expect(html).toContain("Not tracked");
    expect(html).not.toContain("Too early to call");
  });

  it("says it is too early under 50 leads per version", () => {
    const steps = summarizeVariantStats([row({ variantId: "a" }), row({ variantId: "b", label: "B" })], {
      trackOpens: true,
    });
    const html = renderToStaticMarkup(<VariantResults steps={steps} />);
    expect(html).toContain("Too early to call: wait for 50 leads on each version.");
    expect(html).not.toContain("Ahead");
  });
});
