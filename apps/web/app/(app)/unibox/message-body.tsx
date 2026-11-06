"use client";

import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useMemo, useState } from "react";
import { cn } from "@smartreach/ui";
import { sanitizeEmailHtml, type SanitizedEmail } from "@/lib/email-html";
import { linkifyPlainText, prepareMessageBody, type TextSegment } from "@/lib/message-body";

/**
 * Renders an email body. HTML is sanitised with DOMPurify (sanitizeEmailHtml)
 * and shown on the paper-white `.email-sheet`, because senders' HTML assumes a
 * light background. Plain text falls back to app typography with linkified
 * URLs. Quoted history is collapsed behind a toggle.
 *
 * `tone="inverse"` is kept for older callers; it renders like the default.
 */
export function EmailBody({
  html,
  text,
  tone: _tone = "default",
  className,
}: {
  html?: string | null;
  text?: string | null;
  tone?: "default" | "inverse";
  className?: string;
}) {
  const prepared = useMemo(() => prepareMessageBody({ html, text }), [html, text]);
  const [safe, setSafe] = useState<{ key: string; value: SanitizedEmail } | null>(null);

  // DOMPurify needs the DOM, so sanitising happens on the client before paint.
  useLayoutEffect(() => {
    if (prepared.kind !== "html") return;
    try {
      const value = sanitizeEmailHtml(prepared.html);
      setSafe({
        key: prepared.html,
        value: value.main.trim() || value.quoted?.trim() ? value : { main: "", quoted: null },
      });
    } catch {
      setSafe({ key: prepared.html, value: { main: "", quoted: null } });
    }
  }, [prepared]);

  const htmlView = prepared.kind === "html" && safe?.key === prepared.html ? safe.value : null;
  const showHtml = Boolean(htmlView && (htmlView.main.trim() || htmlView.quoted?.trim()));

  if (showHtml && htmlView) {
    return (
      <div className={cn("email-sheet px-4 py-3.5 text-sm leading-relaxed", className)}>
        {htmlView.main.trim() ? (
          <div className="email-sheet-html" dangerouslySetInnerHTML={{ __html: htmlView.main }} />
        ) : (
          <p className="email-quoted text-[13px]">Only quoted text in this message.</p>
        )}
        {htmlView.quoted?.trim() ? (
          <QuotedBlock onSheet>
            <div className="email-sheet-html" dangerouslySetInnerHTML={{ __html: htmlView.quoted }} />
          </QuotedBlock>
        ) : null}
      </div>
    );
  }

  const body = prepared.body;
  const quoted = prepared.quoted;

  return (
    <div className={cn("text-sm leading-relaxed text-foreground", className)}>
      {body || quoted ? (
        <>
          {body ? (
            <PlainText text={body} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Only quoted text in this message.</p>
          )}
          {quoted ? (
            <QuotedBlock>
              <PlainText text={quoted} muted />
            </QuotedBlock>
          ) : null}
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">This message has no text.</p>
      )}
    </div>
  );
}

function QuotedBlock({ children, onSheet = false }: { children: React.ReactNode; onSheet?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("mt-3 border-t pt-2", onSheet ? "border-current/15" : "border-border")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
          onSheet ? "email-quoted hover:underline" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden />
        {open ? "Hide quoted text" : "Show quoted text"}
      </button>
      {open ? <div className="email-quoted mt-2">{children}</div> : null}
    </div>
  );
}

function PlainText({ text, muted = false }: { text: string; muted?: boolean }) {
  const segments = linkifyPlainText(text);
  return (
    <div className={cn("whitespace-pre-wrap break-words", muted ? "text-muted-foreground" : "text-foreground")}>
      {segments.map((seg, i) => (
        <SegmentView key={i} segment={seg} />
      ))}
    </div>
  );
}

function SegmentView({ segment }: { segment: TextSegment }) {
  if (segment.type === "link" && segment.href && isSafeHttp(segment.href)) {
    return (
      <a
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-foreground underline decoration-border-strong underline-offset-2 hover:decoration-foreground"
      >
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
