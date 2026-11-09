import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* Approving an account launches at most ONE run: the newest autopilot run
 * whose only blocker was approval, touched in the last 14 days, through the
 * Launch button's path (advanceRunForUser). Others are listed in the email.
 * Temporary failures retry on their own (every 15 min+, up to 24 h); a run
 * younger than 2 minutes is held so the client's own start can finish. */

const st = vi.hoisted(() => ({
  runs: [] as any[],
  blockers: new Map<string, any[]>(),
  launch: vi.fn(),
  send: vi.fn(),
  mailer: true,
  access: "approved" as string,
  candidateWhere: null as any,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../workspaces", () => ({ ensureDefaultWorkspace: async () => ({ id: "ws-1" }) }));
vi.mock("../approval", () => ({
  assertCanSend: async () => {
    if (st.access !== "approved") throw new Error("approval required");
  },
  getSendAccess: async () => st.access,
  isSendAccessError: (m: string) => m === "approval required",
}));
vi.mock("@smartreach/email-engine/system-mailer", () => ({
  isSystemMailerConfigured: () => st.mailer,
  sendSystemEmail: (mail: unknown) => st.send(mail),
}));
vi.mock("../gtm-launch", () => {
  class LaunchError extends Error {
    constructor(readonly code: string, message = "Launch failed.") {
      super(message);
    }
  }
  class LaunchInProgressError extends Error {}
  return {
    COMPLIANCE_REQUIRED_ERROR: "compliance required",
    LaunchError,
    LaunchInProgressError,
    launchRunCampaign: (...args: any[]) => st.launch(...args),
  };
});
vi.mock("../autopilot-state", () => ({
  loadLaunchContext: async () => ({
    approved: st.access === "approved",
    identity: { companyName: "Acme", postalAddress: "1 Main St, Springfield" },
    defaultBookingUrl: null,
  }),
  runBlockers: (run: any) => [
    ...(st.blockers.get(run.id) ?? []),
    ...(st.access === "approved" ? [] : [{ kind: "approval", message: "waiting" }]),
  ],
  runLaunchState: (run: any) => {
    const blockers = st.blockers.get(run.id) ?? [];
    const phase = run.campaignId
      ? "live"
      : blockers[0]?.kind === "details"
        ? "needs_details"
        : blockers[0]?.kind === "research"
          ? "needs_research"
          : st.access !== "approved"
            ? "awaiting_approval"
            : run.calibrationProfile?.launchFailure
              ? "launch_failed"
              : "ready";
    return { phase, blockers, launchFailure: run.calibrationProfile?.launchFailure ?? null };
  },
}));

const dialect = new PgDialect();

/* A tiny in-memory chad_gtm_runs: enough of the SQL the module writes. */
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
  const runFor = (where: any) => {
    const params = dialect.sqlToQuery(where).params;
    return st.runs.find((r) => params.includes(r.id));
  };
  const db: any = {
    select: () =>
      chain((calls) => {
        const table = calls.from?.[0];
        if (table === schema.users) return [{ email: "dana@client.test", name: "Dana Lee" }];
        if (table === schema.replies) return [{ n: 0 }];
        if (table !== schema.chadGtmRuns) return [];
        const limit = calls.limit?.[0];
        if (limit === 50) {
          st.candidateWhere = calls.where?.[0];
          return st.runs;
        }
        if (limit === 10) {
          // The retry loop's "due" query.
          const now = dialect.sqlToQuery(calls.where[0]).params.find((p: unknown) => typeof p === "string" && /^\d{4}-/.test(p));
          return st.runs
            .filter((r) => {
              const rec = r.calibrationProfile?.approvalLaunch;
              return (
                !r.campaignId &&
                !r.dismissedAt &&
                rec &&
                (rec.state === "launching" || rec.state === "retrying") &&
                String(rec.nextAttemptAt ?? "") <= String(now)
              );
            })
            .map((r) => ({ id: r.id, userId: r.userId }));
        }
        if (calls.orderBy) {
          const mine = st.runs.filter((r) => !r.dismissedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return mine.slice(0, 1).map((r) => ({ id: r.id }));
        }
        // loadOwnedRun(runId, userId): match both bound params.
        const params = dialect.sqlToQuery(calls.where[0]).params;
        return st.runs.filter((r) => params.includes(r.id) && params.includes(r.userId) && !r.dismissedAt).map((r) => ({ ...r }));
      }),
    update: () =>
      chain((calls) => {
        const set = calls.set?.[0] ?? {};
        const run = runFor(calls.where?.[0]);
        if (!run) return [];
        const whereQ = dialect.sqlToQuery(calls.where[0]);
        const cp = set.calibrationProfile;
        if (cp && typeof cp === "object" && "queryChunks" in cp) {
          const q = dialect.sqlToQuery(cp);
          if (q.sql.includes("jsonb_build_object('approvalLaunch'")) {
            const rec = run.calibrationProfile?.approvalLaunch ?? {};
            if (whereQ.sql.includes("'attempts'")) {
              const expected = whereQ.params.find((p: unknown) => typeof p === "number");
              if ((rec.attempts ?? 0) !== expected) return [];
            }
            if (whereQ.sql.includes("'emailPending'")) {
              const expected = whereQ.params.find((p: unknown) => typeof p === "boolean");
              if (Boolean(rec.emailPending) !== expected) return [];
            }
            const patch = JSON.parse(q.params.find((p: unknown) => typeof p === "string" && p.startsWith("{")) as string);
            run.calibrationProfile = { ...(run.calibrationProfile ?? {}), approvalLaunch: { ...rec, ...patch } };
            return [{ id: run.id }];
          }
          if (q.sql.includes("jsonb_build_object('launchFailure'")) {
            // advanceRunForUser's failure write: merged into the stored profile.
            if (whereQ.sql.includes('"campaign_id" is null') && run.campaignId) return [];
            const failure = JSON.parse(q.params.find((p: unknown) => typeof p === "string" && p.startsWith("{")) as string);
            const { calibrationProfile: _cp, ...rest } = set;
            Object.assign(run, rest);
            run.calibrationProfile = { ...(run.calibrationProfile ?? {}), launchFailure: failure };
            return [{ id: run.id }];
          }
          if (q.sql.includes("jsonb_set")) {
            if (!run.campaignId && run.calibrationProfile?.launchFailure) {
              run.calibrationProfile.launchFailure = { ...run.calibrationProfile.launchFailure, message: q.params[0] };
            }
            return [];
          }
        }
        if (whereQ.sql.includes('"campaign_id" is null') && run.campaignId) return [];
        Object.assign(run, set);
        return [{ id: run.id }];
      }),
  };
  return { getDb: () => db, ensureChadGtmTables: vi.fn(async () => {}) };
});

import {
  APPROVAL_RETRY_BASE_MS,
  attemptApprovalLaunch,
  beginApprovalLaunch,
  finishApprovalLaunch,
  planApprovalLaunch,
  retryApprovalLaunches,
} from "../autopilot-advance";
import { LaunchError } from "../gtm-launch";
import { AUTO_RETRY_MESSAGES } from "../approval-copy";
import { LAUNCH_FAILURE_MESSAGES } from "../autopilot-policy";
import { revalidatePath } from "next/cache";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function run(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    userId: "u-1",
    workspaceId: "ws-1",
    url: `https://${id}.test`,
    companyName: `${id} Inc`,
    status: "ready",
    autopilot: true,
    campaignId: null,
    dismissedAt: null,
    launchStartedAt: null,
    bookingUrl: "https://cal.com/acme",
    dailyEmailLimit: 60,
    calibrationProfile: {},
    createdAt: ago(60 * MIN),
    updatedAt: ago(60 * MIN),
    ...extra,
  };
}

const record = (id: string) => st.runs.find((r) => r.id === id)?.calibrationProfile?.approvalLaunch;

/** Approve: plan + record (inside the request), then the background half. */
async function approve(opts: { reapproved?: boolean; now?: Date } = {}) {
  const plan = await beginApprovalLaunch("u-1", { now: NOW, ...opts });
  await finishApprovalLaunch("u-1", plan);
  return plan;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  st.runs = [];
  st.blockers = new Map();
  st.launch.mockReset();
  st.launch.mockImplementation(async (_db: unknown, input: any) => {
    const r = st.runs.find((x) => x.id === input.run.id);
    r.campaignId = `c-${r.id}`;
    r.status = "active";
    return { campaignId: r.campaignId, leadCount: 100 };
  });
  st.send.mockReset();
  st.send.mockResolvedValue(undefined);
  st.mailer = true;
  st.access = "approved";
  st.candidateWhere = null;
  process.env.APP_URL = "https://autogtm.tech";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("which run approval launches", () => {
  it("launches only the newest ready run and lists the others in the email", async () => {
    st.runs = [run("old", { updatedAt: ago(3 * DAY), createdAt: ago(3 * DAY) }), run("new"), run("mid", { updatedAt: ago(DAY), createdAt: ago(DAY) })];
    const plan = await approve();
    expect(plan.note).toEqual({ kind: "launching", runId: "new" });
    expect(st.launch).toHaveBeenCalledTimes(1);
    expect(st.launch.mock.calls[0]![1]).toMatchObject({ userId: "u-1", workspaceId: "ws-1", dailyLimit: 60 });
    expect(st.launch.mock.calls[0]![1].run.id).toBe("new");
    expect(record("new")).toMatchObject({ state: "done", note: { kind: "live", runId: "new" }, emailPending: false, attempts: 1 });
    expect(st.send).toHaveBeenCalledTimes(1);
    const mail = st.send.mock.calls[0]![0];
    expect(mail.subject).toBe("Your AutoGTM campaign is live");
    expect(mail.text).toContain("https://autogtm.tech/chad-gtm/new");
    expect(mail.text).toContain("We didn't start your other plans. Open one to launch it:");
    expect(mail.text).toContain("- mid Inc: https://autogtm.tech/chad-gtm/mid");
    expect(mail.text).toContain("- old Inc: https://autogtm.tech/chad-gtm/old");
  });

  it("only asks for this user's unlaunched, undismissed autopilot runs", async () => {
    await planApprovalLaunch("u-1", { now: NOW });
    const q = dialect.sqlToQuery(st.candidateWhere);
    expect(q.sql).toContain('"user_id" = $');
    expect(q.params).toContain("u-1");
    expect(q.sql).toContain('"autopilot" = $');
    expect(q.sql).toContain('"campaign_id" is null');
    expect(q.sql).toContain('"dismissed_at" is null');
  });

  it("never launches someone else's, dismissed, already launched or non-autopilot runs", async () => {
    st.runs = [
      run("other", { userId: "u-2" }),
      run("gone", { dismissedAt: "2026-11-01T00:00:00Z" }),
      run("live", { campaignId: "c-live" }),
      run("manual", { autopilot: false }),
    ];
    const plan = await approve();
    expect(st.launch).not.toHaveBeenCalled();
    expect(plan.note).toEqual({ kind: "none" });
  });

  it("does not launch a run untouched for more than 14 days; the email points to it instead", async () => {
    st.runs = [run("stale", { createdAt: ago(20 * DAY), updatedAt: ago(15 * DAY) })];
    const plan = await approve();
    expect(st.launch).not.toHaveBeenCalled();
    expect(plan.note).toEqual({ kind: "none" });
    expect(plan.latestRunId).toBe("stale");
    const mail = st.send.mock.calls[0]![0];
    expect(mail.text).toContain("Open AutoGTM to review your plan and launch your campaign.");
    expect(mail.text).not.toContain("Enter your website");
    expect(mail.text).toContain("https://autogtm.tech/chad-gtm/stale");
  });

  it("skips runs whose launch already failed (they were not waiting on approval)", async () => {
    st.runs = [run("r1", { calibrationProfile: { launchFailure: { code: "no_leads", message: "x", at: "t" } } })];
    await approve();
    expect(st.launch).not.toHaveBeenCalled();
  });

  it("launches the newest ready run even when a newer one still needs details", async () => {
    st.runs = [run("needs", { updatedAt: ago(MIN * 10) }), run("ready")];
    st.blockers.set("needs", [{ kind: "details", missing: ["postalAddress"], message: "need address" }]);
    const plan = await approve();
    expect(plan.note).toEqual({ kind: "launching", runId: "ready" });
    expect(st.launch.mock.calls[0]![1].run.id).toBe("ready");
  });

  it("with no ready run, says exactly which details are missing and launches nothing", async () => {
    st.runs = [run("r1", { bookingUrl: null })];
    st.blockers.set("r1", [{ kind: "details", missing: ["bookingUrl"], message: "need link" }]);
    const plan = await approve();
    expect(st.launch).not.toHaveBeenCalled();
    expect(plan.note).toEqual({ kind: "details", runId: "r1", missing: ["bookingUrl"] });
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "details" } });
    expect(st.send.mock.calls[0]![0].text).toContain("add your booking link");
  });
});

