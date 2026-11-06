"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, Pencil, RotateCcw, X } from "lucide-react";
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Kbd,
  Progress,
  Textarea,
} from "@smartreach/ui";
import { WorkingPanel } from "./working-panel";

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

const MAX_DECK_SIZE = 16;

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Guided setup, step 4: review sample emails one at a time. Approvals,
 * rejections (with a reason) and edits teach the writer the client's voice.
 * New samples are requested mid-deck, conditioned on the feedback so far.
 */
export function SwipeCardDeck({
  samples,
  onComplete,
  onRequestMore,
  onBack,
}: {
  samples: EmailCalibrationSample[];
  onComplete: (approvedSamples: EmailCalibrationSample[]) => void;
  /** Fetch additional cards conditioned on the swipes so far. */
  onRequestMore?: (feedback: EmailCalibrationSample[], existingCount: number) => Promise<EmailCalibrationSample[]>;
  onBack?: () => void;
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
  const cardRef = useRef<HTMLDivElement>(null);

  const currentCard = deck[currentIndex];
  const isFinished = currentIndex >= deck.length && !isLoadingMore;
  const reviewed = Math.min(currentIndex, deck.length);

  const maybeExtendDeck = async (updatedDeck: EmailCalibrationSample[], reviewedIndex: number) => {
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
            `Added ${fresh.length} more sample${fresh.length === 1 ? "" : "s"} based on your feedback so far.`,
          );
        }
      }
    } catch (err) {
      console.warn("[swipe-card] adaptive generation failed", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const advance = (updated: EmailCalibrationSample[]) => {
    const nextIndex = currentIndex + 1;
    setDeck(updated);
    setCurrentIndex(nextIndex);
    setShowRejectMenu(false);
    void maybeExtendDeck(updated, nextIndex);
    cardRef.current?.focus({ preventScroll: true });
  };

  const handleApprove = () => {
    if (!currentCard) return;
    const updated = [...deck];
    updated[currentIndex] = { ...currentCard, approved: true };
    setApprovedCount((c) => c + 1);
    advance(updated);
  };

  const handleRejectWithReason = (reason?: string) => {
    if (!currentCard) return;
    const updated = [...deck];
    updated[currentIndex] = { ...currentCard, approved: false, rejectedReason: reason };
    advance(updated);
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
      s.id === editingSample.id ? { ...s, subject: editSubject, bodyText: editBody, approved: true } : s,
    );
    setDeck(updated);
    setEditingSample(null);
    if (currentIndex < deck.length && deck[currentIndex]?.id === editingSample.id) {
      setApprovedCount((c) => c + 1);
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setShowRejectMenu(false);
      void maybeExtendDeck(updated, nextIndex);
    }
  };

  const restart = () => {
    setCurrentIndex(0);
    setApprovedCount(0);
    setShowRejectMenu(false);
  };

  // Keyboard: A approve, R reject, E edit, 1–5 pick a reason, Esc closes the reasons.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || editingSample || !currentCard || isTypingTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === "a") {
      e.preventDefault();
      handleApprove();
    } else if (k === "r") {
      e.preventDefault();
      setShowRejectMenu(true);
    } else if (k === "e") {
      e.preventDefault();
      startEdit(currentCard);
    } else if (showRejectMenu && /^[1-5]$/.test(k)) {
      e.preventDefault();
      handleRejectWithReason(REJECTION_TAGS[Number(k) - 1]);
    } else if (showRejectMenu && k === "escape") {
      setShowRejectMenu(false);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = deck.length;

  return (
    <>
      {isLoadingMore && !currentCard ? (
        <WorkingPanel
          title="Writing more samples"
          description="We're using your approvals and rejection reasons to write the next few emails."
        />
      ) : !isFinished && currentCard ? (
        <Card>
          <CardHeader
            actions={
              <Button variant="outline" size="sm" onClick={handleApproveAll}>
                <CheckCheck />
                Approve all
              </Button>
            }
          >
            <CardTitle>Does this sound like you?</CardTitle>
            <CardDescription>
              Approve emails you&apos;d send yourself and reject the rest. We rewrite the sequence from your choices.
            </CardDescription>
          </CardHeader>

          <div className="px-5 pt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="tabular">
                Email {currentIndex + 1} of {total}
                {isLoadingMore ? ", writing more…" : ""}
              </span>
              <span className="tabular">{approvedCount} approved</span>
            </div>
            <Progress
              value={total > 0 ? (reviewed / total) * 100 : 0}
              className="mt-2"
              aria-label={`${reviewed} of ${total} reviewed`}
            />
            {adaptiveNote && <p className="mt-2 text-xs text-subtle-foreground">{adaptiveNote}</p>}
          </div>

          <div
            ref={cardRef}
            tabIndex={-1}
            aria-live="polite"
            aria-label={`Sample email ${currentIndex + 1} of ${total}`}
            className="p-5 outline-none"
          >
            <article className="rounded-lg border border-border">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0 text-[13px]">
                  <p>
                    <span className="text-muted-foreground">To </span>
                    <span className="font-medium">{currentCard.recipientName}</span>
                    {currentCard.recipientTitle && (
                      <span className="text-muted-foreground">, {currentCard.recipientTitle}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle-foreground">
                    {[currentCard.recipientCompany, currentCard.recipientIndustry].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="xs" onClick={() => startEdit(currentCard)}>
                  <Pencil />
                  Edit
                </Button>
              </header>
              <div className="px-4 py-4">
                <p className="text-sm font-semibold">{currentCard.subject}</p>
                <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {currentCard.bodyText}
                </div>
              </div>
            </article>

            {showRejectMenu && (
              <fieldset className="mt-4 rounded-lg bg-muted/60 p-4">
                <legend className="sr-only">Why doesn&apos;t this email work?</legend>
                <p className="text-[13px] font-medium" aria-hidden>
                  What&apos;s wrong with it?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REJECTION_TAGS.map((tag, i) => (
                    <Button key={tag} variant="outline" size="sm" onClick={() => handleRejectWithReason(tag)}>
                      <Kbd className="hidden sm:inline-flex">{i + 1}</Kbd>
                      {tag}
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => handleRejectWithReason()}>
                    Skip reason
                  </Button>
                </div>
              </fieldset>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft />
                  Audience
                </Button>
              )}
              <p className="hidden text-xs text-subtle-foreground lg:block">
                <Kbd>A</Kbd> approve <Kbd className="ml-2">R</Kbd> reject <Kbd className="ml-2">E</Kbd> edit
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                variant="outline"
                onClick={() => (showRejectMenu ? handleRejectWithReason() : setShowRejectMenu(true))}
                aria-expanded={showRejectMenu}
              >
                <X />
                Reject
              </Button>
              <Button onClick={handleApprove}>
                <Check />
                Approve
              </Button>
            </div>
          </div>
        </Card>
      ) : !isLoadingMore ? (
        <Card>
          <CardHeader>
            <CardTitle>All samples reviewed</CardTitle>
            <CardDescription>
              Next we rewrite the sequence to match the emails you approved, and steer away from the reasons you gave
              for rejecting the others.
            </CardDescription>
          </CardHeader>
          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden border-y border-border bg-border [&>*]:bg-card">
            <div className="p-5">
              <dt className="text-[13px] text-muted-foreground">Approved</dt>
              <dd className="tabular mt-1 text-[26px] font-semibold leading-none tracking-[-0.03em]">{approvedCount}</dd>
            </div>
            <div className="p-5">
              <dt className="text-[13px] text-muted-foreground">Rejected</dt>
              <dd className="tabular mt-1 text-[26px] font-semibold leading-none tracking-[-0.03em]">
                {Math.max(0, total - approvedCount)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-col-reverse gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={restart}>
              <RotateCcw />
              Review again
            </Button>
            <Button onClick={() => onComplete(deck)}>
              Rewrite my emails
              <ArrowRight />
            </Button>
          </div>
        </Card>
      ) : null}

      <Dialog open={!!editingSample} onOpenChange={(o) => !o && setEditingSample(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit this email</DialogTitle>
            <DialogDescription>
              Saving counts as an approval, and we use your edits as an example of how you write.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit();
            }}
          >
            <Field label="Subject">
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
            </Field>
            <Field label="Body">
              <Textarea rows={9} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingSample(null)}>
                Cancel
              </Button>
              <Button type="submit">Save and approve</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
