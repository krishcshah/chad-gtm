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

import { LaunchDetailsForm, LaunchStatePanel, PlanPreviewCard, audienceText } from "../../app/(app)/chad-gtm/launch-setup";

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

  it("leaves the approval explanation to the global banner (no repeated email or check-back copy)", async () => {
    const off = await render(
      <LaunchStatePanel runId="r1" phase="awaiting_approval" approved={false} companyLabel="Acme" onChanged={noop} />,
    );
    // Approval launches only the newest plan: the line says so (any other plan needs Launch).
    expect(off.host.textContent).toContain("Once your account is approved, your newest plan launches on its own.");
    expect(off.host.textContent).toContain("Any other plan waits for you to press Launch.");
    expect(off.host.textContent).not.toMatch(/email/i);
    expect(off.host.textContent).not.toMatch(/Check back/i);
    await off.unmount();

    const withReason = await render(
      <LaunchStatePanel
        runId="r1"
        phase="awaiting_approval"
        reason="Your account is waiting for approval. You'll get an email when you're approved."
        approved={false}
        emailOnApprove
        companyLabel="Acme"
        onChanged={noop}
      />,
    );
    expect(withReason.host.textContent).not.toMatch(/email/i);
    expect(withReason.host.textContent).toContain("launches on its own");
    expect(withReason.host.textContent?.match(/launches on its own/g)).toHaveLength(1);
    await withReason.unmount();
  });

  it("links needs_research to guided setup for the same run, so a blocked site is not a dead end (#55)", async () => {
    const { host, unmount } = await render(
      <LaunchStatePanel runId="r1" phase="needs_research" reason="We couldn't read your website." approved companyLabel="Acme" onChanged={noop} />,
    );
    const link = Array.from(host.querySelectorAll("a")).find((a) => a.textContent?.includes("guided setup"));
    expect(link?.getAttribute("href")).toBe("/chad-gtm?mode=guided&run=r1");
    expect(link?.getAttribute("href")).toContain("&run=r1");
    await unmount();
  });

  it("gives a draft run a Continue setup link to guided setup for the same run (#55)", async () => {
    const { host, unmount } = await render(
      <LaunchStatePanel runId="r 1" phase="draft" approved companyLabel="Acme" onChanged={noop} />,
    );
    expect(host.textContent).toContain("Setup isn't finished");
    const link = Array.from(host.querySelectorAll("a")).find((a) => a.textContent?.includes("Continue setup"));
    expect(link?.getAttribute("href")).toBe("/chad-gtm?mode=guided&run=r%201");
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

  it("shows a complete identity read-only under 'Sending as' with the workspace, and lets you change it (#73)", async () => {
    const { host, unmount } = await render(
      <LaunchDetailsForm
        runId="r1"
        companyLabel="Acme"
        missing={["bookingUrl"]}
        identity={{ companyName: "Client B LLC", postalAddress: "500 Client B Ave\nAustin, TX 78701" }}
        workspaceName="Client B"
        onOutcome={noop}
      />,
    );
    expect(host.textContent).toContain("Sending as");
    expect(host.textContent).toContain("For workspace Client B");
    expect(host.textContent).toContain("Client B LLC");
    expect(host.textContent).toContain("500 Client B Ave");
    expect(host.querySelector("#setup-booking")).not.toBeNull();
    expect(host.querySelector("#setup-company")).toBeNull();
    expect(host.querySelector("#setup-postal")).toBeNull();

    const change = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Change for this workspace");
    expect(change).toBeDefined();
    await act(async () => change!.click());

    expect((host.querySelector("#setup-company") as HTMLInputElement).value).toBe("Client B LLC");
    expect((host.querySelector("#setup-postal") as HTMLTextAreaElement).value).toBe("500 Client B Ave\nAustin, TX 78701");
    expect(host.textContent).toContain(
      "We add both to the footer of every email sent from Client B, and save them in Settings for this workspace only.",
    );
    expect(host.textContent).not.toContain("under Compliance");
    await unmount();
  });

  it("labels a company name prefilled from the website research (#73)", async () => {
    const { host, unmount } = await render(
      <LaunchDetailsForm
        runId="r1"
        companyLabel="Acme"
        missing={["companyName", "postalAddress"]}
        identity={{ companyName: "", postalAddress: "" }}
        workspaceName="Client B"
        suggestedCompanyName="Acme Researched"
        onOutcome={noop}
      />,
    );
    expect((host.querySelector("#setup-company") as HTMLInputElement).value).toBe("Acme Researched");
    expect(host.querySelector("#setup-company-hint")?.textContent).toBe(
      "Filled in from your website research. Use your legal or trading name.",
    );
    // Missing identity: editable straight away, no "Change" button.
    const change = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Change for this workspace");
    expect(change).toBeUndefined();
    await unmount();
  });

  it("does not use the suggestion when the workspace already has a company name", async () => {
    const { host, unmount } = await render(
      <LaunchDetailsForm
        runId="r1"
        companyLabel="Acme"
        missing={["postalAddress"]}
        identity={{ companyName: "Client B LLC", postalAddress: "" }}
        suggestedCompanyName="Acme Researched"
        onOutcome={noop}
      />,
    );
    expect((host.querySelector("#setup-company") as HTMLInputElement).value).toBe("Client B LLC");
    expect(host.querySelector("#setup-company-hint")).toBeNull();
    await unmount();
  });

  it("submits the identity only when it was missing or changed (#73)", async () => {
    const { completeAutopilotSetupAction } = await import("@/lib/autopilot-actions");
    const save = vi.mocked(completeAutopilotSetupAction);
    save.mockReset();
    save.mockResolvedValue({ ok: true, data: { runId: "r1", phase: "live", companyName: "Acme" } } as any);
    const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const identity = { companyName: "Client B LLC", postalAddress: "500 Client B Ave, Austin, TX 78701" };

    // Read-only identity: only the booking link is sent.
    const first = await render(
      <LaunchDetailsForm runId="r1" companyLabel="Acme" missing={["bookingUrl"]} identity={identity} onOutcome={noop} />,
    );
    await act(async () => setValue(first.host.querySelector("#setup-booking") as HTMLInputElement, "https://cal.com/b/intro"));
    await act(async () => (first.host.querySelector("form") as HTMLFormElement).requestSubmit());
    expect(save).toHaveBeenLastCalledWith("r1", { bookingUrl: "https://cal.com/b/intro" });
    await first.unmount();

    // Changed for this workspace: the new identity is sent with the booking link.
    const second = await render(
      <LaunchDetailsForm runId="r1" companyLabel="Acme" missing={["bookingUrl"]} identity={identity} onOutcome={noop} />,
    );
    const change = Array.from(second.host.querySelectorAll("button")).find((b) => b.textContent === "Change for this workspace");
    await act(async () => change!.click());
    await act(async () => setValue(second.host.querySelector("#setup-booking") as HTMLInputElement, "https://cal.com/b/intro"));
    await act(async () => setValue(second.host.querySelector("#setup-company") as HTMLInputElement, "Client B Inc."));
    await act(async () => (second.host.querySelector("form") as HTMLFormElement).requestSubmit());
    expect(save).toHaveBeenLastCalledWith("r1", {
      bookingUrl: "https://cal.com/b/intro",
      companyName: "Client B Inc.",
      postalAddress: identity.postalAddress,
    });
    await second.unmount();
  });
});

