import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const processUnsubscribe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({ processUnsubscribe }));

import { createUnsubscribeToken } from "@smartreach/database";
import { GET, POST } from "@/app/api/unsubscribe/route";
import UnsubscribePage from "@/app/unsubscribe/page";
import { isOneClickBody, publicAppOrigin, unsubscribePageUrl } from "@/lib/unsubscribe-flow";

const env = process.env as Record<string, string | undefined>;
const saved = { APP_URL: env.APP_URL, BETTER_AUTH_URL: env.BETTER_AUTH_URL, BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET };

beforeEach(() => {
  processUnsubscribe.mockReset();
  processUnsubscribe.mockResolvedValue({ ok: true, message: "Unsubscribed", data: { email: "a@b.com" } });
  env.APP_URL = "https://autogtm.tech";
  env.BETTER_AUTH_SECRET = "test-secret-for-unsub-tokens-xxxxxx";
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

// The internal origin the app sees behind the reverse proxy.
const INTERNAL = "https://localhost:3005";

describe("unsubscribe-flow helpers", () => {
  it("builds page URLs from APP_URL, falling back to BETTER_AUTH_URL", () => {
    expect(unsubscribePageUrl({ token: "a b", status: "done" }, { APP_URL: "https://autogtm.tech/x" })).toBe(
      "https://autogtm.tech/unsubscribe?token=a+b&status=done"
    );
    expect(publicAppOrigin({ APP_URL: "", BETTER_AUTH_URL: "https://auth.example.com" })).toBe(
      "https://auth.example.com"
    );
    expect(publicAppOrigin({ APP_URL: "javascript:alert(1)" })).toBe("http://localhost:3000");
  });
  it("recognises the RFC 8058 one-click body", () => {
    expect(isOneClickBody(new URLSearchParams("List-Unsubscribe=One-Click"))).toBe(true);
    expect(isOneClickBody(new URLSearchParams("foo=bar"))).toBe(false);
    expect(isOneClickBody(null)).toBe(false);
  });
});

describe("GET /api/unsubscribe", () => {
  it("never unsubscribes and redirects to the confirm page on APP_URL", async () => {
    const res = await GET(new Request(`${INTERNAL}/api/unsubscribe?token=tok123`));
    expect(processUnsubscribe).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://autogtm.tech/unsubscribe?token=tok123");
  });
  it("redirects to the bare page without a token", async () => {
    const res = await GET(new Request(`${INTERNAL}/api/unsubscribe`));
    expect(res.headers.get("location")).toBe("https://autogtm.tech/unsubscribe");
    expect(processUnsubscribe).not.toHaveBeenCalled();
  });
});

describe("POST /api/unsubscribe", () => {
  it("supports RFC 8058 one-click (token in query, List-Unsubscribe=One-Click body)", async () => {
    const res = await POST(
      new Request(`${INTERNAL}/api/unsubscribe?token=tok123`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      })
    );
    expect(processUnsubscribe).toHaveBeenCalledWith("tok123");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("returns 400 JSON for a bad or missing token", async () => {
    processUnsubscribe.mockResolvedValueOnce({ ok: false, error: "Invalid signature" });
    const bad = await POST(new Request(`${INTERNAL}/api/unsubscribe?token=nope`, { method: "POST" }));
    expect(bad.status).toBe(400);
    const missing = await POST(new Request(`${INTERNAL}/api/unsubscribe`, { method: "POST" }));
    expect(missing.status).toBe(400);
  });
  it("confirm-page POST unsubscribes then 303-redirects to APP_URL, never the request origin", async () => {
    const res = await POST(
      new Request(`${INTERNAL}/api/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "token=tok123&confirm=1",
      })
    );
    expect(processUnsubscribe).toHaveBeenCalledWith("tok123");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://autogtm.tech/unsubscribe?status=done");
    expect(res.headers.get("location")).not.toContain("localhost");
  });
  it("confirm-page POST with an invalid token redirects with status=error", async () => {
    processUnsubscribe.mockResolvedValueOnce({ ok: false, error: "Invalid signature" });
    const res = await POST(
      new Request(`${INTERNAL}/api/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "token=bad&confirm=1",
      })
    );
    expect(res.headers.get("location")).toBe("https://autogtm.tech/unsubscribe?status=error");
  });
});

describe("/unsubscribe page", () => {
  it("shows a confirm button that POSTs, without unsubscribing on load", async () => {
    const token = createUnsubscribeToken("user-1", "Ada@Example.com");
    const el = await UnsubscribePage({ searchParams: Promise.resolve({ token }) });
    const html = renderToStaticMarkup(el);
    expect(processUnsubscribe).not.toHaveBeenCalled();
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/unsubscribe"');
    expect(html).toContain('name="confirm"');
    expect(html).toContain("ada@example.com");
  });
  it("shows the result after the POST redirect", async () => {
    const done = renderToStaticMarkup(await UnsubscribePage({ searchParams: Promise.resolve({ status: "done" }) }));
    expect(done).toContain("You have been unsubscribed");
    const bad = renderToStaticMarkup(await UnsubscribePage({ searchParams: Promise.resolve({ token: "x.y" }) }));
    // Recipients get a plain message, not the verifier's internal error text.
    expect(bad).toContain("This unsubscribe link is invalid or has expired.");
    expect(bad).not.toContain("Invalid signature");
    expect(bad).not.toContain("<form");
  });
});
