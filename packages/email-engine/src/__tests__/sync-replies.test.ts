import { describe, expect, it } from "vitest";
import {
  decodeQuotedPrintable,
  decodeHtmlEntities,
  extractTextAndHtml,
  htmlToPlainText,
  prepareReplyBodies,
  stripLeakageFromBody,
} from "../sync-replies";

describe("decodeQuotedPrintable (UTF-8)", () => {
  it("decodes em-dash UTF-8 octets without latin1 mojibake", () => {
    // "Thanks — this" where — is U+2014 → UTF-8 E2 80 94 → QP =E2=80=94
    const qp = "Thanks =E2=80=94 this is a Sentinel live reply.";
    const out = decodeQuotedPrintable(qp);
    expect(out).toBe("Thanks — this is a Sentinel live reply.");
    expect(out).not.toMatch(/â|Â|ï¿½/);
  });

  it("handles soft line breaks", () => {
    expect(decodeQuotedPrintable("Hel=\r\nlo")).toBe("Hello");
    expect(decodeQuotedPrintable("Hel=\nlo")).toBe("Hello");
  });

  it("does not use String.fromCharCode latin1 path for multi-byte", () => {
    // Classic mojibake of "—" via latin1 fromCharCode would be "â\x80\x94"
    const latin1Broken = String.fromCharCode(0xe2, 0x80, 0x94);
    const fixed = decodeQuotedPrintable("=E2=80=94");
    expect(fixed).toBe("—");
    expect(fixed).not.toBe(latin1Broken);
  });
});

describe("html / text split", () => {
  it("extracts text and html parts separately", () => {
    const parts = new Map<string, Buffer>([
      ["1", Buffer.from("Plain hello from prospect", "utf8")],
      ["2", Buffer.from("<p>HTML <b>hello</b> from prospect</p>", "utf8")],
    ]);
    const { text, html } = extractTextAndHtml({ bodyParts: parts });
    expect(text).toContain("Plain hello");
    expect(html).toContain("<b>hello</b>");
    expect(text).not.toContain("<b>");
  });

  it("prepareReplyBodies stores both and snippets from plain only", () => {
    const prepared = prepareReplyBodies(
      "Plain line one",
      "<p>HTML <em>line</em></p>",
    );
    expect(prepared.bodyText).toBe("Plain line one");
    expect(prepared.bodyHtml).toContain("<em>line</em>");
    expect(prepared.snippet).toBe("Plain line one");
  });

  it("derives bodyText from html when text part missing", () => {
    const prepared = prepareReplyBodies("", "<p>Only HTML &amp; entities</p>");
    expect(prepared.bodyHtml).toContain("Only HTML");
    expect(prepared.bodyText).toMatch(/Only HTML & entities/);
    expect(prepared.snippet).not.toContain("<p>");
  });
});

describe("strip unsub / postal leakage from stored body", () => {
  it("strips staging /api/unsubscribe?token= URLs", () => {
    const raw =
      "Thanks for reaching out.\n\nhttps://staging.example.com/api/unsubscribe?token=abc.def.ghi\n";
    const cleaned = stripLeakageFromBody(raw);
    expect(cleaned).toContain("Thanks for reaching out.");
    expect(cleaned).not.toMatch(/unsubscribe\?token=/i);
  });

  it("strips angle-bracketed List-Unsubscribe URLs and plaintext Unsubscribe: lines", () => {
    const raw =
      "Hi there\n<https://app.example.com/api/unsubscribe?token=xyz>\nUnsubscribe: https://app.example.com/unsubscribe?token=xyz\n";
    const cleaned = stripLeakageFromBody(raw);
    expect(cleaned).toContain("Hi there");
    expect(cleaned).not.toMatch(/unsubscribe/i);
  });

  it("strips trailing -- physical address -- footers and data-sr blocks", () => {
    const plain = "Reply body\n\n-- physical address --\nAcme Inc\n1 Main St";
    expect(stripLeakageFromBody(plain)).toBe("Reply body");

    const html =
      '<p>Reply</p>\n<p data-sr-unsub="1"><a href="https://x/api/unsubscribe?token=t">Unsubscribe</a></p>\n<p data-sr-postal="1">1 Main</p>';
    const cleaned = stripLeakageFromBody(html);
    expect(cleaned).toContain("<p>Reply</p>");
    expect(cleaned).not.toMatch(/data-sr-/);
    expect(cleaned).not.toMatch(/unsubscribe\?token=/i);
  });

  it("prepareReplyBodies applies strip to both fields", () => {
    const prepared = prepareReplyBodies(
      "Ok https://staging.krpath/api/unsubscribe?token=tok123",
      '<div>Ok</div><p data-sr-unsub="1"><a href="https://staging.href/api/unsubscribe?token=tok123">Unsubscribe</a></p>',
    );
    expect(prepared.bodyText).not.toMatch(/token=/);
    expect(prepared.bodyHtml).not.toMatch(/token=/);
    expect(prepared.snippet).not.toMatch(/token=/);
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeHtmlEntities("A&amp;B &lt;C&gt; &#8212; &#x2014;")).toBe("A&B <C> — —");
  });
});

