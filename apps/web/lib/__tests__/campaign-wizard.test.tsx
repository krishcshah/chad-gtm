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

describe("CampaignWizard selection-only", () => {
  it("selects an existing lead list and does not offer inline create or CSV upload", async () => {
    const { host, unmount } = await renderWizard({
      initialDraft: draft({ wizardStep: 2, leadListId: null }),
    });
    expect(host.textContent).not.toContain("New list");
    expect(host.textContent).not.toContain("Import leads");
    expect(host.textContent).not.toContain("Upload");
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

  it("selects an existing template with a checkmark and a non-selectable Preview panel", async () => {
    const { host, unmount } = await renderWizard({
      initialDraft: draft({ wizardStep: 4 }),
    });
    expect(host.textContent).not.toContain("New template");
    expect(host.querySelector("[aria-label='Preview']")).toBeNull();

    const intro = [...host.querySelectorAll("button")].find((el) => el.textContent?.includes("Intro"));
    await act(async () => {
      intro?.click();
    });

    expect(intro?.getAttribute("aria-pressed")).toBe("true");
    expect(intro?.querySelector("svg")).toBeTruthy();

    const preview = host.querySelector("[aria-label='Preview']");
    expect(preview).toBeTruthy();
    expect(preview?.tagName).not.toBe("BUTTON");
    expect(preview?.querySelector("button")).toBeNull();
    expect(preview?.querySelector("svg")).toBeNull();
    expect(preview?.textContent).toContain("Preview");
    expect(preview?.textContent).toContain("Quick question");
    expect(preview?.textContent).toContain("Hi {{first_name}}");
    expect(host.textContent).toContain("Save as Draft");
    await unmount();
  });

  it("keeps Save as Draft and publish on the last step", async () => {
    const { host, unmount } = await renderWizard({
      initialDraft: draft({ wizardStep: 6, templateId: "tpl-1", startMode: "later" }),
    });
    expect(host.textContent).toContain("Save as Draft");
    expect(host.textContent).toContain("Publish");
    await unmount();
  });
});
