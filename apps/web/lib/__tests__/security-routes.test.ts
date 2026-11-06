import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engineTick = vi.hoisted(() => vi.fn());
const dbState = vi.hoisted(() => ({ job: undefined as any, inserted: [] as any[] }));

vi.mock("@smartreach/email-engine", () => ({ engineTick }));
vi.mock("@/lib/db", () => ({
  getDb: () => {
    const chain: any = {
      select: () => chain,
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: async () => (dbState.job ? [dbState.job] : []),
      insert: () => ({
        values: async (v: unknown) => {
          dbState.inserted.push(v);
        },
      }),
    };
    return chain;
  },
}));

import { GET as tickGET, POST as tickPOST } from "@/app/api/engine/tick/route";
import { GET as clickGET } from "@/app/api/track/click/route";

const env = process.env as Record<string, string | undefined>;
const saved = { NODE_ENV: env.NODE_ENV, CRON_SECRET: env.CRON_SECRET, APP_URL: env.APP_URL };

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

describe("/api/engine/tick", () => {
  beforeEach(() => {
    engineTick.mockReset();
    engineTick.mockResolvedValue({
      startedAt: "now",
      sched: { started: 1, enqueued: 2, skipped: [{ campaign: "Top Secret Campaign", note: "no-senders" }] },
      proc: { sent: 2, failed: 0 },
      sync: { checked: 1, repliesFound: 0, errors: ["imap bob@client.com: auth failed"] },
      agent: null,
    });
    env.NODE_ENV = "production";
    env.CRON_SECRET = "a-long-random-secret";
  });

  it("rejects a spoofed vercel-cron User-Agent without the token", async () => {
    const res = await tickGET(
      new Request("https://autogtm.tech/api/engine/tick", { headers: { "user-agent": "vercel-cron/1.0" } })
    );
    expect(res.status).toBe(401);
    expect(engineTick).not.toHaveBeenCalled();
  });

  it("refuses in production when CRON_SECRET is unset", async () => {
    delete env.CRON_SECRET;
    const res = await tickPOST(
      new Request("https://autogtm.tech/api/engine/tick", { method: "POST", headers: { authorization: "Bearer " } })
    );
    expect(res.status).toBe(401);
    expect(engineTick).not.toHaveBeenCalled();
  });

  it("runs with the bearer token and returns counts only", async () => {
    const res = await tickGET(
      new Request("https://autogtm.tech/api/engine/tick", {
        headers: { authorization: "Bearer a-long-random-secret" },
      })
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/@|Secret|auth failed|no-senders/);
    expect(JSON.parse(text)).toEqual({
      ok: true,
      data: {
        sched: { started: 1, enqueued: 2, skipped: 1 },
        proc: { sent: 2, failed: 0 },
        sync: { checked: 1, repliesFound: 0, errors: 1 },
      },
    });
  });

  it("does not leak error text on failure", async () => {
    engineTick.mockRejectedValue(new Error("connect to smtp bob@client.com failed"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await tickGET(
      new Request("https://autogtm.tech/api/engine/tick", {
        headers: { authorization: "Bearer a-long-random-secret" },
      })
    );
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("bob@client.com");
  });
});

describe("/api/track/click", () => {
  beforeEach(() => {
    env.APP_URL = "https://autogtm.tech";
    dbState.inserted = [];
    dbState.job = {
      id: "job_1",
      campaignId: "c1",
      leadId: "l1",
      userId: "u1",
      bodyHtml: '<p><a href="https://cal.com/acme/intro">book</a></p>',
      bodyText: "",
    };
  });

  const click = (qs: string) => clickGET(new Request(`http://localhost:3005/api/track/click?${qs}`));

  it("redirects and logs a link from the email", async () => {
    const res = await click(`jid=job_1&url=${encodeURIComponent("https://cal.com/acme/intro")}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://cal.com/acme/intro");
    expect(dbState.inserted).toHaveLength(1);
    expect(dbState.inserted[0]).toMatchObject({ type: "click", jobId: "job_1", targetUrl: "https://cal.com/acme/intro" });
  });

  it("sends forged targets to APP_URL and does not log", async () => {
    const res = await click(`jid=job_1&url=${encodeURIComponent("https://evil.example/phish")}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://autogtm.tech/");
    expect(dbState.inserted).toHaveLength(0);
  });

  it("sends requests without a job to APP_URL", async () => {
    expect((await click(`url=${encodeURIComponent("https://example.com")}`)).headers.get("location")).toBe(
      "https://autogtm.tech/"
    );
    dbState.job = undefined;
    expect(
      (await click(`jid=nope&url=${encodeURIComponent("https://cal.com/acme/intro")}`)).headers.get("location")
    ).toBe("https://autogtm.tech/");
  });
});
