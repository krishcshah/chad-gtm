import Link from "next/link";
import { authLinkErrorMessage, verifiedRedirectTarget } from "@/lib/auth-redirects";
import { AuthCard, AuthNotice } from "../auth-card";
import { ContinueRedirect } from "./continue-redirect";

export const dynamic = "force-dynamic";

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
        title="Couldn't confirm your email"
        footer={
          <Link href="/login" className="text-zinc-100 hover:underline transition-colors font-medium">
            Back to sign in
          </Link>
        }
      >
        <AuthNotice>
          {error} Sign in with your email and password and we&apos;ll send you a fresh confirmation link.
        </AuthNotice>
      </AuthCard>
    );
  }

  const target = verifiedRedirectTarget(params.next);
  return (
    <AuthCard title="You're in" subtitle="Taking you to AutoGTM…">
      <ContinueRedirect href={target} markSignup={target.includes("new_signup=1")} />
    </AuthCard>
  );
}