describe("the 2-minute guard", () => {
  it("the background launch waits until the run is 2 minutes old", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.setSystemTime(NOW);
    st.runs = [run("fresh", { createdAt: ago(30_000), updatedAt: ago(30_000) })];
    const plan = await beginApprovalLaunch("u-1", { now: NOW });
    const done = finishApprovalLaunch("u-1", plan);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(st.launch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(31_000);
    vi.useRealTimers();
    await done;
    expect(st.launch).toHaveBeenCalledTimes(1);
    expect(st.send).toHaveBeenCalledTimes(1);
  });

  it("holds a run created under 2 minutes ago; the retry loop launches it then and sends the email", async () => {
    st.runs = [run("fresh", { createdAt: ago(30_000), updatedAt: ago(30_000) })];
    const plan = await beginApprovalLaunch("u-1", { now: NOW });
    expect(plan.holdUntil).toBe(new Date(NOW.getTime() + 90_000).toISOString());
    expect(st.launch).not.toHaveBeenCalled();
    expect(st.send).not.toHaveBeenCalled();
    expect(record("fresh")).toMatchObject({ state: "launching", emailPending: true });

    // Not due yet.
    await retryApprovalLaunches(new Date(NOW.getTime() + 60_000));
    expect(st.launch).not.toHaveBeenCalled();

    await retryApprovalLaunches(new Date(NOW.getTime() + 5 * MIN));
    expect(st.launch).toHaveBeenCalledTimes(1);
    expect(record("fresh")).toMatchObject({ state: "done", note: { kind: "live" } });
    expect(st.send).toHaveBeenCalledTimes(1);
    expect(st.send.mock.calls[0]![0].subject).toBe("Your AutoGTM campaign is live");
  });
});

