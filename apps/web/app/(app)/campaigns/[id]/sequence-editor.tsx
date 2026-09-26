"use client";

import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
} from "@smartreach/ui";
import { STANDARD_LEAD_FIELDS } from "@smartreach/shared";
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Eye,
  Italic,
  Link2,
  List,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";
import { previewSequenceStep, saveCampaignSequence } from "@/lib/actions";
import { EmailBody } from "../../unibox/message-body";
import { AiDynamicScriptCard } from "@/components/ai/ai-dynamic-script-card";
import { AiAssistantPopover } from "@/components/ai/ai-assistant-popover";
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
  waitLabel,
  type DraftStep,
  type DraftVariant,
  type StepSource,
  type StepType,
} from "@/lib/sequence-draft";

const PRIMARY_VARS = ["first_name", "last_name", "company", "email"] as const;

const SAMPLE_LEAD: Record<string, string> = {
  email: "jordan@northwind.example",
  first_name: "Jordan",
  last_name: "Lee",
  company: "Northwind",
  website: "northwind.example",
  linkedin: "linkedin.com/in/jordanlee",
  job_title: "Head of Sales",
  location: "Austin",
  phone: "+1 512 555 0148",
  industry: "Software",
};

type Caret = { start: number; end: number };

function isDenied(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

function fieldLabel(key: string): string {
  return STANDARD_LEAD_FIELDS.find((field) => field.key === key)?.label ?? key;
}

function fallbackCopy(templateName: string | null, hasTemplate: boolean): string {
  if (templateName) {
    return `With no steps saved, sends use the ${templateName} template.`;
  }
  if (hasTemplate) {
    return "With no steps saved, sends use this campaign’s template.";
  }
  return "With no steps saved, there is no template to fall back to. Add a step, or attach a template when you build the campaign.";
}

function insertAt(value: string, caret: Caret, token: string): { value: string; caret: Caret } {
  const start = Math.max(0, Math.min(caret.start, value.length));
  const end = Math.max(start, Math.min(caret.end, value.length));
  const next = value.slice(0, start) + token + value.slice(end);
  const pos = start + token.length;
  return { value: next, caret: { start: pos, end: pos } };
}

function safeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type VisualHandle = {
  insertText: (text: string) => void;
  command: (command: "bold" | "italic" | "insertUnorderedList") => void;
  link: (url: string) => void;
};

const VisualBody = memo(
  function VisualBody({
    mountKey,
    initialHtml,
    labelledBy,
    onChangeRef,
    handleRef,
  }: {
    mountKey: string;
    initialHtml: string;
    labelledBy: string;
    onChangeRef: RefObject<(html: string, text: string) => void>;
    handleRef: MutableRefObject<VisualHandle | null>;
  }) {
  const ref = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLParagraphElement>(null);
  const rangeRef = useRef<Range | null>(null);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    const text = (el.innerText || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (placeholderRef.current) {
      placeholderRef.current.hidden = plainFromHtml(html).length > 0 || text.length > 0;
    }
    onChangeRef.current(html, text);
  };

  const remember = () => {
    const sel = window.getSelection();
    const el = ref.current;
    if (!sel || !sel.rangeCount || !el) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) rangeRef.current = range.cloneRange();
  };

  const focusWithRange = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = rangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    // Hydrate once per step/variant. Typing stays in the DOM so the caret does not jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  handleRef.current = {
    insertText(text: string) {
      focusWithRange();
      const ok = document.execCommand("insertText", false, text);
      if (!ok && ref.current) {
        ref.current.appendChild(document.createTextNode(text));
      }
      emit();
      remember();
    },
    command(command) {
      focusWithRange();
      document.execCommand(command);
      emit();
      remember();
    },
    link(url: string) {
      focusWithRange();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        document.execCommand(
          "insertHTML",
          false,
          `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`,
        );
      } else {
        document.execCommand("createLink", false, url);
      }
      emit();
      remember();
    },
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border border-border bg-background/60 shadow-sm",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50",
      )}
    >
      <p
        ref={placeholderRef}
        hidden={plainFromHtml(initialHtml).length > 0}
        className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground/80"
      >
        Hi {"{{first_name}}"}, I noticed {"{{company}}"}…
      </p>
      <div
        ref={ref}
        className="sequence-body min-h-48 px-3 py-2 text-sm"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelledBy}
        suppressContentEditableWarning
        onInput={emit}
        onKeyUp={remember}
        onMouseUp={remember}
        onBlur={remember}
      />
    </div>
  );
  },
  (prev, next) => prev.mountKey === next.mountKey,
);

