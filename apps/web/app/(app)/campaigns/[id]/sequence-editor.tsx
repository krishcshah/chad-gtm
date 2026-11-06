"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Bold, Eye, Italic, List, Mail, Plus, Send, Trash2, X } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Kbd,
  Label,
  SectionHeader,
  SegmentedControl,
  Separator,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@smartreach/ui";
import { previewSequenceStep, saveCampaignSequence } from "@/lib/actions";
import { AiDynamicScriptCard } from "@/components/ai/ai-dynamic-script-card";
import { AiAssistantPopover } from "@/components/ai/ai-assistant-popover";
import { ManualEmailPreviewDialog } from "@/components/email/manual-email-preview-dialog";
import {
  MAX_SEQUENCE_STEP_COUNT,
  addStep,
  addVariant,
  clampDelayDays,
  moveStep,
  payloadKey,
  plainFromHtml,
  removeStep,
  removeVariant,
  stepsFromDto,
  toSavePayload,
  validateDraft,
  type DraftStep,
  type DraftVariant,
  type StepSource,
} from "@/lib/sequence-draft";
import { LinkButton, SpinButton, VariableChips, VariablePicker } from "./sequence/insert-tools";
import { StepPreviewDialog, type PreviewData } from "./sequence/preview-dialog";
import { StepList } from "./sequence/step-list";
import { SAMPLE_LEAD, fallbackCopy, insertAt, isDenied, type Caret } from "./sequence/utils";
import { VisualBody, type VisualHandle } from "./sequence/visual-body";

const SUBJECT_MAX = 500;

/**
 * Campaign sequence editor: steps with calendar-day waits, an optional A/B
 * variant per step, subject and body (formatted + plain text), variables,
 * spins, AI helpers, previews and a single replace-all save.
 */
