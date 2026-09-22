/** @vitest-environment happy-dom */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (typeof proto.hasPointerCapture !== "function") proto.hasPointerCapture = () => false;
  if (typeof proto.setPointerCapture !== "function") proto.setPointerCapture = () => {};
  if (typeof proto.releasePointerCapture !== "function") proto.releasePointerCapture = () => {};
  if (typeof proto.scrollIntoView !== "function") proto.scrollIntoView = () => {};
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/actions", () => ({
  importLeads: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { importLeads } from "../actions";
import { EMAIL_MAPPING_REQUIRED_MESSAGE, LeadImport } from "../../app/(app)/leads/import/lead-import";

function buttonByText(host: HTMLElement, text: string) {
  return [...host.querySelectorAll("button")].find((el) => el.textContent?.includes(text));
}

async function renderImport() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<LeadImport lists={[{ id: "list-1", name: "Founders" }]} />);
  });
  return { host, root };
}

async function upload(host: HTMLElement, csv: string, name = "leads.csv") {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([csv], name, { type: "text/csv" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function openMapping(host: HTMLElement) {
  const continueButton = buttonByText(host, "Continue");
  expect(continueButton).toBeTruthy();
  await act(async () => {
    continueButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function unmount(root: Root, host: HTMLElement) {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

describe("LeadImport column mapping", () => {
  it("opens a mapping dropdown in a portal outside the scroll panel", async () => {
    const { host, root } = await renderImport();
    await upload(host, "Company,Notes\nAcme,hi\n");
    await openMapping(host);

    const trigger = host.querySelector("[aria-label='Map column Company']") as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      trigger.click();
    });

    const listbox = document.body.querySelector("[role='listbox']");
    const scroll = host.querySelector("[data-testid='column-mapping-scroll']")!;
    expect(listbox).toBeTruthy();
    expect(scroll.contains(listbox)).toBe(false);
    expect(listbox?.textContent).toContain("Email");

    const emailOption = [...document.body.querySelectorAll("[role='option']")].find((el) =>
      el.textContent?.startsWith("Email"),
    );
    expect(emailOption).toBeTruthy();
    await act(async () => {
      (emailOption as HTMLElement).click();
    });

    const confirm = buttonByText(host, "Confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    expect(host.textContent).not.toContain(EMAIL_MAPPING_REQUIRED_MESSAGE);

    await unmount(root, host);
  });

  it("preselects Email Address and leaves Confirm enabled", async () => {
    const { host, root } = await renderImport();
    await upload(host, "Company,Email Address,Notes\nAcme,ada@example.com,hi\n");
    await openMapping(host);

    expect(host.textContent).not.toContain(EMAIL_MAPPING_REQUIRED_MESSAGE);
    const confirm = buttonByText(host, "Confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);

    const scroll = host.querySelector("[data-testid='column-mapping-scroll']");
    const actions = host.querySelector("[data-testid='column-mapping-actions']");
    expect(scroll?.className).toContain("overflow-auto");
    expect(scroll?.contains(confirm)).toBe(false);
    expect(actions?.contains(confirm)).toBe(true);
    expect(actions?.className).toContain("sticky");
    expect(buttonByText(host, "Cancel")).toBeTruthy();

    await unmount(root, host);
  });

  it("blocks Confirm and explains why when no email column is mapped", async () => {
    const { host, root } = await renderImport();
    await upload(host, "Company,Notes\nAcme,hi\n");
    await openMapping(host);

    const actions = host.querySelector("[data-testid='column-mapping-actions']");
    expect(actions?.textContent).toContain(EMAIL_MAPPING_REQUIRED_MESSAGE);
    const confirm = buttonByText(host, "Confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute("aria-describedby")).toBe("email-mapping-error");
    expect(actions?.contains(confirm)).toBe(true);

    await unmount(root, host);
  });

  it("auto-detects a BOM e-mail column on a wide CSV without moving Confirm into the scroller", async () => {
    const extras = Array.from({ length: 24 }, (_, i) => `custom_field_${i}_with_a_long_header`);
    const header = ["\uFEFFe-mail", "Company", ...extras].join(",");
    const row = ["ada@example.com", "Acme", ...extras.map(() => "x")].join(",");
    const { host, root } = await renderImport();
    await upload(host, `${header}\n${row}\n`, "wide.csv");
    await openMapping(host);

    const confirm = buttonByText(host, "Confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    const scroll = host.querySelector("[data-testid='column-mapping-scroll']")!;
    expect(scroll.contains(confirm)).toBe(false);
    expect(scroll.innerHTML).toContain("min-w-[40rem]");

    await unmount(root, host);
  });

  it("chunks large uploads into batches of 1000 rows and aggregates results", async () => {
    const mockImport = vi.mocked(importLeads);
    mockImport.mockReset();
    mockImport
      .mockResolvedValueOnce({
        ok: true,
        data: { imported: 1000, skipped: 0, invalid: 0, listId: "list-1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { imported: 450, skipped: 50, invalid: 0, listId: "list-1" },
      });

    const rows = Array.from({ length: 1500 }, (_, i) => `lead${i}@example.com,Company${i}`);
    const csvContent = ["Email,Company", ...rows].join("\n");

    const { host, root } = await renderImport();
    await upload(host, csvContent, "large.csv");
    await openMapping(host);

    const confirm = buttonByText(host, "Confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);

    await act(async () => {
      confirm.click();
    });

    expect(mockImport).toHaveBeenCalledTimes(2);
    expect(mockImport.mock.calls[0]![0]).toMatchObject({
      listId: "list-1",
      rows: expect.any(Array),
    });
    expect((mockImport.mock.calls[0]![0] as any).rows.length).toBe(1000);
    expect((mockImport.mock.calls[1]![0] as any).rows.length).toBe(500);

    expect(host.textContent).toContain("1,450 imported");
    expect(host.textContent).toContain("50 duplicates skipped");

    await unmount(root, host);
  });
});
