import { describe, expect, it } from "vitest";
import { prepareMessageBody } from "../message-body";
import { composeUniboxOutbound, formatReplyAttribution, uniboxReplyMail, type PriorOutboundMessage } from "../outbound-quote";
import { buildOperatorThreadMessage } from "../unibox-thread";

const prior: PriorOutboundMessage = {
  fromName: "Krish",
  fromEmail: "krish@example.com",
  sentAt: "2026-09-22T03:18:00.000Z",
  bodyText: "Is this the same thread?",
  bodyHtml:
    '<div>Is this the same thread?</div><div class="gmail_quote">On Mon, Sep 21, 2026 at 9:00 AM Jack wrote:<blockquote>earlier note</blockquote></div>',
};

describe("composeUniboxOutbound", () => {
  it("appends an On-wrote plain quote and a gmail_quote html block", () => {
    const outbound = composeUniboxOutbound("Hi Jack,\n\nPlease check why.", prior);
    expect(outbound.text.startsWith("Hi Jack,\n\nPlease check why.")).toBe(true);
    expect(outbound.text).toContain("On Tue, Sep 22, 2026 at 3:18 AM Krish <krish@example.com> wrote:");
    expect(outbound.text).toContain("> Is this the same thread?");
    expect(outbound.html).toContain("Hi Jack,");
    expect(outbound.html).toContain('class="gmail_quote gmail_quote_container"');
    expect(outbound.html).toContain('class="gmail_attr"');
    expect(outbound.html).toContain("<blockquote class=\"gmail_quote\"");
    expect(outbound.html).toContain("Is this the same thread?");
    expect(outbound.html).toContain("earlier note");
    expect(outbound.html.indexOf("Please check why.")).toBeLessThan(outbound.html.indexOf("gmail_quote"));
  });

  it("preserves the quoted thread in stored operator body so the UI can display quoted text", () => {
    const outbound = composeUniboxOutbound("  Sounds good.\n", prior);
    expect(outbound.storedBodyText.startsWith("Sounds good.")).toBe(true);
    expect(outbound.storedBodyText).toContain("wrote:");
    expect(outbound.storedBodyText).toContain("Is this the same thread?");
    expect(outbound.storedBodyHtml).toContain("Sounds good.");
    expect(outbound.storedBodyHtml).toContain("gmail_quote");

    const bubble = buildOperatorThreadMessage({
      id: "row-1",
      fromName: "Jack",
      fromEmail: "jack@example.com",
      subject: "Re: Hello",
      bodyText: outbound.storedBodyText,
      bodyHtml: outbound.storedBodyHtml,
      sentAt: "2026-09-22T04:00:00.000Z",
    });
    expect(bubble.bodyText).toBe(outbound.storedBodyText);
    expect(bubble.bodyHtml).toBe(outbound.storedBodyHtml);
    expect(bubble.direction).toBe("operator");

    const prepared = prepareMessageBody({ html: bubble.bodyHtml, text: bubble.bodyText });
    expect(prepared.body).toBe("Sounds good.");
    expect(prepared.quoted).toContain("Is this the same thread?");
  });

  it("folds the outbound plain part the way a quote-aware client does", () => {
    const outbound = composeUniboxOutbound("Thanks, that works.", prior);
    const prepared = prepareMessageBody({ text: outbound.text });
    expect(prepared.body).toBe("Thanks, that works.");
    expect(prepared.quoted).toContain("wrote:");
    expect(prepared.quoted).toContain("> Is this the same thread?");
    expect(prepared.body).not.toContain("thread");
  });

  it("escapes operator text and quotes a plain prior when html is missing", () => {
    const outbound = composeUniboxOutbound("Use <b>this</b> & that", {
      ...prior,
      bodyHtml: "",
      bodyText: "Line one\nLine two",
    });
    expect(outbound.html).toContain("Use &lt;b&gt;this&lt;/b&gt; &amp; that");
    expect(outbound.html).not.toContain("<b>this</b>");
    expect(outbound.text).toContain("> Line one\n> Line two");
    expect(outbound.html).toContain("Line one<br>Line two");
  });

  it("does not invent a quote block when the prior message is empty", () => {
    const outbound = composeUniboxOutbound("Only the new note", {
      ...prior,
      bodyText: "  ",
      bodyHtml: "",
    });
    expect(outbound.text).toBe("Only the new note");
    expect(outbound.html).not.toContain("gmail_quote");
    expect(outbound.storedBodyText).toBe("Only the new note");
  });

  it("does not carry Message-ID, In-Reply-To, or References in the mime builder itself", () => {
    const outbound = composeUniboxOutbound("Ack", prior);
    expect(outbound).not.toHaveProperty("messageId");
    expect(outbound).not.toHaveProperty("inReplyTo");
    expect(outbound).not.toHaveProperty("references");
    expect(outbound).not.toHaveProperty("headers");
  });
});

describe("uniboxReplyMail", () => {
  it("builds SMTP text and html from server-side prior state and stores complete thread", () => {
    const mail = uniboxReplyMail({
      to: "krish@example.com",
      subject: "Re: Hello",
      newText: "Please check why.",
      prior,
    });
    expect(Object.keys(mail).sort()).toEqual(["html", "storedBodyHtml", "storedBodyText", "subject", "text", "to"]);
    expect(mail).not.toHaveProperty("messageId");
    expect(mail).not.toHaveProperty("inReplyTo");
    expect(mail).not.toHaveProperty("references");
    expect(mail.to).toBe("krish@example.com");
    expect(mail.subject).toBe("Re: Hello");
    expect(mail.text).toContain("Please check why.");
    expect(mail.text).toContain("On Tue, Sep 22, 2026 at 3:18 AM Krish <krish@example.com> wrote:");
    expect(mail.text).toContain("> Is this the same thread?");
    expect(mail.html).toContain("gmail_quote");
    expect(mail.storedBodyText).toBe(mail.text);
    expect(mail.storedBodyHtml).toBe(mail.html);
  });
});

describe("formatReplyAttribution", () => {
  it("uses the prior sender and UTC timestamp", () => {
    expect(formatReplyAttribution(prior)).toBe(
      "On Tue, Sep 22, 2026 at 3:18 AM Krish <krish@example.com> wrote:",
    );
  });
});
