"use client";

import { useState, useTransition } from "react";
import { Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Field,
  Input,
} from "@smartreach/ui";
import { createLeadTag } from "@/lib/actions";

export interface TagOpt {
  id: string;
  name: string;
  color: string;
}

/** Default colour for tags created here; stored as data, shown as a dot. */
const NEW_TAG_COLOR = "#6366f1";

function TagDot({ color }: { color: string }) {
  // Tag colours are user data, so they are applied inline rather than as tokens.
  return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

/** Read-only tag chips for a lead row. */
export function LeadTagChips({ tagIds, tagById }: { tagIds: string[] | null; tagById: Record<string, TagOpt> }) {
  const tags = (tagIds ?? []).map((id) => tagById[id]).filter((t): t is TagOpt => Boolean(t));
  if (tags.length === 0) return <span className="text-subtle-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Badge key={t.id} variant="neutral" className="max-w-[10rem]">
          <TagDot color={t.color} />
          <span className="truncate">{t.name}</span>
        </Badge>
      ))}
    </div>
  );
}

/** Bulk tag menu shown while leads are selected. */
export function TagMenu({
  tags,
  disabled,
  onTag,
  onNew,
}: {
  tags: TagOpt[];
  disabled?: boolean;
  onTag: (tagId: string, mode: "add" | "remove") => void;
  onNew: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Tag />
          Tag
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {tags.length === 0 ? (
          <DropdownMenuLabel className="font-normal">No tags yet</DropdownMenuLabel>
        ) : (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Add tag</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {tags.map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => onTag(t.id, "add")}>
                    <TagDot color={t.color} />
                    <span className="truncate">{t.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Remove tag</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {tags.map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => onTag(t.id, "remove")}>
                    <TagDot color={t.color} />
                    <span className="truncate">{t.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNew}>
          <Plus />
          New tag…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Name a new tag; the parent applies it to the current selection. */
export function NewTagDialog({
  open,
  selectedCount,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  selectedCount: number;
  onOpenChange: (open: boolean) => void;
  onCreated: (tag: TagOpt) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the tag a name");
      return;
    }
    if (trimmed.length > 40) {
      setError("Keep tag names to 40 characters or fewer");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createLeadTag({ name: trimmed });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.data) {
        setError("The tag was not created. Try again.");
        return;
      }
      toast.success(`Tag "${trimmed}" created`);
      onCreated({ id: res.data.id, name: trimmed, color: NEW_TAG_COLOR });
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New tag</DialogTitle>
          <DialogDescription>
            {selectedCount > 0
              ? `The tag is added to the ${selectedCount.toLocaleString()} selected ${selectedCount === 1 ? "lead" : "leads"}.`
              : "Tags help you group leads across lists."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Field label="Tag name" required error={error ?? undefined}>
            <Input
              autoFocus
              value={name}
              maxLength={40}
              disabled={pending}
              placeholder="e.g. Warm intro"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {selectedCount > 0 ? "Create and add" : "Create tag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
