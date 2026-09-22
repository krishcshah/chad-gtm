import { afterEach, describe, expect, it } from "vitest";
import { pickSenderIndex, todayKey } from "../rotation";
import { isInSendingWindow, leadVars } from "../scheduler";
import { claimDueJobs, injectEmailTracking } from "../processor";
import { isEngineDryRun, workerOwnsJob } from "../queue-mode";
import type { CampaignRow, JobRow, SenderRow } from "../db-port";

function sender(over: Partial<SenderRow>): SenderRow {
  return {
    id: "s1",
    userId: "u1",
    senderName: "S",
    email: "s@x.com",
    smtpHost: "h",
    smtpPort: 587,
    smtpUsername: "u",
    smtpPasswordEnc: "",
    smtpSecurity: "tls",
    imapHost: "",
    imapPort: 993,
    imapUsername: "",
    imapPasswordEnc: "",
    dailyLimit: 50,
    hourlyLimit: 10,
    fromName: "",
    replyTo: "",
    timezone: "UTC",
    signature: "",
    status: "active",
    health: 100,
    smtpStatus: "ok",
    imapStatus: "ok",
    lastSyncAt: null,
    repliedCount: 0,
    ...over,
  };
}

const daily = new Map<string, number>();
const hourly = new Map<string, number>();

describe("sender rotation", () => {
  it("round-robins across healthy senders", () => {
    const senders = [sender({ id: "a" }), sender({ id: "b" }), sender({ id: "c" })];
    const p1 = pickSenderIndex(senders, daily, hourly, 0, 50);
    const p2 = pickSenderIndex(senders, daily, hourly, p1!.index, 50);
    const p3 = pickSenderIndex(senders, daily, hourly, p2!.index, 50);
    expect([p1!.sender.id, p2!.sender.id, p3!.sender.id]).toEqual(["b", "c", "a"]);
  });
  it("skips paused and failed senders", () => {
    const senders = [sender({ id: "a", status: "paused" }), sender({ id: "b" }), sender({ id: "c", status: "failed" })];
    const p = pickSenderIndex(senders, daily, hourly, 0, 50);
    expect(p!.sender.id).toBe("b");
  });
  it("skips senders at daily or hourly cap", () => {
    const d = new Map([["a", 50]]);
    const h = new Map([["b", 10]]);
    const senders = [sender({ id: "a" }), sender({ id: "b" }), sender({ id: "c" })];
    const p = pickSenderIndex(senders, d, h, 2, 50);
    expect(p!.sender.id).toBe("c");
  });
  it("respects the campaign's stricter per-sender cap", () => {
    const senders = [sender({ id: "a", dailyLimit: 50 })];
    const d = new Map([["a", 20]]);
    expect(pickSenderIndex(senders, d, hourly, 0, 20)).toBeNull(); // campaign cap 20 reached
    expect(pickSenderIndex(senders, d, hourly, 0, 30)).not.toBeNull();
  });
  it("returns null when everything is exhausted", () => {
    const senders = [sender({ id: "a", status: "paused" }), sender({ id: "b", status: "failed" })];
    expect(pickSenderIndex(senders, daily, hourly, 0, 50)).toBeNull();
  });
});

function campaign(over: Partial<CampaignRow>): CampaignRow {
  return {
    id: "c1",
    userId: "u1",
    name: "C",
    status: "running",
    leadListId: "l1",
    templateId: "t1",
    scheduledAt: null,
    businessDaysOnly: false,
    sendingTimezone: "UTC",
    sendingWindowStart: "09:00",
    sendingWindowEnd: "18:00",
    dailyLimit: 100,
    minDelaySec: 90,
    maxDelaySec: 240,
    maxEmailsPerSenderPerDay: 50,
    stopOnReply: true,
    retryFailed: true,
    retryCount: 3,
    lastSenderIdx: 0,
    senderCapUntil: null,
    startedAt: null,
    completedAt: null,
    ...over,
  };
}

describe("sending window", () => {
  it("allows inside the window (UTC)", () => {
    const c = campaign({});
    expect(isInSendingWindow(c, new Date("2024-03-05T12:00:00Z"))).toBe(true); // Tue noon
    expect(isInSendingWindow(c, new Date("2024-03-05T08:00:00Z"))).toBe(false);
  });
  it("blocks weekends only when businessDaysOnly", () => {
    const saturday = new Date("2024-03-09T12:00:00Z");
    expect(isInSendingWindow(campaign({ businessDaysOnly: true }), saturday)).toBe(false);
    expect(isInSendingWindow(campaign({ businessDaysOnly: false }), saturday)).toBe(true);
  });
  it("honors the campaign timezone", () => {
    const c = campaign({ sendingTimezone: "America/New_York" }); // 09:00 ET = 14:00 UTC
    expect(isInSendingWindow(c, new Date("2024-03-05T13:00:00Z"))).toBe(false); // 8am ET
    expect(isInSendingWindow(c, new Date("2024-03-05T15:00:00Z"))).toBe(true); // 10am ET
  });
});

