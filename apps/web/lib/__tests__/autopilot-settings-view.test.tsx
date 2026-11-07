/** @vitest-environment happy-dom */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

/* #48/#52: on an Autopilot campaign the Settings sheet shows the schedule,
 * pace and stop-on-reply as text (set by Autopilot), and Mission control shows
 * the effective schedule under the daily volume. */

const { updateCampaignSettings } = vi.hoisted(() => ({ updateCampaignSettings: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/actions", () => ({ updateCampaignSettings }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/lead-conversations/lead-conversations-control", () => ({ LeadConversationsControl: () => null }));

import { EditCampaignDialog } from "../../app/(app)/campaigns/[id]/edit-campaign-dialog";
import { VolumeCard } from "../../app/(app)/chad-gtm/[id]/run-controls";
import { campaignScheduleLine } from "../../app/(app)/chad-gtm/[id]/mission-control-view";

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, unmount: () => act(async () => root.unmount()) };
}

const CAMPAIGN = {
  id: "c1",
  name: "Acme outreach",
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
  senders: [{ id: "s1", email: "alex@pool.example", isSystemPool: true }],
};

async function openSheet(managed: boolean) {
  const view = await render(
    <EditCampaignDialog
      campaign={CAMPAIGN}
      availableSenders={[]}
      managedByAutopilot={managed}
      autopilotRunId={managed ? "r1" : null}
    />,
  );
  const trigger = [...view.host.querySelectorAll("button")].find((b) => b.textContent?.includes("Settings"))!;
  await act(async () => trigger.click());
  return view;
}

describe("EditCampaignDialog managed by Autopilot", () => {
  it("shows stop on reply and the timezone as text, not as a switch or an input", async () => {
    const view = await openSheet(true);
    const body = document.body;
    expect(body.textContent).toContain("Set by Autopilot.");
    expect(body.textContent).toContain("09:00–17:00 (America/New York)");
    expect(body.textContent).toContain("On: a lead who replies gets no more emails");
    expect(body.textContent).toContain("Monday–Friday");
    const link = [...body.querySelectorAll("a")].find((a) => a.textContent === "Change the daily volume on the Autopilot page");
    expect(link?.getAttribute("href")).toBe("/chad-gtm/r1");
    // No editable schedule, pace or stop-on-reply controls.
    expect(body.querySelector('input[type="time"]')).toBeNull();
    expect(body.querySelector('input[placeholder="UTC"]')).toBeNull();
    expect(body.querySelector('input[type="number"]')).toBeNull();
    const switches = [...body.querySelectorAll('[role="switch"]')].map((s) => s.id);
    const labels = switches.map((id) => body.querySelector(`label[for="${id}"]`)?.textContent);
    expect(labels).toEqual(["Track opens"]);
    await view.unmount();
    document.body.innerHTML = "";
  });

  it("saves only the name and open tracking", async () => {
    updateCampaignSettings.mockClear();
    const view = await openSheet(true);
    const form = document.body.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(updateCampaignSettings).toHaveBeenCalledWith("c1", { name: "Acme outreach", trackOpens: true });
    await view.unmount();
    document.body.innerHTML = "";
  });

  it("a manual campaign keeps the editable fields; an empty daily limit is an error, not 500", async () => {
    updateCampaignSettings.mockClear();
    const view = await openSheet(false);
    const body = document.body;
    expect(body.querySelector('input[type="time"]')).not.toBeNull();
    const limit = [...body.querySelectorAll('input[type="number"]')][0] as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(limit, "");
      limit.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = body.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(updateCampaignSettings).not.toHaveBeenCalled();
    expect(body.textContent).toContain("Enter a daily limit.");
    await view.unmount();
    document.body.innerHTML = "";
  });
});

describe("VolumeCard schedule line", () => {
  it("renders the schedule it is given", async () => {
    const line = campaignScheduleLine({
      businessDaysOnly: true,
      sendingWindowStart: "09:00",
      sendingWindowEnd: "17:00",
      sendingTimezone: "America/New_York",
      stopOnReply: true,
    });
    expect(line).toBe("Monday–Friday, 09:00–17:00 (America/New York). Stops emailing a lead once they reply.");
    const view = await render(<VolumeCard initial={60} onCommit={() => {}} schedule={line} />);
    expect(view.host.textContent).toContain(line);
    await view.unmount();
  });

  it("says when follow-ups continue after a reply (an admin turned stop-on-reply off)", () => {
    expect(
      campaignScheduleLine({
        businessDaysOnly: false,
        sendingWindowStart: "08:00",
        sendingWindowEnd: "18:00",
        sendingTimezone: "UTC",
        stopOnReply: false,
      }),
    ).toBe("Every day, 08:00–18:00 (UTC). Follow-ups continue after a reply.");
  });
});
