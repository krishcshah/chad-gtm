"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  Card,
  CardContent,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Textarea,
} from "@smartreach/ui";
import {
  Ban,
  Search,
  Upload,
  Plus,
  Trash2,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { addSuppression, removeSuppression, importSuppressions } from "@/lib/actions";

export interface SuppressionItem {
  id: string;
  value: string;
  kind: string;
  reason: string;
  source: string;
}

export function SettingsBlocklistCard({
  initialSuppressions,
}: {
  initialSuppressions: SuppressionItem[];
}) {
  const [items, setItems] = useState<SuppressionItem[]>(initialSuppressions);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "email" | "domain">("all");
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Filtered suppressions
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      const q = search.toLowerCase().trim();
      if (!q) return true;
      return (
        item.value.toLowerCase().includes(q) ||
        (item.reason && item.reason.toLowerCase().includes(q))
      );
    });
  }, [items, kindFilter, search]);

  const emailCount = items.filter((i) => i.kind === "email").length;
  const domainCount = items.filter((i) => i.kind === "domain").length;

  const handleAdd = () => {
    if (!value.trim()) return;
    start(async () => {
      setMsg(null);
      setErr(null);
      const res = await addSuppression({ value: value.trim(), reason: reason.trim() });
      if (res.ok) {
        setMsg("Added to blocklist.");
        const isDomain = value.trim().startsWith("@") || !value.includes("@");
        setItems((prev) => [
          {
            id: res.data?.id || crypto.randomUUID(),
            value: value.trim(),
            kind: isDomain ? "domain" : "email",
            reason: reason.trim(),
            source: "manual",
          },
          ...prev,
        ]);
        setValue("");
        setReason("");
      } else {
        setErr(res.error || "Failed to add.");
      }
    });
  };

  const handleRemove = (id: string) => {
    start(async () => {
      setMsg(null);
      setErr(null);
      const res = await removeSuppression(id);
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      } else {
        setErr(res.error || "Failed to remove.");
      }
    });
  };

  const handleBulkImport = () => {
    const lines = bulkText
      .split(/[\r\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    start(async () => {
      setMsg(null);
      setErr(null);
      const res = await importSuppressions({
        lines,
        reason: bulkReason.trim() || undefined,
      });
      if (res.ok) {
        setMsg(`Imported ${res.data?.added || lines.length} items to blocklist.`);
        setIsBulkOpen(false);
        setBulkText("");
        setBulkReason("");
        // Reload page or re-query in background
        window.location.reload();
      } else {
        setErr(res.error || "Failed to import.");
      }
    });
  };

  return (
    <Card id="blocklist" className="border-border/70 shadow-sm scroll-mt-20">
      <CardContent className="p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Ban className="size-4 text-rose-400" />
              <h2 className="font-semibold text-base text-foreground">Global Suppression & Blocklist</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Emails and domains the sending engine will strictly skip during campaign dispatching.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
              {items.length} blocked
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkOpen(true)}
              className="text-xs h-7 gap-1"
            >
              <Upload className="size-3" /> Import CSV
            </Button>
          </div>
        </div>

        {/* Quick Add Form */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="email@example.com or @domain.com"
              className="flex-1 text-xs h-8"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional, e.g. Unsubscribed)"
              className="sm:w-60 text-xs h-8"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button
              size="sm"
              disabled={pending || !value.trim()}
              onClick={handleAdd}
              className="text-xs h-8 px-3 shrink-0"
            >
              <Plus className="size-3 mr-1" /> Add
            </Button>
          </div>

          {msg && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="size-3" /> {msg}</p>}
          {err && <p className="text-xs text-rose-400 flex items-center gap-1"><AlertCircle className="size-3" /> {err}</p>}
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search blocked emails or domains..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border/70 bg-background/60 pl-8 pr-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setKindFilter("all")}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all ${
                kindFilter === "all" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setKindFilter("email")}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all ${
                kindFilter === "email" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Emails ({emailCount})
            </button>
            <button
              type="button"
              onClick={() => setKindFilter("domain")}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all ${
                kindFilter === "domain" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Domains ({domainCount})
            </button>
          </div>
        </div>

        {/* List of Suppressions */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground space-y-1">
                <Ban className="size-5 mx-auto text-muted-foreground/60 mb-1" />
                <p>{items.length === 0 ? "No blocked contacts or domains." : "No items match your search."}</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/40 text-xs">
                {filtered.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 p-2.5 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-foreground truncate">{s.value}</span>
                        <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground uppercase font-semibold">
                          {s.kind}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {s.source} {s.reason ? `· ${s.reason}` : ""}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleRemove(s.id)}
                      className="size-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                      title="Unblock"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Bulk Import Modal */}
        <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
          <DialogContent className="max-w-lg p-6">
            <DialogHeader className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
                <Upload className="size-3.5" /> Bulk Import
              </div>
              <DialogTitle className="text-lg font-bold">Import Suppressions to Blocklist</DialogTitle>
              <DialogDescription className="text-xs">
                Paste a list of email addresses or domains (comma or newline-separated).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Entries</label>
                <Textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`user@domain.com\n@competitor.com\nspam@example.org`}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Reason (optional)</label>
                <Input
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="e.g. Competitor suppression list"
                  className="text-xs h-8"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsBulkOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={pending || !bulkText.trim()}
                  onClick={handleBulkImport}
                  className="text-xs"
                >
                  Import {bulkText.split(/[\r\n,]+/).filter(Boolean).length} entries
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
