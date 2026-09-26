"use client";

import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@smartreach/ui";
import {
  CheckCircle2,
  FolderPlus,
  Loader2,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { saveDirectoryLeadsToCampaignListAction } from "@/lib/actions";
import { toast } from "sonner";

interface ExistingListOption {
  id: string;
  name: string;
  leadCount?: number;
}

interface AddToCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLeadIds: number[];
  existingLists: ExistingListOption[];
  onSuccess: () => void;
}

export function AddToCampaignDialog({
  open,
  onOpenChange,
  selectedLeadIds,
  existingLists,
  onSuccess,
}: AddToCampaignDialogProps) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newListName, setNewListName] = useState("");
  const [selectedListId, setSelectedListId] = useState<string>(
    existingLists[0]?.id || ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (selectedLeadIds.length === 0) {
      toast.error("No leads selected");
      return;
    }

    if (mode === "new" && !newListName.trim()) {
      toast.error("Please enter a name for the new list");
      return;
    }

    if (mode === "existing" && !selectedListId) {
      toast.error("Please choose an existing list");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await saveDirectoryLeadsToCampaignListAction({
        leadIds: selectedLeadIds,
        listName: mode === "new" ? newListName.trim() : undefined,
        listId: mode === "existing" ? selectedListId : undefined,
      });

      if (res.ok) {
        toast.success(res.message || "Leads saved to campaign list!");
        onOpenChange(false);
        setNewListName("");
        onSuccess();
      } else {
        toast.error(res.error || "Failed to save leads");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save leads");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <UserPlus className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                Add to Campaign List
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Import {selectedLeadIds.length} verified leads into an active SmartReach list for email sequences.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
                mode === "new"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create New List
            </button>
            <button
              type="button"
              onClick={() => setMode("existing")}
              disabled={existingLists.length === 0}
              className={`py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
                mode === "existing"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground disabled:opacity-40"
              }`}
            >
              Existing List ({existingLists.length})
            </button>
          </div>

          {mode === "new" ? (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">List Name</Label>
              <Input
                placeholder="e.g. US Restaurant Founders Q4"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="text-xs h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                A dedicated list will be created in your workspace containing these {selectedLeadIds.length} leads.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Select Destination List</Label>
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {existingLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.leadCount || 0} leads)
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Duplicates are automatically skipped to prevent emailing the same contact twice.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={isSubmitting || selectedLeadIds.length === 0}
            className="gap-1.5 font-semibold bg-primary text-primary-foreground"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Importing Leads...
              </>
            ) : (
              <>
                <FolderPlus className="size-3.5" />
                Add {selectedLeadIds.length} Leads
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
