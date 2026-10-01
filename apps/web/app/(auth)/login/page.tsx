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
    <div className="w-full max-w-md rounded-none border border-zinc-800 bg-zinc-950 p-6 sm:p-8 font-mono shadow-none">
      <div className="mb-6 space-y-1.5 text-center">
        <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-white">Sign In</h1>
        <p className="text-xs text-zinc-500 font-mono">
          ChadGTM Autonomous Outbound Engine
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[10px] uppercase tracking-widest text-zinc-400">
            Work Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono"
            {...register("email")}
          />
          {formState.errors.email && (
            <p className="text-[11px] text-zinc-400">{formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[10px] uppercase tracking-widest text-zinc-400">
              Password
            </Label>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono"
            {...register("password")}
          />
          {formState.errors.password && (
            <p className="text-[11px] text-zinc-400">{formState.errors.password.message}</p>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-none border-zinc-700 bg-zinc-900 text-zinc-200">
            <AlertDescription className="text-xs font-mono">{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full rounded-none bg-white font-semibold text-black hover:bg-zinc-200 text-xs font-mono uppercase tracking-wider h-10 border border-white cursor-pointer"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? "Authenticating..." : "Sign In to Mission Control"}
        </Button>
      </form>

      <div className="mt-6 border-t border-zinc-800 pt-4 text-center text-xs text-zinc-500 font-mono">
        New to ChadGTM?{" "}
        <Link href="/signup" className="text-white hover:underline transition-colors uppercase tracking-wider font-semibold">
          Create Account ($0/mo)
        </Link>
      </div>
    </div>
  );
}
