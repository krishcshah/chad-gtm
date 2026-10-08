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
    <div className="w-full max-w-md rounded-xl border border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl p-6 sm:p-8 font-sans shadow-2xl card-shine">
      <div className="mb-6 space-y-1.5 text-center">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Sign In</h1>
        <p className="text-xs text-zinc-400 font-sans">
          ChadGTM Autonomous Outbound Engine
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
            className="rounded-md border-zinc-800 bg-black/60 text-xs text-white placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-white font-sans"
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
            className="rounded-md border-zinc-800 bg-black/60 text-xs text-white placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-white font-sans"
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
          className="w-full rounded-md bg-white font-semibold text-black hover:bg-zinc-200 text-xs tracking-tight h-10 transition-all active:scale-[0.98] cursor-pointer"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? "Authenticating..." : "Sign In to Mission Control"}
        </Button>
      </form>

      <div className="mt-6 border-t border-zinc-800/80 pt-4 text-center text-xs text-zinc-400">
        New to ChadGTM?{" "}
        <Link href="/signup" className="text-white hover:underline transition-colors font-medium">
          Create Account ($0/mo)
        </Link>
      </div>
    </div>
  );
}