describe("merge variables from a lead row", () => {
  it("maps standard + custom fields with normalized keys", () => {
    const vars = leadVars({
      email: "a@b.com",
      firstName: "Ada",
      company: "Acme",
      customFields: { "Ice Breaker": "loved your post", Score: "9" },
    });
    expect(vars.first_name).toBe("Ada");
    expect(vars.ice_breaker).toBe("loved your post");
    expect(vars.score).toBe("9");
  });
});

describe("todayKey", () => {
  it("is a YYYY-MM-DD UTC bucket", () => {
    expect(todayKey(new Date("2024-03-05T23:59:00Z"))).toBe("2024-03-05");
  });
});

function job(over: Partial<JobRow> & Pick<JobRow, "id" | "dryRun">): JobRow {
  return {
    campaignId: "c1",
    campaignLeadId: `cl-${over.id}`,
    senderId: "s1",
    leadId: `l-${over.id}`,
    toEmail: `${over.id}@x.com`,
    subject: "hi",
    bodyText: "body",
    bodyHtml: "",
    stepPosition: 1,
    sequenceStepId: null,
    variantId: null,
    status: "pending",
    scheduledFor: "2020-01-01T00:00:00.000Z",
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    messageId: null,
    sentAt: null,
    processingAt: null,
    ...over,
  };
}

/** Fake DB: select returns both modes; CAS update always succeeds. Isolation relies on claimDueJobs. */
function fakeClaimDb(rows: JobRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => rows,
          }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: "ok" }],
        }),
      }),
    }),
  };
}

describe("dry/live queue isolation", () => {
  const prev = process.env.ENGINE_DRY_RUN;
  afterEach(() => {
    if (prev === undefined) delete process.env.ENGINE_DRY_RUN;
    else process.env.ENGINE_DRY_RUN = prev;
  });

  it("isEngineDryRun treats 1/true as dry, everything else as live", () => {
    delete process.env.ENGINE_DRY_RUN;
    expect(isEngineDryRun()).toBe(false);
    process.env.ENGINE_DRY_RUN = "0";
    expect(isEngineDryRun()).toBe(false);
    process.env.ENGINE_DRY_RUN = "false";
    expect(isEngineDryRun()).toBe(false);
    process.env.ENGINE_DRY_RUN = "1";
    expect(isEngineDryRun()).toBe(true);
    process.env.ENGINE_DRY_RUN = "true";
    expect(isEngineDryRun()).toBe(true);
    process.env.ENGINE_DRY_RUN = "TRUE";
    expect(isEngineDryRun()).toBe(true);
  });

  it("workerOwnsJob: dry worker ignores live job and vice versa", () => {
    expect(workerOwnsJob(false, true)).toBe(false);
    expect(workerOwnsJob(true, true)).toBe(true);
    expect(workerOwnsJob(true, false)).toBe(false);
    expect(workerOwnsJob(false, false)).toBe(true);
  });

  it("claimDueJobs: dry worker ignores live job and vice versa", async () => {
    const all = [job({ id: "live", dryRun: false }), job({ id: "dry", dryRun: true })];
    const db = fakeClaimDb(all);
    const now = new Date("2024-01-01T00:00:00Z");

    process.env.ENGINE_DRY_RUN = "1";
    expect((await claimDueJobs(db as any, now, 10)).map((j) => j.id)).toEqual(["dry"]);

    process.env.ENGINE_DRY_RUN = "0";
    expect((await claimDueJobs(db as any, now, 10)).map((j) => j.id)).toEqual(["live"]);

    delete process.env.ENGINE_DRY_RUN;
    expect((await claimDueJobs(db as any, now, 10)).map((j) => j.id)).toEqual(["live"]);
  });
});

describe("injectEmailTracking", () => {
  const baseUrl = "https://app.smartreach.io";

  it("appends open tracking pixel to html body", () => {
    const raw = "<p>Hello world</p>";
    const out = injectEmailTracking(raw, "job-123", baseUrl);
    expect(out).toContain(`<img src="https://app.smartreach.io/api/track/open?jid=job-123"`);
    expect(out).toContain(`width="1" height="1"`);
  });

  it("places tracking pixel right before </body> if present", () => {
    const raw = "<html><body><p>Hello world</p></body></html>";
    const out = injectEmailTracking(raw, "job-123", baseUrl);
    expect(out).toContain(`<img src="https://app.smartreach.io/api/track/open?jid=job-123" width="1" height="1" alt="" style="display:none;width:1px;height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;" /></body></html>`);
  });

  it("rewrites outbound web links for click tracking while preserving non-http links", () => {
    const raw = `<p>Check our <a href="https://example.com/demo">demo</a> or email us at <a href="mailto:test@example.com">email</a></p>`;
    const out = injectEmailTracking(raw, "job-456", baseUrl);
    expect(out).toContain(`href="https://app.smartreach.io/api/track/click?jid=job-456&url=https%3A%2F%2Fexample.com%2Fdemo"`);
    expect(out).toContain(`href="mailto:test@example.com"`);
  });

  it("does not double-wrap tracking links", () => {
    const raw = `<p><a href="https://app.smartreach.io/api/track/click?jid=abc&url=xyz">click</a></p>`;
    const out = injectEmailTracking(raw, "job-789", baseUrl);
    expect(out).toContain(`href="https://app.smartreach.io/api/track/click?jid=abc&url=xyz"`);
  });
});
