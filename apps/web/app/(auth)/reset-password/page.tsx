import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { Button } from "@smartreach/ui";
import { authLinkErrorMessage, firstParam } from "@/lib/auth-redirects";
import { AuthCard, authLinkClass } from "../auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Choose a new password" };

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
        icon={LinkIcon}
        tone="warning"
        title="This reset link doesn't work"
        description={`${error} Reset links work once and expire after 1 hour.`}
        footer={
          <Link href="/login" className={authLinkClass}>
            Back to sign in
          </Link>
        }
      >
        <Button asChild className="h-10 w-full">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </AuthCard>
    );
  }

  return <ResetPasswordForm token={token} />;
}
