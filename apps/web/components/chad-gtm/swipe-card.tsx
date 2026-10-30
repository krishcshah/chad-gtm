"use client";

import { useState } from "react";
import {
  Check,
  X,
  Edit3,
  Building2,
  User,
  Briefcase,
  ChevronRight,
  ThumbsUp,
  RotateCcw,
  Sparkles,
} from "lucide-react";
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
  rejectedReason?: string;
}

const REJECTION_TAGS = [
  "Too generic",
  "Too salesy / pushy",
  "Too long / verbose",
  "Weak call to action",
  "Wrong persona tone",
];

export function SwipeCardDeck({
  samples,
  onComplete,
  onRequestMore,
}: {
  samples: EmailCalibrationSample[];
  onComplete: (approvedSamples: EmailCalibrationSample[]) => void;
  /** Fetch additional cards conditioned on the swipes so far. */
  onRequestMore?: (
    feedback: EmailCalibrationSample[],
    existingCount: number
  ) => Promise<EmailCalibrationSample[]>;
}) {
  const [deck, setDeck] = useState<EmailCalibrationSample[]>(samples);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [editingSample, setEditingSample] = useState<EmailCalibrationSample | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [showRejectMenu, setShowRejectMenu] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [adaptiveNote, setAdaptiveNote] = useState("");

  const MAX_DECK_SIZE = 16;
  const currentCard = deck[currentIndex];
  const isFinished = currentIndex >= deck.length && !isLoadingMore;

  const maybeExtendDeck = async (
    updatedDeck: EmailCalibrationSample[],
    reviewedIndex: number
  ) => {
    if (!onRequestMore) return;
    if (isLoadingMore) return;
    if (updatedDeck.length >= MAX_DECK_SIZE) return;
    if (updatedDeck.length - reviewedIndex > 2) return;

    setIsLoadingMore(true);
    try {
      const feedback = updatedDeck.slice(0, reviewedIndex + 1);
      const more = await onRequestMore(feedback, updatedDeck.length);
      if (more && more.length > 0) {
        const existingIds = new Set(updatedDeck.map((s) => s.id));
        const fresh = more.filter((s) => !existingIds.has(s.id));
        if (fresh.length > 0) {
          setDeck((prev) => {
            const prevIds = new Set(prev.map((s) => s.id));
            return [...prev, ...fresh.filter((s) => !prevIds.has(s.id))];
          });
          setAdaptiveNote(
            `Added ${fresh.length} new sample${fresh.length === 1 ? "" : "s"} conditioned on your feedback.`
          );
        }
      }
    } catch (err) {
      console.warn("[swipe-card] adaptive generation failed", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleApprove = () => {
    if (!currentCard) return;
    const updated = [...deck];
    updated[currentIndex] = { ...currentCard, approved: true };
    setDeck(updated);
    setApprovedCount((c) => c + 1);
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    setShowRejectMenu(false);
    void maybeExtendDeck(updated, nextIndex);
  };

  const handleRejectWithReason = (reason?: string) => {
    if (!currentCard) return;
    const updated = [...deck];
    updated[currentIndex] = { ...currentCard, approved: false, rejectedReason: reason };
    setDeck(updated);
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    setShowRejectMenu(false);
    void maybeExtendDeck(updated, nextIndex);
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
    if (currentIndex < deck.length && deck[currentIndex]?.id === editingSample.id) {
      setApprovedCount((c) => c + 1);
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      void maybeExtendDeck(updated, nextIndex);
    }
  };

  const handleFinish = () => {
    onComplete(deck);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 font-sans">
      {/* Header & Calibration Progress */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-300">
              Stage 04 // Calibration
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Tone Alignment
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-1">
            Voice & Angle Calibration Deck
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Approve or reject sample copy to lock in your tone before launching outreach.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-semibold text-white">
              {Math.min(currentIndex, deck.length)} of {deck.length} Reviewed
            </div>
            <div className="text-[10px] text-zinc-500">{approvedCount} approved</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleApproveAll}
            className="rounded-none text-xs font-medium border-zinc-700 hover:border-zinc-500 text-white"
          >
            <ThumbsUp className="size-3 mr-1.5" /> Approve All
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-zinc-900 border border-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${(Math.min(currentIndex, deck.length) / deck.length) * 100}%` }}
        />
      </div>

      {adaptiveNote && (
        <div className="flex items-center gap-2 border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-300">
          <Sparkles className="size-3 shrink-0" />
          {adaptiveNote}
        </div>
      )}

      {/* Adaptive fetch while the deck is temporarily exhausted */}
      {isLoadingMore && !currentCard ? (
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-8 text-center space-y-3">
          <div className="mx-auto flex size-10 items-center justify-center border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
            <Sparkles className="size-5 animate-pulse" />
          </div>
          <h3 className="text-sm font-semibold text-white">
            Calibrating your next samples...
          </h3>
          <p className="mx-auto max-w-sm text-xs text-zinc-400">
            Applying your approvals and rejection reasons to the next batch of prospects.
          </p>
        </div>
      ) : null}

      {/* Main Tinder Card or Completion Screen */}
      {!isFinished && currentCard ? (
        <div className="relative">
          {/* Active Card */}
          <div className="relative rounded-none border border-zinc-800 bg-zinc-950 p-5 sm:p-7 shadow-xl">
            {/* Prospect Metadata Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900/60 p-3 border border-zinc-800 mb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <User className="size-3.5 text-zinc-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">
                    {currentCard.recipientName}
                  </span>
                  <span className="rounded-none border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
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
                className="rounded-none text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <Edit3 className="size-3 mr-1" /> Edit Copy
              </Button>
            </div>

            {/* Email Subject Line */}
            <div className="bg-zinc-900/40 border border-zinc-800 px-4 py-3 mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
                Subject
              </span>
              <p className="text-xs sm:text-sm font-semibold text-white tracking-tight">
                {currentCard.subject}
              </p>
            </div>

            {/* Email Body */}
            <div className="bg-zinc-900/40 border border-zinc-800 p-4 min-h-[140px]">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-2">
                Body Preview
              </span>
              <div className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-zinc-300 font-sans">
                {currentCard.bodyText}
              </div>
            </div>

            {/* Rejection Tags Selection */}
            {showRejectMenu && (
              <div className="mt-4 p-3 bg-zinc-900/80 border border-red-900/50 space-y-2 animate-in fade-in">
                <span className="text-[10px] font-mono uppercase tracking-wider text-red-400 block">
                  Why are you rejecting this variation?
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {REJECTION_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleRejectWithReason(tag)}
                      className="rounded-none border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-red-500 hover:text-white hover:bg-red-950/40 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleRejectWithReason()}
                    className="rounded-none border border-zinc-800 bg-transparent px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Skip Reason →
                  </button>
                </div>
              </div>
            )}

            {/* Swipe Action Buttons */}
            <div className="flex items-center justify-between gap-4 pt-6 mt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  if (showRejectMenu) {
                    handleRejectWithReason();
                  } else {
                    setShowRejectMenu(true);
                  }
                }}
                className="group flex flex-1 items-center justify-center gap-2 border border-zinc-800 bg-zinc-900/40 hover:bg-red-950/30 hover:border-red-800/80 py-3 text-xs font-semibold text-zinc-300 hover:text-red-300 transition-all rounded-none"
              >
                <div className="flex size-6 items-center justify-center border border-zinc-700 group-hover:border-red-500 bg-zinc-800 group-hover:bg-red-500/20 text-zinc-400 group-hover:text-red-400 transition-colors rounded-none">
                  <X className="size-3.5" />
                </div>
                <span>Reject Variation</span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                className="group flex flex-1 items-center justify-center gap-2 border border-zinc-800 bg-zinc-900/40 hover:bg-emerald-950/30 hover:border-emerald-800/80 py-3 text-xs font-semibold text-zinc-300 hover:text-emerald-300 transition-all rounded-none"
              >
                <div className="flex size-6 items-center justify-center border border-zinc-700 group-hover:border-emerald-500 bg-zinc-800 group-hover:bg-emerald-500/20 text-zinc-400 group-hover:text-emerald-400 transition-colors rounded-none">
                  <Check className="size-3.5" />
                </div>
                <span>Approve Tone & Angle</span>
              </button>
            </div>
          </div>
        </div>
      ) : !isLoadingMore ? (
        /* Finished Calibration Screen */
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-8 text-center space-y-4 shadow-xl">
          <div className="mx-auto flex size-12 items-center justify-center border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 rounded-none">
            <Check className="size-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Calibration Deck Completed
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto mt-1">
              Reviewed {deck.length} variations · {approvedCount} approved ·{" "}
              {deck.length - approvedCount} rejected. Ready to analyze feedback and lock in your
              outbound tone.
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
                setShowRejectMenu(false);
              }}
              className="rounded-none text-xs font-medium border-zinc-800 hover:border-zinc-700 w-full sm:w-auto h-9"
            >
              <RotateCcw className="size-3 mr-1.5" /> Re-swipe
            </Button>
            <Button
              type="button"
              onClick={handleFinish}
              className="rounded-none text-xs font-semibold bg-white hover:bg-zinc-200 text-black w-full sm:w-auto h-9 transition-all active:scale-[0.98]"
            >
              Adjust Copy to My Preferences ({approvedCount} approved){" "}
              <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Inline Quick-Edit Modal */}
      {editingSample && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-none border border-zinc-800 bg-zinc-950 p-6 space-y-4 shadow-2xl font-sans">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Edit3 className="size-4 text-emerald-400" /> Edit Cold Email Copy
              </h3>
              <button
                type="button"
                onClick={() => setEditingSample(null)}
                className="rounded-none p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
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
                  className="w-full rounded-none border border-zinc-800 bg-black/60 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white"
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
                  className="w-full rounded-none border border-zinc-800 bg-black/60 p-3 text-xs font-sans text-white focus:outline-none focus:ring-1 focus:ring-white leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingSample(null)}
                className="rounded-none text-xs font-medium border-zinc-800 hover:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveEdit}
                className="rounded-none text-xs font-semibold bg-white text-black hover:bg-zinc-200 transition-all active:scale-[0.98]"
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
