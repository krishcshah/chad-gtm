import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";

export function ChadGtmLogo({
  href = "/",
  compact = false,
  className = "",
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={`inline-flex shrink-0 items-center gap-2.5 group ${className}`}>
      <span className="relative flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 shadow-lg shadow-indigo-500/25 transition-all duration-300 group-hover:scale-105 group-hover:shadow-indigo-500/40">
        <Zap className="size-4 text-white fill-white transition-transform group-hover:rotate-12" />
        <span className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 opacity-0 blur-sm transition-opacity group-hover:opacity-75" />
      </span>
      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-base font-extrabold tracking-tight text-white font-mono">
              Chad<span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">GTM</span>
            </span>
            <span className="rounded-full bg-gradient-to-r from-violet-500/20 to-cyan-500/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-cyan-300 uppercase border border-cyan-500/30">
              AI 2.0
            </span>
          </div>
          <span className="text-[10px] font-medium text-zinc-400 tracking-wide mt-0.5">
            Autonomous Outbound Engine
          </span>
        </div>
      )}
    </Link>
  );
}
