import { processUnsubscribe } from "@/lib/actions";
import { NextResponse } from "next/server";
import { UNSUBSCRIBE_CONFIRM_FIELD, unsubscribePageUrl } from "@/lib/unsubscribe-flow";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

async function readForm(req: Request): Promise<URLSearchParams | null> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (ct.includes("application/x-www-form-urlencoded")) {
      return new URLSearchParams(await req.text());
    }
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const out = new URLSearchParams();
      for (const [k, v] of fd.entries()) if (typeof v === "string") out.append(k, v);
      return out;
    }
  } catch {
    // Unreadable body: fall through with the query token only.
  }
  return null;
}

/**
 * Unsubscribes. Used by RFC 8058 one-click (`List-Unsubscribe=One-Click` body,
 * token in the query string; answered with 200/400 JSON) and by the confirm
 * button on /unsubscribe (answered with a 303 back to the page on APP_URL).
 */
export async function POST(req: Request) {
  const form = await readForm(req);
  const fromConfirmPage = form?.get(UNSUBSCRIBE_CONFIRM_FIELD) === "1";
  const token = (new URL(req.url).searchParams.get("token") || form?.get("token") || "").trim();

  if (!token) {
    if (fromConfirmPage) {
      return NextResponse.redirect(unsubscribePageUrl({ status: "error" }), { status: 303, headers: NO_STORE });
    }
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400, headers: NO_STORE });
  }

  const r = await processUnsubscribe(token);
  if (fromConfirmPage) {
    return NextResponse.redirect(unsubscribePageUrl({ status: r.ok ? "done" : "error" }), {
      status: 303,
      headers: NO_STORE,
    });
  }
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/**
 * Never unsubscribes (link scanners and previewers fetch with GET): sends the
 * visitor to the confirm page on APP_URL.
 */
export async function GET(req: Request) {
  const token = (new URL(req.url).searchParams.get("token") ?? "").trim();
  return NextResponse.redirect(unsubscribePageUrl(token ? { token } : {}), { status: 302, headers: NO_STORE });
}
