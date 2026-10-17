import Link from "next/link";

export function AutoGtmLogo({
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
  const imgClass = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";

  return (
    <Link href={href} className={`inline-flex shrink-0 items-center gap-3 group ${className}`}>
      {/* Boxy Architectural Compass Badge */}
      <span
        className={`relative flex ${boxSize} items-center justify-center rounded-none border border-zinc-700 bg-black text-white transition-all duration-200 group-hover:border-zinc-300 shadow-sm overflow-hidden p-1`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${imgClass} transition-transform duration-500 ease-out group-hover:rotate-45 text-white`}
        >
          {/* Dial and Cardinal Ticks */}
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.2" className="text-zinc-700 group-hover:text-zinc-500 transition-colors" />
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.2 1.8" className="text-zinc-800" />
          
          <line x1="12" y1="2" x2="12" y2="4" stroke="currentColor" strokeWidth="1.5" className="text-white" />
          <line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" strokeWidth="1.2" className="text-zinc-600" />
          <line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" className="text-zinc-600" />
          <line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.2" className="text-zinc-600" />
          
          {/* North Needle (Bright multi-faceted tip) */}
          <path d="M12 4.5L14 12L12 10.5Z" fill="#FFFFFF" />
          <path d="M12 4.5L10 12L12 10.5Z" fill="#A1A1AA" />

          {/* South Needle (Precision dark facets) */}
          <path d="M12 19.5L14 12L12 13.5Z" fill="#52525B" />
          <path d="M12 19.5L10 12L12 13.5Z" fill="#27272A" />

          {/* Center Pivot Jewel */}
          <circle cx="12" cy="12" r="1.6" fill="#09090B" stroke="#FFFFFF" strokeWidth="0.8" />
          <circle cx="12" cy="12" r="0.6" fill="#FFFFFF" />
        </svg>
        <span className="absolute -bottom-1 -right-1 size-1.5 bg-white border border-black" />
      </span>

      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 leading-none">
            <span className="text-sm font-bold tracking-tight text-white font-mono uppercase">
              Auto<span className="text-zinc-400">GTM</span>
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

// Backward compatibility alias for any existing imports
export const ChadGtmLogo = AutoGtmLogo;

