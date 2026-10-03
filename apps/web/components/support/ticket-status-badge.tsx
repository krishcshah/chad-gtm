import type { TicketStatus } from "@/lib/support-types";

const statusConfig: Record<TicketStatus, { label: string; className: string; dotClass: string }> = {
  open: {
    label: "Open",
    className: "border-zinc-700 bg-zinc-900 text-white",
    dotClass: "bg-white animate-pulse",
  },
  in_progress: {
    label: "Ongoing",
    className: "border-zinc-700 bg-black text-zinc-200",
    dotClass: "bg-zinc-400",
  },
  resolved: {
    label: "Resolved",
    className: "border-emerald-800/60 bg-emerald-950/30 text-emerald-400",
    dotClass: "bg-emerald-400",
  },
  closed: {
    label: "Closed",
    className: "border-zinc-900 bg-black text-zinc-500",
    dotClass: "bg-zinc-600",
  },
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const conf = statusConfig[status] || statusConfig.open;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-none border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest font-bold ${conf.className}`}
    >
      <span className={`size-1 rounded-none ${conf.dotClass}`} />
      <span>{conf.label}</span>
    </span>
  );
}
