import * as React from "react";

interface GermanFlagProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Universal SVG German Flag.
 * Replaces the 🇩🇪 emoji so that flags render accurately and crisply
 * across all operating systems, including Windows PCs where country flag emojis
 * fail to render and display as raw letters "DE".
 */
export function GermanFlag({ className = "h-3 w-4.5 rounded-[2px] shadow-xs inline-block shrink-0 align-middle", ...props }: GermanFlagProps) {
  return (
    <svg
      viewBox="0 0 5 3"
      aria-label="German Flag"
      role="img"
      className={`overflow-hidden border border-black/15 dark:border-white/15 ${className}`}
      {...props}
    >
      <rect width="5" height="1" y="0" fill="#000000" />
      <rect width="5" height="1" y="1" fill="#DD0000" />
      <rect width="5" height="1" y="2" fill="#FFCE00" />
    </svg>
  );
}
