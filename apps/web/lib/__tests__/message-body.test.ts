import { describe, expect, it } from "vitest";
import { fixMojibake, linkifyPlainText, messagePreview, prepareMessageBody, resolveBubbleSide, threadDayLabel } from "../message-body";

describe("prepareMessageBody", () => {
  it("prefers html over plain text", () => {
    const prepared = prepareMessageBody({
      html: "<p>HTML body</p>",
      text: "plain body",
    });
    expect(prepared.kind).toBe("html");
    expect(prepared.html).toContain("HTML body");
    expect(prepared.preview).toContain("HTML body");
    expect(prepared.preview).not.toContain("plain body");
  });

  it("keeps plain newlines and repairs mojibake", () => {
    const prepared = prepareMessageBody({
      text: `Hello\nIt\u00e2\u20ac\u2122s a caf\u00c3\u00a9\u00c2\u00a0today`,
    });
    expect(prepared.kind).toBe("plain");
    expect(prepared.body).toContain("Hello\n");
    expect(prepared.body).toContain("It\u2019s a caf\u00e9");
    expect(prepared.body).not.toContain("\u00c3");
    expect(prepared.body).not.toContain("\u00c2");
  });

  it("leaves already-correct unicode alone", () => {
    expect(fixMojibake("It’s a café 😀")).toBe("It’s a café 😀");
  });

  it("prefers the text/html MIME part and decodes quoted-printable utf-8", () => {
    const raw = [
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="BOUND"',
      "",
      "--BOUND",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Plain caf=C3=A9",
      "",
      "--BOUND",
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<p>HTML caf=C3=A9</p>",
      "",
      "--BOUND--",
      "",
    ].join("\n");
    const prepared = prepareMessageBody({ text: raw });
    expect(prepared.kind).toBe("html");
    expect(prepared.html).toContain("HTML caf\u00e9");
    expect(prepared.html).not.toContain("Plain");
  });

  it("hides On-wrote and > quotes behind a separate block", () => {
    const prepared = prepareMessageBody({
      text: [
        "Thanks, that works.",
        "",
        "On Tue, Sep 1, 2026 at 9:00 AM Ada Lovelace <ada@example.com> wrote:",
        "> Can you review this?",
      ].join("\n"),
    });
    expect(prepared.body).toBe("Thanks, that works.");
    expect(prepared.quoted).toContain("wrote:");
    expect(prepared.quoted).toContain("> Can you review this?");
    expect(prepared.preview).not.toContain("review");
  });

  it("does not treat a normal sentence as a quote header", () => {
    const prepared = prepareMessageBody({ text: "On purpose I wrote: this stays." });
    expect(prepared.quoted).toBeNull();
    expect(prepared.body).toContain("On purpose I wrote: this stays.");
  });

  it("keeps only the new reply when a Gmail On-wrote block is on its own lines", () => {
    const prepared = prepareMessageBody({
      text: "Yes?\n\nOn Tue, 22 Sept 2026, 02:22 Hello1, wrote:\n> yoo",
    });
    expect(prepared.body).toBe("Yes?");
    expect(prepared.quoted).toContain("On Tue, 22 Sept 2026, 02:22 Hello1, wrote:");
    expect(prepared.quoted).toContain("> yoo");
    expect(prepared.body).not.toContain("wrote:");
    expect(prepared.body).not.toContain("yoo");
  });

  it("splits an inline Gmail attribution so the bubble is only the new reply", () => {
    const what = prepareMessageBody({
      text: "What? On Tue, 22 Sept 2026, 02:00 Hello1, wrote: > YOOO > What?",
    });
    expect(what.body).toBe("What?");
    expect(what.quoted).toContain("YOOO");
    expect(what.quoted).not.toMatch(/(?:^|>\s*)What\?\s*$/);
    expect(what.quoted).toContain("On Tue, 22 Sept 2026, 02:00 Hello1, wrote:");
    expect(what.quoted?.match(/YOOO/g)).toHaveLength(1);
    expect(what.body).not.toContain("YOOO");
    expect(what.body).not.toContain("wrote:");

    const yes = prepareMessageBody({
      text: "Yes? On Tue, 22 Sept 2026, 02:22 Hello1, wrote: > yoo > Yes?",
    });
    expect(yes.body).toBe("Yes?");
    expect(yes.quoted).toContain("On Tue, 22 Sept 2026, 02:22 Hello1, wrote:");
    expect(yes.quoted).toContain("yoo");
    expect(yes.body).not.toContain("yoo");
    expect(yes.body).not.toContain("wrote:");
  });

  it("drops a bare duplicate of the new reply after the quote block", () => {
    const prepared = prepareMessageBody({
      text: "Yes? On Tue, 22 Sept 2026, 02:22 Hello1, wrote: > yoo >\nYes?",
    });
    expect(prepared.body).toBe("Yes?");
    expect(prepared.quoted).toContain("> yoo");
    expect(prepared.quoted?.trim().endsWith("Yes?")).toBe(false);
  });

  it("linkifies unsubscribe urls and strips tracking footer lines", () => {
    const token = "a".repeat(50);
    const prepared = prepareMessageBody({
      text: [
        "Hello there",
        "",
        `https://example.com/unsubscribe?token=${token}`,
        `https://track.example.com/open/abc?x=${"b".repeat(40)}`,
        `See https://example.com/r?sig=${"x".repeat(80)} now`,
      ].join("\n"),
    });
    const visible = linkifyPlainText(prepared.body).map((s) => s.value).join("");
    expect(visible).not.toContain(token);
    expect(visible).not.toContain("sig=");
    expect(visible).not.toContain("track.example.com");
    expect(visible).toContain("Unsubscribe");
    expect(visible).toContain("example.com");
    const unsub = linkifyPlainText(prepared.body).find((s) => s.value === "Unsubscribe");
    expect(unsub?.href).toContain(token);
    expect(messagePreview(prepared.body)).not.toContain(token);
  });

  it("drops script text from the preview", () => {
    const prepared = prepareMessageBody({
      html: "<p>Hello</p><script>secretToken123</script>",
    });
    expect(prepared.preview).toContain("Hello");
    expect(prepared.preview).not.toContain("secretToken123");
    expect(prepared.html).toContain("<p>Hello</p>");
  });

  it("decodes entity-encoded html when tags were escaped", () => {
    const prepared = prepareMessageBody({ text: "&lt;p&gt;Hello team&lt;/p&gt;" });
    expect(prepared.kind).toBe("html");
    expect(prepared.html).toContain("<p>Hello team</p>");
  });
});

