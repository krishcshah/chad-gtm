/** @vitest-environment happy-dom */
import { act } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/autopilot-actions", () => ({
  startAutopilotAction: vi.fn(),
  completeAutopilotSetupAction: vi.fn(),
  retryAutopilotLaunchAction: vi.fn(),
  retryAutopilotResearchAction: vi.fn(),
}));
vi.mock("@/lib/pending-website", () => ({ takePendingWebsite: () => null }));

import { AutopilotLauncher } from "../../app/(app)/chad-gtm/autopilot-launcher";

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, unmount: () => act(async () => root.unmount()) };
}

/* #73: before a run starts, the launcher says which sender identity (and
 * which workspace's) the emails will carry. */
describe("AutopilotLauncher 'Sending as' line", () => {
  it("names the company, the first address line and the workspace, with a link to change it", async () => {
    const { host, unmount } = await render(
      <AutopilotLauncher
        runs={[]}
        sender={{
          workspaceName: "Client B",
          companyName: "Client B LLC",
          postalAddress: "500 Client B Ave\nAustin, TX 78701",
        }}
      />,
    );
    const line = host.querySelector('[data-testid="launcher-sending-as"]');
    expect(line?.textContent).toContain("Sending as Client B LLC · 500 Client B Ave · For workspace Client B");
    expect(line?.textContent).not.toContain("Austin");
    const link = line?.querySelector("a");
    expect(link?.textContent).toBe("Change for this workspace");
    expect(link?.getAttribute("href")).toBe("/settings#compliance");
    await unmount();
  });

  it("says the details will be asked for when the workspace has none", async () => {
    const { host, unmount } = await render(
      <AutopilotLauncher runs={[]} sender={{ workspaceName: "Client B", companyName: "", postalAddress: "" }} />,
    );
    const line = host.querySelector('[data-testid="launcher-sending-as"]');
    expect(line?.textContent).toBe(
      "Before anything is sent we'll ask for this workspace's company name and postal address.",
    );
    expect(line?.querySelector("a")).toBeNull();
    await unmount();
  });
});
