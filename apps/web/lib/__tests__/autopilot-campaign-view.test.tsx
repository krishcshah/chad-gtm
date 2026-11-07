/** @vitest-environment happy-dom */
/**
 * #49: an Autopilot campaign's sequence and schedule are managed by Autopilot,
 * so the campaign page shows them read-only with a way back to the run.
 */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/campaigns/c1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions", () => ({
  updateCampaignSettings: vi.fn(),
}));

import { ScheduleCard, SequenceSummaryCard } from "../../app/(app)/campaigns/[id]/overview-cards";
import { EditCampaignDialog } from "../../app/(app)/campaigns/[id]/edit-campaign-dialog";

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const steps = [
  { id: "s1", delayDays: 0, variants: [{ id: "v1", label: "A", subject: "Quick idea", bodyText: "Hi", aiGenerateOnTheFly: false }] },
] as any[];

const schedule = {
  dailyLimit: 60,
  windowStart: "09:00",
  windowEnd: "17:00",
  timezone: "America/New_York",
  businessDaysOnly: true,
  minDelaySec: 45,
  maxDelaySec: 120,
  stopOnReply: true,
  trackOpens: true,
  capacity: { perDay: 60, limitedBy: "campaign" } as any,
};

describe("SequenceSummaryCard", () => {
  it("offers 'Edit sequence' for a manual campaign", async () => {
    const { host, unmount } = await render(<SequenceSummaryCard steps={steps} error={null} templateName={null} />);
    expect(host.textContent).toContain("Edit sequence");
    await unmount();
  });

  it("hides 'Edit sequence' when Autopilot manages the sequence", async () => {
    const { host, unmount } = await render(
      <SequenceSummaryCard steps={steps} error={null} templateName={null} managed />,
    );
    expect(host.textContent).not.toContain("Edit sequence");
    expect(host.textContent).toContain("Quick idea");
    await unmount();
  });
});

describe("ScheduleCard", () => {
  it("says the schedule is set by Autopilot", async () => {
    const { host, unmount } = await render(<ScheduleCard {...schedule} managedByAutopilot />);
    expect(host.textContent).toContain("Set by Autopilot.");
    expect(host.textContent).not.toContain("Settings button");
    await unmount();
  });

  it("points a manual campaign at Settings", async () => {
    const { host, unmount } = await render(<ScheduleCard {...schedule} />);
    expect(host.textContent).not.toContain("Set by Autopilot.");
    await unmount();
  });
});

describe("EditCampaignDialog for an Autopilot campaign", () => {
  const campaign = {
    id: "c1",
    name: "AutoGTM: Acme",
    dailyLimit: 60,
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:00",
    sendingTimezone: "America/New_York",
    businessDaysOnly: true,
    stopOnReply: true,
    trackOpens: true,
    minDelaySec: 45,
    maxDelaySec: 120,
    maxEmailsPerSenderPerDay: 30,
    retryFailed: true,
    retryCount: 2,
    senders: [{ id: "s1", email: "alex@pool.example", senderName: "Alex", isSystemPool: true }],
  } as any;

  async function openSheet(node: React.ReactNode) {
    const r = await render(node);
    const trigger = [...r.host.querySelectorAll("button")].find((b) => b.textContent?.includes("Settings"));
    await act(async () => {
      trigger!.click();
    });
    return r;
  }

  it("hides the sequence shortcut and the daily-limit input, and links to the Autopilot page", async () => {
    const { unmount } = await openSheet(
      <EditCampaignDialog
        campaign={campaign}
        availableSenders={[]}
        onGoToSequence={() => {}}
        managedByAutopilot
        autopilotRunId="run-1"
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Edit sequence");
    const numberInputs = [...document.body.querySelectorAll("input[type=number]")];
    expect(numberInputs.some((i) => (i as HTMLInputElement).value === "60")).toBe(false);
    const link = [...document.body.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Change the daily volume on the Autopilot page"),
    );
    expect(link?.getAttribute("href")).toBe("/chad-gtm/run-1");
    await unmount();
  });

  it("keeps the shortcut and the input for a manual campaign", async () => {
    const { unmount } = await openSheet(
      <EditCampaignDialog
        campaign={{ ...campaign, senders: [{ id: "s2", email: "me@acme.example", senderName: "Me" }] }}
        availableSenders={[]}
        onGoToSequence={() => {}}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Edit sequence");
    const numberInputs = [...document.body.querySelectorAll("input[type=number]")];
    expect(numberInputs.some((i) => (i as HTMLInputElement).value === "60")).toBe(true);
    await unmount();
  });
});
