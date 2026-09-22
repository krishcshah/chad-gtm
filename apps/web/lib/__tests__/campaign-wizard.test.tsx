/** @vitest-environment happy-dom */
import { act, type ComponentProps, type ReactNode } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/actions", () => ({
  publishCampaign: vi.fn(),
  saveCampaignDraft: vi.fn(),
  saveCampaignSequence: vi.fn(),
}));

import { CampaignWizard, type CampaignDraftSeed } from "../../app/(app)/campaigns/new/campaign-wizard";

function draft(overrides: Partial<CampaignDraftSeed> & Pick<CampaignDraftSeed, "wizardStep">): CampaignDraftSeed {
  return {
    id: "d1",
    name: "Q1",
    leadListId: "list-1",
    templateId: null,
    senderIds: [],
    scheduledAt: null,
    businessDaysOnly: false,
    sendingTimezone: "UTC",
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:00",
    dailyLimit: 500,
    minDelaySec: 90,
    maxDelaySec: 240,
    maxEmailsPerSenderPerDay: 50,
    stopOnReply: true,
    retryFailed: true,
    retryCount: 2,
    startMode: "now",
    ...overrides,
  };
}

const lists = [
  { id: "list-1", name: "Founders", leadCount: 12 },
  { id: "list-2", name: "Agencies", leadCount: 4 },
];
const templates = [
  { id: "tpl-1", name: "Intro", subject: "Quick question", bodyText: "Hi {{first_name}}" },
  { id: "tpl-2", name: "Follow up", subject: "Circling back", bodyText: "Just checking in." },
];

async function renderWizard(props: Partial<ComponentProps<typeof CampaignWizard>> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <CampaignWizard
        leadLists={lists}
        senders={[]}
        templates={templates}
        {...props}
      />,
    );
  });
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("CampaignWizard", () => {
  it("selects an existing lead list on Step 2", async () => {
    const { host, unmount } = await renderWizard({
      initialDraft: draft({ wizardStep: 2, leadListId: null }),
    });
    expect(host.textContent).not.toContain("New list");
    expect(host.textContent).not.toContain("Import leads");
    const buttons = [...host.querySelectorAll("button")];
    const founders = buttons.find((el) => el.textContent?.includes("Founders"));
    expect(founders?.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      founders?.click();
    });
    expect(founders?.getAttribute("aria-pressed")).toBe("true");
    expect(founders?.querySelector("svg")).toBeTruthy();
    await unmount();
  });

  it("configures sequences in Step 4 with initial/follow-up steps and formatted/plain toggle", async () => {
    const { host, unmount } = await renderWizard({
      initialDraft: draft({ wizardStep: 4, templateId: "tpl-1" }),
    });
    expect(host.textContent).toContain("Sequence");
    expect(host.textContent).toContain("Initial");
    expect(host.textContent).toContain("Quick question");

    // Check formatted vs plain toggle exists
    expect(host.textContent).toContain("Formatted");
    expect(host.textContent).toContain("Plain text");

    // Toggle to plain text
    const plainBtn = [...host.querySelectorAll("button")].find((el) => el.textContent === "Plain text");
    expect(plainBtn).toBeTruthy();
    await act(async () => {
      plainBtn?.click();
    });
    expect(host.textContent).toContain("Standard plain text");

    // Add step button adds follow-up
    const addStepBtn = [...host.querySelectorAll("button")].find((el) => el.textContent?.includes("Add step"));
    expect(addStepBtn).toBeTruthy();
    await act(async () => {
      addStepBtn?.click();
    });
    expect(host.textContent).toContain("Follow-up 1");

    await unmount();
  });

  it("renders information-dense preview and action buttons on Step 6", async () => {
    const { host, unmount } = await renderWizard({
      initialDraft: draft({ wizardStep: 6, templateId: "tpl-1", startMode: "later" }),
    });
    expect(host.textContent).toContain("Ready to publish");
    expect(host.textContent).toContain("Target Leads");
    expect(host.textContent).toContain("Connected Senders");
    expect(host.textContent).toContain("Audience & Senders");
    expect(host.textContent).toContain("Sequence Steps");
    expect(host.textContent).toContain("Save as Draft");
    expect(host.textContent).toContain("Publish Campaign");
    await unmount();
  });
});
