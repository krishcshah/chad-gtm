/**
 * Browser sanitizer for Unibox HTML. DOMPurify needs a DOM, so callers
 * must run this on the client. Style tags are removed because a <style>
 * in a div applies to the whole document, not just the message.
 */
import createDOMPurify from "dompurify";
import type { Config, DOMPurify } from "dompurify";
import { classifyHttpUrl, linkifyPlainText } from "./message-body";

export interface SanitizedEmail {
  main: string;
  quoted: string | null;
}

const PURIFY_CONFIG: Config = {
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base", "link", "meta", "frame", "frameset", "style"],
  FORBID_ATTR: ["srcdoc", "formaction"],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["target", "rel"],
};

const QUOTE_SELECTOR = [
  ".gmail_quote",
  ".gmail_attr",
  "#divRplyFwdMsg",
  "#appendonsend",
  ".yahoo_quoted",
  ".moz-cite-prefix",
  "blockquote[type='cite']",
].join(", ");

const ON_WROTE = /^On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d).{0,240}\bwrote:\s*$/i;

let cached: DOMPurify | null = null;

function browserPurify(): DOMPurify | null {
  if (cached) return cached;
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const factory = createDOMPurify as unknown as (root?: Window) => DOMPurify;
  const purify = typeof factory === "function" ? factory(window) : (createDOMPurify as DOMPurify);
  if (!purify?.isSupported || typeof purify.sanitize !== "function") return null;
  installHooks(purify);
  cached = purify;
  return purify;
}

/** Drop active content before the HTML parser sees it. */
function preStrip(dirty: string): string {
  return dirty
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<base[\s\S]*?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*(?:javascript|vbscript):[^"']*\1/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:javascript|vbscript):[^\s>]*/gi, "");
}

function installHooks(purify: DOMPurify) {
  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = data.attrName.toLowerCase();
    if (name.startsWith("on")) {
      data.keepAttr = false;
      return;
    }
    if (name === "href" || name === "src" || name === "action" || name === "xlink:href") {
      const compact = data.attrValue.replace(/[\u0000-\u001F\s]+/g, "");
      if (/^(?:javascript|vbscript):/i.test(compact)) {
        data.keepAttr = false;
        return;
      }
      if (/^data:/i.test(compact) && !/^data:image\/(?:png|gif|jpe?g|webp);/i.test(compact)) {
        data.keepAttr = false;
      }
    }
  });

  purify.addHook("afterSanitizeAttributes", (node) => {
    if ((node.tagName || "").toUpperCase() !== "A") return;
    rewriteAnchor(node);
  });
}

export function sanitizeEmailHtml(dirty: string): SanitizedEmail {
  const purify = browserPurify();
  if (!purify) return { main: "", quoted: null };
  const clean = purify.sanitize(preStrip(dirty), PURIFY_CONFIG);
  const parts = partitionEmailHtml(clean);
  return { main: parts.main.trim(), quoted: parts.quoted?.trim() || null };
}

function partitionEmailHtml(cleanHtml: string): { main: string; quoted: string | null } {
  if (typeof DOMParser === "undefined") return { main: cleanHtml, quoted: null };
  const doc = new DOMParser().parseFromString(`<div id="sr-email-root">${cleanHtml}</div>`, "text/html");
  const root = doc.getElementById("sr-email-root");
  if (!root) return { main: cleanHtml, quoted: null };

  rewriteAnchors(root);
  rewriteLooseUrls(root);

  const quoted = doc.createElement("div");
  const take = (node: Node) => {
    if (!node.parentNode || quoted.contains(node)) return;
    quoted.appendChild(node);
  };

  for (const el of [...root.querySelectorAll(QUOTE_SELECTOR)]) {
    if (root.contains(el)) take(el);
  }

  for (const el of [...root.querySelectorAll("div, p, span, font")]) {
    if (!root.contains(el)) continue;
    const text = (el.textContent || "").trim();
    if (text.length > 300 || !ON_WROTE.test(text)) continue;
    let node: ChildNode | null = el;
    while (node) {
      const next: ChildNode | null = node.nextSibling;
      take(node);
      node = next;
    }
  }

  const last = [...root.children].reverse().find((el) => (el.textContent || "").trim() || el.querySelector("img"));
  if (last && last.tagName === "BLOCKQUOTE" && root.contains(last)) take(last);

  const quotedHtml = quoted.innerHTML.trim();
  return { main: root.innerHTML.trim(), quoted: quotedHtml || null };
}

function rewriteAnchors(root: HTMLElement) {
  for (const a of [...root.querySelectorAll("a")]) rewriteAnchor(a);
}

function rewriteAnchor(node: Element) {
  const href = node.getAttribute("href") || "";
  if (/^\s*(?:javascript|vbscript):/i.test(href)) node.removeAttribute("href");
  if (/^https?:/i.test(href)) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  if (typeof node.querySelector === "function" && node.querySelector("img")) return;
  const text = (node.textContent || "").trim();
  const looksLikeUrl = /^https?:\/\//i.test(text) || text.length > 96;
  const kind = classifyHttpUrl(href);
  if (kind === "unsub" && (looksLikeUrl || text.length > 40 || /^https?:/i.test(text))) {
    node.textContent = "Unsubscribe";
    return;
  }
  if (!looksLikeUrl) return;
  if (kind === "strip") {
    node.replaceWith(node.ownerDocument.createTextNode(""));
    return;
  }
  if (kind === "shorten") node.textContent = safeHost(href);
}

function rewriteLooseUrls(root: HTMLElement) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (!root.contains(node)) continue;
    if (node.parentElement?.closest("a, script, style")) continue;
    const text = node.nodeValue ?? "";
    if (!/https?:\/\//i.test(text)) continue;
    const frag = doc.createDocumentFragment();
    for (const seg of linkifyPlainText(text)) {
      if (seg.type === "link" && seg.href) {
        const a = doc.createElement("a");
        a.setAttribute("href", seg.href);
        a.textContent = seg.value;
        frag.appendChild(a);
      } else if (seg.value) {
        frag.appendChild(doc.createTextNode(seg.value));
      }
    }
    node.parentNode?.replaceChild(frag, node);
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}
