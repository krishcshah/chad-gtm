import { Badge, statusVariant } from "@smartreach/ui";
import { isSendingStatus } from "@/lib/postal-hold-policy";
import { campaignStatusLabel } from "@/lib/status-labels";

export const POSTAL_HELD_LABEL = "Held: needs postal address";

/**
 * A campaign's status badge. When the engine is holding its sends (no postal
 * address) the hold is the real status, so it replaces "running"/"scheduled".
 * No hooks: works in server and client components.
 */
export function CampaignStatusBadge({
  status,
  held = false,
  className,
}: {
  status: string;
  held?: boolean;
  className?: string;
}) {
  if (held && isSendingStatus(status)) {
    return (
      <Badge variant="warning" dot className={className}>
        {POSTAL_HELD_LABEL}
      </Badge>
    );
  }
  return (
    <Badge variant={statusVariant(status)} dot className={className}>
      {campaignStatusLabel(status)}
    </Badge>
  );
}
