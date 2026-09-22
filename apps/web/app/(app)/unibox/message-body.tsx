"use client";

import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useMemo, useState } from "react";
import { sanitizeEmailHtml, type SanitizedEmail } from "@/lib/email-html";
import { linkifyPlainText, prepareMessageBody, type TextSegment } from "@/lib/message-body";

export function MessageBody({ html, text }: { html?: string | null; text?: string | null }) {
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

  return (
    <div className="email-sheet rounded-lg px-3.5 py-3 text-[14px] leading-relaxed">
      {showHtml && htmlView ? (
        <>
          {htmlView.main.trim() ? (
            <div className="email-sheet-html" dangerouslySetInnerHTML={{ __html: htmlView.main }} />
          ) : (
            <p className="text-[13px] text-slate-700">Quoted reply hidden.</p>
          )}
          {htmlView.quoted?.trim() ? (
            <QuotedBlock>
              <div className="email-sheet-html" dangerouslySetInnerHTML={{ __html: htmlView.quoted }} />
            </QuotedBlock>
          ) : null}
        </>
      ) : plainBody || plainQuoted ? (
        <>
          {plainBody ? <PlainText text={plainBody} /> : <p className="text-[13px] text-slate-700">Quoted reply hidden.</p>}
          {plainQuoted ? (
            <QuotedBlock>
              <PlainText text={plainQuoted} muted />
            </QuotedBlock>
          ) : null}
        </>
      ) : (
        <p className="text-[13px] text-slate-600">This message has no body.</p>
      )}
    </div>
  );
}

function QuotedBlock({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-slate-200 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-medium text-blue-800 hover:bg-slate-100"
      >
        <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        {open ? "Hide quoted text" : "Show quoted text"}
      </button>
      {open ? <div className="email-quoted mt-2">{children}</div> : null}
    </div>
  );
}

function PlainText({ text, muted = false }: { text: string; muted?: boolean }) {
  const segments = linkifyPlainText(text);
  return (
    <div className={`whitespace-pre-wrap break-words ${muted ? "text-slate-700" : "text-slate-900"}`}>
      {segments.map((seg, i) => (
        <SegmentView key={i} segment={seg} />
      ))}
    </div>
  );
}

function SegmentView({ segment }: { segment: TextSegment }) {
  if (segment.type === "link" && segment.href && isSafeHttp(segment.href)) {
    return (
      <a href={segment.href} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-800 underline underline-offset-2">
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
