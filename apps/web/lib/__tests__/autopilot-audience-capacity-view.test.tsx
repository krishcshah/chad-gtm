/** @vitest-environment happy-dom */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

/* Problem 2: the run page shows the whole audience. Problem 8: the volume
 * controls say what the shared mailboxes can really send. */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/autopilot-actions", () => ({ startAutopilotAction: vi.fn() }));
vi.mock("@/components/lead-conversations/lead-conversations-control", () => ({ LeadConversationsControl: () => null }));

import { PoolCapacityNote, VelocitySlider, VolumeForecast } from "@/components/chad-gtm/velocity-slider";
import { VolumeCard } from "../../app/(app)/chad-gtm/[id]/run-controls";
import { AudienceCard, prospectsStat } from "../../app/(app)/chad-gtm/[id]/audience-card";
import { AutopilotLauncher } from "../../app/(app)/chad-gtm/autopilot-launcher";
import { summarizeAudience } from "../audience-summary";

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, unmount: () => act(async () => root.unmount()) };
}

const SHARE = { activeMailboxes: 4, totalDailyCapacity: 120, availableToYou: 90 };

describe("pool capacity next to the emails-per-day control", () => {
  it("states what can go out, and what to expect above it", async () => {
    const fits = await render(<PoolCapacityNote share={SHARE} perDay={60} />);
    expect(fits.host.textContent).toBe("Right now our mailboxes can send about 90 emails a day for you.");
    await fits.unmount();

    const over = await render(<PoolCapacityNote share={SHARE} perDay={500} />);
    expect(over.host.textContent).toContain("Expect about 90 a day until more mailboxes are added.");
    await over.unmount();
  });

  it("says sending is paused with no mailboxes", async () => {
    const v = await render(<PoolCapacityNote share={{ activeMailboxes: 0, totalDailyCapacity: 0, availableToYou: 0 }} perDay={60} />);
    expect(v.host.textContent).toContain("Sending is paused until we add mailboxes to our pool.");
    await v.unmount();
  });

  it("renders nothing when the estimate is unknown", async () => {
    const v = await render(<PoolCapacityNote share={null} perDay={60} />);
    expect(v.host.textContent).toBe("");
    await v.unmount();
  });

  it("bases the forecast on what can go out and keeps the pricing facts", async () => {
    const v = await render(<VolumeForecast perDay={300} expected={90} />);
    // 90 a day → 30 new leads a day, 1,980 emails a month, up to $99.
    expect(v.host.textContent).toContain("Based on about 90 a day");
    expect(v.host.textContent).toContain("about 30");
    expect(v.host.textContent).toContain("$99");
    expect(v.host.textContent).toContain("Each lead gets 3 emails");
    expect(v.host.textContent).toContain("5¢ per email sent");
    await v.unmount();
  });

  it("shows on the guided setup, the run page and the launcher", async () => {
    const slider = await render(<VelocitySlider initialLimit={300} onLaunch={() => {}} poolShare={SHARE} />);
    expect(slider.host.querySelector('[data-testid="pool-capacity-note"]')?.textContent).toContain("about 90 emails a day");
    await slider.unmount();

    const card = await render(<VolumeCard initial={60} onCommit={() => {}} poolShare={SHARE} />);
    expect(card.host.textContent).toContain("Right now our mailboxes can send about 90 emails a day for you.");
    await card.unmount();

    const sender = { workspaceName: "Northwind", companyName: "Northwind Inc", postalAddress: "1 Main St, Austin, TX 78701, USA" };
    const launcher = await render(
      <AutopilotLauncher runs={[]} poolShare={SHARE} approved={false} sender={sender} defaultBookingUrl="https://cal.com/dana" />,
    );
    expect(launcher.host.textContent).toContain("about 90 emails a day");
    expect(launcher.host.querySelector('[data-testid="launcher-awaiting-approval"]')?.textContent).toContain(
      "launches on its own as soon as you're approved",
    );
    await launcher.unmount();
  });

  it("only promises a launch on approval when nothing else is missing", async () => {
    const launcher = await render(<AutopilotLauncher runs={[]} poolShare={SHARE} approved={false} />);
    const note = launcher.host.querySelector('[data-testid="launcher-awaiting-approval"]')?.textContent ?? "";
    expect(note).not.toContain("as soon as you're approved");
    expect(note).toContain("once you're approved and you've added your booking link and your company name and postal address");
    await launcher.unmount();
  });

  it("says plainly when the mailboxes are full (no 'about 0 a day')", async () => {
    const full = { activeMailboxes: 4, totalDailyCapacity: 120, availableToYou: 0 };
    const note = await render(<PoolCapacityNote share={full} perDay={60} />);
    expect(note.host.textContent).toContain("Our mailboxes are full right now, so sending waits for room.");
    expect(note.host.textContent).not.toContain("about 0");
    await note.unmount();
    const forecast = await render(<VolumeForecast perDay={60} expected={0} />);
    expect(forecast.host.textContent).toContain("Nothing can go out right now");
    expect(forecast.host.textContent).toContain("about 20"); // the chosen 60 a day, once it can go out
    expect(forecast.host.textContent).not.toContain("Based on about 0");
    await forecast.unmount();
  });

  it("on the run page, speaks for this campaign when the customer runs several", async () => {
    const share = { activeMailboxes: 4, totalDailyCapacity: 120, availableToYou: 45, forCampaign: true, yourCampaigns: 2, customerShare: 90 };
    const v = await render(<PoolCapacityNote share={share} perDay={30} />);
    expect(v.host.textContent).toContain("about 45 emails a day for this campaign. Your 2 running campaigns share about 90 a day.");
    await v.unmount();
  });
});

describe("run page audience", () => {
  const audience = summarizeAudience(
    {
      version: 1,
      tiers: {
        "1": { total: 1200, added: 200, exhausted: false },
        "2": { total: 3000, added: 0, exhausted: false },
        "3": { total: 20000, added: 0, exhausted: false },
      },
      added: 200,
      exhausted: false,
      countedAt: "2026-11-01T00:00:00.000Z",
    },
    [{ priority: 1, loaded: 200, emailed: 50, waiting: 150 }],
  );

  it("the Prospects stat is the full total, not the loaded batch", () => {
    expect(prospectsStat(audience, { loaded: 200 })).toEqual({
      value: "24,200",
      hint: "50 emailed · about 24,150 to come",
    });
  });

  it("older runs keep the loaded count", () => {
    expect(prospectsStat(null, { loaded: 200, roleMatches: 150 })).toEqual({ value: "200", hint: "150 match your roles" });
  });

  it("breaks the audience down by priority", async () => {
    const v = await render(<AudienceCard audience={audience} perDay={60} />);
    const text = v.host.textContent ?? "";
    expect(text).toContain("24,200 contacts match. We email all of them, in this order.");
    expect(text).toContain("Priority 1");
    expect(text).toContain("Your target job titles");
    expect(text).toContain("1,200 match · 50 emailed · 1,150 to come");
    expect(text).toContain("Other decision-makers");
    expect(text).toContain("Everyone else in your industries");
    expect(text).toContain("everyone gets a first email in");
    await v.unmount();
  });
});
