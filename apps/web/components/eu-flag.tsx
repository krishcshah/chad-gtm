import * as React from "react";

interface EuFlagProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Universal SVG European Union Flag.
 * Crisp, vector-accurate 12-star EU emblem on #003399 blue background.
 */
export function EuFlag({
  className = "h-3 w-4.5 rounded-[2px] shadow-xs inline-block shrink-0 align-middle",
  ...props
}: EuFlagProps) {
  return (
    <svg
      viewBox="0 0 30 20"
      aria-label="European Union Flag"
      role="img"
      className={`overflow-hidden border border-black/15 dark:border-white/15 ${className}`}
      {...props}
    >
      <rect width="30" height="20" fill="#003399" />
      <polygon points="15.00,3.05 15.21,3.71 15.90,3.71 15.35,4.11 15.56,4.77 15.00,4.36 14.44,4.77 14.65,4.11 14.10,3.71 14.79,3.71" fill="#FFCC00" />
      <polygon points="18.00,3.85 18.21,4.51 18.90,4.51 18.35,4.92 18.56,5.57 18.00,5.17 17.44,5.57 17.65,4.92 17.10,4.51 17.79,4.51" fill="#FFCC00" />
      <polygon points="20.20,6.05 20.41,6.71 21.10,6.71 20.54,7.11 20.75,7.77 20.20,7.36 19.64,7.77 19.85,7.11 19.29,6.71 19.98,6.71" fill="#FFCC00" />
      <polygon points="21.00,9.05 21.21,9.71 21.90,9.71 21.35,10.11 21.56,10.77 21.00,10.36 20.44,10.77 20.65,10.11 20.10,9.71 20.79,9.71" fill="#FFCC00" />
      <polygon points="20.20,12.05 20.41,12.71 21.10,12.71 20.54,13.11 20.75,13.77 20.20,13.36 19.64,13.77 19.85,13.11 19.29,12.71 19.98,12.71" fill="#FFCC00" />
      <polygon points="18.00,14.25 18.21,14.90 18.90,14.90 18.35,15.31 18.56,15.96 18.00,15.56 17.44,15.96 17.65,15.31 17.10,14.90 17.79,14.90" fill="#FFCC00" />
      <polygon points="15.00,15.05 15.21,15.71 15.90,15.71 15.35,16.11 15.56,16.77 15.00,16.36 14.44,16.77 14.65,16.11 14.10,15.71 14.79,15.71" fill="#FFCC00" />
      <polygon points="12.00,14.25 12.21,14.90 12.90,14.90 12.35,15.31 12.56,15.96 12.00,15.56 11.44,15.96 11.65,15.31 11.10,14.90 11.79,14.90" fill="#FFCC00" />
      <polygon points="9.80,12.05 10.02,12.71 10.71,12.71 10.15,13.11 10.36,13.77 9.80,13.36 9.25,13.77 9.46,13.11 8.90,12.71 9.59,12.71" fill="#FFCC00" />
      <polygon points="9.00,9.05 9.21,9.71 9.90,9.71 9.35,10.11 9.56,10.77 9.00,10.36 8.44,10.77 8.65,10.11 8.10,9.71 8.79,9.71" fill="#FFCC00" />
      <polygon points="9.80,6.05 10.02,6.71 10.71,6.71 10.15,7.11 10.36,7.77 9.80,7.36 9.25,7.77 9.46,7.11 8.90,6.71 9.59,6.71" fill="#FFCC00" />
      <polygon points="12.00,3.85 12.21,4.51 12.90,4.51 12.35,4.92 12.56,5.57 12.00,5.17 11.44,5.57 11.65,4.92 11.10,4.51 11.79,4.51" fill="#FFCC00" />
    </svg>
  );
}
