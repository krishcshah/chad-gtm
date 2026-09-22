"use client";

import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useMemo, useState } from "react";
import { sanitizeEmailHtml, type SanitizedEmail } from "@/lib/email-html";
import { linkifyPlainText, prepareMessageBody, type TextSegment } from "@/lib/message-body";

/** Prefer `html` (sanitized) and fall back to `text`. `inverse` is for plain text on the right-hand bubble. */
export function EmailBody({
  html,
  text,
  tone = "default",
}: {
  html?: string | null;
  text?: string | null;
  tone?: "default" | "inverse";
}) {
  const prepared = useMemo(() => prepareMessageBody({ html, text }), [html, text]);
  const [safe, setSafe] = useState<{ key: string; value: SanitizedEmail } | null>(null);

  useLayoutEffect(() => {
    if (prepared.kind !== "html") return;
    try {
      const value = sanitizeEmailHtml(prepared.html);
      setSafe(value.main.trim() || value.quoted?.trim() ? { key: prepared.html, value } : { key: prepared.html, value: { main: "", quoted: null } });
    } catch {
      setSafe({ key: prepared.html, value: { main: "", quoted: null } });
    }
  }, [prepared]);

  const htmlView = prepared.kind === "html" && safe?.key === prepared.html ? safe.value : null;
  const showHtml = Boolean(htmlView && (htmlView.main.trim() || htmlView.quoted?.trim()));
  const plainBody = prepared.body;
  const plainQuoted = prepared.quoted;

  if (showHtml && htmlView) {
    return (
      <div className="email-sheet rounded-2xl px-3.5 py-3 text-[14px] leading-relaxed shadow-sm">
        {htmlView.main.trim() ? (
          <div className="email-sheet-html" dangerouslySetInnerHTML={{ __html: htmlView.main }} />
        ) : (
          <p className="text-[13px] text-slate-700">Quoted reply hidden.</p>
        )}
        {htmlView.quoted?.trim() ? (
          <QuotedBlock tone="sheet">
            <div className="email-sheet-html" dangerouslySetInnerHTML={{ __html: htmlView.quoted }} />
          </QuotedBlock>
        ) : null}
      </div>
    );
  }

  const muted = tone === "inverse" ? "text-indigo-100" : "text-muted-foreground";
  const body = tone === "inverse" ? "text-white" : "text-foreground";

  return (
    <div className={`text-[14px] leading-relaxed ${body}`}>
      {plainBody || plainQuoted ? (
        <>
          {plainBody ? <PlainText text={plainBody} tone={tone} /> : <p className={`text-[13px] ${muted}`}>Quoted reply hidden.</p>}
          {plainQuoted ? (
            <QuotedBlock tone={tone === "inverse" ? "inverse" : "chat"}>
              <PlainText text={plainQuoted} tone={tone} muted />
            </QuotedBlock>
          ) : null}
        </>
      ) : (
        <p className={`text-[13px] ${muted}`}>This message has no body.</p>
      )}
    </div>
  );
}

function QuotedBlock({ children, tone }: { children: React.ReactNode; tone: "sheet" | "chat" | "inverse" }) {
  const [open, setOpen] = useState(false);
  const button =
    tone === "inverse"
      ? "text-blue-200 hover:bg-white/10"
      : tone === "sheet"
        ? "text-blue-800 hover:bg-slate-100"
        : "text-primary hover:bg-accent";
  const rule = tone === "inverse" ? "border-white/20" : tone === "sheet" ? "border-slate-200" : "border-border";
  return (
    <div className={`mt-2.5 border-t pt-2 ${rule}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-medium ${button}`}
      >
        <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        {open ? "Hide quoted text" : "Show quoted text"}
      </button>
      {open ? <div className="email-quoted mt-2">{children}</div> : null}
    </div>
  );
}

function PlainText({
  text,
  tone,
  muted = false,
}: {
  text: string;
  tone: "default" | "inverse";
  muted?: boolean;
}) {
  const segments = linkifyPlainText(text);
  const color =
    tone === "inverse" ? (muted ? "text-indigo-100" : "text-white") : muted ? "text-muted-foreground" : "text-foreground";
  return (
    <div className={`whitespace-pre-wrap break-words ${color}`}>
      {segments.map((seg, i) => (
        <SegmentView key={i} segment={seg} tone={tone} />
      ))}
    </div>
  );
}

function SegmentView({ segment, tone }: { segment: TextSegment; tone: "default" | "inverse" }) {
  if (segment.type === "link" && segment.href && isSafeHttp(segment.href)) {
    const link = tone === "inverse" ? "font-medium text-blue-200 underline underline-offset-2" : "font-medium text-primary underline underline-offset-2";
    return (
      <a href={segment.href} target="_blank" rel="noopener noreferrer" className={link}>
        {segment.value}
      </a>
    );
  }
  return <>{segment.value}</>;
}

function isSafeHttp(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