describe("LaunchStatePanel needs_details (#73)", () => {
  it("passes the workspace name and the research suggestion to the details form", async () => {
    const { host, unmount } = await render(
      <LaunchStatePanel
        runId="r1"
        phase="needs_details"
        approved
        companyLabel="Acme"
        missing={["companyName", "postalAddress"]}
        identity={{ companyName: "", postalAddress: "" }}
        workspaceName="Client B"
        suggestedCompanyName="Acme Researched"
        onChanged={noop}
      />,
    );
    expect(host.textContent).toContain("For workspace Client B");
    expect((host.querySelector("#setup-company") as HTMLInputElement).value).toBe("Acme Researched");
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

  const basePreview = {
    industries: ["Logistics and Supply Chain"],
    titles: ["Owner"],
    countries: ["United States"],
    sendingWindow: "Monday–Friday, 09:00–17:00 (America/New York)",
    offer: null,
    sampleEmails: [],
  };

  it("shows the launch audience: every match in priority order and the 90-day skip (#56)", async () => {
    const { host, unmount } = await render(
      <PlanPreviewCard
        preview={{ ...basePreview, audience: { roleMatches: 300, otherRoles: 700, perRun: 500, strictRoles: false } }}
      />,
    );
    expect(host.textContent).toContain("All 1,000 matching contacts in the countries we send to (United States), in priority order");
    expect(host.textContent).toContain("300 with your job titles first, then 700 other decision-makers and people in your industries");
    expect(host.textContent).not.toContain("People at your company size go first");
    expect(host.textContent).toContain("Each gets three emails over five days.");
    expect(host.textContent).toContain("People anyone contacted in the last 90 days and opted-out addresses are skipped.");
    await unmount();
  });

  it("counts only title matches with strict roles, and warns when nobody matches", async () => {
    const strict = await render(
      <PlanPreviewCard
        preview={{ ...basePreview, audience: { roleMatches: 300, otherRoles: 700, perRun: 500, strictRoles: true } }}
      />,
    );
    expect(strict.host.textContent).toContain(
      "All 300 matching contacts in the countries we send to (United States), in priority order: only people with your job titles.",
    );
    await strict.unmount();

    // Company size orders the list; the counts are never narrowed by it.
    const sized = await render(
      <PlanPreviewCard
        preview={{
          ...basePreview,
          companySizes: ["11-50"],
          audience: { roleMatches: 300, otherRoles: 700, perRun: 500, strictRoles: false, bySize: true },
        }}
      />,
    );
    expect(sized.host.textContent).toContain("All 1,000 matching contacts");
    expect(sized.host.textContent).toContain("People at your company size go first in each group.");
    expect(sized.host.textContent).toContain("Company size (contacted first)");
    expect(sized.host.textContent).not.toContain("and company size");
    await sized.unmount();

    const none = await render(
      <PlanPreviewCard preview={{ ...basePreview, audience: { roleMatches: 0, otherRoles: 0, perRun: 500, strictRoles: false } }} />,
    );
    expect(none.host.textContent).toContain("No contacts match this plan, so the launch would fail.");
    await none.unmount();
  });
});

describe("LaunchStatePanel while launching (#50)", () => {
  it("offers a Retry launch button in the launching state", async () => {
    const { host, unmount } = await render(
      <LaunchStatePanel runId="r1" phase="launching" approved companyLabel="Acme" onChanged={noop} />,
    );
    expect(host.textContent).toContain("Setting up your campaign");
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Retry launch"));
    expect(button?.disabled).toBe(false);
    await unmount();
  });
});

describe("audienceText", () => {
  it("never says the launch would fail when the count itself failed", () => {
    const text = audienceText({ roleMatches: 0, otherRoles: 0, perRun: 0, strictRoles: false, unavailable: true }, ["United States"]);
    expect(text).toContain("We couldn't count the matching contacts just now.");
    expect(text).not.toMatch(/would fail/);
    expect(audienceText({ roleMatches: 0, otherRoles: 0, perRun: 0, strictRoles: false })).toMatch(/would fail/);
  });
});
