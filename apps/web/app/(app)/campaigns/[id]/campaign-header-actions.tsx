"use client";

import { CampaignActions, CampaignStatusButton } from "../campaign-actions";
import { EditCampaignDialog } from "./edit-campaign-dialog";
import { setCampaignTab } from "./campaign-tabs";

type EditProps = React.ComponentProps<typeof EditCampaignDialog>;

/** Detail header: settings, the one status action, and an overflow menu. */
export function CampaignHeaderActions({
  campaign,
  status,
  availableSenders,
}: {
  campaign: EditProps["campaign"];
  status: string;
  availableSenders: EditProps["availableSenders"];
}) {
  return (
    <>
      <EditCampaignDialog
        campaign={campaign}
        availableSenders={availableSenders}
        onGoToSequence={() => setCampaignTab("sequence")}
      />
      <CampaignStatusButton id={campaign.id} status={status} />
      <CampaignActions
        id={campaign.id}
        status={status}
        name={campaign.name}
        includeStatusAction={false}
        triggerVariant="outline"
      />
    </>
  );
}
