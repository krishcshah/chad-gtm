"use client";

import Link from "next/link";
import { Button } from "@smartreach/ui";
import { CampaignActions, CampaignStatusButton } from "../campaign-actions";
import { EditCampaignDialog } from "./edit-campaign-dialog";
import { setCampaignTab } from "./campaign-tabs";

type EditProps = React.ComponentProps<typeof EditCampaignDialog>;

/** Detail header: settings, the one status action, and an overflow menu. */
export function CampaignHeaderActions({
  campaign,
  status,
  availableSenders,
  autopilotRunId = null,
  managed = false,
  failed = 0,
}: {
  /** Failed leads (offers "Retry failed leads"). */
  failed?: number;
  campaign: EditProps["campaign"];
  status: string;
  availableSenders: EditProps["availableSenders"];
  /** The Autopilot run that manages this campaign, if any. */
  autopilotRunId?: string | null;
  /** Autopilot owns the sequence and daily volume (not for admins). */
  managed?: boolean;
}) {
  return (
    <>
      {/* A completed Autopilot campaign's main action is this same link. */}
      {autopilotRunId && status !== "completed" ? (
        <Button variant="outline" asChild>
          <Link href={`/chad-gtm/${autopilotRunId}`}>Open in Autopilot</Link>
        </Button>
      ) : null}
      <EditCampaignDialog
        campaign={campaign}
        availableSenders={availableSenders}
        onGoToSequence={() => setCampaignTab("sequence")}
        managedByAutopilot={managed}
        autopilotRunId={autopilotRunId}
      />
      <CampaignStatusButton id={campaign.id} status={status} name={campaign.name} autopilotRunId={autopilotRunId} />
      <CampaignActions
        id={campaign.id}
        status={status}
        name={campaign.name}
        includeStatusAction={false}
        triggerVariant="outline"
        isAutopilot={Boolean(autopilotRunId)}
        autopilotRunId={autopilotRunId}
        failed={failed}
      />
    </>
  );
}
