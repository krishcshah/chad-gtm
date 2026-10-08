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
    onComplete(deck);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 font-sans">
      {/* Header & Calibration Progress */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300">
              Stage 04 // Calibration
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Tone Alignment</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-1">
            Voice & Angle Calibration Deck
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Approve or reject sample copy. Lock in cadence before dispatching.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-semibold text-white">
              {Math.min(currentIndex, deck.length)} of {deck.length} Reviewed
            </div>
            <div className="text-[10px] text-zinc-500">
              {approvedCount} approved
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleApproveAll}
            className="rounded-lg text-xs font-medium border-zinc-700 hover:border-zinc-500 text-white"
          >
            <ThumbsUp className="size-3 mr-1.5" /> Approve All
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
          style={{ width: `${(Math.min(currentIndex, deck.length) / deck.length) * 100}%` }}
        />
      </div>

      {/* Main Tinder Card or Completion Screen */}
      {!isFinished && currentCard ? (
        <div className="relative">
          {/* Active Card */}
          <div className="relative rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 sm:p-7 shadow-xl card-shine">
            {/* Prospect Metadata Chip Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/50 p-3.5 border border-zinc-800/60 mb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <User className="size-3.5 text-zinc-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">
                    {currentCard.recipientName}
                  </span>
                  <span className="rounded-full border border-zinc-700/60 bg-zinc-800/70 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                    {currentCard.recipientTitle}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3 text-zinc-500" />
                    {currentCard.recipientCompany}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="size-3 text-zinc-500" />
                    {currentCard.recipientIndustry}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => startEdit(currentCard)}
                className="rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              >
                <Edit3 className="size-3 mr-1" /> Edit Copy
              </Button>
            </div>

            {/* Email Subject Line */}
            <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 px-4 py-3 mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1">
                Subject
              </span>
              <p className="text-xs sm:text-sm font-semibold text-white tracking-tight">{currentCard.subject}</p>
            </div>

            {/* Email Body */}
            <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 p-4 min-h-[140px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block mb-2">
                Body Preview
              </span>
              <div className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-zinc-300 font-sans">
                {currentCard.bodyText}
              </div>
            </div>

            {/* Action Bar (Reject / Approve Buttons) */}
            <div className="flex items-center justify-center gap-10 mt-6 pt-5 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={handleReject}
                className="group flex flex-col items-center gap-2 focus:outline-none cursor-pointer"
              >
                <div className="flex size-13 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400 transition-all duration-200 group-hover:scale-105 group-hover:bg-rose-500/20 group-hover:border-rose-500/60 group-active:scale-95 shadow-xs">
                  <X className="size-6" />
                </div>
                <span className="text-[11px] font-medium text-zinc-400 group-hover:text-rose-300 transition-colors">
                  Discard (←)
                </span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                className="group flex flex-col items-center gap-2 focus:outline-none cursor-pointer"
              >
                <div className="flex size-13 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 transition-all duration-200 group-hover:scale-105 group-hover:bg-emerald-500/30 group-hover:border-emerald-500/70 group-active:scale-95 shadow-xs">
                  <Check className="size-6" />
                </div>
                <span className="text-[11px] font-medium text-zinc-400 group-hover:text-emerald-300 transition-colors">
                  Approve (→)
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Finished Calibration Screen */
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-8 text-center space-y-4 shadow-xl card-shine">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-sm">
            <Check className="size-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Calibration Deck Completed</h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto mt-1">
              Reviewed {deck.length} variations · {approvedCount} approved · {deck.length - approvedCount} rejected.
              Ready to analyze your feedback and refine the outbound model.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentIndex(0);
                setApprovedCount(0);
              }}
              className="rounded-lg text-xs font-medium border-zinc-800 hover:border-zinc-700 w-full sm:w-auto h-9"
            >
              <RotateCcw className="size-3 mr-1.5" /> Re-swipe
            </Button>
            <Button
              type="button"
              onClick={handleFinish}
              className="rounded-lg text-xs font-semibold bg-white hover:bg-zinc-200 text-black w-full sm:w-auto h-9 shadow-xs transition-all active:scale-[0.98]"
            >
              Adjust Copy to My Preferences ({approvedCount} approved) <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Inline Quick-Edit Modal */}
      {editingSample && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl p-6 space-y-4 shadow-2xl card-shine font-sans">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Edit3 className="size-4 text-emerald-400" /> Edit Cold Email Copy
              </h3>
              <button
                type="button"
                onClick={() => setEditingSample(null)}
                className="rounded-md p-1 text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-black/60 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  Email Body
                </label>
                <textarea
                  rows={8}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-black/60 p-3 text-xs font-sans text-white focus:outline-none focus:ring-1 focus:ring-white leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800/80">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingSample(null)}
                className="rounded-md text-xs font-medium border-zinc-800 hover:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveEdit}
                className="rounded-md text-xs font-semibold bg-white text-black hover:bg-zinc-200 transition-all active:scale-[0.98]"
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
