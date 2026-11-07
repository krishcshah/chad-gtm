"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Spinner, cn } from "@smartreach/ui";
import { savePendingWebsite } from "@/lib/pending-website";

/** Where the website field sends a signed-out visitor. */
export function signupHrefForWebsite(website: string): string {
  return `/signup?url=${encodeURIComponent(website)}`;
}

/**
 * The page's one primary action: paste your website.
 *
 * Signed out, it continues to `/signup?url=<website>` (and still works as a
 * plain GET form without JavaScript). Signed in, the run starts inside the
 * app, so it is a single button to `/chad-gtm`.
 */
export function UrlForm({
  isLoggedIn,
  cta,
  hint,
  className,
}: {
  isLoggedIn: boolean;
  cta: string;
  hint?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (isLoggedIn) {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <Link
          href="/chad-gtm"
          className="group inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-[15px] font-medium text-brand-foreground shadow-[0_8px_30px_-8px_var(--brand)] transition-transform hover:-translate-y-px"
        >
          Open your agent
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <p className="text-[13px] text-muted-foreground">You&apos;re signed in. Start a run from the app.</p>
      </div>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = website.trim();
    if (!value) {
      setError("Enter your website to continue.");
      return;
    }
    setError("");
    setPending(true);
    savePendingWebsite(value);
    router.push(signupHrefForWebsite(value));
  }

  const inputId = `${id}-website`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <form action="/signup" method="get" noValidate onSubmit={onSubmit} className={cn("w-full max-w-[520px]", className)}>
      <label htmlFor={inputId} className="sr-only">
        Your website
      </label>
      <div className="lp-beam rounded-full">
        <div className="flex items-center gap-2 rounded-full border border-border-strong bg-card/90 p-1.5 pl-5 shadow-lg backdrop-blur transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-ring">
          <span aria-hidden className="hidden select-none text-[15px] text-subtle-foreground sm:inline">
            https://
          </span>
          <input
            id={inputId}
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourcompany.com"
            value={website}
            onChange={(e) => {
              setWebsite(e.target.value);
              if (error) setError("");
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle-foreground"
          />
          <button
            type="submit"
            disabled={pending}
            className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-brand px-4 text-[14.5px] font-medium text-brand-foreground shadow-[0_8px_30px_-8px_var(--brand)] transition-[transform,opacity] hover:-translate-y-px disabled:opacity-80 sm:px-5"
          >
            {pending ? <Spinner className="size-4 text-brand-foreground" /> : null}
            {cta}
            {!pending && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
          </button>
        </div>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-3 text-center text-[13px] text-destructive-text">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-4 text-center text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </form>
  );
}
