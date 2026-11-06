import { Badge, type BadgeProps } from "@smartreach/ui";
import type { TicketStatus } from "@/lib/support-types";

export const TICKET_STATUS_META: Record<TicketStatus, { label: string; variant: BadgeProps["variant"] }> = {
  open: { label: "Open", variant: "info" },
  in_progress: { label: "In progress", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
  closed: { label: "Closed", variant: "outline" },
};

export function ticketStatusLabel(status: TicketStatus): string {
  return (TICKET_STATUS_META[status] ?? TICKET_STATUS_META.open).label;
}

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const meta = TICKET_STATUS_META[status] ?? TICKET_STATUS_META.open;
  return (
    <Badge variant={meta.variant} dot className={className}>
      {meta.label}
    </Badge>
  );
}
