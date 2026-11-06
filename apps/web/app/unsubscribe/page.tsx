import { verifyUnsubscribeToken } from "@smartreach/database";
import { APP_NAME } from "@smartreach/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { UNSUBSCRIBE_CONFIRM_FIELD } from "@/lib/unsubscribe-flow";

export const dynamic = "force-dynamic";

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
      <p className="text-sm text-muted-foreground">
        You have been unsubscribed. You will not receive further campaign emails from this sender.
      </p>
    );
  } else if (status === "error") {
    body = (
      <p className="text-sm text-destructive">
        We could not process this unsubscribe link. It may be invalid or expired. Reply to the email
        and ask to be removed instead.
      </p>
    );
  } else if (!token) {
    body = <p className="text-sm text-destructive">Missing unsubscribe token</p>;
  } else {
    // Read-only check so the page can show which address will be removed.
    const verified = verifyUnsubscribeToken(token);
    body = verified.ok ? (
      <form method="post" action="/api/unsubscribe" className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Stop campaign emails to <span className="font-mono">{verified.email}</span> from this sender?
        </p>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name={UNSUBSCRIBE_CONFIRM_FIELD} value="1" />
        <button
          type="submit"
          className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Unsubscribe
        </button>
      </form>
    ) : (
      <p className="text-sm text-destructive">{verified.error}</p>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
      <h2 className="text-lg font-medium">Unsubscribe</h2>
      {body}
      <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to {APP_NAME}
      </Link>
    </main>
  );
}
