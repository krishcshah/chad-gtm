"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription, Button } from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/password-rules";
import { AuthCard, authLinkClass } from "../auth-card";
import { AuthField } from "../auth-field";
import { PasswordInput } from "../password-input";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<{ field: "password" | "confirm"; message: string } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      // Length problems belong to the first field; anything else is a mismatch.
      const lengthOk = password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
      return setFieldError({ field: lengthOk ? "confirm" : "password", message: problem });
    }
    setFieldError(null);
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
      description="You'll be signed out on every other device."
      footer={
        <Link href="/login" className={authLinkClass}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <AuthField
          id="password"
          label="New password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={fieldError?.field === "password" ? fieldError.message : undefined}
        >
          <PasswordInput
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </AuthField>

        <AuthField
          id="confirm"
          label="Confirm new password"
          error={fieldError?.field === "confirm" ? fieldError.message : undefined}
        >
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </AuthField>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="mt-0 text-foreground">
              {error}{" "}
              <Link href="/forgot-password" className={authLinkClass}>
                Send a new link
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="h-10 w-full" loading={submitting}>
          {submitting ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthCard>
  );
}
