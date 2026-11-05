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

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, formState } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    const res = await authClient.signIn.email(values);
    if (res.error) return setError(res.error.message ?? "Invalid email or password");
    router.push("/dashboard");
    router.refresh();
  });

  return (
    <div className="hairline-top w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-6 sm:p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="mb-6 space-y-1.5 text-center">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-50">Welcome back</h1>
        <p className="text-sm text-zinc-400">Sign in to see what your outbound did today.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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

      <div className="mt-6 border-t border-zinc-800/80 pt-4 text-center text-xs text-zinc-400">
        New to AutoGTM?{" "}
        <Link href="/signup" className="text-zinc-100 hover:underline transition-colors font-medium">
          Create an account
        </Link>
      </div>
    </div>
  );
}