describe("htmlToPlainText", () => {
  it("strips tags and keeps text", () => {
    expect(htmlToPlainText("<p>Hi<br/>there</p>")).toMatch(/Hi\nthere/);
  });
});

/** Visible reply in bodyHtml, before the structured quote block Unibox collapses. */
function mainHtmlText(html: string): string {
  const at = html.search(/<div\b[^>]*\bgmail_quote\b|<blockquote\b|<div\b[^>]*\bid=["']divRplyFwdMsg["']/i);
  const head = at > 0 ? html.slice(0, at) : html;
  return htmlToPlainText(head);
}

const GMAIL_YES_TEXT = [
  "Yes?",
  "",
  "On Tue, 22 Sept 2026, 02:22 Hello1, <hello1@krishshah.work> wrote:",
  "",
  "> yoo",
  "",
].join("\n");

const GMAIL_YES_HTML = [
  '<div dir="ltr">Yes?</div><br>',
  '<div class="gmail_quote" style="margin:0px 0px 0px 0.8ex">',
  '<div class="gmail_attr">On Tue, 22 Sept 2026, 02:22 Hello1, &lt;<a href="mailto:hello1@krishshah.work">hello1@krishshah.work</a>&gt; wrote:<br></div>',
  '<blockquote class="gmail_quote"><div dir="ltr">yoo</div></blockquote>',
  "</div>",
].join("");

describe("unibox quote ingest", () => {
  it("does not treat an angle-bracket email as HTML", () => {
    const { text, html } = extractTextAndHtml({
      bodyParts: new Map<string, Buffer>([["1", Buffer.from(GMAIL_YES_TEXT, "utf8")]]),
    });
    expect(html).toBe("");
    expect(text).toContain("<hello1@krishshah.work>");
    const prepared = prepareReplyBodies(text, html);
    expect(prepared.bodyText).toBe("Yes?");
    expect(prepared.snippet).toBe("Yes?");
    expect(prepared.bodyHtml).toBe("");
  });

  it("splits a multipart BODY[TEXT] blob into plain and html instead of gluing them", () => {
    const boundary = "000000000000aabbcc";
    const qpHtml = GMAIL_YES_HTML.replace(/=/g, "=3D");
    const blob = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Yes?=E2=80=94",
      "",
      "On Tue, 22 Sept 2026, 02:22 Hello1, <hello1@krishshah.work> wrote:",
      "",
      "> yoo",
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      qpHtml,
      "",
      `--${boundary}--`,
      "",
    ].join("\n");
    const { text, html } = extractTextAndHtml({
      bodyParts: new Map<string, Buffer>([["text", Buffer.from(blob, "utf8")]]),
    });
    expect(text.startsWith("Yes?—")).toBe(true);
    expect(text).toContain("> yoo");
    expect(text).not.toContain("<div");
    expect(html.startsWith("<div")).toBe(true);
    expect(html).toContain('style="margin:0px 0px 0px 0.8ex"');
    expect(html).not.toContain("Yes?—");
    expect(html).not.toContain("> yoo");

    const prepared = prepareReplyBodies(text, html);
    expect(prepared.bodyText).toBe("Yes?—");
    expect(prepared.snippet).toBe("Yes?—");
    expect(mainHtmlText(prepared.bodyHtml)).toBe("Yes?");
    expect(prepared.bodyHtml).toContain("gmail_quote");
    expect(prepared.bodyHtml).toContain("yoo");
  });

  it("prefers leaf parts over a concatenated BODY[TEXT] blob", () => {
    const boundary = "000000000000aabbcc";
    const blob = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      GMAIL_YES_TEXT.trimEnd(),
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      GMAIL_YES_HTML,
      "",
      `--${boundary}--`,
    ].join("\n");
    const { text, html } = extractTextAndHtml({
      bodyParts: new Map<string, Buffer>([
        ["text", Buffer.from(blob, "utf8")],
        ["1", Buffer.from(GMAIL_YES_TEXT, "utf8")],
        ["2", Buffer.from(GMAIL_YES_HTML, "utf8")],
      ]),
    });
    expect(html.startsWith("<div dir=\"ltr\">Yes?</div>")).toBe(true);
    expect(html).not.toMatch(/^Yes\?/);
    expect(text).toContain("<hello1@krishshah.work>");
    const prepared = prepareReplyBodies(text, html);
    expect(prepared.bodyText).toBe("Yes?");
    expect(prepared.snippet).toBe("Yes?");
    expect(mainHtmlText(prepared.bodyHtml)).toBe("Yes?");
  });

  it("stores Gmail On-wrote and > quotes as the new reply only", () => {
    const what = [
      "What?",
      "",
      "On Tue, 22 Sept 2026, 02:00 Hello1, <hello1@krishshah.work> wrote:",
      "",
      "> YOOO",
      "",
    ].join("\n");
    const prepared = prepareReplyBodies(GMAIL_YES_TEXT, GMAIL_YES_HTML);
    expect(prepared.bodyText).toBe("Yes?");
    expect(prepared.snippet).toBe("Yes?");
    expect(mainHtmlText(prepared.bodyHtml)).toBe("Yes?");
    expect(prepared.bodyHtml).toContain("gmail_attr");
    expect(prepared.bodyHtml).toContain("mailto:hello1@krishshah.work");
    expect(prepared.bodyHtml).toContain("wrote:");
    expect(prepared.bodyText).not.toContain("yoo");

    const whatHtml = GMAIL_YES_HTML.replaceAll("Yes?", "What?").replaceAll("yoo", "YOOO").replaceAll("02:22", "02:00");
    const whatPrepared = prepareReplyBodies(what, whatHtml);
    expect(whatPrepared.bodyText).toBe("What?");
    expect(whatPrepared.snippet).toBe("What?");
    expect(mainHtmlText(whatPrepared.bodyHtml)).toBe("What?");
    expect(whatPrepared.bodyHtml).toContain("YOOO");
    expect(whatPrepared.bodyText).not.toContain("YOOO");
  });

  it("collapses the screenshot glued reply that is duplicated around the quote", () => {
    const yesGlued = "Yes? On Tue, 22 Sept 2026, 02:22 Hello1, wrote: > yoo >\nYes?";
    const whatGlued = "What? On Tue, 22 Sept 2026, 02:00 Hello1, wrote: > YOOO >\nWhat?";
    expect(prepareReplyBodies(yesGlued, "").bodyText).toBe("Yes?");
    expect(prepareReplyBodies(yesGlued, "").snippet).toBe("Yes?");
    expect(prepareReplyBodies(whatGlued, "").bodyText).toBe("What?");
    expect(prepareReplyBodies(whatGlued, "").snippet).toBe("What?");

    const dupHtml = [
      '<div dir="auto">Yes? On Tue, 22 Sept 2026, 02:22 Hello1, &lt;hello1@krishshah.work&gt; wrote:<br>&gt; yoo<br>&gt;<br>Yes?</div>',
      '<div class="gmail_quote"><div class="gmail_attr">On Tue, 22 Sept 2026, 02:22 Hello1, &lt;<a href="mailto:hello1@krishshah.work">hello1@krishshah.work</a>&gt; wrote:<br></div>',
      '<blockquote class="gmail_quote"><div dir="ltr">yoo</div></blockquote></div>',
    ].join("");
    const prepared = prepareReplyBodies("", dupHtml);
    expect(prepared.bodyText).toBe("Yes?");
    expect(prepared.snippet).toBe("Yes?");
    expect(mainHtmlText(prepared.bodyHtml)).toBe("Yes?");
    expect(mainHtmlText(prepared.bodyHtml)).not.toContain("wrote:");
    expect(prepared.bodyHtml).toContain("gmail_quote");
    expect(prepared.bodyHtml).toContain("yoo");

    const whatDup = dupHtml.replaceAll("Yes?", "What?").replaceAll("yoo", "YOOO").replaceAll("02:22", "02:00");
    const whatPrepared = prepareReplyBodies(whatGlued, whatDup);
    expect(whatPrepared.bodyText).toBe("What?");
    expect(mainHtmlText(whatPrepared.bodyHtml)).toBe("What?");
    expect(whatPrepared.bodyHtml).toContain("YOOO");
  });

  it("drops a plaintext quote preamble concatenated in front of the html part", () => {
    const dirty = `${GMAIL_YES_TEXT}\n${GMAIL_YES_HTML}`;
    const prepared = prepareReplyBodies("", dirty);
    expect(prepared.bodyText).toBe("Yes?");
    expect(prepared.bodyHtml.startsWith("<div")).toBe(true);
    expect(prepared.bodyHtml).not.toMatch(/^Yes\?/);
    expect(mainHtmlText(prepared.bodyHtml)).toBe("Yes?");
    expect(prepared.bodyHtml).toContain("yoo");
  });

  it("does not treat a normal sentence as a quote header", () => {
    const prepared = prepareReplyBodies("On purpose I wrote: this stays.", "");
    expect(prepared.bodyText).toBe("On purpose I wrote: this stays.");
    expect(prepared.snippet).toBe("On purpose I wrote: this stays.");
  });
});
