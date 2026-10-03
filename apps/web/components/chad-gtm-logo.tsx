import Link from "next/link";
import { Terminal, Zap } from "lucide-react";

export function ChadGtmLogo({
  href = "/",
  compact = false,
  className = "",
  size = "md",
}: {
  href?: string;
  compact?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const boxSize = size === "lg" ? "size-10" : size === "sm" ? "size-7" : "size-8";
  const imgClass = size === "lg" ? "size-8" : size === "sm" ? "size-5" : "size-6";

  return (
    <Link href={href} className={`inline-flex shrink-0 items-center gap-3 group ${className}`}>
      {/* Boxy Architectural GigaChad Badge */}
      <span
        className={`relative flex ${boxSize} items-center justify-center rounded-none border border-zinc-700 bg-black text-white transition-all duration-150 group-hover:border-white shadow-sm overflow-hidden p-0.5`}
      >
        <img
          src="/chad-white-border.png"
          alt="ChadGTM Emblem"
          className={`${imgClass} object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-transform duration-150 group-hover:scale-110`}
        />
        <span className="absolute -bottom-1 -right-1 size-1.5 bg-white border border-black" />
      </span>

      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 leading-none">
            <span className="text-sm font-bold tracking-tight text-white font-mono uppercase">
              Chad<span className="text-zinc-400">GTM</span>
            </span>
            <span className="rounded-none border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono tracking-widest text-zinc-300 uppercase">
              v2.0
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">
            Autonomous Engine
          </span>
        </div>
      )}
    </Link>
  );
}
