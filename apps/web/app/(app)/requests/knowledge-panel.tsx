"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, HelpCircle, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Textarea,
  toast,
} from "@smartreach/ui";
import {
  deleteKnowledgeAction,
  saveKnowledgeAction,
  type KnowledgeView,
} from "@/lib/autopilot-actions";

type Kind = "resource" | "faq";

/** The only links and answers the reply agent is allowed to use. */
export function KnowledgePanel({ items }: { items: KnowledgeView[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <Card id="knowledge" className="scroll-mt-20 lg:sticky lg:top-6 lg:scroll-mt-6">
      <CardHeader
        actions={
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add
          </Button>
        }
      >
        <CardTitle>Knowledge base</CardTitle>
        <CardDescription>The only links and answers the agent may use in this workspace. It shares them when a lead asks.</CardDescription>
      </CardHeader>

      {items.length === 0 ? (
        <EmptyState
          compact
          icon={BookOpen}
          title="Nothing saved yet"
          description="Add your case study, references or pricing answer. Answers you give above are saved here too."
        />
      ) : (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {items.map((item) => (
            <KnowledgeRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      <KnowledgeDialog open={adding} onOpenChange={setAdding} />
    </Card>
  );
}

function KnowledgeRow({ item }: { item: KnowledgeView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const Icon = item.kind === "resource" ? FileText : HelpCircle;

  const remove = async () => {
    const res = await deleteKnowledgeAction(item.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{item.title}</p>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-muted-foreground underline decoration-border-strong underline-offset-2 hover:text-foreground hover:decoration-foreground"
          >
            {item.url}
          </a>
        ) : (
          <p className="line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
        )}
        <p className="mt-1 text-xs text-subtle-foreground">
          {item.usageCount === 0 ? "Not used yet" : `Used ${item.usageCount.toLocaleString()} ${item.usageCount === 1 ? "time" : "times"}`}
          {item.keywords.length > 0 ? ` · ${item.keywords.slice(0, 3).join(", ")}` : null}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        aria-label={`Edit ${item.title}`}
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden />
      </Button>
      <KnowledgeDialog item={item} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        title={`Remove "${item.title}"?`}
        description="The agent will no longer share this with leads. This cannot be undone."
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
      >
        <Button variant="ghost" size="icon-xs" className="-mr-1 shrink-0" aria-label={`Remove ${item.title}`}>
          <Trash2 aria-hidden />
        </Button>
      </ConfirmDialog>
    </li>
  );
}

/** Adds a knowledge item, or edits `item` in place (same id, so the usage count is kept). */
function KnowledgeDialog({
  item,
  open,
  onOpenChange,
}: {
  item?: KnowledgeView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const editing = Boolean(item);
  const [kind, setKind] = useState<Kind>(item ? (item.kind === "resource" ? "resource" : "faq") : "resource");
  const [title, setTitle] = useState(item?.title ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [keywords, setKeywords] = useState(item?.keywords.join(", ") ?? "");
  const [pending, start] = useTransition();

  // Editing: start from the saved item each time the dialog opens (or the item changes).
  // Adding keeps whatever was typed before a Cancel.
  useEffect(() => {
    if (!open || !item) return;
    setKind(item.kind === "resource" ? "resource" : "faq");
    setTitle(item.title);
    setUrl(item.url ?? "");
    setContent(item.content);
    setKeywords(item.keywords.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const reset = () => {
    setTitle("");
    setUrl("");
    setContent("");
    setKeywords("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    start(async () => {
      const res = await saveKnowledgeAction({
        id: item?.id,
        // A fact stays a fact unless it is turned into a link or resource.
        kind: item?.kind === "fact" && kind === "faq" ? "fact" : kind,
        title,
        url,
        content,
        keywords,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || (editing ? "Saved" : "Added"));
      if (!editing) reset();
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit knowledge item" : "Add to knowledge base"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply to the agent's next reply. The usage count is kept."
              : "The agent shares this when a lead asks for something that matches."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <SegmentedControl<Kind>
            aria-label="Type"
            value={kind}
            onValueChange={setKind}
            options={[
              { value: "resource", label: "Link or resource" },
              { value: "faq", label: "Answer" },
            ]}
            className="w-full [&>button]:flex-1"
          />
          <Field label="Title" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "resource" ? "Case study deck" : "Pricing"}
              autoFocus
            />
          </Field>
          {kind === "resource" ? (
            <Field label="Link" hint="Resources need a link or a description.">
              <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </Field>
          ) : null}
          <Field
            label={kind === "resource" ? "Description" : "Answer"}
            optional={kind === "resource"}
            required={kind === "faq"}
          >
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder={kind === "resource" ? "One line on what it is" : "The answer the agent should give"}
            />
          </Field>
          <Field label="Keywords" optional hint="Comma separated. The agent matches them against what leads ask for.">
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="deck, references" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? "Save changes" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
