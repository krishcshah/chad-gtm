import { isSystemMailerConfigured } from "@smartreach/email-engine/system-mailer";
import { LoginForm } from "./login-form";

// Read the mailer env at request time, not at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <LoginForm
      passwordResetEnabled={isSystemMailerConfigured()}
      justReset={params.reset === "1"}
      accountDeleted={params.deleted === "true"}
    />
  );
}
