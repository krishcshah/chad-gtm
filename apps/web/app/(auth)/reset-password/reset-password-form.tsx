"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
} from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { validateNewPassword } from "@/lib/password-rules";
import { AuthCard } from "../auth-card";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const problem = validateNewPassword(password, confirm);
    if (problem) return setFieldError(problem);
    setFieldError("");
    setSubmitting(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) {
        const code = String(res.error.code ?? "");
        return setError(
          code === "INVALID_TOKEN"
            ? "This reset link has expired or was already used. Request a new one."
            : res.error.message || "Could not update your password. Try again.",
        );
      }
      router.push("/login?reset=1");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="You'll be signed out everywhere else."
      footer={
        <Link href="/login" className="text-zinc-100 hover:underline transition-colors font-medium">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium text-zinc-300">
            New password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="h-10 rounded-lg text-sm placeholder:text-zinc-600"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-xs font-medium text-zinc-300">
            Confirm new password
          </Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="h-10 rounded-lg text-sm placeholder:text-zinc-600"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {fieldError && <p className="text-[11px] text-rose-400">{fieldError}</p>}
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-lg border-rose-500/30 bg-rose-500/10 text-rose-200">
            <AlertDescription className="text-xs">
              {error}{" "}
              <Link href="/forgot-password" className="underline">
                Send a new link
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" variant="brand" className="w-full h-10 text-sm" disabled={submitting}>
          {submitting ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthCard>
  );
}
