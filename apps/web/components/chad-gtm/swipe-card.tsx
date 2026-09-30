"use client";

import { useState } from "react";
import { Check, X, Edit3, Sparkles, Building2, User, Briefcase, ChevronRight, ThumbsUp, RotateCcw } from "lucide-react";
import { Button } from "@smartreach/ui";

export interface EmailCalibrationSample {
  id: string;
  leadId: string;
  recipientName: string;
  recipientCompany: string;
  recipientTitle: string;
  recipientIndustry: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  approved: boolean;
}

export function SwipeCardDeck({
  samples,
  onComplete,
}: {
  samples: EmailCalibrationSample[];
  onComplete: (approvedSamples: EmailCalibrationSample[]) => void;
}) {
  const [deck, setDeck] = useState<EmailCalibrationSample[]>(samples);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [editingSample, setEditingSample] = useState<EmailCalibrationSample | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const currentCard = deck[currentIndex];
  const isFinished = currentIndex >= deck.length;

  const handleApprove = () => {
    if (!currentCard) return;
    const updated = [...deck];
    updated[currentIndex] = { ...currentCard, approved: true };
    setDeck(updated);
    setApprovedCount((c) => c + 1);
    setCurrentIndex((i) => i + 1);
  };

  const handleReject = () => {
    if (!currentCard) return;
    const updated = [...deck];
    updated[currentIndex] = { ...currentCard, approved: false };
    setDeck(updated);
    setCurrentIndex((i) => i + 1);
  };

  const handleApproveAll = () => {
    const updated = deck.map((c) => ({ ...c, approved: true }));
    setDeck(updated);
    setApprovedCount(deck.length);
    onComplete(updated);
  };

  const startEdit = (sample: EmailCalibrationSample) => {
    setEditingSample(sample);
    setEditSubject(sample.subject);
    setEditBody(sample.bodyText);
  };

  const saveEdit = () => {
    if (!editingSample) return;
    const updated = deck.map((s) =>
      s.id === editingSample.id
        ? { ...s, subject: editSubject, bodyText: editBody, approved: true }
        : s
    );
    setDeck(updated);
    setEditingSample(null);
    setApprovedCount((c) => c + 1);
    setCurrentIndex((i) => i + 1);
  };

  const handleFinish = () => {
    const approved = deck.filter((c) => c.approved);
    onComplete(approved.length > 0 ? approved : deck.slice(0, 3));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header & Calibration Progress */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3" /> Step 4 of 5
            </span>
            <span className="text-xs text-muted-foreground">Voice & Tone Calibration</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground mt-1">
            Email Calibration Deck
          </h2>
          <p className="text-xs text-muted-foreground">
            Swipe right to approve or left to reject outreach angles. Approve at least 2 to lock in tone.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold text-foreground">
              {Math.min(currentIndex, deck.length)} / {deck.length}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">
              {approvedCount} approved
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleApproveAll}
            className="text-xs border-primary/40 hover:bg-primary/10 text-primary"
          >
            <ThumbsUp className="size-3 mr-1.5" /> Approve All
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-300"
          style={{ width: `${(Math.min(currentIndex, deck.length) / deck.length) * 100}%` }}
        />
      </div>

      {/* Main Tinder Card or Completion Screen */}
      {!isFinished && currentCard ? (
        <div className="relative">
          {/* Stack background hint */}
          <div className="absolute inset-x-3 -bottom-2 h-full rounded-2xl border border-border/30 bg-card/40 shadow-sm pointer-events-none" />
          <div className="absolute inset-x-6 -bottom-4 h-full rounded-2xl border border-border/20 bg-card/20 shadow-sm pointer-events-none" />

          {/* Active Card */}
          <div className="relative rounded-2xl border border-border/70 bg-card/90 p-6 shadow-xl backdrop-blur-xl transition-all duration-200">
            {/* Prospect Metadata Chip Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-4 mb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User className="size-3.5 text-primary" />
                  <span className="text-sm font-bold text-foreground">
                    {currentCard.recipientName}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {currentCard.recipientTitle}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3 text-muted-foreground/70" />
                    {currentCard.recipientCompany}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="size-3 text-muted-foreground/70" />
                    {currentCard.recipientIndustry}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => startEdit(currentCard)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <Edit3 className="size-3 mr-1" /> Edit Copy
              </Button>
            </div>

            {/* Email Subject Line */}
            <div className="rounded-lg bg-muted/40 border border-border/40 px-3.5 py-2.5 mb-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-0.5">
                Subject
              </span>
              <p className="text-sm font-semibold text-foreground">{currentCard.subject}</p>
            </div>

            {/* Email Body */}
            <div className="rounded-lg bg-muted/20 border border-border/30 p-4 min-h-[160px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-2">
                Personalized Preview
              </span>
              <div className="whitespace-pre-line text-xs leading-relaxed text-foreground/90 font-mono">
                {currentCard.bodyText}
              </div>
            </div>

            {/* Action Bar (Reject / Approve Buttons) */}
            <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-border/40">
              <button
                type="button"
                onClick={handleReject}
                className="group flex flex-col items-center gap-1.5 focus:outline-none"
              >
                <div className="flex size-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-500 transition-all duration-200 group-hover:scale-110 group-hover:bg-rose-500 group-hover:text-white shadow-lg">
                  <X className="size-6 stroke-[2.5]" />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-rose-400">
                  Discard (←)
                </span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                className="group flex flex-col items-center gap-1.5 focus:outline-none"
              >
                <div className="flex size-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 transition-all duration-200 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white shadow-lg">
                  <Check className="size-6 stroke-[2.5]" />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-emerald-400">
                  Approve (→)
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Finished Calibration Screen */
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-4 shadow-xl">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Check className="size-6 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Calibration Complete!</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
              You reviewed {deck.length} variations and approved {approvedCount} personalized angles.
              The outreach engine is tuned to your brand voice.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentIndex(0);
                setApprovedCount(0);
              }}
              className="text-xs"
            >
              <RotateCcw className="size-3 mr-1.5" /> Re-calibrate
            </Button>
            <Button
              type="button"
              onClick={handleFinish}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Next: Set Daily Velocity <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Inline Quick-Edit Modal */}
      {editingSample && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Edit3 className="size-4 text-primary" /> Edit Cold Email Copy
              </h3>
              <button
                type="button"
                onClick={() => setEditingSample(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Email Body
                </label>
                <textarea
                  rows={8}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/30 p-3 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingSample(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveEdit}
                className="text-xs font-semibold bg-primary text-primary-foreground"
              >
                Save & Approve
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
