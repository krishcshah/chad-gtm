"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal, Rocket, Trash2 } from "lucide-react";
import { renderTemplate } from "@smartreach/database/template";
import { timeAgo } from "@smartreach/shared";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Kbd,
  PageHeader,
  SegmentedControl,
  Textarea,
  cn,
  toast,
} from "@smartreach/ui";
import { deleteTemplate, upsertTemplate } from "@/lib/actions";
import { AiAssistantPopover } from "@/components/ai/ai-assistant-popover";
import { Page } from "@/components/layout/page";
import { campaignHref, wordCount } from "./template-utils";
import { EMAIL_VARIABLES, HighlightedText, VariableButtons, useCaretInsert } from "./variables";

/** Sample lead used for the preview. */
const SAMPLE_VARS: Record<string, string> = {
  first_name: "Ada",
  last_name: "Lovelace",
  company: "Analytical Engines Inc",
  website: "analytical.dev",
  job_title: "Founder",
  icebreaker: "loved your recent post on compilers",
  sender_name: "Sam",
};

export interface TemplateEditorProps {
  initial?: {
    id: string;
    name: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    format: "text" | "html";
    updatedAt?: string;
  };
}

type Format = "text" | "html";
type SaveState = { kind: "idle" } | { kind: "saved"; at: Date } | { kind: "error"; message: string };

