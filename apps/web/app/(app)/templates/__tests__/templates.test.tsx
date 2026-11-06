/** @vitest-environment happy-dom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/templates",
  useSearchParams: () => params,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const actions = vi.hoisted(() => ({
  deleteTemplate: vi.fn(async () => ({ ok: true })),
  saveSequenceAsTemplate: vi.fn(async () => ({ ok: true, data: { id: "new" } })),
  updateSequenceTemplate: vi.fn(async () => ({ ok: true, data: { id: "seq-1" } })),
  upsertTemplate: vi.fn(async () => ({ ok: true, data: { id: "tpl-9" }, message: "Template created" })),
  improveSequenceCopy: vi.fn(),
}));
vi.mock("@/lib/actions", () => actions);

import { serializeSequenceTemplate } from "@/lib/sequence-templates";
import { TemplatesHub } from "../templates-hub";
import { TemplateEditor } from "../template-editor";

const sequenceRow = {
  id: "seq-1",
  name: "Founder intro",
  subject: "Quick question",
  bodyText: serializeSequenceTemplate("Founder intro", "", [
    { key: "a", delayDays: 0, variants: [{ label: "A", subject: "Quick question", bodyText: "Hi {{first_name}}" }] },
    { key: "b", delayDays: 3, variants: [{ label: "A", subject: "Re: Quick question", bodyText: "Following up" }] },
  ]),
  bodyHtml: "",
  format: "text",
  updatedAt: new Date().toISOString(),
};
const emailRow = {
  id: "tpl-1",
  name: "Webinar invite",
  subject: "Join us Thursday",
  bodyText: "Hi there",
  bodyHtml: "",
  format: "text",
  updatedAt: new Date().toISOString(),
};

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  params = new URLSearchParams();
  vi.clearAllMocks();
});

describe("templates library", () => {
  it("lists saved templates and starters with campaign links", () => {
    const el = render(<TemplatesHub templates={[sequenceRow, emailRow]} />);
    expect(el.textContent).toContain("Founder intro");
    expect(el.textContent).toContain("2 emails over 3 days");
    expect(el.textContent).toContain("Webinar invite");
    expect(el.textContent).toContain("Starter sequences");
    const link = el.querySelector('a[href^="/campaigns/new?sequence=seq-1"]');
    expect(link).not.toBeNull();
    expect(el.querySelector('a[href="/templates/tpl-1"]')).not.toBeNull();
  });

  it("filters to single emails", () => {
    const el = render(<TemplatesHub templates={[sequenceRow, emailRow]} />);
    const radio = [...el.querySelectorAll('[role="radio"]')].find((b) => b.textContent === "Single emails") as HTMLElement;
    act(() => radio.click());
    expect(el.textContent).toContain("Webinar invite");
    expect(el.textContent).not.toContain("Founder intro");
    expect(el.textContent).not.toContain("Starter sequences");
  });

  it("shows an empty state when nothing is saved", () => {
    const el = render(<TemplatesHub templates={[]} />);
    expect(el.textContent).toContain("No templates yet");
  });

  it("opens the sequence editor from ?edit= and saves changes", async () => {
    params = new URLSearchParams("edit=seq-1");
    render(<TemplatesHub templates={[sequenceRow]} />);
    expect(document.body.textContent).toContain("Edit sequence");
    const save = [...document.querySelectorAll("button")].find((b) => b.textContent === "Save changes") as HTMLElement;
    await act(async () => save.click());
    expect(actions.updateSequenceTemplate).toHaveBeenCalledWith(
      "seq-1",
      "Founder intro",
      "",
      expect.arrayContaining([expect.objectContaining({ stepNumber: 1, delayDays: 0 })]),
    );
  });

  it("blocks saving a new sequence without a name", async () => {
    render(<TemplatesHub templates={[]} />);
    const open = [...document.querySelectorAll("button")].find((b) => b.textContent === "New sequence") as HTMLElement;
    act(() => open.click());
    const save = [...document.querySelectorAll("button")].find((b) => b.textContent === "Save sequence") as HTMLElement;
    await act(async () => save.click());
    expect(actions.saveSequenceAsTemplate).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Give the sequence a name");
  });
});

describe("template editor", () => {
  it("renders a preview with the sample lead", () => {
    const el = render(
      <TemplateEditor
        initial={{ id: "tpl-1", name: "Intro", subject: "Hi {{first_name}}", bodyText: "Hello {{company}}", bodyHtml: "", format: "text" }}
      />,
    );
    expect(el.textContent).toContain("Hi Ada");
    expect(el.textContent).toContain("Hello Analytical Engines Inc");
    expect(el.querySelector('a[href^="/campaigns/new?sequence=tpl-1"]')).not.toBeNull();
  });

  it("never creates a second template when saves overlap", async () => {
    let release: () => void = () => {};
    actions.upsertTemplate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: { id: "tpl-9" }, message: "Template created" });
        }),
    );
    const replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const el = render(<TemplateEditor />);
    const type = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const [nameInput, subjectInput] = [...el.querySelectorAll("input")] as HTMLInputElement[];
    act(() => {
      type(nameInput!, "Intro");
      type(subjectInput!, "Hi");
    });
    const save = [...el.querySelectorAll("button")].find((b) => b.textContent === "Save template") as HTMLElement;
    await act(async () => save.click());
    // The button is disabled while saving; Cmd+S still saves.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true }));
    });
    expect(actions.upsertTemplate).toHaveBeenCalledTimes(1);
    await act(async () => release());
    expect(actions.upsertTemplate).toHaveBeenCalledTimes(2);
    expect(actions.upsertTemplate).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: undefined }));
    expect(actions.upsertTemplate).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "tpl-9" }));
    replace.mockRestore();
  });

  it("asks for a name and subject before saving", async () => {
    const el = render(<TemplateEditor />);
    const save = [...el.querySelectorAll("button")].find((b) => b.textContent === "Save template") as HTMLElement;
    await act(async () => save.click());
    expect(actions.upsertTemplate).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Give the template a name");
    expect(el.textContent).toContain("Add a subject line");
  });
});