export function SequenceEditor({
  campaignId,
  initialSteps,
  templateName,
  hasTemplate,
}: {
  campaignId: string;
  initialSteps: StepSource[];
  templateName: string | null;
  hasTemplate: boolean;
}) {
  const [steps, setSteps] = useState<DraftStep[]>(() => stepsFromDto(initialSteps));
  const [selected, setSelected] = useState(0);
  const [variantIndex, setVariantIndex] = useState(0);
  const [savedKey, setSavedKey] = useState(() => payloadKey(toSavePayload(campaignId, stepsFromDto(initialSteps))));
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [samples, setSamples] = useState(SAMPLE_LEAD);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [manualPreviewOpen, setManualPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDenied, setPreviewDenied] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [pending, start] = useTransition();
  const [previewPending, startPreview] = useTransition();
  const [bodyMode, setBodyMode] = useState<"formatted" | "plain">("formatted");
  /** Bumped when content is replaced from outside the editor (AI), to remount the formatted body. */
  const [bodyRevision, setBodyRevision] = useState(0);

  const sectionRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [isMac, setIsMac] = useState(true);
  const subjectRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const subjectCaret = useRef<Caret>({ start: 0, end: 0 });
  const textCaret = useRef<Caret>({ start: 0, end: 0 });
  const visualRef = useRef<VisualHandle | null>(null);
  const visualChangeRef = useRef<(html: string, text: string) => void>(() => {});
  const delayId = useId();
  const bodyLabelId = useId();
  const bodyHintId = useId();
  const pauseId = useId();

  visualChangeRef.current = (html, text) => {
    const plain = text.replace(/ /g, " ").trim();
    const bodyHtml = plain.length === 0 && plainFromHtml(html).length === 0 ? "" : html;
    setSteps((prev) =>
      prev.map((item, index) => {
        if (index !== selected) return item;
        const variantAt = Math.min(variantIndex, item.variants.length - 1);
        return {
          ...item,
          variants: item.variants.map((itemVariant, vi) =>
            vi === variantAt
              ? { ...itemVariant, bodyHtml, ...(itemVariant.plainEdited ? {} : { bodyText: plain }) }
              : itemVariant,
          ),
        };
      }),
    );
  };

  const step = steps[selected] ?? null;
  const activeVariantIndex = step ? Math.min(variantIndex, step.variants.length - 1) : 0;
  const variant = step?.variants[activeVariantIndex] ?? null;
  const dirty = payloadKey(toSavePayload(campaignId, steps)) !== savedKey;
  const fallback = fallbackCopy(templateName, hasTemplate);

  const stepKey = step?.key;
  const seenStepKey = useRef(stepKey);
  useEffect(() => {
    if (seenStepKey.current === stepKey) return;
    seenStepKey.current = stepKey;
    setVariantIndex(0);
  }, [stepKey]);

  const patchStep = (index: number, patch: Partial<DraftStep>) => {
    setSteps((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const patchVariant = (index: number, patch: Partial<DraftVariant>) => {
    setSteps((prev) =>
      prev.map((item, i) =>
        i !== selected
          ? item
          : { ...item, variants: item.variants.map((v, vi) => (vi === index ? { ...v, ...patch } : v)) },
      ),
    );
  };

  const placeCaret = (el: HTMLInputElement | HTMLTextAreaElement | null, caret: Caret) => {
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret.start, caret.end);
    });
  };

  const insertSubject = (token: string) => {
    if (!variant) return;
    const next = insertAt(variant.subject, subjectCaret.current, token);
    patchVariant(activeVariantIndex, { subject: next.value });
    subjectCaret.current = next.caret;
    placeCaret(subjectRef.current, next.caret);
  };

  const insertPlain = (token: string) => {
    if (!variant) return;
    const next = insertAt(variant.bodyText, textCaret.current, token);
    patchVariant(activeVariantIndex, { bodyText: next.value, plainEdited: true });
    textCaret.current = next.caret;
    placeCaret(textRef.current, next.caret);
  };

  const insertBody = (token: string) => {
    if (bodyMode === "plain") insertPlain(token);
    else visualRef.current?.insertText(token);
  };

  const selectStep = (index: number) => {
    setSelected(index);
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const onAddStep = () => {
    const result = addStep(steps);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setSteps(result.steps);
    selectStep(result.steps.length - 1);
  };

  const onRemoveStep = () => {
    const next = removeStep(steps, selected);
    setSteps(next);
    setSelected(Math.min(selected, Math.max(0, next.length - 1)));
  };

  const onMoveStep = (direction: -1 | 1) => {
    setSteps(moveStep(steps, selected, direction));
    setSelected(selected + direction);
  };

  const onSave = () => {
    const problem = validateDraft(steps);
    if (problem) {
      setError(problem);
      setDenied(false);
      return;
    }
    const payload = toSavePayload(campaignId, steps);
    start(async () => {
      const res = await saveCampaignSequence(payload);
      if (!res.ok || !res.data) {
        const message = res.ok ? "The sequence could not be saved." : res.error;
        setDenied(isDenied(message));
        setError(message);
        return;
      }
      const next = stepsFromDto(res.data.steps);
      setSteps(next);
      setSavedKey(payloadKey(toSavePayload(campaignId, next)));
      setSelected((index) => Math.min(index, Math.max(0, next.length - 1)));
      setError(null);
      setDenied(false);
      toast.success(
        next.length === 0 ? "Sequence cleared. This campaign will send from its template." : "Sequence saved",
      );
    });
  };

  const runPreview = () => {
    if (!variant) return;
    const sampleVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(samples)) {
      if (value.trim()) sampleVars[key] = value.trim();
    }
    startPreview(async () => {
      const res = await previewSequenceStep({
        subject: variant.subject,
        bodyHtml: variant.bodyHtml,
        bodyText: variant.bodyText,
        sampleVars,
      });
      if (!res.ok || !res.data) {
        const message = res.ok ? "The preview could not be built." : res.error;
        setPreviewDenied(isDenied(message));
        setPreviewError(message);
        setPreviewData(null);
        return;
      }
      setPreviewDenied(false);
      setPreviewError(null);
      setPreviewData(res.data);
    });
  };

  // Cmd/Ctrl+S saves; leaving the page with unsaved edits asks first.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const canSave = dirty && !pending;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && sectionRef.current?.offsetParent != null) {
        if (!canSave) return;
        e.preventDefault();
        saveRef.current();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent));
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [canSave, dirty]);

  const stepTitle = selected === 0 ? "First email" : `Follow-up ${selected}`;
  const ai = Boolean(variant?.aiGenerateOnTheFly);

  return (
    <TooltipProvider delayDuration={200}>
      <section ref={sectionRef} className="flex flex-col gap-5" aria-label="Sequence editor">
        <SectionHeader
          title="Sequence"
          description="Each step waits a number of calendar days after the one before it, then sends. Add a second variant to a step to split leads evenly between two versions."
          actions={
            <span className="tabular text-[13px] text-muted-foreground">
              {steps.length} of {MAX_SEQUENCE_STEP_COUNT} steps
            </span>
          }
        />

        {denied ? (
          <Alert variant="warning">
            <AlertTitle>You do not have permission to change this sequence.</AlertTitle>
            <AlertDescription>Your edits are still on this page.</AlertDescription>
          </Alert>
        ) : error ? (
          <Alert variant="destructive">{error}</Alert>
        ) : null}

        {steps.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No sequence steps"
            description={`${fallback} Add a step to write the first email, then follow-ups that wait a few days.`}
            action={
              <Button type="button" onClick={onAddStep}>
                <Plus /> Add first step
              </Button>
            }
          />
        ) : step && variant ? (
          <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <div className="min-w-0 lg:sticky lg:top-6">
              <StepList steps={steps} selected={selected} onSelect={selectStep} onAdd={onAddStep} />
            </div>

            <div ref={editorRef} className="min-w-0 scroll-mt-20">
              <Card>
                <CardHeader
                  actions={
                    <>
                      <IconButton
                        label={`Move step ${selected + 1} earlier`}
                        disabled={selected === 0}
                        onClick={() => onMoveStep(-1)}
                      >
                        <ArrowUp />
                      </IconButton>
                      <IconButton
                        label={`Move step ${selected + 1} later`}
                        disabled={selected === steps.length - 1}
                        onClick={() => onMoveStep(1)}
                      >
                        <ArrowDown />
                      </IconButton>
                      <IconButton label={`Remove step ${selected + 1}`} onClick={() => setRemoveOpen(true)}>
                        <Trash2 />
                      </IconButton>
                    </>
                  }
                >
                  <CardTitle>{stepTitle}</CardTitle>
                  <CardDescription>
                    Step {selected + 1} of {steps.length}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={delayId}>{selected === 0 ? "Wait before sending" : "Wait after the previous step"}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={delayId}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={365}
                        value={step.delayDays}
                        aria-describedby={`${delayId}-hint`}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          patchStep(selected, { delayDays: clampDelayDays(Number.isNaN(val) ? 0 : val) });
                        }}
                        className="tabular w-24"
                      />
                      <span className="text-[13px] text-muted-foreground">calendar days</span>
                    </div>
                    <p id={`${delayId}-hint`} className="text-xs leading-relaxed text-muted-foreground">
                      {selected === 0
                        ? "0 sends in the lead’s next open sending slot."
                        : `Counted from when step ${selected} was sent to the lead.`}
                    </p>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {step.variants.length > 1 ? (
                        <SegmentedControl
                          aria-label="Variant"
                          value={variant.label}
                          onValueChange={(label) => setVariantIndex(label === "B" ? 1 : 0)}
                          options={step.variants.map((v) => ({
                            value: v.label,
                            label: (
                              <>
                                Variant {v.label}
                                {v.pausedAt ? <span className="text-subtle-foreground">Paused</span> : null}
                              </>
                            ),
                          }))}
                        />
                      ) : (
                        <p className="text-[13px] text-muted-foreground">Every lead gets this version.</p>
                      )}
                      {step.variants.length < 2 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            patchStep(selected, addVariant(step));
                            setVariantIndex(1);
                          }}
                        >
                          <Plus /> Add variant B
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            patchStep(selected, removeVariant(step, activeVariantIndex));
                            setVariantIndex(0);
                          }}
                        >
                          <X /> Remove variant {variant.label}
                        </Button>
                      )}
                    </div>
                    {step.variants.length > 1 ? (
                      <div className="flex items-center gap-3">
                        <Switch
                          id={pauseId}
                          size="sm"
                          checked={Boolean(variant.pausedAt)}
                          aria-describedby={`${pauseId}-hint`}
                          onCheckedChange={(checked) =>
                            patchVariant(activeVariantIndex, { pausedAt: checked ? new Date().toISOString() : null })
                          }
                        />
                        <div>
                          <label htmlFor={pauseId} className="cursor-pointer text-[13px] font-medium">
                            Pause variant {variant.label}
                          </label>
                          <p id={`${pauseId}-hint`} className="text-xs text-muted-foreground">
                            A paused variant stops going to new leads.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {ai ? (
                    <Alert
                      variant="info"
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => patchVariant(activeVariantIndex, { aiGenerateOnTheFly: false })}
                        >
                          Write it myself
                        </Button>
                      }
                    >
                      <AlertTitle>AI writes variant {variant.label} for each lead</AlertTitle>
                      <AlertDescription>
                        The subject and body are written when the email is sent, from the lead’s details and your
                        instructions below.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <Field
                        label="Subject"
                        error={variant.subject.length > SUBJECT_MAX ? `Keep the subject under ${SUBJECT_MAX} characters.` : undefined}
                        action={
                          <div className="flex items-center gap-2">
                            {variant.subject.length > SUBJECT_MAX * 0.8 ? (
                              <span className="tabular text-xs text-subtle-foreground">
                                {variant.subject.length}/{SUBJECT_MAX}
                              </span>
                            ) : null}
                            <VariablePicker onInsert={insertSubject} label="Variable" />
                          </div>
                        }
                      >
                        <Input
                          ref={subjectRef}
                          value={variant.subject}
                          placeholder="Quick question, {{first_name}}"
                          autoComplete="off"
                          onChange={(e) => patchVariant(activeVariantIndex, { subject: e.target.value })}
                          onSelect={(e) => {
                            const el = e.currentTarget;
                            subjectCaret.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
                          }}
                        />
                      </Field>

                      <div className="flex flex-col gap-2" role="group" aria-labelledby={bodyLabelId}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span id={bodyLabelId} className="text-[13px] font-medium leading-none">
                            Body
                          </span>
                          <SegmentedControl
                            size="sm"
                            aria-label="Body format"
                            value={bodyMode}
                            onValueChange={(mode) => {
                              if (mode === "plain" && !variant.plainEdited && variant.bodyHtml.trim()) {
                                patchVariant(activeVariantIndex, { bodyText: plainFromHtml(variant.bodyHtml) });
                              }
                              setBodyMode(mode);
                            }}
                            options={[
                              { value: "formatted", label: "Formatted" },
                              { value: "plain", label: "Plain text" },
                            ]}
                          />
                        </div>

                        <div className="overflow-hidden rounded-md border border-border-strong bg-card shadow-xs transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-ring">
                          <div
                            role="toolbar"
                            aria-label="Body tools"
                            className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1"
                          >
                            {bodyMode === "formatted" ? (
                              <>
                                <IconButton label="Bold" keepFocus onClick={() => visualRef.current?.command("bold")}>
                                  <Bold />
                                </IconButton>
                                <IconButton label="Italic" keepFocus onClick={() => visualRef.current?.command("italic")}>
                                  <Italic />
                                </IconButton>
                                <IconButton
                                  label="Bulleted list"
                                  keepFocus
                                  onClick={() => visualRef.current?.command("insertUnorderedList")}
                                >
                                  <List />
                                </IconButton>
                                <LinkButton onInsert={(url) => visualRef.current?.link(url)} />
                                <SpinButton onInsert={insertBody} />
                              </>
                            ) : (
                              <>
                                <SpinButton onInsert={insertBody} />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  className="ml-auto"
                                  onClick={() =>
                                    patchVariant(activeVariantIndex, {
                                      bodyText: plainFromHtml(variant.bodyHtml),
                                      plainEdited: false,
                                    })
                                  }
                                >
                                  Copy from formatted body
                                </Button>
                              </>
                            )}
                          </div>

                          {bodyMode === "formatted" ? (
                            <VisualBody
                              key={`${step.key}:${variant.key}:${bodyRevision}`}
                              mountKey={`${step.key}:${variant.key}:${bodyRevision}`}
                              initialHtml={variant.bodyHtml}
                              labelledBy={bodyLabelId}
                              describedBy={bodyHintId}
                              handleRef={visualRef}
                              onChangeRef={visualChangeRef}
                            />
                          ) : (
                            <Textarea
                              ref={textRef}
                              rows={10}
                              value={variant.bodyText}
                              aria-labelledby={bodyLabelId}
                              aria-describedby={bodyHintId}
                              className="rounded-none border-0 bg-transparent px-3 py-3 shadow-none hover:border-0 focus-visible:ring-0"
                              placeholder={"Hi {{first_name}},\n\nI noticed {{company}}…"}
                              onChange={(e) =>
                                patchVariant(activeVariantIndex, { bodyText: e.target.value, plainEdited: true })
                              }
                              onSelect={(e) => {
                                const el = e.currentTarget;
                                textCaret.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
                              }}
                            />
                          )}

                          <div className="border-t border-border bg-muted/40 px-3 py-2">
                            <VariableChips onInsert={insertBody} />
                          </div>
                        </div>

                        <p id={bodyHintId} className="text-xs leading-relaxed text-muted-foreground">
                          {bodyMode === "plain"
                            ? "Sent alongside the formatted body, for mail apps that cannot show formatting."
                            : "Variables like {{company}} are filled from each lead. {Hi|Hello} rotates between phrases."}
                        </p>
                      </div>
                    </>
                  )}

                  <AiDynamicScriptCard
                    enabled={variant.aiGenerateOnTheFly ?? false}
                    onEnabledChange={(enabled) => patchVariant(activeVariantIndex, { aiGenerateOnTheFly: enabled })}
                    instruction={variant.aiPrompt ?? ""}
                    onInstructionChange={(val) => patchVariant(activeVariantIndex, { aiPrompt: val })}
                    fallbackSubject={variant.subject}
                    fallbackBody={variant.bodyText}
                    campaignId={campaignId}
                  />
                </CardContent>

                <CardFooter className="flex-wrap justify-between">
                  <div>
                    {!ai ? (
                      <AiAssistantPopover
                        subject={variant.subject}
                        bodyText={variant.bodyText}
                        onApply={(improved) => {
                          patchVariant(activeVariantIndex, {
                            subject: improved.subject,
                            bodyText: improved.bodyText,
                            bodyHtml: improved.bodyHtml || `<p>${improved.bodyText.replace(/\n/g, "<br>")}</p>`,
                            plainEdited: true,
                          });
                          setBodyRevision((n) => n + 1);
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewOpen(true);
                        runPreview();
                      }}
                    >
                      <Eye /> Preview
                    </Button>
                    {!ai ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setManualPreviewOpen(true)}>
                        <Send /> Send a test
                      </Button>
                    ) : null}
                  </div>
                </CardFooter>
              </Card>
            </div>

            <ManualEmailPreviewDialog
              open={manualPreviewOpen}
              onOpenChange={setManualPreviewOpen}
              subject={variant.subject}
              bodyText={variant.bodyText}
              bodyHtml={variant.bodyHtml}
              campaignId={campaignId}
            />
            <ConfirmDialog
              open={removeOpen}
              onOpenChange={setRemoveOpen}
              destructive
              title={`Remove step ${selected + 1}?`}
              description={`“${stepTitle}” and its variants are removed from this draft. Leads are not affected until you save the sequence.`}
              confirmLabel="Remove step"
              onConfirm={onRemoveStep}
            />
          </div>
        ) : null}

        <div
          className={cn(
            "sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-popover px-4 py-3",
            dirty ? "border-border-strong shadow-lg" : "border-border shadow-xs",
          )}
        >
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
            {dirty ? <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden /> : null}
            {dirty
              ? steps.length === 0
                ? "Unsaved. Saving removes every step and sends from the template."
                : "You have unsaved changes"
              : steps.length === 0
                ? "Using the campaign template"
                : "All changes saved"}
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 text-xs text-subtle-foreground sm:flex" aria-hidden>
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>S</Kbd>
            </span>
            <Button type="button" onClick={onSave} disabled={!dirty} loading={pending}>
              {steps.length === 0 ? "Save and use template" : "Save sequence"}
            </Button>
          </div>
        </div>

        <StepPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          pending={previewPending}
          error={previewError}
          denied={previewDenied}
          data={previewData}
          stepNumber={(step ? selected : 0) + 1}
          variantLabel={variant?.label ?? "A"}
          samples={samples}
          onSamplesChange={setSamples}
          onRefresh={runPreview}
        />
      </section>
    </TooltipProvider>
  );
}

/** Icon-only button with a tooltip. `keepFocus` stops it stealing focus from the body editor. */
function IconButton({
  label,
  onClick,
  disabled,
  keepFocus,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  keepFocus?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