describe("temporary launch failures retry on their own", () => {
  it("busy mailboxes: retries later, says so on the run and in the email, and sends the email once", async () => {
    st.runs = [run("r1")];
    st.launch.mockRejectedValueOnce(new LaunchError("no_senders", LAUNCH_FAILURE_MESSAGES.no_senders));
    await approve();
    expect(record("r1")).toMatchObject({ state: "retrying", note: { kind: "failed", retrying: true }, attempts: 1 });
    expect(record("r1").nextAttemptAt).toBe(new Date(NOW.getTime() + APPROVAL_RETRY_BASE_MS).toISOString());
    // The run page shows the stored failure: it promises the automatic retry, not "retry it yourself".
    expect(st.runs[0].calibrationProfile.launchFailure.message).toBe(AUTO_RETRY_MESSAGES.no_senders);
    const mail = st.send.mock.calls[0]![0];
    expect(mail.subject).toBe("Your AutoGTM account is approved");
    expect(mail.text).toContain("We'll retry the launch for you automatically.");

    // Not before the next attempt is due.
    expect((await retryApprovalLaunches(new Date(NOW.getTime() + 5 * MIN))).tried).toBe(0);
    await retryApprovalLaunches(new Date(NOW.getTime() + 16 * MIN));
    expect(st.launch).toHaveBeenCalledTimes(2);
    expect(st.runs[0].campaignId).toBe("c-r1");
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "live" } });
    expect(st.send).toHaveBeenCalledTimes(1);
  });

  it("an error retries too, with a growing gap", async () => {
    st.runs = [run("r1")];
    st.launch.mockRejectedValue(new Error("boom"));
    await approve();
    expect(record("r1")).toMatchObject({ state: "retrying", attempts: 1 });
    const t2 = new Date(NOW.getTime() + 16 * MIN);
    await retryApprovalLaunches(t2);
    expect(record("r1")).toMatchObject({ state: "retrying", attempts: 2 });
    expect(record("r1").nextAttemptAt).toBe(new Date(t2.getTime() + 2 * APPROVAL_RETRY_BASE_MS).toISOString());
  });

  it("a launch already in progress is checked again later, never reported as live", async () => {
    st.runs = [run("r1", { launchStartedAt: ago(MIN) })];
    await approve();
    expect(st.launch).not.toHaveBeenCalled();
    expect(record("r1")).toMatchObject({ state: "retrying", note: { kind: "starting" } });
    expect(st.send.mock.calls[0]![0].subject).not.toMatch(/live/);
  });

  it("a permanent failure (no matching leads) is final", async () => {
    st.runs = [run("r1")];
    st.launch.mockRejectedValue(new LaunchError("no_leads", LAUNCH_FAILURE_MESSAGES.no_leads));
    await approve();
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "failed" } });
    expect(record("r1").note.retrying).toBeUndefined();
    await retryApprovalLaunches(new Date(NOW.getTime() + 2 * DAY));
    expect(st.launch).toHaveBeenCalledTimes(1);
  });

  it("stops 24 h after approval, restores the 'retry it yourself' wording and tells the client", async () => {
    st.runs = [run("r1")];
    st.launch.mockRejectedValue(new LaunchError("no_senders", LAUNCH_FAILURE_MESSAGES.no_senders));
    await approve();
    st.send.mockClear();
    await retryApprovalLaunches(new Date(NOW.getTime() + DAY + MIN));
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "failed" } });
    expect(st.runs[0].calibrationProfile.launchFailure.message).toBe(LAUNCH_FAILURE_MESSAGES.no_senders);
    expect(st.send).toHaveBeenCalledTimes(1);
    expect(st.send.mock.calls[0]![0].subject).toBe("Your AutoGTM campaign didn't start");
    await retryApprovalLaunches(new Date(NOW.getTime() + 2 * DAY));
    expect(st.launch).toHaveBeenCalledTimes(2);
  });

  it("does not retry for an account that was revoked since", async () => {
    st.runs = [run("r1")];
    st.launch.mockRejectedValueOnce(new LaunchError("no_senders", "busy"));
    await approve();
    st.access = "revoked";
    await retryApprovalLaunches(new Date(NOW.getTime() + 16 * MIN));
    expect(st.launch).toHaveBeenCalledTimes(1);
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "none" } });
  });

  it("two workers never repeat an attempt or the email", async () => {
    st.runs = [run("r1")];
    const plan = await beginApprovalLaunch("u-1", { now: NOW });
    await Promise.all([finishApprovalLaunch("u-1", plan), attemptApprovalLaunch("r1", "u-1", NOW)]);
    expect(st.launch).toHaveBeenCalledTimes(1);
    expect(st.send).toHaveBeenCalledTimes(1);
  });
});