describe("resolveBubbleSide", () => {
  it("keeps automation and inbound on the left and operator replies on the right", () => {
    expect(resolveBubbleSide({ direction: "campaign", fromRole: "automation" })).toBe("left");
    expect(resolveBubbleSide({ direction: "inbound", fromRole: "lead" })).toBe("left");
    expect(resolveBubbleSide({ direction: "operator", fromRole: "operator" })).toBe("right");
  });

  it("falls back when direction is missing and leaves unknown rows on the left", () => {
    expect(resolveBubbleSide({ fromRole: "operator" })).toBe("right");
    expect(resolveBubbleSide({ folder: "operator" })).toBe("right");
    expect(resolveBubbleSide({ fromRole: "automation", isOutbound: true, folder: "sent" })).toBe("left");
    expect(resolveBubbleSide({ isOutbound: true, folder: "inbox" })).toBe("left");
    expect(resolveBubbleSide({})).toBe("left");
  });
});

describe("threadDayLabel", () => {
  it("labels today, yesterday, and older dates", () => {
    const now = new Date(2026, 8, 22, 15, 0, 0);
    expect(threadDayLabel(new Date(2026, 8, 22, 9, 0, 0).toISOString(), now)).toBe("Today");
    expect(threadDayLabel(new Date(2026, 8, 21, 18, 0, 0).toISOString(), now)).toBe("Yesterday");
    expect(threadDayLabel(new Date(2020, 0, 15, 12, 0, 0).toISOString(), now)).toMatch(/Jan 15, 2020/);
  });
});
