/** @vitest-environment happy-dom */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({
  previewSequenceStep: vi.fn(),
  saveCampaignSequence: vi.fn(),
}));

import { SequenceEditor } from "../../app/(app)/campaigns/[id]/sequence-editor";

describe("SequenceEditor", () => {
  it("explains template fallback when a campaign has no steps", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <SequenceEditor
          campaignId="camp-1"
          initialSteps={[]}
          templateName="Founder outreach"
          hasTemplate
        />,
      );
    });
    expect(host.textContent).toContain("No sequence steps");
    expect(host.textContent).toContain("Founder outreach");
    expect(host.textContent).toContain("Using the campaign template");
    const add = [...host.querySelectorAll("button")].find((el) => el.textContent?.includes("Add first step"));
    expect(add).toBeTruthy();
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
