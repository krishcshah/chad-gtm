import { beforeEach, describe, expect, it, vi } from "vitest";

/* The real better-auth config (lib/auth.ts): the admin signup alert is wired to
 * emailVerification.afterEmailVerification (only verified addresses alert
 * anyone), never to user.create, and the hook never waits on the send. */

const st = vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "ops@autogtm.tech";
  return { options: null as any, send: vi.fn(), mailer: true };
});

vi.mock("better-auth", () => ({
  betterAuth: (options: unknown) => {
    st.options = options;
    return { $Infer: {} };
  },
}));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }));
vi.mock("better-auth/next-js", () => ({ nextCookies: () => ({}) }));
vi.mock("@smartreach/email-engine/system-mailer", () => ({
  isSystemMailerConfigured: () => st.mailer,
  sendSystemEmail: (mail: unknown) => st.send(mail),
}));
vi.mock("../db", () => {
  const empty: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (res: (v: unknown) => unknown) => Promise.resolve([]).then(res);
        return () => empty;
      },
    },
  );
  return { lazyDb: () => ({}), getDb: () => ({ select: () => empty }) };
});

async function loadAuthOptions(mailer: boolean) {
  st.mailer = mailer;
  st.options = null;
  vi.resetModules();
  await import("../auth");
  return st.options;
}

beforeEach(() => {
  st.send.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("auth config: admin signup alert", () => {
  it("registers the alert after email verification, not on user.create", async () => {
    const options = await loadAuthOptions(true);
    expect(typeof options.emailVerification.afterEmailVerification).toBe("function");
    expect(options.databaseHooks?.user?.create?.after).toBeUndefined();
  });

  it("returns at once while the send is still running, then alerts the admin once", async () => {
    const options = await loadAuthOptions(true);
    st.send.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    await options.emailVerification.afterEmailVerification({ email: "dana@client.test", name: "Dana", role: "user" });
    expect(Date.now() - started).toBeLessThan(50);
    await vi.waitFor(() => expect(st.send).toHaveBeenCalledTimes(1));
    expect(st.send.mock.calls[0]![0]).toMatchObject({ to: "ops@autogtm.tech", subject: "New AutoGTM signup: dana@client.test" });
  });

  it("verification still succeeds when the alert fails", async () => {
    const options = await loadAuthOptions(true);
    st.send.mockRejectedValue(new Error("smtp down"));
    await expect(options.emailVerification.afterEmailVerification({ email: "dana@client.test" })).resolves.toBeUndefined();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it("an approved user confirming a changed address is not a new signup", async () => {
    const options = await loadAuthOptions(true);
    await options.emailVerification.afterEmailVerification({ email: "dana@client.test", approvedAt: new Date() });
    await new Promise((r) => setTimeout(r, 10));
    expect(st.send).not.toHaveBeenCalled();
  });

  it("without a mailer there is no verification and no alert hook", async () => {
    const options = await loadAuthOptions(false);
    expect(options.emailVerification).toBeUndefined();
    expect(options.databaseHooks?.user?.create?.after).toBeUndefined();
  });
});