function VarChips({
  onInsert,
  idPrefix,
}: {
  onInsert: (token: string) => void;
  idPrefix: string;
}) {
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const customId = `${idPrefix}-custom-var`;

  const insertCustom = () => {
    const key = custom.trim();
    if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(key)) {
      setCustomError("Use letters, numbers, dots, or underscores. Start with a letter.");
      return;
    }
    setCustomError(null);
    onInsert(`{{${key}}}`);
    setCustom("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRIMARY_VARS.map((key) => (
        <button
          key={key}
          type="button"
          className="rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onInsert(`{{${key}}}`)}
        >
          {`{{${key}}}`}
          <span className="sr-only">, {fieldLabel(key)}</span>
        </button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            More variables
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <p className="text-sm font-medium">Merge variables</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lead columns become {"{{variables}}"}. Fallbacks look like {"{{first_name | \"there\"}}"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STANDARD_LEAD_FIELDS.map((field) => (
              <button
                key={field.key}
                type="button"
                className="rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onInsert(`{{${field.key}}}`)}
              >
                {`{{${field.key}}}`}
                <span className="sr-only">, {field.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <Label htmlFor={customId}>Custom column</Label>
            <div className="flex gap-2">
              <Input
                id={customId}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="icebreaker"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    insertCustom();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={insertCustom}>
                Insert
              </Button>
            </div>
            {customError ? (
              <p role="alert" className="text-xs text-destructive">
                {customError}
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SpinButton({ onInsert }: { onInsert: (token: string) => void }) {
  const [a, setA] = useState("Hi");
  const [b, setB] = useState("Hello");
  const [open, setOpen] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);
  const aId = useId();
  const bId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="Insert spin">
          {"{a|b}"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="text-sm font-medium">Insert a spin</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {"{Hi|Hello}"} picks one phrase when the email is prepared. Preview shows one option.
        </p>
        <div className="mt-3 space-y-2">
          <Label htmlFor={aId}>Option A</Label>
          <Input id={aId} value={a} onChange={(e) => setA(e.target.value)} />
          <Label htmlFor={bId}>Option B</Label>
          <Input id={bId} value={b} onChange={(e) => setB(e.target.value)} />
          {spinError ? (
            <p role="alert" className="text-xs text-destructive">
              {spinError}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const left = a.replace(/[{}|]/g, "").trim();
              const right = b.replace(/[{}|]/g, "").trim();
              if (!left || !right) {
                setSpinError("Enter two different phrases.");
                return;
              }
              setSpinError(null);
              onInsert(`{${left}|${right}}`);
              setOpen(false);
            }}
          >
            Insert spin
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  const [status, setStatus] = useState<string | null>(null);
  const [removeArmed, setRemoveArmed] = useState(false);
  const [samples, setSamples] = useState(SAMPLE_LEAD);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDenied, setPreviewDenied] = useState(false);
  const [previewData, setPreviewData] = useState<{
    subject: string;
    bodyHtml: string;
    bodyText: string;
  } | null>(null);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [previewPending, startPreview] = useTransition();
  const [bodyMode, setBodyMode] = useState<"formatted" | "plain">("formatted");

  const subjectRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const subjectCaret = useRef<Caret>({ start: 0, end: 0 });
  const textCaret = useRef<Caret>({ start: 0, end: 0 });
  const visualRef = useRef<VisualHandle | null>(null);
  const visualChangeRef = useRef<(html: string, text: string) => void>(() => {});
  const delayId = useId();
  const typeId = useId();
  const subjectId = useId();
  const bodyLabelId = useId();
  const plainId = useId();
  const pauseId = useId();

  visualChangeRef.current = (html, text) => {
    const plain = text.replace(/\u00a0/g, " ").trim();
    const bodyHtml = plain.length === 0 && plainFromHtml(html).length === 0 ? "" : html;
    setSteps((prev) =>
      prev.map((item, index) => {
        if (index !== selected) return item;
        const variantAt = Math.min(variantIndex, item.variants.length - 1);
        return {
          ...item,
          variants: item.variants.map((itemVariant, vi) =>
            vi === variantAt
              ? {
                  ...itemVariant,
                  bodyHtml,
                  ...(itemVariant.plainEdited ? {} : { bodyText: plain }),
                }
              : itemVariant,
          ),
        };
      }),
    );
    setStatus(null);
  };

  const step = steps[selected] ?? null;
  const variant = step?.variants[Math.min(variantIndex, (step?.variants.length ?? 1) - 1)] ?? null;
  const activeVariantIndex = step ? Math.min(variantIndex, step.variants.length - 1) : 0;
  const dirty = payloadKey(toSavePayload(campaignId, steps)) !== savedKey;
  const atMax = steps.length >= MAX_SEQUENCE_STEP_COUNT;
  const fallback = fallbackCopy(templateName, hasTemplate);

  const stepKey = step?.key;
  const seenStepKey = useRef(stepKey);
  useEffect(() => {
    if (seenStepKey.current === stepKey) return;
    seenStepKey.current = stepKey;
    setVariantIndex(0);
    setRemoveArmed(false);
  }, [stepKey]);

  const patchStep = (index: number, patch: Partial<DraftStep>) => {
    setSteps((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setStatus(null);
  };

  const patchVariant = (index: number, patch: Partial<DraftVariant>) => {
    setSteps((prev) =>
      prev.map((item, i) => {
        if (i !== selected) return item;
        return {
          ...item,
          variants: item.variants.map((v, vi) => (vi === index ? { ...v, ...patch } : v)),
        };
      }),
    );
    setStatus(null);
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
    const plainFocused = document.activeElement === textRef.current;
    if (plainFocused) insertPlain(token);
    else visualRef.current?.insertText(token);
  };

  const onAddStep = () => {
    const result = addStep(steps);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setSteps(result.steps);
    setSelected(result.steps.length - 1);
    setStatus(null);
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
        setStatus(null);
        return;
      }
      const next = stepsFromDto(res.data.steps);
      setSteps(next);
      setSavedKey(payloadKey(toSavePayload(campaignId, next)));
      setSelected((index) => Math.min(index, Math.max(0, next.length - 1)));
      setError(null);
      setDenied(false);
      setStatus(
        next.length === 0
          ? "Sequence cleared. This campaign will send from its template."
          : "Sequence saved.",
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
        const message = res.ok ? "Preview could not be built." : res.error;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight">Sequence</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each step waits a number of calendar days, then sends variant A, or an equal A/B split.
            {" "}
            {fallback}
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {steps.length} / {MAX_SEQUENCE_STEP_COUNT} steps
        </p>
      </div>

      {denied ? (
        <Alert variant="warning">
          You do not have permission to change this sequence. Your edits are still on this page.
        </Alert>
      ) : error ? (
        <Alert variant="destructive">{error}</Alert>
      ) : null}
      {status ? (
        <p role="status" className="text-sm text-success-foreground">
          {status}
        </p>
      ) : null}

      {steps.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No sequence steps"
          description={`${fallback} Add a step to write the first email, then follow-ups after a calendar-day wait. Two variants on a step send at an equal split.`}
          action={
            <Button type="button" size="sm" onClick={onAddStep}>
              <Plus /> Add first step
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Steps</h3>
              <Button type="button" size="sm" variant="outline" onClick={onAddStep} disabled={atMax}>
                <Plus /> Add
              </Button>
            </div>
            {atMax ? (
              <p className="text-xs text-muted-foreground">
                {MAX_SEQUENCE_STEP_COUNT} steps is the maximum.
              </p>
            ) : null}
            <ol aria-label="Sequence steps" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {steps.map((item, index) => {
                const current = index === selected;
                const subject = item.variants[0]?.subject?.trim() || "No subject";
                return (
                  <li key={item.key} className="min-w-[13rem] shrink-0 lg:min-w-0">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-current={current ? "step" : undefined}
                      onClick={() => setSelected(index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(index);
                        }
                      }}
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        current
                          ? "border-primary/40 bg-accent text-accent-foreground shadow-xs"
                          : "border-border bg-card hover:bg-accent/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                          {index === 0 ? "Initial" : `Follow-up ${index}`}
                        </span>
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Step {index + 1}
                        </span>
                      </div>

                      {index === 0 ? (
                        <span className="text-xs text-muted-foreground">Sends immediately</span>
                      ) : (
                        <div
                          className="flex items-center gap-1.5 text-xs text-muted-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>Wait</span>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            aria-label={`Step ${index + 1} wait days`}
                            value={item.delayDays}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              patchStep(index, {
                                delayDays: clampDelayDays(Number.isNaN(val) ? 0 : val),
                              });
                            }}
                            className="w-12 rounded border border-border bg-background px-1.5 py-0.5 text-center font-mono text-xs text-foreground focus:ring-1 focus:ring-primary"
                          />
                          <span>days</span>
                        </div>
                      )}

                      <span className="truncate text-xs font-medium text-foreground/90">{subject}</span>

                      <div
                        className="mt-1 flex items-center justify-between gap-1 border-t border-border/40 pt-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          {item.variants.map((v, vi) => (
                            <button
                              key={v.key}
                              type="button"
                              onClick={() => {
                                setSelected(index);
                                setVariantIndex(vi);
                              }}
                              className={cn(
                                "h-5 rounded px-2 text-[10px] font-medium transition-colors",
                                current && vi === activeVariantIndex
                                  ? "bg-primary text-primary-foreground font-semibold"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80",
                              )}
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                        {item.variants.length < 2 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(index);
                              patchStep(index, addVariant(item));
                              setVariantIndex(1);
                            }}
                            className="flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" /> A/B
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(index);
                              patchStep(index, removeVariant(item, 1));
                              setVariantIndex(0);
                            }}
                            className="text-[10px] font-medium text-destructive hover:underline"
                          >
                            Remove B
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {step && variant ? (
            <div className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">Step {selected + 1}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selected === 0
                      ? "Calendar days before the first email. 0 sends on the lead’s next open slot."
                      : "Calendar days after the previous step is sent."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move step ${selected + 1} earlier`}
                    disabled={selected === 0}
                    onClick={() => {
                      setSteps(moveStep(steps, selected, -1));
                      setSelected(selected - 1);
                    }}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move step ${selected + 1} later`}
                    disabled={selected === steps.length - 1}
                    onClick={() => {
                      setSteps(moveStep(steps, selected, 1));
                      setSelected(selected + 1);
                    }}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (!removeArmed) {
                        setRemoveArmed(true);
                        return;
                      }
                      const next = removeStep(steps, selected);
                      setSteps(next);
                      setSelected(Math.min(selected, Math.max(0, next.length - 1)));
                      setRemoveArmed(false);
                    }}
                  >
                    <Trash2 /> {removeArmed ? "Confirm remove" : "Remove"}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    {selected === 0 ? "Initial Email" : `Follow-up ${selected}`}
                  </span>
                  {step.variants.length > 1 && (
                    <Badge variant="outline" className="text-xs">
                      Variant {variant.label}
                    </Badge>
                  )}
                  {variant.pausedAt && (
                    <Badge variant="secondary" className="text-xs text-amber-500">
                      Paused
                    </Badge>
                  )}
                </div>
                {step.variants.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id={pauseId}
                      checked={Boolean(variant.pausedAt)}
                      aria-label={`Pause variant ${variant.label}`}
                      onCheckedChange={(checked) =>
                        patchVariant(activeVariantIndex, {
                          pausedAt: checked ? new Date().toISOString() : null,
                        })
                      }
                    />
                    <Label htmlFor={pauseId} className="text-xs text-muted-foreground">
                      Pause variant {variant.label}
                    </Label>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={subjectId}>Subject</Label>
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
                      }}
                    />
                  </div>
                  <span className={cn("text-xs tabular-nums", variant.subject.length > 500 ? "text-destructive" : "text-muted-foreground")}>
                    {variant.subject.length}/500
                  </span>
                </div>
                <Input
                  ref={subjectRef}
                  id={subjectId}
                  value={variant.subject}
                  placeholder="Quick question, {{first_name}}"
                  onChange={(e) => patchVariant(activeVariantIndex, { subject: e.target.value })}
                  onSelect={(e) => {
                    const el = e.currentTarget;
                    subjectCaret.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
                  }}
                />
                <VarChips idPrefix={`${subjectId}-vars`} onInsert={insertSubject} />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p id={bodyLabelId} className="text-sm font-medium">
                    {bodyMode === "formatted" ? "Formatted body" : "Plain-text version"}
                  </p>
                  {bodyMode === "formatted" ? (
                    <div role="toolbar" aria-label="Body formatting" className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Bold"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => visualRef.current?.command("bold")}
                      >
                        <Bold />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Italic"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => visualRef.current?.command("italic")}
                      >
                        <Italic />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Bulleted list"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => visualRef.current?.command("insertUnorderedList")}
                      >
                        <List />
                      </Button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Insert link"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <Link2 />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72">
                          <Label htmlFor={`${bodyLabelId}-link`}>Link URL</Label>
                          <Input
                            id={`${bodyLabelId}-link`}
                            className="mt-2"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            placeholder="https://"
                          />
                          {linkError ? (
                            <p role="alert" className="mt-2 text-xs text-destructive">
                              {linkError}
                            </p>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            className="mt-3"
                            onClick={() => {
                              const url = safeUrl(linkUrl);
                              if (!url) {
                                setLinkError("Enter an http, https, or mailto link.");
                                return;
                              }
                              setLinkError(null);
                              visualRef.current?.link(url);
                            }}
                          >
                            Add link
                          </Button>
                        </PopoverContent>
                      </Popover>
                      <SpinButton onInsert={(token) => visualRef.current?.insertText(token)} />
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        patchVariant(activeVariantIndex, {
                          bodyText: plainFromHtml(variant.bodyHtml),
                          plainEdited: false,
                        })
                      }
                    >
                      Match formatted body
                    </Button>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-background shadow-xs focus-within:ring-2 focus-within:ring-ring">
                  {bodyMode === "formatted" ? (
                    <div className="p-1">
                      <VisualBody
                        key={`${step.key}:${variant.key}`}
                        mountKey={`${step.key}:${variant.key}`}
                        initialHtml={variant.bodyHtml}
                        labelledBy={bodyLabelId}
                        handleRef={visualRef}
                        onChangeRef={visualChangeRef}
                      />
                    </div>
                  ) : (
                    <Textarea
                      ref={textRef}
                      id={plainId}
                      rows={8}
                      value={variant.bodyText}
                      className="w-full border-0 bg-transparent p-4 font-mono text-sm shadow-none focus-visible:ring-0"
                      placeholder={"Hi {{first_name}},\n\nI noticed {{company}}."}
                      onChange={(e) =>
                        patchVariant(activeVariantIndex, { bodyText: e.target.value, plainEdited: true })
                      }
                      onSelect={(e) => {
                        const el = e.currentTarget;
                        textCaret.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
                      }}
                    />
                  )}

                  {/* Single compose footer with VarChips and bottom-right Formatted / Plain text toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-3 py-2">
                    <VarChips idPrefix={`${bodyLabelId}-vars`} onInsert={insertBody} />
                    <div className="flex items-center rounded-md border border-border bg-background p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setBodyMode("formatted")}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                          bodyMode === "formatted"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Formatted
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!variant.plainEdited && variant.bodyHtml.trim()) {
                            patchVariant(activeVariantIndex, {
                              bodyText: plainFromHtml(variant.bodyHtml),
                            });
                          }
                          setBodyMode("plain");
                        }}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                          bodyMode === "plain"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Plain text
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Type {"{Hi|Hello}"} in the body to rotate a phrase. Variables use {"{{company}}"}.
                </p>
              </div>

              {/* AI Dynamic Scripts on the Fly */}
              <AiDynamicScriptCard
                enabled={variant.aiGenerateOnTheFly ?? false}
                onEnabledChange={(enabled) =>
                  patchVariant(activeVariantIndex, { aiGenerateOnTheFly: enabled })
                }
                instruction={variant.aiPrompt ?? ""}
                onInstructionChange={(val) =>
                  patchVariant(activeVariantIndex, { aiPrompt: val })
                }
                fallbackSubject={variant.subject}
                fallbackBody={variant.bodyText}
                campaignId={campaignId}
              />

              <details className="rounded-lg border border-border bg-background/40 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">Sample lead for preview</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {STANDARD_LEAD_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={`sample-${field.key}`}>{field.label}</Label>
                      <Input
                        id={`sample-${field.key}`}
                        value={samples[field.key] ?? ""}
                        onChange={(e) => setSamples((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </details>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPreviewOpen(true);
                    runPreview();
                  }}
                  disabled={previewPending}
                >
                  <Eye /> {previewPending ? "Building preview…" : "Preview step"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {dirty
            ? steps.length === 0
              ? "Unsaved. Saving clears the sequence and uses the template."
              : "Unsaved changes"
            : steps.length === 0
              ? "Using the campaign template"
              : "All changes saved"}
        </p>
        <Button type="button" onClick={onSave} disabled={!dirty || pending}>
          {pending ? "Saving…" : steps.length === 0 ? "Save and use template" : "Save sequence"}
        </Button>
      </div>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        pending={previewPending}
        error={previewError}
        denied={previewDenied}
        data={previewData}
        stepNumber={(step ? selected : 0) + 1}
        variantLabel={variant?.label ?? "A"}
        onRefresh={runPreview}
      />
    </div>
  );
}

function PreviewDialog({
  open,
  onOpenChange,
  pending,
  error,
  denied,
  data,
  stepNumber,
  variantLabel,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: string | null;
  denied: boolean;
  data: { subject: string; bodyHtml: string; bodyText: string } | null;
  stepNumber: number;
  variantLabel: string;
  onRefresh: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Preview step {stepNumber} · Variant {variantLabel}
          </DialogTitle>
          <DialogDescription>
            Variables and spins are filled the way a send is prepared. Each refresh can pick a different spin.
          </DialogDescription>
        </DialogHeader>
        {denied ? (
          <Alert variant="warning">You do not have permission to preview this step.</Alert>
        ) : null}
        {error && !denied ? <Alert variant="destructive">{error}</Alert> : null}
        {pending ? <p className="text-sm text-muted-foreground">Building preview…</p> : null}
        {data ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Subject</p>
              <p className="font-medium">{data.subject || "Empty subject"}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Formatted body</p>
              {data.bodyHtml.trim() ? (
                <EmailBody html={data.bodyHtml} text={data.bodyText} />
              ) : (
                <p className="text-sm text-muted-foreground">No formatted body. The plain-text version is what sends.</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Plain text</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {data.bodyText.trim() ? data.bodyText : "Empty plain-text body."}
              </p>
            </div>
          </div>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={pending}>
          Refresh preview
        </Button>
      </DialogContent>
    </Dialog>
  );
}
