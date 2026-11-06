/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/chad-gtm-actions", () => ({
  searchMatchingLeadsAction: vi.fn(async () => ({
    ok: true,
    total: 1234,
    leads: [
      {
        id: 1,
        fullName: "Ana Lopez",
        firstName: "Ana",
        lastName: "Lopez",
        jobTitle: "Owner",
        companyName: "Acme",
        industry: "Logistics",
        location: "Austin, TX",
        country: "US",
      },
    ],
  })),
}));

import { SwipeCardDeck, type EmailCalibrationSample } from "../swipe-card";
import { CalibrationRefinementView } from "../calibration-refinement-view";
import { VelocitySlider } from "../velocity-slider";
import { StrategyReviewBoard } from "../strategy-review";
import { LeadMatcher } from "../lead-matcher";

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, unmount: () => act(async () => root.unmount()) };
}

const button = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

const sample = (id: string): EmailCalibrationSample => ({
  id,
  leadId: `lead-${id}`,
  recipientName: `Person ${id}`,
  recipientCompany: "Acme",
  recipientTitle: "Owner",
  recipientIndustry: "Logistics",
  subject: `Subject ${id}`,
  bodyText: `Body ${id}`,
  approved: false,
});

describe("SwipeCardDeck", () => {
  it("records approvals and rejection reasons, then hands back the whole deck", async () => {
    const onComplete = vi.fn();
    const { host, unmount } = await render(<SwipeCardDeck samples={[sample("1"), sample("2")]} onComplete={onComplete} />);

    expect(host.textContent).toContain("Email 1 of 2");
    await act(async () => button(host, "Approve")!.click());
    expect(host.textContent).toContain("Subject 2");

    // Keyboard: R opens the reasons, 1 picks the first one.
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" })));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" })));

    expect(host.textContent).toContain("All samples reviewed");
    await act(async () => button(host, "Rewrite my emails")!.click());
    const deck = onComplete.mock.calls[0][0] as EmailCalibrationSample[];
    expect(deck.map((s) => s.approved)).toEqual([true, false]);
    expect(deck[1].rejectedReason).toBe("Too generic");
    await unmount();
  });
});

describe("CalibrationRefinementView", () => {
  it("does not invent a voice when refinement failed", async () => {
    const { host, unmount } = await render(
      <CalibrationRefinementView
        isRefining={false}
        profile={null}
        refinedSamples={[sample("1")]}
        approvedCount={1}
        rejectedCount={0}
        onProceedToLaunch={() => {}}
        onRecalibrate={() => {}}
      />,
    );
    expect(host.textContent).toContain("couldn't learn a voice");
    expect(host.textContent).toContain("Subject 1");
    expect(host.textContent).not.toContain("{{company}}");
    await unmount();
  });

  it("describes the work without a fake percentage while refining", async () => {
    const { host, unmount } = await render(
      <CalibrationRefinementView
        isRefining
        profile={null}
        refinedSamples={[]}
        approvedCount={3}
        rejectedCount={2}
        onProceedToLaunch={() => {}}
        onRecalibrate={() => {}}
      />,
    );
    expect(host.textContent).toContain("Rewriting your emails");
    expect(host.textContent).not.toMatch(/\d+%/);
    await unmount();
  });
});

describe("VelocitySlider", () => {
  it("launches with the chosen daily limit", async () => {
    const onLaunch = vi.fn();
    const { host, unmount } = await render(<VelocitySlider initialLimit={60} onLaunch={onLaunch} />);
    expect(host.textContent).toContain("2 mailboxes");
    await act(async () => button(host, "Start outreach")!.click());
    expect(onLaunch).toHaveBeenCalledWith(60);
    await unmount();
  });
});

describe("StrategyReviewBoard", () => {
  it("confirms with the chosen pitch and edits", async () => {
    const onConfirm = vi.fn();
    const { host, unmount } = await render(
      <StrategyReviewBoard
        companyName="Acme"
        initialOverview={{ summary: "We route trucks.", valuePropositions: ["Faster"], keyDifferentiators: [], targetMarket: "Fleets" }}
        initialIcp={{ targetTitles: ["Owner"], companySizes: ["11-50"], industries: ["Logistics"], painPoints: ["Late loads"] }}
        initialOffers={[
          { title: "A", angle: "Speed", valueProp: "Fast", cta: "Worth a look?" },
          { title: "B", angle: "Cost", valueProp: "Cheap", cta: "Open to it?" },
        ]}
        onConfirm={onConfirm}
      />,
    );
    const radio = Array.from(host.querySelectorAll('[role="radio"]'))[1] as HTMLButtonElement;
    await act(async () => radio.click());
    expect(radio.getAttribute("aria-checked")).toBe("true");
    await act(async () => button(host, "Continue to audience")!.click());
    expect(onConfirm.mock.calls[0][0].selectedOfferIndex).toBe(1);
    await unmount();
  });
});

describe("LeadMatcher", () => {
  it("shows the real matching count and keeps one industry selected", async () => {
    const { host, unmount } = await render(
      <LeadMatcher initialIndustries={["Logistics"]} allAvailableIndustries={["Logistics", "Retail"]} onProceed={() => {}} />,
    );
    await act(async () => {});
    expect(host.textContent).toContain("1,234");
    expect(host.textContent).toContain("Ana Lopez");
    const remove = host.querySelector('[aria-label="Remove Logistics"]') as HTMLButtonElement;
    await act(async () => remove.click());
    expect(host.textContent).toContain("Keep at least one industry");
    await unmount();
  });
});