describe("other outcomes", () => {
  it("a campaign set up but not started asks for Resume outreach", async () => {
    st.runs = [run("r1")];
    st.launch.mockImplementation(async (_db: unknown, input: any) => {
      st.runs.find((x) => x.id === input.run.id).campaignId = "c-1";
      throw new Error("flip failed");
    });
    await approve();
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "paused", runId: "r1" } });
    expect(st.send.mock.calls[0]![0].text).toContain("Press Resume outreach");
  });

  it("without a mailer still launches, and sends nothing", async () => {
    st.mailer = false;
    st.runs = [run("r1")];
    await approve();
    expect(st.launch).toHaveBeenCalledTimes(1);
    expect(st.send).not.toHaveBeenCalled();
  });

  it("never throws when loading runs fails", async () => {
    await expect(finishApprovalLaunch("u-1", null)).resolves.toBeUndefined();
  });
});

describe("outside a request (the retry loop)", () => {
  // next/cache throws "static generation store missing" when there is no request.
  const throwing = () => {
    throw new Error("Invariant: static generation store missing in revalidatePath /chad-gtm");
  };

  it("a retry that launches is recorded live, never as an error", async () => {
    st.runs = [run("r1")];
    st.launch.mockRejectedValueOnce(new LaunchError("no_senders", LAUNCH_FAILURE_MESSAGES.no_senders));
    await approve();
    expect(record("r1")).toMatchObject({ state: "retrying" });
    vi.mocked(revalidatePath).mockImplementation(throwing);
    try {
      await retryApprovalLaunches(new Date(NOW.getTime() + 16 * MIN));
    } finally {
      vi.mocked(revalidatePath).mockReset();
    }
    expect(st.runs[0].campaignId).toBe("c-r1");
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "live", runId: "r1" } });
  });

  it("a permanent failure on retry is final and keeps its real reason", async () => {
    st.runs = [run("r1")];
    st.launch.mockRejectedValueOnce(new LaunchError("no_senders", LAUNCH_FAILURE_MESSAGES.no_senders));
    await approve();
    st.launch.mockRejectedValue(new LaunchError("no_leads", LAUNCH_FAILURE_MESSAGES.no_leads));
    vi.mocked(revalidatePath).mockImplementation(throwing);
    try {
      await retryApprovalLaunches(new Date(NOW.getTime() + 16 * MIN));
      await retryApprovalLaunches(new Date(NOW.getTime() + 2 * DAY));
    } finally {
      vi.mocked(revalidatePath).mockReset();
    }
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "failed" } });
    expect(record("r1").note.retrying).toBeUndefined();
    expect(st.launch).toHaveBeenCalledTimes(2);
    expect(st.runs[0].calibrationProfile.launchFailure.code).toBe("no_leads");
    // The record written before the failure is still there (the failure write merges).
    expect(record("r1").approvedAt).toBe(NOW.toISOString());
  });
});

