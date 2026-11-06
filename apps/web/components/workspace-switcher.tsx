"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2, Plus, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@smartreach/ui";
import { switchWorkspaceAction } from "@/lib/actions";
import type { WorkspaceItem } from "@/lib/workspaces";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceItem[];
  activeWorkspace: WorkspaceItem;
  className?: string;
  compact?: boolean;
}

function WorkspaceAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground",
        className,
      )}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function WorkspaceSwitcher({ workspaces, activeWorkspace, className, compact = false }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState<string | null>(null);

  const handleSwitch = async (wsId: string) => {
    if (wsId === activeWorkspace.id || switching) return;
    setSwitching(wsId);
    try {
      await switchWorkspaceAction(wsId);
      router.refresh();
    } finally {
      setSwitching(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "group flex items-center rounded-md text-left outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring",
              compact ? "size-9 justify-center" : "w-full gap-2.5 px-1.5 py-1.5",
              className,
            )}
            aria-label={`Workspace: ${activeWorkspace.name}. Switch workspace`}
          >
            <WorkspaceAvatar name={activeWorkspace.name} />
            {!compact && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-tight">{activeWorkspace.name}</span>
                  {activeWorkspace.stats && (
                    <span className="block truncate text-xs leading-tight text-subtle-foreground">
                      {activeWorkspace.stats.senderCount} mailboxes · {activeWorkspace.stats.leadCount.toLocaleString()} leads
                    </span>
                  )}
                </span>
                {switching ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-subtle-foreground" />
                ) : (
                  <ChevronsUpDown className="size-4 shrink-0 text-subtle-foreground" />
                )}
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => {
            const active = w.id === activeWorkspace.id;
            return (
              <DropdownMenuItem key={w.id} onSelect={() => handleSwitch(w.id)} className="gap-2.5 py-2">
                <WorkspaceAvatar name={w.name} className={active ? undefined : "bg-muted text-muted-foreground"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{w.name}</span>
                  {w.stats && (
                    <span className="block truncate text-xs text-subtle-foreground">
                      {w.stats.senderCount} mailboxes · {w.stats.campaignCount} campaigns
                    </span>
                  )}
                </span>
                {switching === w.id ? (
                  <Loader2 className="animate-spin" />
                ) : active ? (
                  <Check className="!text-foreground" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus />
            New workspace
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/settings#workspaces")}>
            <Settings />
            Manage workspaces
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
