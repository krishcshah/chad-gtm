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

import { PlanPreviewCard } from "../../app/(app)/chad-gtm/launch-setup";
import type { PlanPreview } from "../autopilot-state";

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, unmount: () => act(async () => root.unmount()) };
}

const base: PlanPreview = {
  industries: ["Logistics and Supply Chain"],
  titles: ["Owner"],
  countries: ["United States"],
  sendingWindow: "Monday–Friday, 09:00–17:00 (America/New York)",
  offer: null,
  sampleEmails: [
    {
      step: 1,
      delayDays: 0,
      recipient: { firstName: "Ana", jobTitle: "Owner", company: "Acme" },
      subject: "routes",
      body: "Hi Ana,\n\nWorth a chat?\n\nBest,\nDana",
    },
  ],
};

describe("PlanPreviewCard sender (#66)", () => {
  it("shows the real From name and the mailbox signature, with one sign-off", async () => {
    const { host, unmount } = await render(
      <PlanPreviewCard
        preview={{ ...base, sender: { name: "Dana Lee", signature: "Dana Lee\nHead of Growth", poolSize: 12 } }}
      />,
    );
    expect(host.querySelector('[data-testid="plan-sample-from"]')?.textContent).toBe(
      "From Dana Lee · one of 12 AutoGTM mailboxes",
    );
    const body = host.querySelector('[data-testid="plan-sample-signature"]')?.parentElement;
    expect(body?.textContent).toBe(
      "Hi Ana,\n\nWorth a chat?\n\nBest,\nSignature added by the sending mailbox: Dana Lee\nHead of Growth",
    );
    expect(host.textContent).toContain("Each lead hears from one mailbox, under its own name and signature.");
    await unmount();
  });

  it("shows the body unchanged and no From line without a mailbox", async () => {
    const { host, unmount } = await render(<PlanPreviewCard preview={base} />);
    expect(host.querySelector('[data-testid="plan-sample-from"]')).toBeNull();
    expect(host.querySelector('[data-testid="plan-sample-signature"]')).toBeNull();
    expect(host.textContent).toContain("Best,\nDana");
    await unmount();
  });
});
