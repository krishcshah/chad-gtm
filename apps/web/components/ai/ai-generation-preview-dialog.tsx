"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
  cn,
} from "@smartreach/ui";
import {
  Sparkles,
  RefreshCw,
  Mail,
  User,
  Building,
  Briefcase,
  MapPin,
  Globe,
  CheckCircle2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
} from "lucide-react";

export interface PreviewSample {
  lead: {
    id?: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    industry?: string | null;
    website?: string | null;
    location?: string | null;
  };
  email: {
    subject: string;
    bodyText: string;
    bodyHtml: string;
    personalizationReason?: string;
  };
}

interface AiGenerationPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  samples: PreviewSample[];
  loading?: boolean;
  onRegenerate?: () => void;
  customInstruction: string;
}

export function AiGenerationPreviewDialog({
  open,
  onOpenChange,
  samples,
  loading = false,
  onRegenerate,
  customInstruction,
}: AiGenerationPreviewDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const activeSample = samples[selectedIndex] ?? samples[0] ?? null;
  const wordCount = activeSample ? activeSample.email.bodyText.trim().split(/\s+/).length : 0;
  const readSec = Math.max(5, Math.round((wordCount / 200) * 60));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-4xl p-0 overflow-hidden border border-border/80 bg-background shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 bg-primary/5 px-4 sm:px-6 py-3.5 sm:py-4 shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Sparkles className="size-4" />
              </span>
              <DialogTitle className="text-sm sm:text-base font-semibold truncate">
                AI On-The-Fly Generation Preview
              </DialogTitle>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px] sm:text-[11px] shrink-0">
                {samples.length} Saved Lead Previews
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              These emails are synthesized in real-time for your saved leads using their actual company and contact attributes.
            </DialogDescription>
          </div>

          {onRegenerate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={loading}
              className="h-8 gap-1.5 text-xs font-medium w-full sm:w-auto shrink-0 justify-center"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              {loading ? "Synthesizing…" : "Regenerate Top 5"}
            </Button>
          ) : null}
        </div>

        {/* Instructions pill bar */}
        {customInstruction?.trim() ? (
          <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-4 sm:px-6 py-2 text-xs text-muted-foreground shrink-0 truncate">
            <span className="font-semibold text-foreground shrink-0">Active Instruction:</span>
            <span className="truncate italic font-mono text-[11px]">"{customInstruction.trim()}"</span>
          </div>
        ) : null}

        {/* Mobile Lead Switcher Bar */}
        {samples.length > 0 ? (
          <div className="flex md:hidden flex-col border-b border-border/60 bg-muted/20 px-3 py-2 shrink-0 gap-1.5">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                disabled={selectedIndex === 0}
              >
                <ChevronLeft className="size-3.5 mr-1" /> Prev
              </Button>
              <span className="text-xs font-semibold text-foreground">
                Lead {selectedIndex + 1} of {samples.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setSelectedIndex((prev) => Math.min(samples.length - 1, prev + 1))}
                disabled={selectedIndex >= samples.length - 1}
              >
                Next <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-xs">
              {samples.map((s, idx) => {
                const isSelected = idx === selectedIndex;
                const firstName = s.lead.firstName || s.lead.email.split("@")[0];
                return (
                  <button
                    key={s.lead.id || idx}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0 transition-colors border",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-semibold"
                        : "bg-background border-border/80 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {idx + 1}. {firstName}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Content Body: 2 Columns on Desktop, 1 Column on Mobile */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Column: List of Leads (Desktop Only) */}
          <div className="hidden md:flex md:w-72 shrink-0 border-r border-border/60 bg-muted/15 flex-col overflow-y-auto">
            <div className="px-4 py-2.5 border-b border-border/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Saved Leads ({samples.length})
            </div>
            <div className="divide-y divide-border/40">
              {samples.map((s, idx) => {
                const isSelected = idx === selectedIndex;
                const leadName = [s.lead.firstName, s.lead.lastName].filter(Boolean).join(" ") || s.lead.email.split("@")[0];
                return (
                  <button
                    key={s.lead.id || idx}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-accent/40",
                      isSelected ? "bg-accent/80 font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <span className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">{leadName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{s.lead.company || "Unknown Company"}</p>
                      <p className="truncate text-[10px] text-muted-foreground/80">{s.lead.jobTitle || s.lead.industry || "Prospect"}</p>
                    </div>
                    <ChevronRight className={cn("size-3.5 shrink-0 transition-opacity", isSelected ? "opacity-100 text-primary" : "opacity-0")} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Full Email Preview */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-3.5 sm:p-6 space-y-3 sm:space-y-4">
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-center space-y-3">
                <RefreshCw className="size-7 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Synthesizing personalized emails for top 5 saved leads…</p>
                <p className="text-xs text-muted-foreground max-w-sm">Applying custom instructions and researching lead company attributes.</p>
              </div>
            ) : activeSample ? (
              <>
                {/* Lead Profile Header */}
                <div className="rounded-lg border border-border/70 bg-card p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                      {(activeSample.lead.firstName || activeSample.lead.email)[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-sm text-foreground">
                          {[activeSample.lead.firstName, activeSample.lead.lastName].filter(Boolean).join(" ") || "Recipient"}
                        </span>
                        <span className="text-muted-foreground text-xs truncate max-w-[200px] sm:max-w-none">&lt;{activeSample.lead.email}&gt;</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-[11px] mt-0.5">
                        {activeSample.lead.jobTitle ? (
                          <span className="flex items-center gap-1">
                            <Briefcase className="size-3 text-muted-foreground" />
                            {activeSample.lead.jobTitle}
                          </span>
                        ) : null}
                        {activeSample.lead.company ? (
                          <span className="flex items-center gap-1 font-medium text-foreground/80">
                            <Building className="size-3 text-muted-foreground" />
                            {activeSample.lead.company}
                          </span>
                        ) : null}
                        {activeSample.lead.industry ? (
                          <span className="flex items-center gap-1">
                            <Globe className="size-3 text-muted-foreground" />
                            {activeSample.lead.industry}
                          </span>
                        ) : null}
                        {activeSample.lead.location ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3 text-muted-foreground" />
                            {activeSample.lead.location}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2 sm:pt-0">
                    <span className="flex items-center gap-1">
                      <FileText className="size-3 text-muted-foreground" />
                      {wordCount} words
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3 text-muted-foreground" />
                      ~{readSec}s read
                    </span>
                  </div>
                </div>

                {/* Personalization Reason Callout */}
                {activeSample.email.personalizationReason ? (
                  <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary">
                    <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                    <span><strong>Personalization hook:</strong> {activeSample.email.personalizationReason}</span>
                  </div>
                ) : null}

                {/* Email Subject */}
                <div className="rounded-lg border border-border/80 bg-background p-3.5 shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</span>
                  <p className="text-sm font-semibold text-foreground select-all">{activeSample.email.subject}</p>
                </div>

                {/* Email Body */}
                <div className="rounded-lg border border-border/80 bg-background p-4 shadow-2xs space-y-2 flex-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email Body</span>
                  <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans text-foreground/90 select-all pt-1">
                    {activeSample.email.bodyText}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                No preview data generated yet. Click "Regenerate" to view sample emails.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between border-t border-border/70 bg-muted/20 px-4 sm:px-6 py-3 gap-2.5 shrink-0">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            {samples.length > 0 ? (
              <span>Inspecting lead <strong>{selectedIndex + 1} of {samples.length}</strong>. Each outreach will be synthesized uniquely at send time.</span>
            ) : null}
          </p>

          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs font-semibold gap-1.5 w-full sm:w-auto"
          >
            <CheckCircle2 className="size-3.5" />
            Looks Reliable — Keep Enabled
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
