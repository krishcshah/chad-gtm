"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, MoreHorizontal, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
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

export type StatusCommand =
  | { kind: "draft"; label: string }
  | { kind: "command"; command: CampaignCommand; label: string; confirm?: boolean }
  | { kind: "duplicate"; label: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "none"; label: string };

/**
 * What the main status action does for a campaign in a given state. A
 * completed campaign is never "started again": a manual one is duplicated, an
 * Autopilot one opens its run. An archived one comes back paused, after a confirm.
 */
export function statusCommand(status: string, opts: { autopilotRunId?: string | null } = {}): StatusCommand {
  if (status === "draft") return { kind: "draft", label: "Continue setup" };
  if (status === "running") return { kind: "command", command: "pause", label: "Pause" };
  if (status === "paused") return { kind: "command", command: "resume", label: "Resume" };
  if (status === "scheduled") return { kind: "command", command: "resume", label: "Start now" };
  if (status === "completed") {
    return opts.autopilotRunId
      ? { kind: "link", href: `/chad-gtm/${opts.autopilotRunId}`, label: "Open in Autopilot" }
      : { kind: "duplicate", label: "Duplicate to run again" };
  }
  if (status === "archived") return { kind: "command", command: "unarchive", label: "Unarchive", confirm: true };
  return { kind: "none", label: "" };
}

/** Failed leads can be retried while the campaign is running, paused or completed. */
export function canRetryFailed(status: string, failed: number | null | undefined): boolean {
  return (status === "completed" || status === "paused" || status === "running") && Number(failed ?? 0) > 0;
}

const UNARCHIVE_DESCRIPTION =
  "It comes back as Paused. Nothing is sent until you resume it; then leads who haven't finished the sequence get their remaining emails.";

function unarchiveTitle(name?: string) {
  return name ? `Unarchive “${name}”?` : "Unarchive this campaign?";
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

/** The one status action for the campaign detail header (start, pause, resume, unarchive, duplicate). */
export function CampaignStatusButton({
  id,
  status,
  name,
  autopilotRunId = null,
}: {
  id: string;
  status: string;
  name?: string;
  /** The Autopilot run that manages this campaign, if any. */
  autopilotRunId?: string | null;
}) {
  const { pending, run, duplicate } = useCampaignCommands(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const action = statusCommand(status, { autopilotRunId });

  if (action.kind === "none") return null;
  if (action.kind === "draft" || action.kind === "link") {
    return (
      <Button asChild>
        <Link href={action.kind === "draft" ? `/campaigns/new?draft=${id}` : action.href}>
          {action.kind === "draft" ? <Play /> : null}
          {action.label}
        </Link>
      </Button>
    );
  }
  if (action.kind === "duplicate") {
    return (
      <Button loading={pending} onClick={duplicate}>
        {pending ? null : <Copy />}
        {action.label}
      </Button>
    );
  }

  const Icon = action.command === "pause" ? Pause : action.command === "unarchive" ? ArchiveRestore : Play;
  return (
    <>
      <Button
        variant={action.command === "pause" || action.command === "unarchive" ? "outline" : "primary"}
        loading={pending}
        onClick={() => (action.confirm ? setConfirmOpen(true) : void run(action.command))}
      >
        {pending ? null : <Icon />}
        {action.label}
      </Button>
      {action.confirm ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={unarchiveTitle(name)}
          description={UNARCHIVE_DESCRIPTION}
          confirmLabel="Unarchive"
          onConfirm={() => run(action.command)}
        />
      ) : null}
    </>
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
  isAutopilot: isAutopilotProp = false,
  autopilotRunId = null,
  failed = 0,
}: {
  id: string;
  status: string;
  name?: string;
  /** Autopilot campaigns can't be duplicated (the copy would re-email Autopilot's prospects). */
  isAutopilot?: boolean;
  /** The Autopilot run that manages this campaign, if any. */
  autopilotRunId?: string | null;
  /** Failed leads (offers "Retry failed leads"). */
  failed?: number;
  /** Hide start/pause when the page already shows them as a button. */
  includeStatusAction?: boolean;
  triggerVariant?: "ghost" | "outline";
}) {
  const { pending, run, duplicate } = useCampaignCommands(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unarchiveOpen, setUnarchiveOpen] = useState(false);
  const router = useRouter();
  const isAutopilot = isAutopilotProp || Boolean(autopilotRunId);
  const action = statusCommand(status, { autopilotRunId });
  const label = name ? `Actions for ${name}` : "Campaign actions";
  const runStatusAction = () => {
    if (action.kind === "draft") router.push(`/campaigns/new?draft=${id}`);
    else if (action.kind === "link") router.push(action.href);
    else if (action.kind === "duplicate") duplicate();
    else if (action.kind === "command") {
      if (action.confirm) setUnarchiveOpen(true);
      else void run(action.command);
    }
  };
  const StatusIcon =
    action.kind === "duplicate"
      ? Copy
      : action.kind === "command" && action.command === "pause"
        ? Pause
        : action.kind === "command" && action.command === "unarchive"
          ? ArchiveRestore
          : Play;

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
          {includeStatusAction && action.kind !== "none" ? (
            <DropdownMenuItem onSelect={runStatusAction}>
              {action.kind === "link" ? null : <StatusIcon />} {action.label}
            </DropdownMenuItem>
          ) : null}
          {canRetryFailed(status, failed) ? (
            <DropdownMenuItem onSelect={() => void run("retry_failed")}>
              <RotateCcw /> Retry failed leads
            </DropdownMenuItem>
          ) : null}
          {isAutopilot || (includeStatusAction && action.kind === "duplicate") ? null : (
            <DropdownMenuItem onSelect={duplicate}>
              <Copy /> Duplicate
            </DropdownMenuItem>
          )}
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
        description={
          isAutopilot
            ? "Sending stops, every email that is scheduled but not yet sent is cancelled, and the Autopilot run ends. The agent stops answering this campaign's leads; their replies wait for you in the Inbox. This cannot be undone."
            : "Sending stops and every email that is scheduled but not yet sent is cancelled. This cannot be undone."
        }
        confirmLabel="Delete campaign"
        onConfirm={() => run("delete")}
      />
      <ConfirmDialog
        open={unarchiveOpen}
        onOpenChange={setUnarchiveOpen}
        title={unarchiveTitle(name)}
        description={UNARCHIVE_DESCRIPTION}
        confirmLabel="Unarchive"
        onConfirm={() => run("unarchive")}
      />
    </>
  );
}
