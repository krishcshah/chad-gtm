import type { ReactNode } from "react";

/** Shared frame for the auth pages (login, sign-up, password reset). */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="hairline-top w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-6 sm:p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="mb-6 space-y-1.5 text-center">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
        {subtitle ? <p className="text-sm text-zinc-400">{subtitle}</p> : null}
      </div>

      {children}

      {footer ? (
        <div className="mt-6 border-t border-zinc-800/80 pt-4 text-center text-xs text-zinc-400">{footer}</div>
      ) : null}
    </div>
  );
}

/** Neutral notice used for "check your inbox" style confirmations. */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-4 py-3 text-xs leading-relaxed text-zinc-300">
      {children}
    </div>
  );
}
