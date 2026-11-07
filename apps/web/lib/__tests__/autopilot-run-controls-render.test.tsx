/** @vitest-environment happy-dom */
/**
 * #58: a launched run's booking link can be removed (with a confirm that says
 * the agent then asks in Needs you). #51: the Pitch card is editable.
 */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/lead-conversations/lead-conversations-control", () => ({
  LeadConversationsControl: () => null,
}));

import { PitchCard, ReplyAgentCard } from "../../app/(app)/chad-gtm/[id]/run-controls";

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

const noop = () => {};
const base = {
  runId: "run-1",
  leadConversation: null,
  onBookingChange: noop,
  editingBooking: false,
  onEditBooking: noop,
  onSaveBooking: noop,
  savingBooking: false,
  openRequests: 0,
};

const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

describe("ReplyAgentCard booking link", () => {
  it("offers Remove with a confirm that explains the agent asks you in Needs you", async () => {
    const onRemove = vi.fn(async () => {});
    const { host, unmount } = await render(
      <ReplyAgentCard {...base} booking="https://cal.com/acme/intro" onRemoveBooking={onRemove} />,
    );
    const remove = button(host, "Remove");
    expect(remove).toBeTruthy();
    await act(async () => remove!.click());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Remove the booking link?");
    expect(text).toContain("the agent asks you in Needs you each time a lead wants to talk");
    const confirm = button(document.body, "Remove link");
    await act(async () => confirm!.click());
    expect(onRemove).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it("has no Remove without the handler (unlaunched runs)", async () => {
    const { host, unmount } = await render(<ReplyAgentCard {...base} booking="https://cal.com/acme/intro" />);
    expect(button(host, "Remove")).toBeUndefined();
    await unmount();
  });

  it("shows an empty state with Add when a launched run has no link", async () => {
    const { host, unmount } = await render(<ReplyAgentCard {...base} booking="" onRemoveBooking={noop} />);
    expect(host.textContent).toContain("No booking link. The agent asks you when a lead wants to talk.");
    expect(button(host, "Add")).toBeTruthy();
    expect(host.querySelector('a[href=""]')).toBeNull();
    await unmount();
  });

  it("offers no Remove when a workspace default link would take over (the confirm would be false)", async () => {
    const { host, unmount } = await render(
      <ReplyAgentCard
        {...base}
        booking="https://cal.com/acme/run"
        workspaceDefaultBooking="https://cal.com/acme"
        workspaceName="Acme"
        onUseWorkspaceDefault={noop}
        onRemoveBooking={noop}
      />,
    );
    expect(button(host, "Remove")).toBeUndefined();
    expect(button(host, "Use workspace default")).toBeTruthy();
    expect(document.body.textContent).not.toContain("the agent asks you in Needs you each time");
    expect(host.textContent).toContain("Runs without their own link use the Acme link");
    expect(host.querySelector('a[href="/settings"]')).toBeTruthy();
    await unmount();
  });

  it("says the workspace link applies while the run uses it, with no Remove", async () => {
    const { host, unmount } = await render(
      <ReplyAgentCard
        {...base}
        booking="https://cal.com/acme"
        usingWorkspaceDefault
        workspaceDefaultBooking="https://cal.com/acme"
        onRemoveBooking={noop}
      />,
    );
    expect(button(host, "Remove")).toBeUndefined();
    expect(host.textContent).toContain("Workspace default");
    expect(host.textContent).toContain("this affects every run in the workspace");
    await unmount();
  });
});

describe("PitchCard", () => {
  it("edits the offer, what the lead gets and the company summary", async () => {
    const onSave = vi.fn(async () => true);
    const { host, unmount } = await render(
      <PitchCard title="Audit" valueProp="A free audit of your books." summary="We do bookkeeping." onSave={onSave} />,
    );
    expect(host.textContent).toContain("Audit");
    await act(async () => button(host, "Edit")!.click());
    expect(host.textContent).toContain("What the lead gets");
    expect(host.textContent).toContain("About your company");
    expect(host.textContent).toContain("Emails in the sequence keep the pitch they launched with.");
    const form = host.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSave).toHaveBeenCalledWith({
      title: "Audit",
      valueProp: "A free audit of your books.",
      summary: "We do bookkeeping.",
    });
    await unmount();
  });

  it("says when 'What this campaign offers' overrides the offer in agent replies", async () => {
    const { host, unmount } = await render(
      <PitchCard
        title="Audit"
        valueProp="A free audit of your books."
        summary="We do bookkeeping."
        campaignOffer="A two-day close"
        onSave={noop as any}
      />,
    );
    expect(host.textContent).toContain("not this one");
    await unmount();
    const plain = await render(
      <PitchCard title="Audit" valueProp="A free audit of your books." summary="" onSave={noop as any} />,
    );
    expect(plain.host.textContent).not.toContain("not this one");
    await plain.unmount();
  });
});
