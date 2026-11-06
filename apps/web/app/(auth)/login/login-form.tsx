"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { signInSchema, type SignInInput } from "@smartreach/validation";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
} from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { SUPPORT_EMAIL } from "@/lib/system-emails";
import { AuthCard, AuthNotice } from "../auth-card";

export function LoginForm({
  passwordResetEnabled,
  justReset,
}: {
  passwordResetEnabled: boolean;
  justReset: boolean;
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
      title="Welcome back"
      subtitle="Sign in to see what your outbound did today."
      footer={
        <>
          New to AutoGTM?{" "}
          <Link href="/signup" className="text-zinc-100 hover:underline transition-colors font-medium">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {justReset && (
          <AuthNotice>Your password was updated. Sign in with your new password.</AuthNotice>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium text-zinc-300">
            Work email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            className="h-10 rounded-lg text-sm placeholder:text-zinc-600"
            {...register("email")}
          />
          {formState.errors.email && (
            <p className="text-[11px] text-rose-400">{formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-medium text-zinc-300">
              Password
            </Label>
            {passwordResetEnabled ? (
              <Link
                href="/forgot-password"
                className="text-[11px] text-zinc-400 hover:text-zinc-100 hover:underline transition-colors"
              >
                Forgot password?
              </Link>
            ) : (
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Password reset")}`}
                className="text-[11px] text-zinc-400 hover:text-zinc-100 hover:underline transition-colors"
              >
                Forgot password? Contact support
              </a>
            )}
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-10 rounded-lg text-sm placeholder:text-zinc-600"
            {...register("password")}
          />
          {formState.errors.password && (
            <p className="text-[11px] text-rose-400">{formState.errors.password.message}</p>
          )}
        </div>

        {unverifiedEmail && (
          <AuthNotice>
            Confirm your email first. We just sent a new link to{" "}
            <span className="font-medium text-zinc-100">{unverifiedEmail}</span>. Open it, then
            come back here.
          </AuthNotice>
        )}

        {error && (
          <Alert variant="destructive" className="rounded-lg border-rose-500/30 bg-rose-500/10 text-rose-200">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          variant="brand"
          className="w-full h-10 text-sm"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
