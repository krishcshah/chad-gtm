"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Check,
  ChevronDown,
  Layers,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  className,
  compact = false,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [isSwitching, setIsSwitching] = React.useState(false);

  const handleSwitch = async (wsId: string) => {
    if (wsId === activeWorkspace.id || isSwitching) return;
    setIsSwitching(true);
    try {
      await switchWorkspaceAction(wsId);
      router.refresh();
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "group flex items-center justify-between rounded-xl border border-border/50 bg-card/50 hover:bg-accent/40 px-3 py-2 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring select-none",
              compact ? "w-10 h-10 justify-center p-0" : "w-full",
              className
            )}
            title={`Active Workspace: ${activeWorkspace.name}`}
          >
            <div className={cn("flex items-center min-w-0", compact ? "justify-center" : "gap-2.5")}>
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                <Briefcase className="size-3.5" />
              </div>
              {!compact && (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {activeWorkspace.name}
                    </span>
                    {activeWorkspace.isDefault && (
                      <span className="shrink-0 rounded bg-muted/80 px-1 py-0.2 text-[9px] font-medium text-muted-foreground uppercase tracking-wide">
                        Main
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {activeWorkspace.stats
                      ? `${activeWorkspace.stats.senderCount} mailboxes · ${activeWorkspace.stats.leadCount} leads`
                      : "Client Workspace"}
                  </p>
                </div>
              )}
            </div>
            {!compact && (
              <ChevronDown className="size-3.5 text-muted-foreground/70 shrink-0 group-hover:text-foreground transition-colors ml-1.5" />
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-64 p-1.5" align="start" sideOffset={6}>
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Workspaces & Clients</span>
            <span className="text-[10px] text-muted-foreground/60 lowercase font-mono">
              {workspaces.length} total
            </span>
          </DropdownMenuLabel>

          <DropdownMenuGroup className="space-y-0.5">
            {workspaces.map((w) => {
              const isActive = w.id === activeWorkspace.id;
              return (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => handleSwitch(w.id)}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent/60 text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <div
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {w.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs">{w.name}</span>
                        {w.isDefault && (
                          <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
                            Default
                          </span>
                        )}
                      </div>
                      {w.stats && (
                        <p className="truncate text-[10px] text-muted-foreground/80 font-normal">
                          {w.stats.senderCount} senders · {w.stats.campaignCount} campaigns
                        </p>
                      )}
                    </div>
                  </div>
                  {isActive && <Check className="size-3.5 text-primary shrink-0 ml-1" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1.5" />

          <DropdownMenuItem
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-primary font-medium cursor-pointer hover:bg-primary/10 transition-colors"
          >
            <Plus className="size-3.5 text-primary" />
            <span>New Client Workspace</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => router.push("/settings#workspaces")}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-accent/60 transition-colors"
          >
            <Settings className="size-3.5" />
            <span>Manage All Workspaces</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
