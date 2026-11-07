/** @vitest-environment happy-dom */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* #105: your own saved sequences and single emails can be renamed or deleted
 * from the "Use a template" menu; starter sequences can't. */

vi.mock("@/lib/actions", () => ({
  renameTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { deleteTemplate, renameTemplate } from "@/lib/actions";
import { PRESET_SEQUENCES } from "@/lib/sequence-templates";
import { SequenceLibrary } from "../sequence-library";

const SAVED_SEQ = {
  id: "tpl-seq",
  name: "My follow-ups",
  subject: "Hi",
  bodyText: JSON.stringify({ __isSequence: true, name: "My follow-ups", description: "Two emails", steps: [] }),
};
const SINGLE = { id: "tpl-single", name: "Intro email", subject: "Quick question", bodyText: "Hi {{first_name}}" };

let container: HTMLDivElement;
let root: Root;
const onTemplateRenamed = vi.fn();
const onTemplateDeleted = vi.fn();

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderOpen() {
  await act(async () => {
    root.render(
      <SequenceLibrary
        templates={[SAVED_SEQ, SINGLE]}
        onApplySequence={vi.fn()}
        onApplySingle={vi.fn()}
        onTemplateRenamed={onTemplateRenamed}
        onTemplateDeleted={onTemplateDeleted}
      />,
    );
  });
  const trigger = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Use a template"))!;
  await act(async () => trigger.click());
  await flush();
}

const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);

function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.mocked(renameTemplate).mockReset();
  vi.mocked(deleteTemplate).mockReset();
  onTemplateRenamed.mockReset();
  onTemplateDeleted.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("SequenceLibrary template actions", () => {
  it("offers Rename and Delete for saved sequences and single emails, never for starter sequences", async () => {
    await renderOpen();
    expect(byLabel("Rename “My follow-ups”")).not.toBeNull();
    expect(byLabel("Delete “My follow-ups”")).not.toBeNull();
    expect(byLabel("Rename “Intro email”")).not.toBeNull();
    expect(byLabel("Delete “Intro email”")).not.toBeNull();
    for (const preset of PRESET_SEQUENCES) {
      expect(document.body.textContent).toContain(preset.name);
      expect(byLabel(`Rename “${preset.name}”`)).toBeNull();
      expect(byLabel(`Delete “${preset.name}”`)).toBeNull();
    }
    // No button inside another button.
    expect(document.querySelector("button button")).toBeNull();
  });

  it("Rename: Save calls renameTemplate and then onTemplateRenamed", async () => {
    vi.mocked(renameTemplate).mockResolvedValue({ ok: true, data: { id: "tpl-single", name: "Opener" }, message: "Renamed to “Opener”" });
    await renderOpen();
    await act(async () => byLabel("Rename “Intro email”")!.click());
    const input = byLabel("Template name") as HTMLInputElement;
    expect(input.value).toBe("Intro email");
    await act(async () => typeInto(input, "Opener"));
    await act(async () => buttonByText("Save")!.click());
    await flush();
    expect(renameTemplate).toHaveBeenCalledWith("tpl-single", "Opener");
    expect(onTemplateRenamed).toHaveBeenCalledWith("tpl-single", "Opener");
    expect(byLabel("Template name")).toBeNull();
  });

  it("Rename: a failure shows the error under the field and keeps the form open", async () => {
    vi.mocked(renameTemplate).mockResolvedValue({ ok: false, error: "Keep the name under 120 characters." });
    await renderOpen();
    await act(async () => byLabel("Rename “My follow-ups”")!.click());
    const input = byLabel("Template name") as HTMLInputElement;
    await act(async () => typeInto(input, "x".repeat(121)));
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    expect(renameTemplate).toHaveBeenCalledWith("tpl-seq", "x".repeat(121));
    expect(onTemplateRenamed).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Keep the name under 120 characters.");
    expect(byLabel("Template name")).not.toBeNull();
  });

  it("Delete: confirming calls deleteTemplate and then onTemplateDeleted", async () => {
    vi.mocked(deleteTemplate).mockResolvedValue({ ok: true, message: "Template deleted" });
    await renderOpen();
    await act(async () => byLabel("Delete “Intro email”")!.click());
    await flush();
    expect(document.body.textContent).toContain("Delete “Intro email”?");
    expect(document.body.textContent).toContain("Campaigns that already use it keep their emails.");
    await act(async () => buttonByText("Delete template")!.click());
    await flush();
    expect(deleteTemplate).toHaveBeenCalledWith("tpl-single");
    expect(onTemplateDeleted).toHaveBeenCalledWith("tpl-single");
  });
});
