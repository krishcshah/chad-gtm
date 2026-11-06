import { verifyUnsubscribeToken } from "@smartreach/database";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { UNSUBSCRIBE_CONFIRM_FIELD } from "@/lib/unsubscribe-flow";

export const dynamic = "force-dynamic";

// Recipients of a client's campaign land here: no platform title or
// description, and keep it out of search results. (The favicon comes from the
// app/ icon files and applies to every route.)
export const metadata: Metadata = {
  title: { absolute: "Unsubscribe" },
  description: "Unsubscribe from these emails.",
  robots: { index: false, follow: false },
};

/**
 * Confirm page. Loading it (GET) never unsubscribes: link scanners fetch every
 * URL in an email. The button POSTs to /api/unsubscribe, which unsubscribes and
 * redirects back here with ?status=done or ?status=error.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token?.trim() ?? "";
  const status = sp.status === "done" || sp.status === "error" ? sp.status : null;

  let body: ReactNode;
  if (status === "done") {
    body = (
      <p className="text-sm text-zinc-300">
        You have been unsubscribed. You will not receive further campaign emails from this sender.
      </p>
    );
  } else if (status === "error") {
    body = (
      <p className="text-sm text-red-400">
        We could not process this unsubscribe link. It may be invalid or expired. Reply to the email
        and ask to be removed instead.
      </p>
    );
  } else if (!token) {
    body = <p className="text-sm text-red-400">This unsubscribe link is incomplete. Reply to the email and ask to be removed instead.</p>;
  } else {
    // Read-only check so the page can show which address will be removed.
    const verified = verifyUnsubscribeToken(token);
    body = verified.ok ? (
      <form method="post" action="/api/unsubscribe" className="flex flex-col gap-3">
        <p className="text-sm text-zinc-300">
          Stop campaign emails to <span className="font-mono">{verified.email}</span> from this sender?
        </p>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name={UNSUBSCRIBE_CONFIRM_FIELD} value="1" />
        <button
          type="submit"
          className="w-fit rounded-lg bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Unsubscribe
        </button>
      </form>
    ) : (
      <p className="text-sm text-red-400">
        This unsubscribe link is invalid or has expired. Reply to the email and ask to be removed instead.
      </p>
    );
  }

  // Recipients land here from a client's email: keep it neutral (no platform
  // branding or links into the app).
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-zinc-900/60 p-6 shadow-xl">
        <h1 className="mb-3 text-lg font-semibold tracking-tight text-zinc-50">Unsubscribe</h1>
        {body}
      </div>
    </main>
  );
}
