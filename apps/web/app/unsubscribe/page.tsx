import { verifyUnsubscribeToken } from "@smartreach/database";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Button, Card } from "@smartreach/ui";
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

const FALLBACK = "Reply to the email and ask to be removed instead.";

/**
 * Confirm page. Loading it (GET) never unsubscribes: link scanners fetch every
 * URL in an email. The button POSTs to /api/unsubscribe, which unsubscribes and
 * redirects back here with ?status=done or ?status=error.
 *
 * Recipients land here from a client's email, so the page stays neutral: no
 * platform branding, navigation or links into the app.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token?.trim() ?? "";
  const status = sp.status === "done" || sp.status === "error" ? sp.status : null;

  let title = "Unsubscribe";
  let body: ReactNode;

  if (status === "done") {
    title = "You're unsubscribed";
    body = <Message>You have been unsubscribed. You will not receive further campaign emails from this sender.</Message>;
  } else if (status === "error") {
    title = "Something went wrong";
    body = (
      <Message>
        We could not process this unsubscribe link. It may be invalid or expired. {FALLBACK}
      </Message>
    );
  } else if (!token) {
    title = "Link incomplete";
    body = <Message>This unsubscribe link is incomplete. {FALLBACK}</Message>;
  } else {
    // Read-only check so the page can show which address will be removed.
    const verified = verifyUnsubscribeToken(token);
    if (verified.ok) {
      body = (
        <form method="post" action="/api/unsubscribe" className="flex flex-col gap-5">
          <Message>
            Stop campaign emails to <span className="font-medium text-foreground">{verified.email}</span> from this
            sender?
          </Message>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name={UNSUBSCRIBE_CONFIRM_FIELD} value="1" />
          <Button type="submit" className="h-10 w-full sm:w-auto sm:self-start">
            Unsubscribe
          </Button>
        </form>
      );
    } else {
      title = "Link not valid";
      body = <Message>This unsubscribe link is invalid or has expired. {FALLBACK}</Message>;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="mb-2 text-lg font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
        {body}
      </Card>
    </main>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}
