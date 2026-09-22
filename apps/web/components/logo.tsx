import { Send } from "lucide-react";
import Link from "next/link";

export function Logo({ href = "/dashboard", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-2.5 group">
      <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-info shadow-md shadow-primary/30 transition-transform group-hover:scale-105">
        <Send className="size-3.5 text-primary-foreground" />
      </span>
      <span className={compact ? "sr-only" : "text-[15px] font-semibold tracking-tight"}>
        Smart<span className="text-primary">Reach</span>
      </span>
    </Link>
  );
}