/** Editor for a single email template, with autosave and a live preview. */
export function TemplateEditor({ initial }: TemplateEditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [format, setFormat] = useState<Format>(initial?.format ?? "text");
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? "");
  const [bodyHtml, setBodyHtml] = useState(initial?.bodyHtml ?? "");
  const [templateId, setTemplateId] = useState<string | undefined>(initial?.id);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [errors, setErrors] = useState<{ name?: string; subject?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The id lives in a ref too so a save that finishes mid-typing never creates a second template.
  const idRef = useRef<string | undefined>(initial?.id);
  const snapshot = JSON.stringify([name, subject, bodyText, bodyHtml, format]);
  // What the server has. Autosave only runs when the form differs from it.
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;

  const body = format === "html" ? bodyHtml : bodyText;
  const setBody = format === "html" ? setBodyHtml : setBodyText;
  const caret = useCaretInsert(body, setBody);
  const canSave = !!name.trim() && !!subject.trim();

  const preview = useMemo(
    () => ({ subject: renderTemplate(subject, SAMPLE_VARS), body: renderTemplate(body, SAMPLE_VARS) }),
    [subject, body],
  );

  const varsUsed = useMemo(() => {
    const re = /\{\{\s*([a-zA-Z0-9_.]+)/g;
    const found = new Set<string>();
    for (const m of `${subject} ${body}`.matchAll(re)) found.add(m[1]!.toLowerCase());
    return [...found];
  }, [subject, body]);

  // Saves run one at a time. A save that starts while the first create is still in
  // flight waits for it and then updates that template instead of creating another.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const runSave = useCallback(
    async (manual: boolean) => {
      const sent = JSON.stringify([name, subject, bodyText, bodyHtml, format]);
      let res: Awaited<ReturnType<typeof upsertTemplate>>;
      try {
        res = await upsertTemplate({ id: idRef.current, name, subject, bodyText, bodyHtml, format });
      } catch {
        res = { ok: false, error: "Could not reach the server" };
      }
      if (res.ok) {
        setSavedSnapshot(sent);
        setSaveState({ kind: "saved", at: new Date() });
        setErrors({});
        const newId = res.data?.id;
        if (!idRef.current && newId) {
          idRef.current = newId;
          setTemplateId(newId);
          // Swap the URL without remounting so nothing typed in the meantime is lost.
          window.history.replaceState(null, "", `/templates/${newId}`);
        }
        if (manual) toast.success(res.message ?? "Template saved");
      } else {
        setSaveState({ kind: "error", message: res.error });
        if (res.fieldErrors) {
          setErrors({ name: res.fieldErrors.name?.[0], subject: res.fieldErrors.subject?.[0] });
        }
        if (manual) toast.error(res.error);
      }
    },
    [name, subject, bodyText, bodyHtml, format],
  );

  const save = useCallback(
    (manual: boolean) => {
      const next = saveQueue.current.then(() => runSave(manual));
      saveQueue.current = next;
      return next;
    },
    [runSave],
  );

  // Autosave (debounced) once a name and subject exist.
  useEffect(() => {
    if (!dirty || !canSave) return;
    const t = setTimeout(() => start(() => save(false)), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, savedSnapshot]);

  const saveNow = useCallback(() => {
    const next = {
      name: name.trim() ? undefined : "Give the template a name",
      subject: subject.trim() ? undefined : "Add a subject line",
    };
    setErrors(next);
    if (next.name || next.subject) return;
    start(() => save(true));
  }, [name, subject, save]);

  // Cmd/Ctrl + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);

  const onDelete = async () => {
    if (!templateId) return;
    const res = await deleteTemplate(templateId);
    if (!res.ok) {
      toast.error(res.error || "Could not delete the template");
      return;
    }
    toast.success(`Deleted “${name.trim() || "template"}”`);
    router.push("/templates");
    router.refresh();
  };

  const status = pending ? (
    <span className="text-muted-foreground">Saving…</span>
  ) : saveState.kind === "error" ? (
    <span className="text-destructive-text">Not saved: {saveState.message}</span>
  ) : dirty && !canSave ? (
    <span className="text-muted-foreground">Add a name and subject to save</span>
  ) : dirty ? (
    <span className="text-muted-foreground">Unsaved changes</span>
  ) : saveState.kind === "saved" ? (
    <span className="text-muted-foreground">Saved at {saveState.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
  ) : initial?.updatedAt ? (
    // Relative time can differ between the server render and hydration.
    <span className="text-muted-foreground" suppressHydrationWarning>
      Last saved {timeAgo(initial.updatedAt)}
    </span>
  ) : (
    <span className="text-muted-foreground">Saves automatically once it has a name and subject</span>
  );

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/templates" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            Templates
          </Link>
        }
        title={<span className="break-words">{name.trim() || (templateId ? "Untitled template" : "New email template")}</span>}
        description="A single email you can use as the first step of any campaign."
        meta={
          <p className="text-[13px]" role="status" aria-live="polite">
            {status}
          </p>
        }
        actions={
          <>
            {templateId && (
              <Button asChild variant="outline">
                <Link href={campaignHref(templateId)}>
                  <Rocket />
                  Use in campaign
                </Link>
              </Button>
            )}
            <Button onClick={saveNow} loading={pending} aria-keyshortcuts="Meta+S Control+S">
              Save template
            </Button>
            {templateId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Delete template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>
              Changes save on their own a moment after you stop typing. <Kbd>⌘S</Kbd> or <Kbd>Ctrl S</Kbd> saves
              right away.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field label="Name" required error={errors.name} hint={errors.name ? undefined : "Only you see this. It helps you find the template later."}>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                }}
                placeholder="Founder intro"
                maxLength={120}
              />
            </Field>

            <Field
              label="Subject"
              required
              error={errors.subject}
              action={
                <AiAssistantPopover
                  subject={subject}
                  bodyText={format === "html" ? bodyHtml : bodyText}
                  onApply={(improved) => {
                    setSubject(improved.subject);
                    if (format === "html") {
                      setBodyHtml(improved.bodyHtml || improved.bodyText);
                    } else {
                      setBodyText(improved.bodyText);
                    }
                  }}
                />
              }
            >
              <Input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (errors.subject) setErrors((p) => ({ ...p, subject: undefined }));
                }}
                placeholder="Quick question, {{first_name}}"
                maxLength={300}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <Field
                label="Body"
                action={
                  <SegmentedControl
                    size="sm"
                    aria-label="Body format"
                    value={format}
                    onValueChange={setFormat}
                    options={[
                      { value: "text", label: "Plain text" },
                      { value: "html", label: "HTML" },
                    ]}
                  />
                }
              >
                <Textarea
                  ref={caret.ref}
                  onSelect={caret.onSelect}
                  rows={14}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={format === "html" ? "<p>Hi {{first_name}},</p>" : 'Hi {{first_name | "there"}},\n\nI noticed {{company}}…'}
                  className={cn("min-h-[280px] resize-y", format === "html" && "font-mono text-[13px]")}
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <VariableButtons variables={EMAIL_VARIABLES} onInsert={caret.insert} />
                <span className="tabular text-xs text-subtle-foreground">
                  {wordCount(format === "html" ? preview.body.replace(/<[^>]+>/g, " ") : body).toLocaleString()} words
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:sticky lg:top-6 lg:col-span-2">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Filled in for a sample lead: {SAMPLE_VARS.first_name} {SAMPLE_VARS.last_name}, {SAMPLE_VARS.job_title} at{" "}
              {SAMPLE_VARS.company}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Subject</div>
              <p className="mt-0.5 break-words text-sm font-medium">
                {preview.subject || <span className="text-subtle-foreground">No subject yet</span>}
              </p>
              <div className="my-4 border-t border-border" />
              {format === "html" ? (
                preview.body.trim() ? (
                  <div
                    className="break-words text-sm leading-relaxed [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:list-disc"
                    dangerouslySetInnerHTML={{ __html: preview.body }}
                  />
                ) : (
                  <p className="text-sm text-subtle-foreground">Start writing to see the preview.</p>
                )
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {preview.body || <span className="text-subtle-foreground">Start writing to see the preview.</span>}
                </p>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">Variables in this email</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {varsUsed.length === 0 ? (
                  <span className="text-[13px] text-muted-foreground">
                    None yet. Try <HighlightedText text="{{first_name}}" />.
                  </span>
                ) : (
                  varsUsed.map((v) => <HighlightedText key={v} text={`{{${v}}}`} />)
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Add a fallback for leads with a missing value: <HighlightedText text={'{{first_name | "there"}}'} />. Any
                column from your lead CSV also works as a variable.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${name.trim() || "this template"}”?`}
        description="It is removed from your templates. Campaigns that already use it keep their own copy of the email."
        confirmLabel="Delete template"
        destructive
        onConfirm={onDelete}
      />
    </Page>
  );
}
