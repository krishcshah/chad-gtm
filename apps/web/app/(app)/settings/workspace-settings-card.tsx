"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
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
  Field,
  Input,
} from "@smartreach/ui";
import { deleteWorkspaceAction, switchWorkspaceAction, updateWorkspaceAction } from "@/lib/actions";
import type { WorkspaceItem } from "@/lib/workspaces";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** List, switch, rename, create and delete workspaces. */
export function WorkspaceSettingsCard({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkspaceItem | null>(null);
  const [deleting, setDeleting] = React.useState<WorkspaceItem | null>(null);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const canDelete = workspaces.length > 1;

  async function handleSwitch(ws: WorkspaceItem) {
    if (ws.id === activeWorkspaceId || switchingId) return;
    setSwitchingId(ws.id);
    try {
      const res = await switchWorkspaceAction(ws.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Switched to ${ws.name}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not switch workspace.");
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleDelete(ws: WorkspaceItem) {
    try {
      const res = await deleteWorkspaceAction(ws.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Deleted ${ws.name}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "The workspace could not be deleted.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspaces</CardTitle>
        <CardDescription>
          Each workspace has its own leads, campaigns, Autopilot runs, knowledge base and sender details (company name,
          postal address, booking link). Your blocklist applies to all of them. Use one per client or brand.
        </CardDescription>
      </CardHeader>

      <ul className="mt-4 divide-y divide-border border-t border-border">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          return (
            <li key={ws.id} className="flex items-start gap-3 px-5 py-4 sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{ws.name}</span>
                  {isActive ? (
                    <Badge variant="success" dot>
                      Current
                    </Badge>
                  ) : null}
                  {ws.isDefault ? <Badge variant="neutral">Default</Badge> : null}
                </div>
                {ws.description ? (
                  <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{ws.description}</p>
                ) : null}
                {ws.stats ? (
                  <p className="tabular mt-1 text-xs text-subtle-foreground">
                    {ws.stats.senderCount > 0 ? `${plural(ws.stats.senderCount, "mailbox", "mailboxes")} · ` : null}
                    {plural(ws.stats.leadCount, "lead", "leads")} ·{" "}
                    {plural(ws.stats.campaignCount, "campaign", "campaigns")}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {!isActive ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={switchingId === ws.id}
                    disabled={switchingId !== null}
                    onClick={() => void handleSwitch(ws)}
                  >
                    Switch
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${ws.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(ws)}>
                      <Pencil /> Rename
                    </DropdownMenuItem>
                    {canDelete ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setDeleting(ws)}>
                          <Trash2 /> Delete workspace
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>

      <CardFooter className="justify-between">
        <p className="text-xs text-subtle-foreground">
          {canDelete ? `${plural(workspaces.length, "workspace", "workspaces")}` : "Your only workspace cannot be deleted."}
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus /> New workspace
        </Button>
      </CardFooter>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />

      <EditWorkspaceDialog workspace={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={deleting ? `Delete ${deleting.name}?` : "Delete workspace?"}
        description="Its leads, lead lists, campaigns, Autopilot runs, Needs you requests, knowledge base and sender details (company name, postal address, booking link, notification settings) are deleted for good, and you are switched to your default workspace. Your sign-in, AI and other workspaces are not affected. Blocklist entries and opt-outs are kept, so those people stay protected. This cannot be undone."
        confirmLabel="Delete workspace"
        destructive
        onConfirm={async () => {
          if (deleting) await handleDelete(deleting);
        }}
      />
    </Card>
  );
}

function EditWorkspaceDialog({
  workspace,
  onClose,
  onSaved,
}: {
  workspace: WorkspaceItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description ?? "");
      setError(null);
    }
  }, [workspace]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await updateWorkspaceAction(workspace.id, {
        name: name.trim(),
        description: description.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Workspace updated");
      onClose();
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The workspace could not be updated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={workspace !== null}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>Change the name and notes you see in the workspace switcher.</DialogDescription>
          </DialogHeader>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              autoComplete="off"
              maxLength={120}
            />
          </Field>
          <Field label="Description" optional>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              placeholder="Client or scope notes"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!name.trim()}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
