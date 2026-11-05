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
          <defs>
            <linearGradient id="agtm-needle" x1="14" y1="6" x2="26" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6ee7c1" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <rect
            width="40"
            height="40"
            rx="11"
            fill="#10131c"
            stroke="#262b3b"
            strokeWidth="1.2"
            className="group-hover:stroke-[#34d3a6]/60 transition-colors"
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
            <polygon points="20,6 20,20 14,20" fill="url(#agtm-needle)" />
            <polygon points="20,6 26,20 20,20" fill="#12b98d" />

            {/* South pointer (Subtle deep zinc facets) */}
            <polygon points="20,34 20,20 14,20" fill="#4b5162" />
            <polygon points="20,34 26,20 20,20" fill="#2a2f3f" />

            {/* Center jewel hub */}
            <circle cx="20" cy="20" r="2.8" fill="#10131c" stroke="#ffffff" strokeWidth="1.4" />
            <circle cx="20" cy="20" r="1" fill="#ffffff" />
          </g>
        </svg>
      </div>

      {!compact && (
        <div className="flex flex-col">
          <span className="text-[15px] sm:text-base font-semibold tracking-tight text-white leading-none">
            Auto<span className="text-brand-gradient">GTM</span>
          </span>
          <span className="text-[11px] text-zinc-500 mt-1 font-medium hidden sm:block leading-none">
            Outbound on autopilot
          </span>
        </div>
      )}
    </Link>
  );
}

// Backward compatibility alias for any existing imports
export const ChadGtmLogo = AutoGtmLogo;
