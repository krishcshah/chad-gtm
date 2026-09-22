"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clock,
  Eye,
  Layers,
  Pencil,
  Plus,
  Rocket,
  Sparkles,
  Split,
  Trash2,
} from "lucide-react";
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
  parseSequenceTemplate,
  type ReusableSequence,
} from "@/lib/sequence-templates";
import { CreateSequenceDialog } from "./create-sequence-dialog";

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
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSeq, setEditingSeq] = useState<ReusableSequence | null>(null);
  const [previewSeq, setPreviewSeq] = useState<ReusableSequence | null>(null);
  const [previewStepIdx, setPreviewStepIdx] = useState(0);
  const [previewVariantIdx, setPreviewVariantIdx] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Parse all templates as sequences (legacy single templates are auto-converted to 1-step sequences)
  const userSequences = useMemo(() => {
    return templates.map((t) => parseSequenceTemplate(t));
  }, [templates]);

  // Combine user sequences and presets
  const allSequences = useMemo(() => {
    return [...userSequences, ...PRESET_SEQUENCES];
  }, [userSequences]);

  useEffect(() => {
    const editId = searchParams?.get("edit");
    if (editId) {
      const match = allSequences.find((s) => s.id === editId);
      if (match) {
        setEditingSeq(match);
        setCreateDialogOpen(true);
      }
    }
  }, [allSequences, searchParams]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      await deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
      router.refresh();
    });
  };

  return (
    <div className="page-stack space-y-6">
      <PageHeader
        title="Sequences"
        description="Build, save, and reuse battle-tested multi-step outreach sequences across your campaigns."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/campaigns/new">
                <Rocket className="h-4 w-4" /> Start campaign
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingSeq(null);
                setCreateDialogOpen(true);
              }}
              className="gap-1.5 shadow-xs"
            >
              <Plus className="h-4 w-4" /> Create sequence
            </Button>
          </div>
        }
      />

      {/* Overview Stat Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Sequences
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
              Custom Sequences
            </span>
            <Sparkles className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {userSequences.length}
            </span>
            <span className="text-xs text-muted-foreground">saved in your workspace</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Verified Presets
            </span>
            <Rocket className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {PRESET_SEQUENCES.length}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Proven high conversion rates
            </span>
          </div>
        </div>
      </div>

      {/* Sequences Grid */}
      <div className="space-y-4">
        {allSequences.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No sequences yet"
            description="Create your first reusable multi-step outreach sequence or choose from verified presets."
            action={
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Create First Sequence
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allSequences.map((seq) => {
              const totalDays = seq.steps.reduce((sum, s) => sum + (s.delayDays || 0), 0);
              return (
                <Card
                  key={seq.id}
                  className="group flex flex-col justify-between border-border/70 bg-card/60 transition-all hover:border-border hover:shadow-md backdrop-blur"
                >
                  <CardHeader className="pb-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        variant={seq.isPreset ? "secondary" : "default"}
                        className={cn(
                          "text-[10px] font-medium",
                          seq.isPreset
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                        )}
                      >
                        {seq.isPreset ? "Verified Preset" : "Custom Sequence"}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSeq(seq);
                            setCreateDialogOpen(true);
                          }}
                          className="rounded-lg p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 hover:text-primary hover:bg-accent/60"
                          title={seq.isPreset ? "Customize preset sequence" : "Edit sequence"}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        {!seq.isPreset && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ id: seq.id, name: seq.name })}
                            className="rounded-lg p-1 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                            title="Delete sequence"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold group-hover:text-primary transition-colors line-clamp-1">
                        {seq.name}
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-2 mt-1">
                        {seq.description}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0">
                    {/* Steps Timeline Visual */}
                    <div className="space-y-2 rounded-xl border border-border/50 bg-muted/30 p-2.5">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1">
                            <Layers className="size-3 text-primary" /> {seq.steps.length} Steps
                          </span>
                          {seq.steps.some((s) => s.variants && s.variants.length > 1) && (
                            <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20">
                              <Split className="size-2.5" /> A/B
                            </span>
                          )}
                        </div>
                        {totalDays > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" /> {totalDays}d span
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 overflow-x-auto py-1">
                        {seq.steps.map((st, i) => (
                          <div key={st.key || i} className="flex items-center gap-1 shrink-0">
                            <span
                              className="inline-flex items-center justify-center size-6 rounded-md bg-background border border-border/70 text-[10px] font-bold text-foreground shadow-2xs"
                              title={`Step ${i + 1}${st.variants && st.variants.length > 1 ? ` (${st.variants.length} A/B variants)` : ""}: ${st.variants[0]?.subject}`}
                            >
                              {i + 1}
                            </span>
                            {i < seq.steps.length - 1 && (
                              <span className="text-[10px] text-muted-foreground/60 px-0.5">
                                +{seq.steps[i + 1]?.delayDays || 0}d →
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="px-2.5 text-xs gap-1 h-8 shrink-0"
                        onClick={() => {
                          setPreviewSeq(seq);
                          setPreviewStepIdx(0);
                          setPreviewVariantIdx(0);
                        }}
                        title="Preview steps"
                      >
                        <Eye className="size-3.5" />
                        <span className="hidden sm:inline">Preview</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1 text-xs gap-1 h-8 font-medium"
                        onClick={() => {
                          setEditingSeq(seq);
                          setCreateDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                        <span>Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 text-xs gap-1 h-8 font-semibold shadow-2xs"
                        asChild
                      >
                        <Link href={`/campaigns/new?sequence=${encodeURIComponent(seq.id)}`}>
                          <Rocket className="size-3.5" />
                          <span>Use</span>
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Step Preview Walkthrough Dialog */}
      {previewSeq && (
        <Dialog open={!!previewSeq} onOpenChange={(open) => !open && setPreviewSeq(null)}>
          <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
            <DialogHeader className="shrink-0">
              <div className="flex items-center gap-2">
                <Badge
                  variant={previewSeq.isPreset ? "secondary" : "default"}
                  className="text-[10px]"
                >
                  {previewSeq.isPreset ? "Preset" : "Custom"}
                </Badge>
                <DialogTitle className="text-base truncate">{previewSeq.name}</DialogTitle>
              </div>
              <DialogDescription className="text-xs line-clamp-2">
                {previewSeq.description}
              </DialogDescription>
            </DialogHeader>

            {/* Step Selector Pills */}
            <div className="flex items-center gap-1.5 border-b border-border/50 pb-3 overflow-x-auto shrink-0">
              {previewSeq.steps.map((st, i) => (
                <button
                  key={st.key || i}
                  type="button"
                  onClick={() => {
                    setPreviewStepIdx(i);
                    setPreviewVariantIdx(0);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all shrink-0 border",
                    previewStepIdx === i
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-2xs"
                      : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span>Step {i + 1}</span>
                  {st.variants && st.variants.length > 1 && (
                    <span className="text-[10px] text-primary font-bold">
                      (A/B)
                    </span>
                  )}
                  {i > 0 && (
                    <span className="text-[10px] text-muted-foreground/80 font-normal">
                      (+{st.delayDays}d)
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Step Detail Content */}
            {previewSeq.steps[previewStepIdx] && (() => {
              const currentStep = previewSeq.steps[previewStepIdx];
              const stepVariants = currentStep.variants || [];
              const activeVar =
                stepVariants[Math.min(previewVariantIdx, Math.max(0, stepVariants.length - 1))] ||
                stepVariants[0];

              return (
                <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1">
                  <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {previewStepIdx === 0 ? "Initial Email" : `Follow-up #${previewStepIdx}`}
                        </span>
                        {stepVariants.length > 1 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <Split className="size-2.5" /> A/B Split (50/50)
                          </span>
                        )}
                      </div>
                      <span className="tabular-nums">
                        {previewStepIdx === 0
                          ? "Sends immediately"
                          : `Sent ${currentStep.delayDays} days after previous step`}
                      </span>
                    </div>

                    {stepVariants.length > 1 && (
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/40">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
                          Variants:
                        </span>
                        {stepVariants.map((v, vi) => (
                          <button
                            key={vi}
                            type="button"
                            onClick={() => setPreviewVariantIdx(vi)}
                            className={cn(
                              "rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                              previewVariantIdx === vi
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "bg-background border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                            )}
                          >
                            Variant {v.label || (vi === 0 ? "A" : "B")}
                          </button>
                        ))}
                      </div>
                    )}

                    <p className="text-xs font-semibold text-foreground pt-1.5 truncate">
                      Subject:{" "}
                      <span className="font-normal text-muted-foreground">
                        {activeVar?.subject || "(No subject)"}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Message Body {stepVariants.length > 1 ? `(Variant ${activeVar?.label || "A"})` : ""}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {activeVar?.bodyText.trim()
                          ? `${activeVar.bodyText.trim().split(/\s+/).length} words`
                          : "0 words"}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                      {activeVar?.bodyText || "(Empty message)"}
                    </div>
                  </div>
                </div>
              );
            })()}

            <DialogFooter className="shrink-0 mt-2 gap-2 border-t border-border/40 pt-3">
              <Button variant="outline" size="sm" onClick={() => setPreviewSeq(null)}>
                Close Preview
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const target = previewSeq;
                  setPreviewSeq(null);
                  setEditingSeq(target);
                  setCreateDialogOpen(true);
                }}
              >
                <Pencil className="size-3.5" /> Edit Sequence
              </Button>
              <Button size="sm" asChild>
                <Link href={`/campaigns/new?sequence=${encodeURIComponent(previewSeq.id)}`}>
                  <Rocket className="size-3.5 mr-1.5" /> Use in Campaign
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Delete Sequence</DialogTitle>
              <DialogDescription className="text-xs">
                Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>? This will remove the sequence template from your library.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={pending}>
                {pending ? "Deleting…" : "Delete Sequence"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create / Edit Sequence Dialog */}
      <CreateSequenceDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setEditingSeq(null);
        }}
        sequence={editingSeq}
      />
    </div>
  );
}
