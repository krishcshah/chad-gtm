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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-2xl">
      <div className="mb-6 space-y-1.5 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-white">Welcome back</h1>
        <p className="text-xs text-zinc-400">
          Sign in to your ChadGTM Autonomous Outbound Hub
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium text-zinc-300">
            Work Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            className="rounded-xl border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/20"
            {...register("email")}
          />
          {formState.errors.email && (
            <p className="text-xs text-rose-400">{formState.errors.email.message}</p>
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
            className="rounded-xl border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/20"
            {...register("password")}
          />
          {formState.errors.password && (
            <p className="text-xs text-rose-400">{formState.errors.password.message}</p>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-xl border-rose-500/30 bg-rose-500/10 text-rose-300">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 font-bold text-white shadow-lg shadow-indigo-600/25 hover:opacity-95 text-xs h-10 transition-all cursor-pointer"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? "Authenticating..." : "Sign in to Mission Control"}
        </Button>
      </form>

      <div className="mt-6 border-t border-white/5 pt-5 text-center text-xs text-zinc-500">
        New to ChadGTM?{" "}
        <Link href="/signup" className="font-semibold text-violet-400 hover:text-violet-300 transition-colors">
          Create free account ($0/mo)
        </Link>
      </div>
    </div>
  );
}
