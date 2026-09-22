"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pause, Play, Archive, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@smartreach/ui";
import { campaignAction, duplicateCampaignToDraft } from "@/lib/actions";

export function CampaignActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (action: Parameters<typeof campaignAction>[1]) =>
    start(async () => {
      const res = await campaignAction(id, action);
      if (res.ok) {
        toast.success(res.message ?? "Done");
        router.refresh();
      } else toast.error(res.error);
    });

  const handleDuplicate = () =>
    start(async () => {
      const res = await duplicateCampaignToDraft(id);
      if (res.ok && res.data?.draftId) {
        toast.success("Campaign duplicated into editor");
        router.push(`/campaigns/new?draft=${res.data.draftId}`);
      } else {
        toast.error(res.ok ? "Duplicate failed" : res.error);
      }
    });

  const running = status === "running";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={pending} aria-label="Campaign actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === "draft" ? (
          <DropdownMenuItem onClick={() => router.push(`/campaigns/new?draft=${id}`)}>
            <Play className="h-4 w-4" /> Resume
          </DropdownMenuItem>
        ) : running ? (
          <DropdownMenuItem onClick={() => run("pause")}>
            <Pause className="h-4 w-4" /> Pause
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => run(running ? "pause" : "resume")}>
            <Play className="h-4 w-4" /> {status === "paused" ? "Resume" : "Start"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleDuplicate}>
          <Copy className="h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("archive")}>
          <Archive className="h-4 w-4" /> Archive
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => run("delete")}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
