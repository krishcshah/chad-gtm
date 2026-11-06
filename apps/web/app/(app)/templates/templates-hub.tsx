"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Search } from "lucide-react";
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  SegmentedControl,
  toast,
} from "@smartreach/ui";
import { deleteTemplate } from "@/lib/actions";
import {
  PRESET_SEQUENCES,
  isSequenceTemplate,
  parseSequenceTemplate,
  type ReusableSequence,
} from "@/lib/sequence-templates";
import { Page } from "@/components/layout/page";
import { CreateSequenceDialog } from "./create-sequence-dialog";
import { LibraryRow } from "./library-row";
import { SequencePreview } from "./sequence-preview";
import {
  matchesQuery,
  meaningfulDescription,
  plural,
  starterDescription,
  starterName,
  type LibraryItem,
  type TemplateRow,
} from "./template-utils";

type Filter = "all" | "sequence" | "email";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sequence", label: "Sequences" },
  { value: "email", label: "Single emails" },
];

export function TemplatesHub({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ReusableSequence | null>(null);
  const [previewing, setPreviewing] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);
  // Keep the name in the confirm dialog while it animates closed.
  const lastDeleting = useRef<LibraryItem | null>(null);
  if (deleting) lastDeleting.current = deleting;

  const yours = useMemo<LibraryItem[]>(
    () =>
      templates.map((t) => {
        const sequence = parseSequenceTemplate(t);
        const isSequence = isSequenceTemplate(t.bodyText);
        return {
          id: t.id,
          kind: isSequence ? "sequence" : "email",
          name: sequence.name,
          description: isSequence ? meaningfulDescription(sequence.description) : null,
          sequence,
          format: t.format === "html" ? "html" : "text",
          updatedAt: t.updatedAt,
        };
      }),
    [templates],
  );

  const starters = useMemo<LibraryItem[]>(
    () =>
      PRESET_SEQUENCES.map((p) => ({
        id: p.id,
        kind: "starter",
        name: starterName(p),
        description: starterDescription(p),
        sequence: p,
        format: "text",
        updatedAt: null,
      })),
    [],
  );

  const q = query.trim();
  const visibleYours = yours.filter((i) => (filter === "all" || i.kind === filter) && matchesQuery(i, q));
  const visibleStarters = filter === "email" ? [] : starters.filter((i) => matchesQuery(i, q));
  const showStarters = filter !== "email" && (!q || visibleStarters.length > 0);

  const openEditor = useCallback((seq: ReusableSequence | null) => {
    setEditing(seq);
    setEditorOpen(true);
  }, []);

  // Deep link: /templates?edit=<id> opens that sequence (or a copy of a starter).
  const editParam = searchParams?.get("edit") ?? null;
  const handledEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!editParam) {
      handledEdit.current = null;
      return;
    }
    if (handledEdit.current === editParam) return;
    handledEdit.current = editParam;
    const own = yours.find((i) => i.id === editParam);
    if (own?.kind === "email") {
      router.replace(`/templates/${encodeURIComponent(own.id)}`);
      return;
    }
    const seq = own?.sequence ?? PRESET_SEQUENCES.find((p) => p.id === editParam);
    if (seq) openEditor(seq);
  }, [editParam, yours, openEditor, router]);

  const handleEdit = (item: LibraryItem) => {
    setPreviewing(null);
    if (item.kind === "email") {
      router.push(`/templates/${encodeURIComponent(item.id)}`);
      return;
    }
    openEditor(item.sequence);
  };

  const handleEditorOpenChange = (open: boolean) => {
    setEditorOpen(open);
    if (!open) {
      setEditing(null);
      if (editParam) router.replace(pathname ?? "/templates", { scroll: false });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const res = await deleteTemplate(deleting.id);
    if (!res.ok) {
      toast.error(res.error || "Could not delete the template");
      return;
    }
    toast.success(`Deleted “${deleting.name}”`);
    setDeleting(null);
    router.refresh();
  };

  return (
    <Page>
      <PageHeader
        title="Templates"
        description="Emails and follow-up sequences you can reuse. Pick one when you create a campaign, then adjust it there."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/templates/new">
                <FileText />
                New single email
              </Link>
            </Button>
            <Button onClick={() => openEditor(null)}>
              <Plus />
              New sequence
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or subject"
            aria-label="Search templates"
            className="pl-9"
          />
        </div>
        <SegmentedControl
          aria-label="Show"
          value={filter}
          onValueChange={setFilter}
          options={FILTERS}
          className="w-full sm:w-auto [&>button]:flex-1"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your templates</CardTitle>
          <CardDescription>
            {yours.length === 0
              ? "Sequences and emails you save show up here."
              : q || filter !== "all"
                ? `${visibleYours.length.toLocaleString()} of ${plural(yours.length, "template")}`
                : plural(yours.length, "template")}
          </CardDescription>
        </CardHeader>
        {yours.length === 0 ? (
          <EmptyState
            compact
            icon={FileText}
            title="No templates yet"
            description="Save a sequence once and reuse it in every campaign. You can also copy one of the starters below."
            action={
              <Button size="sm" variant="outline" onClick={() => openEditor(null)}>
                <Plus />
                New sequence
              </Button>
            }
          />
        ) : visibleYours.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title="No matching templates"
            description={q ? `Nothing matches “${q}”. Try another name or subject.` : "No templates of this type yet."}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {visibleYours.map((item) => (
              <LibraryRow key={item.id} item={item} onPreview={setPreviewing} onEdit={handleEdit} onDelete={setDeleting} />
            ))}
          </ul>
        )}
      </Card>

      {showStarters && (
        <Card>
          <CardHeader>
            <CardTitle>Starter sequences</CardTitle>
            <CardDescription>Written by AutoGTM. Use one as it is, or copy it and make it yours.</CardDescription>
          </CardHeader>
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {visibleStarters.map((item) => (
              <LibraryRow key={item.id} item={item} onPreview={setPreviewing} onEdit={handleEdit} onDelete={setDeleting} />
            ))}
          </ul>
        </Card>
      )}

      <SequencePreview item={previewing} onOpenChange={(o) => !o && setPreviewing(null)} onEdit={handleEdit} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${(deleting ?? lastDeleting.current)?.name ?? "template"}”?`}
        description="It is removed from your templates. Campaigns that already use it keep their own copy of the emails."
        confirmLabel="Delete template"
        destructive
        onConfirm={confirmDelete}
      />

      <CreateSequenceDialog open={editorOpen} onOpenChange={handleEditorOpenChange} sequence={editing} />
    </Page>
  );
}
