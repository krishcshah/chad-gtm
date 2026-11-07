/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { updateUser, changePassword, refresh, toastSuccess } = vi.hoisted(() => ({
  updateUser: vi.fn(async (_input: unknown): Promise<any> => ({ data: { status: true }, error: null })),
  changePassword: vi.fn(async (_input: unknown): Promise<any> => ({ data: { token: null }, error: null })),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { updateUser, changePassword } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return { ...actual, toast: Object.assign(vi.fn(), { ...actual.toast, success: toastSuccess }) };
});

import { AccountCard, validateName } from "../../app/(app)/settings/account-card";

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

function button(label: string): HTMLButtonElement {
  const b = Array.from(document.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);
  if (!b) throw new Error(`No button "${label}"`);
  return b as HTMLButtonElement;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  updateUser.mockClear();
  changePassword.mockClear();
  refresh.mockClear();
  toastSuccess.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AccountCard name="Dana Client" email="dana@example.com" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("AccountCard: name", () => {
  it("validates the trimmed name", () => {
    expect(validateName("")).toMatch(/Enter your name/);
    expect(validateName("a".repeat(101))).toMatch(/100 characters/);
    expect(validateName("Dana")).toBeNull();
  });

  it("saves the trimmed name with authClient.updateUser and refreshes", async () => {
    await act(async () => button("Edit name").click());
    await act(async () => type(document.querySelector("#account-name") as HTMLInputElement, "  Dana Smith  "));
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(updateUser).toHaveBeenCalledWith({ name: "Dana Smith" });
    expect(refresh).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Name updated");
    expect(host.textContent).toContain("Dana Smith");
  });

  it("refuses a blank name without calling updateUser", async () => {
    await act(async () => button("Edit name").click());
    await act(async () => type(document.querySelector("#account-name") as HTMLInputElement, "   "));
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(updateUser).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Enter your name.");
  });

  it("offers email changes through support", () => {
    const link = Array.from(host.querySelectorAll("a")).find((a) => a.textContent === "contact support");
    expect(link?.getAttribute("href")).toBe("/support?new=contact");
  });
});

describe("AccountCard: change password", () => {
  async function fill(current: string, next: string, confirm: string) {
    await act(async () => button("Change password").click());
    await act(async () => {
      type(document.querySelector("#current-password") as HTMLInputElement, current);
      type(document.querySelector("#new-password") as HTMLInputElement, next);
      type(document.querySelector("#confirm-password") as HTMLInputElement, confirm);
    });
    const form = document.querySelector("#current-password")!.closest("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
  }

  it("uses password inputs with the right autocomplete hints", async () => {
    await act(async () => button("Change password").click());
    const current = document.querySelector("#current-password") as HTMLInputElement;
    const next = document.querySelector("#new-password") as HTMLInputElement;
    const confirm = document.querySelector("#confirm-password") as HTMLInputElement;
    expect([current.type, next.type, confirm.type]).toEqual(["password", "password", "password"]);
    expect(current.getAttribute("autocomplete")).toBe("current-password");
    expect(next.getAttribute("autocomplete")).toBe("new-password");
    expect(confirm.getAttribute("autocomplete")).toBe("new-password");
  });

  it("refuses mismatched passwords without calling changePassword", async () => {
    await fill("old-password-1", "new-password-1", "new-password-2");
    expect(changePassword).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Passwords don't match");
  });

  it("refuses a short new password without calling changePassword", async () => {
    await fill("old-password-1", "short", "short");
    expect(changePassword).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("at least 8 characters");
  });

  it("calls changePassword and signs out other sessions on valid input", async () => {
    await fill("old-password-1", "new-password-1", "new-password-1");
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password-1",
      newPassword: "new-password-1",
      revokeOtherSessions: true,
    });
    expect(toastSuccess).toHaveBeenCalledWith("Password changed. You've been signed out on other devices.");
  });

  it("says when the current password is wrong", async () => {
    changePassword.mockResolvedValueOnce({ data: null, error: { code: "INVALID_PASSWORD", message: "Invalid password" } });
    await fill("wrong-password", "new-password-1", "new-password-1");
    expect(document.body.textContent).toContain("Your current password is incorrect.");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("links to the reset flow when the account has no password", async () => {
    changePassword.mockResolvedValueOnce({
      data: null,
      error: { code: "CREDENTIAL_ACCOUNT_NOT_FOUND", message: "Credential account not found" },
    });
    await fill("anything-123", "new-password-1", "new-password-1");
    expect(document.body.textContent).toContain("Credential account not found");
    const link = Array.from(document.querySelectorAll("a")).find((a) => a.getAttribute("href") === "/forgot-password");
    expect(link).toBeDefined();
  });
});
