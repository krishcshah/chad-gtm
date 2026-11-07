"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  NativeSelect,
  SegmentedControl,
  toast,
} from "@smartreach/ui";
import { saveDirectoryLeadsToCampaignListAction } from "@/lib/actions";
import type { DirectorySearchParams } from "@/lib/leads-directory";

interface ExistingListOption {
  id: string;
  name: string;
  leadCount?: number;
}

interface AddToCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLeadIds: number[];
  isSelectAllMatching?: boolean;
  totalMatchingCount?: number;
  searchParams?: DirectorySearchParams;
  existingLists: ExistingListOption[];
  onSuccess: () => void;
  /** Most rows one save can copy for this account. */
  saveLimit?: number;
}

type Mode = "new" | "existing";

/** Copy directory contacts into a new or existing lead list. */
export function AddToCampaignDialog({
  open,
  onOpenChange,
  selectedLeadIds,
  isSelectAllMatching = false,
  totalMatchingCount = 0,
  searchParams,
  existingLists,
  onSuccess,
  saveLimit,
}: AddToCampaignDialogProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("new");
  const [newListName, setNewListName] = React.useState("");
  const [selectedListId, setSelectedListId] = React.useState<string>(existingLists[0]?.id || "");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const effectiveCount = isSelectAllMatching ? totalMatchingCount : selectedLeadIds.length;
  const capped = isSelectAllMatching && saveLimit !== undefined && totalMatchingCount > saveLimit;
  const people = effectiveCount === 1 ? "person" : "people";

  // Fresh form each time the dialog opens; pick a list if the old pick is gone.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedListId((cur) => (existingLists.some((l) => l.id === cur) ? cur : existingLists[0]?.id || ""));
    if (existingLists.length === 0) setMode("new");
  }, [open, existingLists]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveCount === 0) {
      toast.error("No leads selected");
      return;
    }
    if (mode === "new" && !newListName.trim()) {
      setError("Give the new list a name.");
      return;
    }
    if (mode === "existing" && !selectedListId) {
      setError("Choose a list.");
      return;
    }
    setError(null);

    try {
      setIsSubmitting(true);
      const res = await saveDirectoryLeadsToCampaignListAction({
        selectAllMatching: isSelectAllMatching,
        searchParams: isSelectAllMatching ? searchParams : undefined,
        leadIds: isSelectAllMatching ? [] : selectedLeadIds,
        listName: mode === "new" ? newListName.trim() : undefined,
        listId: mode === "existing" ? selectedListId : undefined,
      });

      if (res.ok) {
        const listId = res.data?.leadListId;
        const added = res.data?.count;
        const skipped = res.data?.skipped ?? 0;
        toast.success(
          typeof added === "number" ? `Added ${added.toLocaleString()} ${added === 1 ? "person" : "people"} to the list` : "Added to the list",
          {
            ...(skipped > 0
              ? { description: `${skipped.toLocaleString()} were already on the list, on a blocklist or opted out.` }
              : {}),
            ...(listId ? { action: { label: "Open list", onClick: () => router.push(`/leads/${listId}`) } } : {}),
          },
        );
        onOpenChange(false);
        setNewListName("");
        onSuccess();
        router.refresh();
      } else {
        toast.error(res.error || "Could not add these people to the list");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not add these people to the list");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Add to a lead list</DialogTitle>
            <DialogDescription>
              {isSelectAllMatching
                ? `All ${effectiveCount.toLocaleString()} people matching your filters.`
                : `${effectiveCount.toLocaleString()} selected ${people}.`}{" "}
              Campaigns send to lead lists. People without an email address are skipped.
            </DialogDescription>
          </DialogHeader>

          {capped ? (
            <Alert variant="warning">
              Only the first {saveLimit!.toLocaleString()} matches are added in one go. Narrow your filters to pick
              which ones.
            </Alert>
          ) : null}

          <SegmentedControl<Mode>
            aria-label="Destination"
            value={mode}
            onValueChange={(v) => {
              setMode(v);
              setError(null);
            }}
            className="self-start"
            options={[
              { value: "new", label: "New list" },
              { value: "existing", label: "Existing list", disabled: existingLists.length === 0 },
            ]}
          />

          {mode === "new" ? (
            <Field label="List name" required error={error ?? undefined}>
              <Input
                autoFocus
                placeholder="e.g. US restaurant founders"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                maxLength={120}
              />
            </Field>
          ) : (
            <Field label="List" required error={error ?? undefined} hint="New people are added alongside the ones already on it.">
              <NativeSelect value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}>
                {existingLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({(l.leadCount || 0).toLocaleString()} leads)
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={effectiveCount === 0}>
              {capped
                ? `Add first ${saveLimit!.toLocaleString()}`
                : `Add ${effectiveCount.toLocaleString()} ${people}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
