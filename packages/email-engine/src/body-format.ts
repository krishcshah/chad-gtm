/**
 * Keep the text and HTML parts of a cold email in step: when a step only has
 * one format, derive the other so both carry the same words (and footer).
 */
import { htmlToPlainText } from "./sync-replies";

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text → simple HTML: paragraphs, line breaks, clickable links. */
export function plainTextToHtml(text: string): string {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>").replace(URL_RE, (u) => `<a href="${u}">${u}</a>`)}</p>`)
    .join("\n");
}

/** Fill in whichever part is missing. */
export function completeBodies(text: string, html: string): { text: string; html: string } {
  const t = (text || "").trim();
  const h = (html || "").trim();
  if (t && h) return { text: t, html: h };
  if (t) return { text: t, html: plainTextToHtml(t) };
  if (h) return { text: htmlToPlainText(h), html: h };
  return { text: "", html: "" };
}
