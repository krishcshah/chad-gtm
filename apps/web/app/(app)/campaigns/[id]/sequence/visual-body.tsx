"use client";

import { memo, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { plainFromHtml } from "@/lib/sequence-draft";
import { escapeHtml } from "./utils";

export type VisualHandle = {
  insertText: (text: string) => void;
  command: (command: "bold" | "italic" | "insertUnorderedList") => void;
  link: (url: string) => void;
};

/**
 * Formatted email body (contentEditable). It hydrates once per `mountKey`
 * and then keeps the text in the DOM so the caret never jumps; changes are
 * reported through `onChangeRef`. Remount it (new key) to replace content.
 */
export const VisualBody = memo(
  function VisualBody({
    initialHtml,
    labelledBy,
    describedBy,
    onChangeRef,
    handleRef,
  }: {
    mountKey: string;
    initialHtml: string;
    labelledBy: string;
    describedBy?: string;
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
      const text = (el.innerText || "").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (placeholderRef.current) {
        placeholderRef.current.hidden = plainFromHtml(html).length > 0 || text.length > 0;
      }
      onChangeRef.current?.(html, text);
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
      // Hydrate once per mount. Typing stays in the DOM so the caret does not jump.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    handleRef.current = {
      insertText(text: string) {
        focusWithRange();
        const ok = document.execCommand("insertText", false, text);
        if (!ok && ref.current) ref.current.appendChild(document.createTextNode(text));
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
          document.execCommand("insertHTML", false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
        } else {
          document.execCommand("createLink", false, url);
        }
        emit();
        remember();
      },
    };

    return (
      <div className="relative">
        <p
          ref={placeholderRef}
          hidden={plainFromHtml(initialHtml).length > 0}
          className="pointer-events-none absolute left-3 top-3 text-sm text-subtle-foreground"
        >
          Hi {"{{first_name}}"}, I noticed {"{{company}}"}…
        </p>
        <div
          ref={ref}
          className="sequence-body min-h-52 px-3 py-3 text-sm leading-relaxed"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
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
