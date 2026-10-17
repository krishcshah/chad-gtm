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
  // Dimensions for the logo mark: big, bold, and commanding
  const dimensionClass =
    size === "lg" ? "size-12" : size === "sm" ? "size-8" : "size-10";

  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-3.5 group select-none ${className}`}
      aria-label="AutoGTM Home"
    >
      {/* The Compass Logo Mark - The box itself IS the logo */}
      <div
        className={`relative ${dimensionClass} shrink-0 transition-transform duration-300 ease-out group-hover:scale-105`}
      >
        <svg
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)]"
        >
          <defs>
            {/* High-tech gradients for the compass badge */}
            <linearGradient id="autogtm-badge-bg" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1c1c20" />
              <stop offset="50%" stopColor="#09090b" />
              <stop offset="100%" stopColor="#050507" />
            </linearGradient>
            <linearGradient id="autogtm-border-grad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#a1a1aa" />
              <stop offset="50%" stopColor="#52525b" />
              <stop offset="100%" stopColor="#27272a" />
            </linearGradient>
            <linearGradient id="autogtm-needle-n-l" x1="22" y1="4" x2="15" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f4f4f5" />
            </linearGradient>
            <linearGradient id="autogtm-needle-n-r" x1="22" y1="4" x2="29" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#e4e4e7" />
              <stop offset="100%" stopColor="#a1a1aa" />
            </linearGradient>
            <linearGradient id="autogtm-needle-s-l" x1="22" y1="40" x2="15" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#71717a" />
              <stop offset="100%" stopColor="#52525b" />
            </linearGradient>
            <linearGradient id="autogtm-needle-s-r" x1="22" y1="40" x2="29" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="100%" stopColor="#27272a" />
            </linearGradient>
          </defs>

          {/* 1. Compass Instrument Housing (The box itself IS the logo) */}
          <rect
            x="1"
            y="1"
            width="42"
            height="42"
            rx="10"
            fill="url(#autogtm-badge-bg)"
            stroke="url(#autogtm-border-grad)"
            strokeWidth="1.5"
            className="group-hover:stroke-zinc-300 transition-colors duration-200"
          />

          {/* 2. Outer Compass Dial Ring (Spanning edge-to-edge inside the housing) */}
          <circle
            cx="22"
            cy="22"
            r="17"
            stroke="#ffffff"
            strokeOpacity="0.25"
            strokeWidth="1.2"
            className="group-hover:stroke-opacity-40 transition-opacity"
          />
          <circle
            cx="22"
            cy="22"
            r="13"
            stroke="#71717a"
            strokeOpacity="0.35"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />

          {/* 3. High-Contrast Cardinal Direction Ticks */}
          {/* North Indicator */}
          <line x1="22" y1="4.5" x2="22" y2="8.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          {/* South Indicator */}
          <line x1="22" y1="35.5" x2="22" y2="39.5" stroke="#71717a" strokeWidth="2" strokeLinecap="round" />
          {/* West Indicator */}
          <line x1="4.5" y1="22" x2="8.5" y2="22" stroke="#71717a" strokeWidth="2" strokeLinecap="round" />
          {/* East Indicator */}
          <line x1="35.5" y1="22" x2="39.5" y2="22" stroke="#71717a" strokeWidth="2" strokeLinecap="round" />

          {/* Tactical Corner Screws / Registration Marks */}
          <circle cx="6" cy="6" r="1.2" fill="#52525b" />
          <circle cx="38" cy="6" r="1.2" fill="#52525b" />
          <circle cx="6" cy="38" r="1.2" fill="#52525b" />
          <circle cx="38" cy="38" r="1.2" fill="#52525b" />

          {/* 4. Big, Bold, Edge-to-Edge Compass Needle */}
          <g className="transition-transform duration-500 ease-out group-hover:rotate-45 origin-[22px_22px]">
            {/* North Needle - Facet Left (Solid White) */}
            <path
              d="M 22 4.5 L 22 22 L 15 22 Z"
              fill="url(#autogtm-needle-n-l)"
            />
            {/* North Needle - Facet Right (Polished Silver) */}
            <path
              d="M 22 4.5 L 29 22 L 22 22 Z"
              fill="url(#autogtm-needle-n-r)"
            />

            {/* South Needle - Facet Left (Mid Steel) */}
            <path
              d="M 22 39.5 L 22 22 L 15 22 Z"
              fill="url(#autogtm-needle-s-l)"
            />
            {/* South Needle - Facet Right (Dark Steel) */}
            <path
              d="M 22 39.5 L 29 22 L 22 22 Z"
              fill="url(#autogtm-needle-s-r)"
            />

            {/* Center Pivot Jewel (High-Precision Bezel & Hub) */}
            <circle cx="22" cy="22" r="4.2" fill="#09090b" stroke="#ffffff" strokeWidth="2" />
            <circle cx="22" cy="22" r="1.8" fill="#ffffff" />
          </g>
        </svg>
      </div>

      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 leading-none">
            <span className="text-base font-bold tracking-tight text-white font-mono uppercase">
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
