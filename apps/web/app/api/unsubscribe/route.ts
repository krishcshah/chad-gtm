import { processUnsubscribe } from "@/lib/actions";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  const ct = req.headers.get("content-type") ?? "";
  if (!token && ct.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    const params = new URLSearchParams(body);
    token = params.get("token") ?? "";
    // Some agents only send List-Unsubscribe=One-Click; token stays in query.
  }
  if (!token) {
    // Also accept ?token on the request URL path used in List-Unsubscribe header
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }
  const r = await processUnsubscribe(token);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.redirect(new URL("/unsubscribe", req.url));
  return NextResponse.redirect(new URL(`/unsubscribe?token=${encodeURIComponent(token)}`, req.url));
}
