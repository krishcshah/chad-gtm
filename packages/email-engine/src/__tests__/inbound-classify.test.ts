import { describe, expect, it } from "vitest";
import {
  classifyOptOut,
  detectAutoReply,
  isDeliveryStatusNotification,
  parseDsn,
  parseHeaderBlock,
} from "../inbound-classify";
import {
  eximHardBounce,
  eximPlainNoHeader,
  gmailDelayed,
  gmailHardBounce,
  outlookHardBounce,
} from "./fixtures/dsn";

function dsn(f: { fromEmail: string; subject: string; headers: string; body: string }) {
  return parseDsn({ fromEmail: f.fromEmail, subject: f.subject, headers: parseHeaderBlock(f.headers), body: f.body });
}

describe("parseHeaderBlock", () => {
  it("lowercases keys and unfolds continuation lines", () => {
    const h = parseHeaderBlock(
      'Content-Type: multipart/report; report-type=delivery-status;\r\n\tboundary="b1"\r\nPrecedence: bulk\r\n\r\nbody: not a header',
    );
    expect(h["content-type"]).toBe('multipart/report; report-type=delivery-status; boundary="b1"');
    expect(h["precedence"]).toBe("bulk");
    expect(h["body"]).toBeUndefined();
  });
  it("accepts a Buffer and empty input", () => {
    expect(parseHeaderBlock(Buffer.from("X-Autoreply: yes\r\n\r\n"))["x-autoreply"]).toBe("yes");
    expect(parseHeaderBlock(undefined)).toEqual({});
  });
});

describe("parseDsn — real-world bounces", () => {
  it("Gmail 5.1.1: recipient, status, diagnostic and original Message-ID", () => {
    const r = dsn(gmailHardBounce)!;
    expect(r).not.toBeNull();
    expect(r.recipients).toHaveLength(1);
    expect(r.recipients[0]).toMatchObject({
      email: "nobody@acme-example.com",
      status: "5.1.1",
      action: "failed",
      permanent: true,
    });
    expect(r.recipients[0]!.diagnostic).toMatch(/does not exist/);
    expect(r.originalMessageIds).toContain("<a1b2c3@pool-one.example>");
  });

  it("Outlook / Exchange 5.1.10 from postmaster", () => {
    const r = dsn(outlookHardBounce)!;
    expect(r.recipients).toEqual([
      expect.objectContaining({ email: "jane.doe@contoso-example.com", status: "5.1.10", permanent: true }),
    ]);
    expect(r.recipients[0]!.diagnostic).toMatch(/RecipientNotFound/);
    expect(r.originalMessageIds).toEqual(["<x9y8z7@pool-two.example>"]);
  });

  it("Exim (cPanel) plain-text bounce with X-Failed-Recipients", () => {
    const r = dsn(eximHardBounce)!;
    expect(r.recipients).toEqual([
      expect.objectContaining({ email: "bob@gone-example.org", status: "5.1.1", permanent: true }),
    ]);
    expect(r.originalMessageIds).toEqual(["<exim-orig-1@pool-three.example>"]);
  });

  it("Exim without X-Failed-Recipients falls back to the address list", () => {
    const r = dsn(eximPlainNoHeader)!;
    expect(r.recipients).toEqual([expect.objectContaining({ email: "carol@closed-example.com", permanent: true })]);
    expect(r.recipients[0]!.status.startsWith("5.")).toBe(true);
  });

  it("a delay notice (4.x.x, Action: delayed) is a DSN but not permanent", () => {
    const r = dsn(gmailDelayed)!;
    expect(r).not.toBeNull();
    expect(r.recipients).toEqual([
      expect.objectContaining({ email: "slow@busy-example.net", status: "4.4.7", permanent: false }),
    ]);
  });

  it("a normal human reply is not a DSN", () => {
    expect(
      parseDsn({
        fromEmail: "dana@acme-example.com",
        subject: "Re: Quick idea for Acme",
        headers: parseHeaderBlock('Content-Type: multipart/alternative; boundary="x"\r\n\r\n'),
        body: "Sounds interesting, send me a time. The following address failed: no",
      }),
    ).toBeNull();
  });

  it("a read receipt (report-type=disposition-notification) is not a DSN", () => {
    expect(
      isDeliveryStatusNotification({
        fromEmail: "dana@acme-example.com",
        subject: "Read: Quick idea",
        headers: parseHeaderBlock("Content-Type: multipart/report; report-type=disposition-notification\r\n\r\n"),
      }),
    ).toBe(false);
  });

  it("a mailer-daemon message with nothing parseable is still a DSN (never a reply)", () => {
    const r = parseDsn({ fromEmail: "MAILER-DAEMON@x.example", subject: "?", headers: {}, body: "garbled" });
    expect(r).not.toBeNull();
    expect(r!.recipients).toEqual([]);
  });
});

