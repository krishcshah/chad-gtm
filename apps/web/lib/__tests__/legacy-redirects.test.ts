import { beforeEach, describe, expect, it, vi } from "vitest";

// Old /templates and /senders links must land on the right page in one hop.
const requireUser = vi.fn();
const isAdmin = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/session", () => ({ requireUser: () => requireUser() }));
vi.mock("@/lib/admin", () => ({ isAdmin: (user: unknown) => isAdmin(user) }));

import TemplatesPage from "../../app/(app)/templates/page";
import EditTemplatePage from "../../app/(app)/templates/[id]/page";
import NewTemplatePage from "../../app/(app)/templates/new/page";
import SendersPage from "../../app/(app)/senders/page";
import NewSenderPage from "../../app/(app)/senders/new/page";
import SenderImportPage from "../../app/(app)/senders/import/page";

async function redirectTarget(render: () => unknown): Promise<string> {
  try {
    await render();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw e;
  }
  throw new Error("page rendered without redirecting");
}

describe("legacy /templates links", () => {
  it("sends /templates/<id> straight to Campaigns", async () => {
    const render = EditTemplatePage as unknown as (props: { params: Promise<{ id: string }> }) => unknown;
    expect(await redirectTarget(() => render({ params: Promise.resolve({ id: "t1" }) }))).toBe("/campaigns");
  });

  it("sends /templates/new and /templates to Campaigns", async () => {
    expect(await redirectTarget(() => NewTemplatePage())).toBe("/campaigns");
    expect(await redirectTarget(() => TemplatesPage())).toBe("/campaigns");
  });
});

describe("legacy /senders links", () => {
  const pages = [
    ["/senders", SendersPage],
    ["/senders/new", NewSenderPage],
    ["/senders/import", SenderImportPage],
  ] as const;

  beforeEach(() => {
    requireUser.mockReset();
    isAdmin.mockReset();
    requireUser.mockResolvedValue({ id: "u1", email: "a@example.com", role: "user", emailVerified: true });
  });

  it.each(pages)("%s takes an admin to the Mailboxes tab", async (_path, Page) => {
    isAdmin.mockReturnValue(true);
    expect(await redirectTarget(() => Page())).toBe("/admin?tab=mailboxes");
  });

  it.each(pages)("%s takes everyone else to Overview", async (_path, Page) => {
    isAdmin.mockReturnValue(false);
    expect(await redirectTarget(() => Page())).toBe("/dashboard");
  });

  it.each(pages)("%s checks the session before redirecting", async (_path, Page) => {
    requireUser.mockRejectedValue(new Error("REDIRECT:/login"));
    expect(await redirectTarget(() => Page())).toBe("/login");
    expect(isAdmin).not.toHaveBeenCalled();
  });
});
