"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Check,
  Edit2,
  Loader2,
  Plus,
  Trash2,
  Users,
  Mail,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Separator,
  cn,
} from "@smartreach/ui";
import {
  createWorkspaceAction,
  deleteWorkspaceAction,
  switchWorkspaceAction,
  updateWorkspaceAction,
} from "@/lib/actions";
import type { WorkspaceItem } from "@/lib/workspaces";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";

export function WorkspaceSettingsCard({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingWs, setEditingWs] = React.useState<WorkspaceItem | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editDesc, setEditDesc] = React.useState("");
  const [loadingEdit, setLoadingEdit] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [loadingDelete, setLoadingDelete] = React.useState(false);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const startEdit = (ws: WorkspaceItem) => {
    setEditingWs(ws);
    setEditName(ws.name);
    setEditDesc(ws.description ?? "");
    setError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWs || !editName.trim()) return;

    setLoadingEdit(true);
    setError(null);
    try {
      const res = await updateWorkspaceAction(editingWs.id, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        setLoadingEdit(false);
        return;
      }
      setEditingWs(null);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update workspace");
    } finally {
      setLoadingEdit(false);
    }
  };

  const handleSwitch = async (wsId: string) => {
    if (wsId === activeWorkspaceId || switchingId) return;
    setSwitchingId(wsId);
    try {
      await switchWorkspaceAction(wsId);
      router.refresh();
    } finally {
      setSwitchingId(null);
    }
  };

  const handleDelete = async (wsId: string) => {
    setLoadingDelete(true);
    try {
      const res = await deleteWorkspaceAction(wsId);
      if (!res.ok) {
        toast.error(res.error);
        setLoadingDelete(false);
        return;
      }
      toast.success("Workspace deleted");
      setDeletingId(null);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete workspace");
    } finally {
      setLoadingDelete(false);
    }
  };

  return (
    <>
      <Card id="workspaces">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Briefcase className="size-4 text-primary" />
                <h2 className="font-semibold text-foreground">Client Workspaces</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Workspaces are isolated blank slates to manage multiple clients or brands. Each has its own dedicated mailboxes, leads, and campaigns.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="gap-1.5 self-start sm:self-auto shrink-0 shadow-xs"
            >
              <Plus className="size-3.5" />
              New Workspace
            </Button>
          </div>

          <Separator className="my-5" />

          <div className="space-y-3">
            {workspaces.map((ws) => {
              const isActive = ws.id === activeWorkspaceId;
              return (
                <div
                  key={ws.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-4 transition-all sm:flex-row sm:items-center sm:justify-between",
                    isActive
                      ? "border-primary/40 bg-primary/5 shadow-xs"
                      : "border-border/60 bg-card/40 hover:bg-card/70"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-sm text-foreground">{ws.name}</p>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Check className="size-2.5" /> Active
                        </span>
                      )}
                      {ws.isDefault && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Primary Default
                        </span>
                      )}
                    </div>
                    {ws.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {ws.description}
                      </p>
                    )}

                    {/* Stats Pill Strip */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="size-3 text-sky-400" />
                        <strong className="text-foreground">{ws.stats?.senderCount ?? 0}</strong> mailboxes
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3 text-emerald-400" />
                        <strong className="text-foreground">{ws.stats?.leadCount ?? 0}</strong> leads
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Rocket className="size-3 text-violet-400" />
                        <strong className="text-foreground">{ws.stats?.campaignCount ?? 0}</strong> campaigns
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {!isActive ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8"
                        disabled={switchingId === ws.id}
                        onClick={() => handleSwitch(ws.id)}
                      >
                        {switchingId === ws.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Switch to"
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-primary font-medium px-2 py-1 select-none">
                        Active Space
                      </span>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(ws)}
                      title="Rename / Edit"
                    >
                      <Edit2 className="size-3.5" />
                    </Button>

                    {workspaces.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingId(ws.id)}
                        title={`Delete Workspace "${ws.name}"`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Danger Zone: Delete Workspace */}
          <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                  <Trash2 className="size-4" /> Danger Zone: Delete Workspace
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Permanently delete a client workspace and remove all of its isolated mailboxes, leads, sequences, and campaigns.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0 text-xs gap-1.5 font-medium self-start sm:self-auto"
                disabled={workspaces.length <= 1}
                onClick={() => setDeletingId(activeWorkspaceId)}
              >
                <Trash2 className="size-3.5" />
                {workspaces.length <= 1 ? "Cannot delete only workspace" : "Delete Current Workspace"}
              </Button>
            </div>
            {workspaces.length <= 1 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                You must have at least one other workspace before deleting this one.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Edit Workspace Dialog */}
      <Dialog open={!!editingWs} onOpenChange={(open) => !open && setEditingWs(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle>Edit Workspace</DialogTitle>
              <DialogDescription>
                Update the display name or notes for this workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="edit-ws-name">Workspace Name *</Label>
                <Input
                  id="edit-ws-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={loadingEdit}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-ws-desc">Description</Label>
                <Input
                  id="edit-ws-desc"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  disabled={loadingEdit}
                  placeholder="Optional notes or client info"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingWs(null)}
                disabled={loadingEdit}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loadingEdit || !editName.trim()}>
                {loadingEdit ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              {(() => {
                const ws = workspaces.find((w) => w.id === deletingId);
                return ws
                  ? `Are you sure you want to permanently delete "${ws.name}" and all its isolated client data (leads, mailboxes, and campaigns)? This action cannot be undone.`
                  : "Are you sure you want to permanently delete this workspace and all its isolated client data (leads, mailboxes, and campaigns)? This action cannot be undone.";
              })()}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingId(null)}
              disabled={loadingDelete}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={loadingDelete}
              onClick={() => deletingId && handleDelete(deletingId)}
            >
              {loadingDelete ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" /> Deleting...
                </>
              ) : (
                "Delete Workspace"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
