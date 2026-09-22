"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CheckSquare, Download, Mail, Plus, Sliders, Square, Upload, X } from "lucide-react";
import { Button, EmptyState, PageHeader } from "@smartreach/ui";
import { SenderCard, type SenderCardData } from "./sender-card";
import { BulkEditDialog } from "./bulk-edit-dialog";

export function SendersClient({ senders }: { senders: SenderCardData[] }) {
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === senders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(senders.map((s) => s.id));
    }
  };

  const exitBulkMode = () => {
    setIsBulkMode(false);
    setSelectedIds([]);
  };

  const allSelected = senders.length > 0 && selectedIds.length === senders.length;

  return (
    <div className="page-stack space-y-6">
      <PageHeader
        title="Senders"
        description="Connect mailboxes. The engine rotates between them automatically."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {senders.length > 0 && (
              <Button
                variant={isBulkMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  if (isBulkMode) exitBulkMode();
                  else setIsBulkMode(true);
                }}
                className="gap-1.5"
              >
                <Sliders className="h-4 w-4" />
                {isBulkMode ? "Exit Bulk Edit" : "Bulk Edit"}
              </Button>
            )}

            {!isBulkMode && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/senders/template" download>
                    <Download className="h-4 w-4" /> CSV template
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/senders/import">
                    <Upload className="h-4 w-4" /> Bulk import
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/senders/new">
                    <Plus className="h-4 w-4" /> Add sender
                  </Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Floating or Sticky Bulk Edit Control Bar */}
      {isBulkMode && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-card/95 p-3.5 shadow-lg backdrop-blur-md animate-in fade-in">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-xs font-semibold text-foreground hover:text-primary transition-colors"
            >
              <div
                className={`flex size-5 items-center justify-center rounded-md border transition-all ${
                  allSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/80 bg-background"
                }`}
              >
                {allSelected && <Check className="size-3.5 stroke-[3]" />}
              </div>
              <span>
                {allSelected ? "Deselect All" : `Select All (${senders.length})`}
              </span>
            </button>
            <span className="h-4 w-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium">
              <strong className="text-foreground">{selectedIds.length}</strong> of {senders.length} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() => setBulkDialogOpen(true)}
              className="gap-1.5 shadow-xs"
            >
              <Sliders className="size-3.5" /> Edit Selected ({selectedIds.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={exitBulkMode} className="text-xs">
              <X className="size-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {senders.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No sender accounts"
          description="Add your first mailbox, or import many at once from a CSV."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" asChild>
                <Link href="/senders/new">
                  <Plus className="h-4 w-4" /> Add sender
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/senders/import">Bulk import</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {senders.map((s) => (
            <SenderCard
              key={s.id}
              sender={s}
              selectable={isBulkMode}
              selected={selectedIds.includes(s.id)}
              onSelect={() => toggleSelect(s.id)}
            />
          ))}
        </div>
      )}

      <BulkEditDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        selectedIds={selectedIds}
        onSuccess={() => {
          exitBulkMode();
        }}
      />
    </div>
  );
}
