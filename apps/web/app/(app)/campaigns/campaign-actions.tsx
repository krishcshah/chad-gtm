"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pause, Play, Archive, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@smartreach/ui";
import { campaignAction, duplicateCampaignToDraft } from "@/lib/actions";

export function CampaignActions({
  id,
  status,
  showDeleteDirect = false,
}: {
  id: string;
  status: string;
  showDeleteDirect?: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();

  const run = (action: Parameters<typeof campaignAction>[1]) =>
    start(async () => {
      const res = await campaignAction(id, action);
      if (res.ok) {
        toast.success(res.message ?? "Done");
        if (action === "delete") {
          setConfirmOpen(false);
          router.push("/campaigns");
        } else {
          router.refresh();
        }
      } else {
        toast.error(res.error);
      }
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
    <>
      <div className="flex items-center gap-1.5">
        {showDeleteDirect && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            className="rounded-none border-red-900/60 bg-red-950/20 text-red-400 hover:bg-red-900/30 hover:text-red-300 text-xs font-mono uppercase tracking-wider h-8 px-2.5 gap-1.5"
          >
            <Trash2 className="size-3.5" />
            <span>Delete</span>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label="Campaign actions"
              className="rounded-none hover:bg-zinc-900 hover:text-white border border-transparent hover:border-zinc-800"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-none border-zinc-800 bg-black font-mono">
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
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem
              onClick={() => setConfirmOpen(true)}
              className="text-red-400 focus:bg-red-950/40 focus:text-red-300"
            >
              <Trash2 className="h-4 w-4" /> Delete Campaign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Confirmation Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-none border border-zinc-800 bg-zinc-950 font-mono text-zinc-100 max-w-md p-6">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Trash2 className="size-4 text-red-500" /> Delete Campaign
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 font-sans leading-relaxed">
              Are you sure you want to delete this campaign? All scheduled delivery pacing and pending outbound emails for this campaign will be immediately cancelled. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
              className="rounded-none border-zinc-800 bg-black text-xs font-mono uppercase tracking-wider hover:bg-zinc-900"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => run("delete")}
              disabled={pending}
              className="rounded-none bg-red-600 text-white hover:bg-red-700 text-xs font-mono uppercase tracking-wider font-semibold"
            >
              {pending ? "Deleting..." : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
