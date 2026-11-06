import Link from "next/link";
import { authLinkErrorMessage, firstParam } from "@/lib/auth-redirects";
import { AuthCard, AuthNotice } from "../auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

/**
 * better-auth redirects the emailed link here with ?token=… (valid) or
 * ?error=INVALID_TOKEN (expired / used).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = firstParam(params.token).trim();
  const error = authLinkErrorMessage(params.error) ?? (token ? null : "This link is missing its reset code.");

  if (error) {
    return (
      <AuthCard
        title="Reset link not valid"
        footer={
          <Link href="/login" className="text-zinc-100 hover:underline transition-colors font-medium">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          <AuthNotice>{error} Reset links work once and expire after 1 hour.</AuthNotice>
          <Link
            href="/forgot-password"
            className="flex h-10 w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/60 text-sm text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
          >
            Send a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  return <ResetPasswordForm token={token} />;
}
