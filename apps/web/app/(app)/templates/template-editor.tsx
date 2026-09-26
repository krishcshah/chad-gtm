"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { renderTemplate } from "@smartreach/database/template";
import {
  Button,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from "@smartreach/ui";
import { upsertTemplate } from "@/lib/actions";
import { AiAssistantPopover } from "@/components/ai/ai-assistant-popover";

const SAMPLE_VARS: Record<string, string> = {
  first_name: "Ada",
  last_name: "Lovelace",
  company: "Analytical Engines Inc",
  website: "analytical.dev",
  job_title: "Founder",
  icebreaker: "loved your recent post on compilers",
};

export interface TemplateEditorProps {
  initial?: {
    id: string;
    name: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    format: "text" | "html";
  };
}

export function TemplateEditor({ initial }: TemplateEditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [format, setFormat] = useState<"text" | "html">(initial?.format ?? "text");
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? "");
  const [bodyHtml, setBodyHtml] = useState(initial?.bodyHtml ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const skipFirst = useRef(true);

  const body = format === "html" ? bodyHtml : bodyText;
  const setBody = format === "html" ? setBodyHtml : setBodyText;

  const preview = useMemo(() => {
    return {
      subject: renderTemplate(subject, SAMPLE_VARS),
      body: renderTemplate(body, SAMPLE_VARS),
    };
  }, [subject, body]);

  // Autosave (debounced) once a name + subject exist.
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (!name.trim() || !subject.trim()) return;
    const t = setTimeout(() => {
      start(async () => {
        const res = await upsertTemplate({
          id: initial?.id,
          name,
          subject,
          bodyText,
          bodyHtml,
          format,
        });
        if (res.ok) {
          setSavedAt(new Date());
          if (!initial?.id && res.data?.id) {
            router.replace(`/templates/${res.data.id}`);
          }
        }
      });
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, subject, bodyText, bodyHtml, format]);

  const varsUsed = useMemo(() => {
    const re = /\{\{\s*([a-zA-Z0-9_.]+)/g;
    const found = new Set<string>();
    for (const m of (subject + " " + body).matchAll(re)) found.add(m[1]!.toLowerCase());
    return [...found];
  }, [subject, body]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="t-name">Template name</Label>
          <Input
            id="t-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Founder outreach v1"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="t-subject">Subject</Label>
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
          </div>
          <Input
            id="t-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick question, {{first_name}}"
          />
        </div>

        <Tabs value={format} onValueChange={(v) => setFormat(v as "text" | "html")}>
          <TabsList>
            <TabsTrigger value="text">Plain text</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="mt-3">
            <Textarea
              rows={14}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={"Hi {{first_name | \"there\"}},\n\nI noticed {{company}}..."}
              className="font-mono text-sm"
            />
          </TabsContent>
          <TabsContent value="html" className="mt-3">
            <Textarea
              rows={14}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="<p>Hi {{first_name}},</p>"
              className="font-mono text-sm"
            />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            {savedAt
              ? `Saved ${savedAt.toLocaleTimeString()}`
              : "Autosaves after you stop typing"}
          </p>
          <Button
            size="sm"
            disabled={pending || !name.trim() || !subject.trim()}
            onClick={() =>
              start(async () => {
                const res = await upsertTemplate({
                  id: initial?.id,
                  name,
                  subject,
                  bodyText,
                  bodyHtml,
                  format,
                });
                if (res.ok) {
                  toast.success(res.message ?? "Saved");
                  if (!initial?.id && res.data?.id) router.push(`/templates/${res.data.id}`);
                } else toast.error(res.error);
              })
            }
          >
            {pending ? "Saving…" : "Save template"}
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Live preview</h3>
          <span className="text-xs text-muted-foreground">sample lead vars</span>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground">Subject</p>
          <p className="font-medium">{preview.subject || <span className="text-muted-foreground">—</span>}</p>
          <div className="my-4 border-t" />
          {format === "html" ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: preview.body }}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{preview.body || "Start typing to see a preview."}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Variables used</p>
          <div className="flex flex-wrap gap-1.5">
            {varsUsed.length === 0 ? (
              <span className="text-xs text-muted-foreground">None yet — try {"{{first_name}}"}</span>
            ) : (
              varsUsed.map((v) => (
                <span
                  key={v}
                  className={cn(
                    "rounded-md bg-accent px-2 py-0.5 font-mono text-[11px] text-accent-foreground",
                  )}
                >
                  {`{{${v}}}`}
                </span>
              ))
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Fallbacks: <code className="font-mono">{`{{first_name | "there"}}`}</code>. Any custom
            CSV column becomes a variable, e.g. <code className="font-mono">{`{{icebreaker}}`}</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
