"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@smartreach/ui";
import { campaignAction, duplicateCampaignToDraft } from "@/lib/actions";

type CampaignCommand = Parameters<typeof campaignAction>[1];

/** What the main status action does for a campaign in a given state. */
export function statusCommand(status: string): {
  kind: "draft" | "command";
  command?: CampaignCommand;
  label: string;
} {
  if (status === "draft") return { kind: "draft", label: "Continue setup" };
  if (status === "running") return { kind: "command", command: "pause", label: "Pause" };
  if (status === "paused") return { kind: "command", command: "resume", label: "Resume" };
  if (status === "scheduled") return { kind: "command", command: "start", label: "Start now" };
  return { kind: "command", command: "start", label: "Start again" };
}

function useCampaignCommands(id: string) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (command: CampaignCommand) =>
    new Promise<void>((resolve) => {
      start(async () => {
        const res = await campaignAction(id, command);
        if (res.ok) {
          toast.success(res.message ?? "Done");
          if (command === "delete") router.push("/campaigns");
          router.refresh();
        } else {
          toast.error(res.error);
        }
        resolve();
      });
    });

  const duplicate = () =>
    start(async () => {
      const res = await duplicateCampaignToDraft(id);
      if (res.ok && res.data?.draftId) {
        toast.success("Copy created. Review it before you start it.");
        router.push(`/campaigns/new?draft=${res.data.draftId}`);
      } else {
        toast.error(res.ok ? "Could not duplicate this campaign." : res.error);
      }
    });

  return { pending, run, duplicate };
}

/** Start / pause / resume button for the campaign detail header. */
export function CampaignStatusButton({ id, status }: { id: string; status: string }) {
  const { pending, run } = useCampaignCommands(id);
  const action = statusCommand(status);

  if (action.kind === "draft") {
    return (
      <Button asChild>
        <Link href={`/campaigns/new?draft=${id}`}>
          <Play />
          {action.label}
        </Link>
      </Button>
    );
  }

  const Icon = action.command === "pause" ? Pause : Play;
  return (
    <Button
      variant={action.command === "pause" ? "outline" : "primary"}
      loading={pending}
      onClick={() => action.command && void run(action.command)}
    >
      {pending ? null : <Icon />}
      {action.label}
    </Button>
  );
}

/**
 * Row and header overflow menu: status action (optional), duplicate, archive
 * and delete. Delete is confirmed and names the campaign.
 */
export function CampaignActions({
  id,
  status,
  name,
  includeStatusAction = true,
  triggerVariant = "ghost",
}: {
  id: string;
  status: string;
  name?: string;
  /** Hide start/pause when the page already shows them as a button. */
  includeStatusAction?: boolean;
  triggerVariant?: "ghost" | "outline";
}) {
  const { pending, run, duplicate } = useCampaignCommands(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();
  const action = statusCommand(status);
  const label = name ? `Actions for ${name}` : "Campaign actions";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={triggerVariant}
            size={triggerVariant === "outline" ? "icon" : "icon-sm"}
            disabled={pending}
            aria-label={label}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {includeStatusAction ? (
            action.kind === "draft" ? (
              <DropdownMenuItem onSelect={() => router.push(`/campaigns/new?draft=${id}`)}>
                <Play /> {action.label}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => action.command && void run(action.command)}>
                {action.command === "pause" ? <Pause /> : <Play />} {action.label}
              </DropdownMenuItem>
            )
          ) : null}
          <DropdownMenuItem onSelect={duplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          {status !== "archived" ? (
            <DropdownMenuItem onSelect={() => void run("archive")}>
              <Archive /> Archive
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive
        title={name ? `Delete “${name}”?` : "Delete this campaign?"}
        description="Sending stops and every email that is scheduled but not yet sent is cancelled. This cannot be undone."
        confirmLabel="Delete campaign"
        onConfirm={() => run("delete")}
      />
    </>
  );
}
