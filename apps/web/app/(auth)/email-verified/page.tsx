import Link from "next/link";
import { CheckCircle2, MailWarning } from "lucide-react";
import { Button } from "@smartreach/ui";
import { authLinkErrorMessage, verifiedRedirectTarget } from "@/lib/auth-redirects";
import { AuthCard } from "../auth-card";
import { ContinueRedirect } from "./continue-redirect";

export const dynamic = "force-dynamic";

export const metadata = { title: "Email confirmation" };

/**
 * Landing page for the verification link (better-auth redirects here after
 * /api/auth/verify-email, with ?error=… when the token was bad). Sign-in also
 * passes this page as its callbackURL, so the copy stays neutral.
 */
export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = authLinkErrorMessage(params.error);

  if (error) {
    return (
      <AuthCard
        icon={MailWarning}
        tone="warning"
        title="Couldn't confirm your email"
        description={`${error} Sign in with your email and password and we'll send you a fresh confirmation link.`}
      >
        <Button asChild className="h-10 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }

  const target = verifiedRedirectTarget(params.next);
  return (
    <AuthCard icon={CheckCircle2} tone="success" title="You're in" description="Taking you to AutoGTM…">
      <ContinueRedirect href={target} markSignup={target.includes("new_signup=1")} />
    </AuthCard>
  );
}
