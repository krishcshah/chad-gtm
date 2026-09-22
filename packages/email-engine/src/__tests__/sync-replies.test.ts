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
