"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@smartreach/ui";
import { addNewListLeadsToCampaignAction } from "@/lib/campaign-lead-actions";

/** Adds leads that joined the campaign's list after it started (#40). */
export function AddNewLeadsButton({ campaignId, count }: { campaignId: string; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      try {
        const res = await addNewListLeadsToCampaignAction(campaignId);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const added = res.data?.added ?? 0;
        if (added > 0) toast.success(`Added ${added.toLocaleString()} ${added === 1 ? "lead" : "leads"} to this campaign`);
        else toast.message(res.message ?? "No new leads to add");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add the new leads");
      }
    });

  return (
    <Button type="button" size="xs" variant="outline" onClick={add} loading={pending}>
      <UserPlus />
      Add {count.toLocaleString()} new {count === 1 ? "lead" : "leads"}
    </Button>
  );
}
