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
    <div className="mx-auto max-w-2xl space-y-6 font-mono">
      {/* Header & Calibration Progress */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
              STAGE 04 // CALIBRATION
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Tone Alignment</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-white mt-1">
            Voice & Angle Calibration Deck
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Approve or reject sample copy. Lock in cadence before dispatching.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-bold text-white uppercase tracking-wider">
              {Math.min(currentIndex, deck.length)} / {deck.length} REVIEWED
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
              {approvedCount} APPROVED
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleApproveAll}
            className="rounded-none text-xs font-mono uppercase tracking-wider border-zinc-700 hover:border-white text-white"
          >
            <ThumbsUp className="size-3 mr-1.5" /> Approve All
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-zinc-900 border border-zinc-800">
        <div
          className="h-full bg-white transition-all duration-200"
          style={{ width: `${(Math.min(currentIndex, deck.length) / deck.length) * 100}%` }}
        />
      </div>

      {/* Main Tinder Card or Completion Screen */}
      {!isFinished && currentCard ? (
        <div className="relative">
          {/* Active Card */}
          <div className="relative rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-6 shadow-none">
            {/* Prospect Metadata Chip Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3 mb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <User className="size-3.5 text-zinc-400 shrink-0" />
                  <span className="text-sm font-bold text-white">
                    {currentCard.recipientName}
                  </span>
                  <span className="rounded-none border border-zinc-800 bg-black px-1.5 py-0.5 text-[10px] text-zinc-400 uppercase">
                    {currentCard.recipientTitle}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3" />
                    {currentCard.recipientCompany}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="size-3" />
                    {currentCard.recipientIndustry}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => startEdit(currentCard)}
                className="rounded-none text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-900"
              >
                <Edit3 className="size-3 mr-1" /> Edit Copy
              </Button>
            </div>

            {/* Email Subject Line */}
            <div className="rounded-none bg-black border border-zinc-800 px-3.5 py-2.5 mb-3 font-mono">
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 block mb-0.5">
                Subject
              </span>
              <p className="text-xs font-bold text-white">{currentCard.subject}</p>
            </div>

            {/* Email Body */}
            <div className="rounded-none bg-black border border-zinc-800 p-4 min-h-[140px] font-mono">
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 block mb-2">
                Body Preview
              </span>
              <div className="whitespace-pre-line text-xs leading-relaxed text-zinc-300 font-mono">
                {currentCard.bodyText}
              </div>
            </div>

            {/* Action Bar (Reject / Approve Buttons) */}
            <div className="flex items-center justify-center gap-8 mt-5 pt-4 border-t border-zinc-800 font-mono">
              <button
                type="button"
                onClick={handleReject}
                className="group flex flex-col items-center gap-1.5 focus:outline-none"
              >
                <div className="flex size-12 items-center justify-center rounded-none border border-zinc-800 bg-black text-zinc-400 transition-colors group-hover:border-zinc-600 group-hover:text-white">
                  <X className="size-5" />
                </div>
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300">
                  Discard (←)
                </span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                className="group flex flex-col items-center gap-1.5 focus:outline-none"
              >
                <div className="flex size-12 items-center justify-center rounded-none border border-white bg-white text-black transition-colors group-hover:bg-zinc-200">
                  <Check className="size-5" />
                </div>
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 group-hover:text-white">
                  Approve (→)
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Finished Calibration Screen */
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-8 text-center space-y-4 font-mono">
          <div className="mx-auto flex size-10 items-center justify-center rounded-none border border-white bg-white text-black">
            <Check className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider">Calibration Complete</h3>
            <p className="text-xs text-zinc-400 font-sans max-w-md mx-auto mt-1">
              Reviewed {deck.length} variations · Approved {approvedCount} personalized angles.
              Outreach tone is calibrated.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentIndex(0);
                setApprovedCount(0);
              }}
              className="rounded-none text-xs font-mono uppercase tracking-wider border-zinc-800 hover:border-zinc-700 w-full sm:w-auto h-9"
            >
              <RotateCcw className="size-3 mr-1.5" /> Re-calibrate
            </Button>
            <Button
              type="button"
              onClick={handleFinish}
              className="rounded-none text-xs font-mono uppercase tracking-wider font-semibold bg-white hover:bg-zinc-200 text-black border border-white w-full sm:w-auto h-9"
            >
              Set Daily Velocity <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Inline Quick-Edit Modal */}
      {editingSample && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-none">
          <div className="w-full max-w-lg rounded-none border border-zinc-800 bg-black p-6 space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Edit3 className="size-3.5 text-white" /> Edit Cold Email Copy
              </h3>
              <button
                type="button"
                onClick={() => setEditingSample(null)}
                className="text-zinc-500 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">
                  Email Body
                </label>
                <textarea
                  rows={8}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full rounded-none border border-zinc-800 bg-zinc-950 p-3 text-xs font-mono text-white focus:outline-none focus:border-white leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingSample(null)}
                className="rounded-none text-xs font-mono uppercase border-zinc-800"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveEdit}
                className="rounded-none text-xs font-mono uppercase tracking-wider font-semibold bg-white text-black hover:bg-zinc-200 border border-white"
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
