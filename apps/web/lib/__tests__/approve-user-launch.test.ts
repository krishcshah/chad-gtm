import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

/* approveUserAction returns at once: it records which run launches, runs the
 * launch and the email in the background (next/server after()), and tells the
 * admin what is happening. A launch problem never fails the approval. */

const st = vi.hoisted(() => ({
  begin: vi.fn(),
  finish: vi.fn(),
  after: [] as Array<() => Promise<void>>,
  afterThrows: false,
  mailer: true,
  revokedAt: null as Date | null,
  updated: [] as Array<Record<string, unknown>>,
  approvedRow: true,
}));

vi.mock("../session", () => ({
  requireUser: async () => ({ id: "usr_admin", email: "a@x.com", role: "admin", emailVerified: true }),
}));
vi.mock("../admin-analytics", () => ({ getUserDetailedActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => {
    if (st.afterThrows) throw new Error("after() was called outside a request scope");
    st.after.push(task);
  },
}));
vi.mock("../autopilot-advance", () => ({
  beginApprovalLaunch: (...args: unknown[]) => st.begin(...args),
  finishApprovalLaunch: (...args: unknown[]) => st.finish(...args),
}));
vi.mock("@smartreach/email-engine/system-mailer", () => ({
  isSystemMailerConfigured: () => st.mailer,
  sendSystemEmail: vi.fn(),
}));
vi.mock("../db", () => {
  const chain = (resolve: (calls: Record<string, any[]>) => any): any => {
    const calls: Record<string, any[]> = {};
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") {
            const p = Promise.resolve().then(() => resolve(calls));
            return (p as any)[prop].bind(p);
          }
          return (...args: any[]) => {
            calls[String(prop)] = args;
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const db = {
    select: () =>
      chain((calls) => {
        const table = calls.from?.[0];
        if (table === schema.users) return [{ revokedAt: st.revokedAt }];
        return [];
      }),
    update: () =>
      chain((calls) => {
        st.updated.push(calls.set?.[0]);
        return st.approvedRow ? [{ email: "dana@client.test", name: "Dana Lee" }] : [];
      }),
  };
  return { getDb: () => db };
});

import { approveUserAction } from "../admin-actions";

const plan = (note: any, extra: Record<string, unknown> = {}) => ({
  note,
  holdUntil: null,
  notStarted: [],
  latestRunId: "runId" in note ? note.runId : null,
  reapproved: false,
  ...extra,
});

beforeEach(() => {
  st.begin.mockReset();
  st.finish.mockReset();
  st.finish.mockImplementation(() => new Promise(() => {})); // never finishes: the action must not wait
  st.after = [];
  st.afterThrows = false;
  st.mailer = true;
  st.revokedAt = null;
  st.updated = [];
  st.approvedRow = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("approveUserAction", () => {
  it("returns at once and launches in the background", async () => {
    st.begin.mockResolvedValue(plan({ kind: "launching", runId: "run_1" }));
    const res = await approveUserAction("usr_target");
    expect(st.updated[0]!.approvedAt).toBeInstanceOf(Date);
    expect(st.begin).toHaveBeenCalledWith("usr_target", { reapproved: false });
    expect(res).toEqual({
      ok: true,
      emailQueued: true,
      launch: "launching",
      outcome: "Approved. Launching their campaign now.",
      launchView: { status: "launching", label: "Launching", runId: "run_1" },
    });
    // Nothing launched inside the request: the launch is queued for after the response.
    expect(st.finish).not.toHaveBeenCalled();
    expect(st.after).toHaveLength(1);
    void st.after[0]!();
    expect(st.finish).toHaveBeenCalledWith("usr_target", expect.objectContaining({ note: { kind: "launching", runId: "run_1" } }));
  });

  it("falls back to a fire-and-forget task outside a request scope", async () => {
    st.afterThrows = true;
    st.begin.mockResolvedValue(plan({ kind: "launching", runId: "run_1" }));
    const res = await approveUserAction("usr_target");
    expect(res.ok).toBe(true);
    expect(st.finish).toHaveBeenCalledTimes(1);
  });

  it("a background failure is logged, never thrown", async () => {
    st.begin.mockResolvedValue(plan({ kind: "launching", runId: "run_1" }));
    st.finish.mockRejectedValue(new Error("db down"));
    await approveUserAction("usr_target");
    await expect(st.after[0]!()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("names the missing details", async () => {
    st.begin.mockResolvedValue(plan({ kind: "details", runId: "run_1", missing: ["bookingUrl"] }));
    const res = await approveUserAction("usr_target");
    expect(res).toMatchObject({ ok: true, launch: "details", outcome: "Approved. Waiting for their booking link." });
    expect(res.ok && res.launchView).toMatchObject({ status: "waiting", label: "Waiting for details" });
  });

  it("nothing waiting but they have a plan: says they can launch it", async () => {
    st.begin.mockResolvedValue(plan({ kind: "none" }, { latestRunId: "run_old" }));
    const res = await approveUserAction("usr_target");
    expect(res).toMatchObject({
      ok: true,
      launch: "none",
      outcome: "Approved. Nothing was waiting to launch. They can launch their plan themselves.",
      launchView: null,
    });
  });

  it("only says no campaign when they have no runs at all", async () => {
    st.begin.mockResolvedValue(plan({ kind: "none" }, { latestRunId: null }));
    const res = await approveUserAction("usr_target");
    expect(res.ok && res.outcome).toBe("Approved. They haven't set up a campaign yet.");
  });

  it("re-approving a revoked account with nothing waiting says campaigns can send again", async () => {
    st.revokedAt = new Date();
    st.begin.mockResolvedValue(plan({ kind: "none" }, { latestRunId: "run_old", reapproved: true }));
    const res = await approveUserAction("usr_target");
    expect(st.begin).toHaveBeenCalledWith("usr_target", { reapproved: true });
    expect(res.ok && res.outcome).toBe("Approved. Their campaigns can send again.");
  });

  it("a planning error never fails the approval; the background still emails", async () => {
    st.begin.mockRejectedValue(new Error("db down"));
    const res = await approveUserAction("usr_target");
    expect(res).toMatchObject({ ok: true, launch: "failed" });
    void st.after[0]!();
    expect(st.finish).toHaveBeenCalledWith("usr_target", null);
  });

  it("without a system mailer says no email will be sent", async () => {
    st.mailer = false;
    st.begin.mockResolvedValue(plan({ kind: "launching", runId: "run_1" }));
    const res = await approveUserAction("usr_target");
    expect(res).toMatchObject({ ok: true, emailQueued: false, launch: "launching" });
    expect(res.ok && res.warning).toBe("Approved. Launching their campaign now. No system mailer configured, so no email will be sent.");
  });

  it("an account approved already launches nothing", async () => {
    st.approvedRow = false;
    const res = await approveUserAction("usr_target");
    expect(res).toMatchObject({ ok: true, emailQueued: false });
    expect(st.begin).not.toHaveBeenCalled();
    expect(st.after).toHaveLength(0);
  });
});
