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
  const dimensionClass =
    size === "lg" ? "size-11" : size === "sm" ? "size-7" : "size-9";

  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-3 group select-none ${className}`}
      aria-label="AutoGTM Home"
    >
      {/* Minimal, Clean & Beautiful Compass Emblem */}
      <div
        className={`relative ${dimensionClass} shrink-0 transition-transform duration-200 ease-out group-hover:scale-105`}
      >
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Clean minimal squircle housing */}
          <rect
            width="40"
            height="40"
            rx="10"
            fill="#121214"
            stroke="#27272a"
            strokeWidth="1.2"
            className="group-hover:stroke-zinc-500 transition-colors"
          />

          {/* Minimal subtle dial ring */}
          <circle
            cx="20"
            cy="20"
            r="14"
            stroke="#ffffff"
            strokeOpacity="0.1"
            strokeWidth="1.2"
          />

          {/* Elegant dual-tone compass needle (rotates smoothly on hover) */}
          <g className="transition-transform duration-500 ease-out group-hover:rotate-45 origin-[20px_20px]">
            {/* North pointer (Pure white & polished silver) */}
            <polygon points="20,6 20,20 14,20" fill="#ffffff" />
            <polygon points="20,6 26,20 20,20" fill="#a1a1aa" />

            {/* South pointer (Subtle deep zinc facets) */}
            <polygon points="20,34 20,20 14,20" fill="#52525b" />
            <polygon points="20,34 26,20 20,20" fill="#27272a" />

            {/* Center jewel hub */}
            <circle cx="20" cy="20" r="2.8" fill="#121214" stroke="#ffffff" strokeWidth="1.4" />
            <circle cx="20" cy="20" r="1" fill="#ffffff" />
          </g>
        </svg>
      </div>

      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 leading-none">
            <span className="text-sm sm:text-base font-bold tracking-tight text-white font-mono uppercase">
              Auto<span className="text-zinc-400">GTM</span>
            </span>
            <span className="rounded border border-zinc-700 bg-zinc-900/90 px-1.5 py-0.5 text-[9px] font-mono font-medium tracking-wider text-zinc-300 uppercase">
              v2.0
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mt-1 font-medium">
            Autonomous Engine
          </span>
        </div>
      )}
    </Link>
  );
}

// Backward compatibility alias for any existing imports
export const ChadGtmLogo = AutoGtmLogo;
