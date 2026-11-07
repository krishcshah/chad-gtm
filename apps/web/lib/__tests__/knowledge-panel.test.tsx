/** @vitest-environment happy-dom */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const saveKnowledgeAction = vi.fn(async (_input: unknown) => ({ ok: true as const, data: { id: "k1" }, message: "Saved." }));

vi.mock("@/lib/autopilot-actions", () => ({
  saveKnowledgeAction: (input: unknown) => saveKnowledgeAction(input),
  deleteKnowledgeAction: vi.fn(async () => ({ ok: true })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import type { KnowledgeView } from "@/lib/autopilot-actions";
import { KnowledgePanel } from "../../app/(app)/requests/knowledge-panel";

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

function item(overrides: Partial<KnowledgeView> = {}): KnowledgeView {
  return {
    id: "k1",
    kind: "faq",
    title: "Pricing",
    content: "Plans start at $99 a month.",
    url: null,
    keywords: ["price", "cost"],
    usageCount: 4,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function dialog(): HTMLElement {
  const el = document.body.querySelector<HTMLElement>('[role="dialog"]');
  expect(el).toBeTruthy();
  return el!;
}

async function submit() {
  const form = dialog().querySelector("form");
  expect(form).toBeTruthy();
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  // Let the transition's async save settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  saveKnowledgeAction.mockClear();
  document.body.innerHTML = "";
});

describe("KnowledgePanel edit", () => {
  it("opens a dialog prefilled with the item's title, content and keywords", async () => {
    const { host, unmount } = await render(<KnowledgePanel items={[item()]} />);
    await click(host.querySelector('[aria-label="Edit Pricing"]'));

    const d = dialog();
    expect(d.textContent).toContain("Edit knowledge item");
    expect(d.textContent).toContain("The usage count is kept.");
    const inputs = Array.from(d.querySelectorAll<HTMLInputElement>("input"));
    const values = inputs.map((i) => i.value);
    expect(values).toContain("Pricing");
    expect(values).toContain("price, cost");
    expect(d.querySelector("textarea")?.value).toBe("Plans start at $99 a month.");
    expect(d.textContent).toContain("Save changes");
    await unmount();
  });

  it("saves with the item's id so it updates in place", async () => {
    const { host, unmount } = await render(<KnowledgePanel items={[item()]} />);
    await click(host.querySelector('[aria-label="Edit Pricing"]'));
    await submit();

    expect(saveKnowledgeAction).toHaveBeenCalledTimes(1);
    expect(saveKnowledgeAction.mock.calls[0]![0]).toEqual({
      id: "k1",
      kind: "faq",
      title: "Pricing",
      url: "",
      content: "Plans start at $99 a month.",
      keywords: "price, cost",
    });
    await unmount();
  });

  it("keeps a 'fact' item's kind as 'fact'", async () => {
    const { host, unmount } = await render(
      <KnowledgePanel items={[item({ id: "f1", kind: "fact", title: "Founded", content: "We started in 2019." })]} />,
    );
    await click(host.querySelector('[aria-label="Edit Founded"]'));
    await submit();

    expect(saveKnowledgeAction).toHaveBeenCalledTimes(1);
    expect(saveKnowledgeAction.mock.calls[0]![0]).toMatchObject({ id: "f1", kind: "fact" });
    await unmount();
  });

  it("adds without an id", async () => {
    const { host, unmount } = await render(<KnowledgePanel items={[]} />);
    const add = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Add");
    await click(add);
    expect(dialog().textContent).toContain("Add to knowledge base");
    await submit();
    expect(saveKnowledgeAction).toHaveBeenCalledTimes(1);
    expect((saveKnowledgeAction.mock.calls[0]![0] as { id?: string }).id).toBeUndefined();
    await unmount();
  });
});
