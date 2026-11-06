/** @vitest-environment happy-dom */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/autopilot-actions", () => ({
  completeAutopilotSetupAction: vi.fn(),
  retryAutopilotLaunchAction: vi.fn(),
  retryAutopilotResearchAction: vi.fn(),
}));

import { LaunchDetailsForm, LaunchStatePanel, PlanPreviewCard } from "../../app/(app)/chad-gtm/launch-setup";

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, unmount: () => act(async () => root.unmount()) };
}

const noop = () => {};

describe("LaunchStatePanel", () => {
  it("shows a disabled launch button while waiting for approval", async () => {
    const { host, unmount } = await render(
      <LaunchStatePanel runId="r1" phase="awaiting_approval" approved={false} companyLabel="Acme" onChanged={noop} />,
    );
    expect(host.textContent).toContain("Waiting for approval");
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Launch outreach"));
    expect(button?.disabled).toBe(true);
    await unmount();
  });

  it("enables launch once approved", async () => {
    const { host, unmount } = await render(
      <LaunchStatePanel runId="r1" phase="ready" approved companyLabel="Acme" onChanged={noop} />,
    );
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Launch outreach"));
    expect(button?.disabled).toBe(false);
    await unmount();
  });

  it("offers retry research when targeting is not grounded", async () => {
    const { host, unmount } = await render(
      <LaunchStatePanel runId="r1" phase="needs_research" reason="We couldn't work out who to target." approved companyLabel="Acme" onChanged={noop} />,
    );
    expect(host.textContent).toContain("We couldn't work out who to target.");
    expect(host.textContent).toContain("Retry research");
    await unmount();
  });

  it("offers retry launch after a capacity failure", async () => {
    const { host, unmount } = await render(
      <LaunchStatePanel
        runId="r1"
        phase="launch_failed"
        reason="All of our sending mailboxes are busy."
        failureCode="no_senders"
        approved
        companyLabel="Acme"
        onChanged={noop}
      />,
    );
    expect(host.textContent).toContain("Retry launch");
    await unmount();
  });
});

describe("LaunchDetailsForm", () => {
  it("asks for the booking link and the CAN-SPAM identity together", async () => {
    const { host, unmount } = await render(
      <LaunchDetailsForm
        runId="r1"
        companyLabel="Acme"
        missing={["bookingUrl", "postalAddress"]}
        identity={{ companyName: "Acme", postalAddress: "" }}
        onOutcome={noop}
      />,
    );
    expect(host.querySelector("#setup-booking")).not.toBeNull();
    expect(host.querySelector("#setup-postal")).not.toBeNull();
    expect((host.querySelector("#setup-company") as HTMLInputElement).value).toBe("Acme");
    await unmount();
  });
});

describe("PlanPreviewCard", () => {
  it("renders the plan and a sample email", async () => {
    const { host, unmount } = await render(
      <PlanPreviewCard
        preview={{
          industries: ["Logistics and Supply Chain"],
          titles: ["Owner"],
          countries: ["United States"],
          sendingWindow: "Monday–Friday, 09:00–17:00 (America/New York)",
          offer: { title: "Faster routes", valueProp: "Plan routes in minutes." },
          sampleEmails: [
            { step: 1, delayDays: 0, recipient: { firstName: "Ana", jobTitle: "Owner", company: "Acme" }, subject: "routes", body: "Hi Ana" },
            { step: 2, delayDays: 3, recipient: null, subject: "re: routes", body: "One more" },
            { step: 3, delayDays: 4, recipient: null, subject: "re: routes", body: "Close the loop?" },
          ],
        }}
      />,
    );
    expect(host.textContent).toContain("United States");
    expect(host.textContent).toContain("Hi Ana");
    expect(host.textContent).toContain("Day 7");
    await unmount();
  });
});
