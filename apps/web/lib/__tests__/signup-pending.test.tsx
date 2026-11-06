/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { signUpEmail, sendVerificationEmail } = vi.hoisted(() => ({
  signUpEmail: vi.fn(async (_input: unknown) => ({ data: { token: null }, error: null })),
  sendVerificationEmail: vi.fn(async (_input: unknown) => ({ data: { status: true }, error: null })),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: signUpEmail }, sendVerificationEmail },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import SignupPage from "../../app/(auth)/signup/page";

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("sign-up 'check your inbox' card", () => {
  it("tells a returning user no link is sent for an existing account and links to sign in / reset", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<SignupPage />));

    await act(async () => {
      type(host.querySelector("#name") as HTMLInputElement, "Dana Client");
      type(host.querySelector("#email") as HTMLInputElement, "dana@example.com");
      type(host.querySelector("#password") as HTMLInputElement, "a-long-enough-password-1");
    });
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(signUpEmail).toHaveBeenCalled();
    expect(host.textContent).toContain("Check your inbox");
    const hint = host.querySelector('[data-testid="existing-account-hint"]');
    expect(hint?.textContent).toMatch(/No new link is sent for an existing account/);
    const hrefs = Array.from(hint!.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/login", "/forgot-password"]);

    const resend = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Resend"))!;
    await act(async () => {
      resend.click();
    });
    expect(host.textContent).not.toContain("Sent. Check your inbox");
    expect(host.textContent).toContain("If this address still needs confirming");

    await act(async () => root.unmount());
  });
});
