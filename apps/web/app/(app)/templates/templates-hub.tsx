"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  Mail,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatDate } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  PageHeader,
  cn,
} from "@smartreach/ui";
import { deleteTemplate } from "@/lib/actions";
import {
  PRESET_SEQUENCES,
  isSequenceTemplate,
  parseSequenceTemplate,
  type ReusableSequence,
} from "@/lib/sequence-templates";

interface TemplateRow {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  format: string;
  updatedAt: string;
}

export function TemplatesHub({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"sequences" | "single">("sequences");
  const [previewSeq, setPreviewSeq] = useState<ReusableSequence | null>(null);
  const [previewStepIdx, setPreviewStepIdx] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Parse user saved sequences
  const userSequences = useMemo(() => {
    return templates
      .map((t) => parseSequenceTemplate(t))
      .filter((s): s is ReusableSequence => s !== null);
  }, [templates]);

  // Combine user sequences and presets
  const allSequences = useMemo(() => {
    return [...userSequences, ...PRESET_SEQUENCES];
  }, [userSequences]);

  // Single email templates (non-sequence)
  const singleTemplates = useMemo(() => {
    return templates.filter((t) => !isSequenceTemplate(t.bodyText));
  }, [templates]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      await deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
      router.refresh();
    });
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Templates & Sequences"
        description="Save and reuse high-performing multi-step outreach sequences and personalized single templates."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/campaigns/new">
                <Rocket className="h-4 w-4" /> Start campaign
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/templates/new">
                <Plus className="h-4 w-4" /> New single template
              </Link>
            </Button>
          </div>
        }
      />

      {/* Overview Stat Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reusable Sequences
            </span>
            <Layers className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {allSequences.length}
            </span>
            <span className="text-xs text-muted-foreground">
              ({userSequences.length} custom, {PRESET_SEQUENCES.length} battle-tested presets)
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Single Templates
            </span>
            <FileText className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {singleTemplates.length}
            </span>
            <span className="text-xs text-muted-foreground">reusable message bodies</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sequence Import Sync
            </span>
            <Sparkles className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Live in Campaign Wizard
            </span>
            <span className="text-xs text-muted-foreground">· 1-click loading</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("sequences")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === "sequences"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Layers className="size-4" />
          Reusable Sequences
          <Badge variant={activeTab === "sequences" ? "outline" : "secondary"} className="ml-1 text-[10px]">
            {allSequences.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("single")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === "single"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <FileText className="size-4" />
          Single Templates
          <Badge variant={activeTab === "single" ? "outline" : "secondary"} className="ml-1 text-[10px]">
            {singleTemplates.length}
          </Badge>
        </button>
      </div>

      {/* Tab 1: Reusable Sequences */}
      {activeTab === "sequences" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allSequences.map((seq) => {
              const totalDays = seq.steps.reduce((acc, s) => acc + (s.delayDays || 0), 0);
              return (
                <Card
                  key={seq.id}
                  className="flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-xs"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {seq.isPreset ? (
                            <Sparkles className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <BookmarkPlus className="size-3.5 text-muted-foreground shrink-0" />
                          )}
                          <CardTitle className="truncate text-base">{seq.name}</CardTitle>
                        </div>
                        <CardDescription className="mt-1 line-clamp-2 text-xs">
                          {seq.description}
                        </CardDescription>
                      </div>
                      <Badge variant={seq.isPreset ? "secondary" : "outline"} className="shrink-0 text-[11px]">
                        {seq.isPreset ? "Preset" : "Custom"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    {/* Step Timeline Pills */}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wider">Timeline</span>
                        <span>{seq.stepsCount} steps · ~{totalDays} days</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {seq.steps.map((st, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1 rounded bg-background px-2 py-0.5 text-[11px] font-mono border border-border/70"
                          >
                            <span className="font-medium text-foreground">S{i + 1}</span>
                            <span className="text-muted-foreground">
                              {i === 0 ? "Now" : `+${st.delayDays}d`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Step 1 Subject Preview */}
                    <div className="rounded-md bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Subject: </span>
                      <span className="italic truncate">{seq.steps[0]?.variants[0]?.subject || "Untitled"}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => {
                          setPreviewSeq(seq);
                          setPreviewStepIdx(0);
                        }}
                      >
                        <Eye className="size-3.5" /> Preview
                      </Button>

                      <div className="flex items-center gap-1.5">
                        {!seq.isPreset && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget({ id: seq.id, name: seq.name })}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                        <Button size="sm" className="gap-1.5 text-xs shadow-2xs" asChild>
                          <Link href={`/campaigns/new?sequenceTemplate=${encodeURIComponent(seq.id)}`}>
                            <Rocket className="size-3.5" /> Use in Campaign
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Single Email Templates */}
      {activeTab === "single" && (
        <div className="space-y-4">
          {singleTemplates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No single templates yet"
              description="Write individual email templates to quickly insert into sequence steps or one-off tests."
              action={
                <Button size="sm" asChild>
                  <Link href="/templates/new">
                    <Plus className="h-4 w-4" /> Create template
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {singleTemplates.map((t) => (
                <Link
                  key={t.id}
                  href={`/templates/${t.id}`}
                  className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full transition-colors hover:border-foreground/20">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium truncate">{t.name}</h3>
                        <Badge variant="secondary">{t.format}</Badge>
                      </div>
                      <p className="mt-2 truncate text-sm text-muted-foreground">{t.subject}</p>
                      <p className="mt-3 text-xs text-muted-foreground/70">
                        Updated {formatDate(t.updatedAt)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview Sequence Dialog */}
      <Dialog open={!!previewSeq} onOpenChange={(open) => !open && setPreviewSeq(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <DialogTitle>{previewSeq?.name}</DialogTitle>
            </div>
            <DialogDescription>{previewSeq?.description}</DialogDescription>
          </DialogHeader>

          {previewSeq && (
            <div className="space-y-4 py-2">
              {/* Step Selector Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border">
                {previewSeq.steps.map((st, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPreviewStepIdx(i)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0",
                      previewStepIdx === i
                        ? "bg-accent text-accent-foreground font-semibold"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span>Step {i + 1}</span>
                    <span className="text-[10px] text-muted-foreground">
                      ({i === 0 ? "Immediate" : `+${st.delayDays}d`})
                    </span>
                  </button>
                ))}
              </div>

              {/* Step Content Preview */}
              {previewSeq.steps[previewStepIdx] && (
                <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wider">
                      {previewStepIdx === 0 ? "Initial Email" : `Follow-up ${previewStepIdx}`}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="size-3" />
                      {previewStepIdx === 0
                        ? "Sends immediately"
                        : `Wait ${previewSeq.steps[previewStepIdx].delayDays} days`}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Subject
                    </span>
                    <p className="mt-0.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
                      {previewSeq.steps[previewStepIdx].variants[0]?.subject || "(No subject)"}
                    </p>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Message Body
                    </span>
                    <div className="mt-0.5 whitespace-pre-wrap rounded-md border border-border/60 bg-muted/10 p-3.5 font-sans text-xs leading-relaxed text-foreground">
                      {previewSeq.steps[previewStepIdx].variants[0]?.bodyText || "(No content)"}
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setPreviewSeq(null)}>
                  Close
                </Button>
                <Button size="sm" className="gap-1.5" asChild>
                  <Link href={`/campaigns/new?sequenceTemplate=${encodeURIComponent(previewSeq.id)}`}>
                    <Rocket className="size-3.5" /> Use in New Campaign
                  </Link>
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Sequence Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? "Deleting..." : "Delete Sequence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
