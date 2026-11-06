"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { signInSchema, type SignInInput } from "@smartreach/validation";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { SUPPORT_EMAIL } from "@/lib/system-emails";
import { AuthCard, authLinkClass } from "../auth-card";
import { AuthField } from "../auth-field";
import { PasswordInput } from "../password-input";

const forgotLinkClass = "text-[13px] text-muted-foreground transition-colors hover:text-foreground";

export function LoginForm({
  passwordResetEnabled,
  justReset,
  accountDeleted = false,
}: {
  passwordResetEnabled: boolean;
  justReset: boolean;
  accountDeleted?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const { register, handleSubmit, formState } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    setUnverifiedEmail("");
    const res = await authClient.signIn.email({ ...values, callbackURL: "/email-verified?next=dashboard" });
    if (res.error) {
      if (res.error.code === "EMAIL_NOT_VERIFIED") {
        // better-auth (sendOnSignIn) has just emailed a fresh verification link.
        return setUnverifiedEmail(values.email);
      }
      return setError(res.error.message ?? "Invalid email or password");
    }
    router.push("/dashboard");
    router.refresh();
  });

  return (
    <AuthCard
      title="Sign in to AutoGTM"
      description="See what your outbound did and what needs your answer."
      footer={
        <>
          New to AutoGTM?{" "}
          <Link href="/signup" className={authLinkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {justReset && (
          <Alert variant="success">
            <AlertDescription className="mt-0 text-foreground">
              Your password was updated. Sign in with your new password.
            </AlertDescription>
          </Alert>
        )}
        {accountDeleted && !justReset && (
          <Alert>
            <AlertDescription className="mt-0 text-foreground">Your account and its data were deleted.</AlertDescription>
          </Alert>
        )}

        <AuthField id="email" label="Work email" error={formState.errors.email?.message}>
          <Input
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
            className="h-10"
            {...register("email")}
          />
        </AuthField>

        <AuthField
          id="password"
          label="Password"
          error={formState.errors.password?.message}
          action={
            passwordResetEnabled ? (
              <Link href="/forgot-password" className={forgotLinkClass}>
                Forgot password?
              </Link>
            ) : (
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Password reset")}`}
                className={forgotLinkClass}
              >
                Forgot password? Contact support
              </a>
            )
          }
        >
          <PasswordInput autoComplete="current-password" {...register("password")} />
        </AuthField>

        {unverifiedEmail && (
          <Alert variant="warning">
            <AlertTitle>Confirm your email first</AlertTitle>
            <AlertDescription>
              We just sent a new link to <span className="font-medium text-foreground">{unverifiedEmail}</span>.
              Open it, then come back here.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="mt-0 text-foreground">{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="h-10 w-full" loading={formState.isSubmitting}>
          {formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