describe("the approval email is never lost", () => {
  it("sends it when the run was deleted during the 2-minute hold", async () => {
    st.runs = [run("fresh", { createdAt: ago(30_000), updatedAt: ago(30_000) }), run("older", { createdAt: ago(2 * DAY), updatedAt: ago(20 * DAY) })];
    const plan = await beginApprovalLaunch("u-1", { now: NOW });
    st.runs[0].dismissedAt = NOW.toISOString();
    await finishApprovalLaunch("u-1", { ...plan, holdUntil: null });
    expect(st.launch).not.toHaveBeenCalled();
    expect(st.send).toHaveBeenCalledTimes(1);
    expect(st.send.mock.calls[0]![0].subject).toBe("Your AutoGTM account is approved");
  });

  it("restores a lost record and launches once, with the email", async () => {
    st.runs = [run("r1")];
    const plan = await beginApprovalLaunch("u-1", { now: NOW });
    // A launch elsewhere replaced the profile with an older copy.
    st.runs[0].calibrationProfile = {};
    await finishApprovalLaunch("u-1", plan);
    expect(st.launch).toHaveBeenCalledTimes(1);
    expect(record("r1")).toMatchObject({ state: "done", note: { kind: "live" } });
    expect(st.send).toHaveBeenCalledTimes(1);
    expect(st.send.mock.calls[0]![0].subject).toBe("Your AutoGTM campaign is live");
  });

  it("says the campaign is live when the client launched it themselves meanwhile", async () => {
    st.runs = [run("r1")];
    const plan = await beginApprovalLaunch("u-1", { now: NOW });
    st.runs[0].calibrationProfile = {};
    st.runs[0].campaignId = "c-own";
    await finishApprovalLaunch("u-1", plan);
    expect(st.launch).not.toHaveBeenCalled();
    expect(st.send).toHaveBeenCalledTimes(1);
    expect(st.send.mock.calls[0]![0].subject).toBe("Your AutoGTM campaign is live");
  });
});