describe("detectAutoReply", () => {
  const h = (raw: string) => parseHeaderBlock(`${raw}\r\n\r\n`);
  it("RFC 3834 Auto-Submitted (anything but 'no')", () => {
    expect(detectAutoReply(h("Auto-Submitted: auto-replied"), "Re: hi").auto).toBe(true);
    expect(detectAutoReply(h("Auto-Submitted: auto-generated"), "Re: hi").auto).toBe(true);
    expect(detectAutoReply(h("Auto-Submitted: no"), "Re: hi").auto).toBe(false);
  });
  it("X-Autoreply / X-Autorespond", () => {
    expect(detectAutoReply(h("X-Autoreply: yes"), "Re: hi").auto).toBe(true);
    expect(detectAutoReply(h("X-Autorespond: Away"), "Re: hi").auto).toBe(true);
  });
  it("Precedence auto_reply / bulk / junk, but not list", () => {
    expect(detectAutoReply(h("Precedence: auto_reply"), "Re: hi").auto).toBe(true);
    expect(detectAutoReply(h("Precedence: bulk"), "Re: hi").auto).toBe(true);
    expect(detectAutoReply(h("Precedence: junk"), "Re: hi").auto).toBe(true);
    expect(detectAutoReply(h("Precedence: list"), "Re: hi").auto).toBe(false);
  });
  it("common out-of-office subjects", () => {
    for (const subject of [
      "Automatic reply: Quick idea for Acme",
      "Auto: Quick idea",
      "Out of Office: Re: Quick idea",
      "Autoreply: Quick idea",
      "Abwesenheitsnotiz: Quick idea",
      "Réponse automatique : Quick idea",
      "Re: Out of office until Monday",
    ]) {
      expect(detectAutoReply({}, subject).auto, subject).toBe(true);
    }
  });
  it("a normal reply is not an auto-reply", () => {
    expect(detectAutoReply(h("Content-Type: text/plain"), "Re: Quick idea for Acme")).toEqual({ auto: false });
  });
});

describe("classifyOptOut", () => {
  it("explicit opt-outs are unsubscribes", () => {
    expect(classifyOptOut("Re: hi", "Please remove me from your list.")).toBe("unsubscribe");
    expect(classifyOptOut("Re: hi", "Stop emailing me")).toBe("unsubscribe");
    expect(classifyOptOut("Re: hi", "Do not contact me again")).toBe("unsubscribe");
    expect(classifyOptOut("unsubscribe", "")).toBe("unsubscribe");
  });
  it("spam complaints are complaints", () => {
    expect(classifyOptOut("Re: hi", "This is spam. Reported.")).toBe("complaint");
    expect(classifyOptOut("Re: hi", "I'm reporting this as spam")).toBe("complaint");
  });
  it("a polite no stays per client", () => {
    expect(classifyOptOut("Re: hi", "Not interested, thanks")).toBe("not_interested");
  });
  it("positive replies are not opt-outs", () => {
    expect(classifyOptOut("Re: hi", "Sounds good, let's talk Tuesday")).toBeNull();
  });
});
