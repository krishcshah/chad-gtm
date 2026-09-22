import { describe, expect, it } from "vitest";
import {
  bubbleSide,
  buildOperatorThreadMessage,
  type UniboxThreadMessage,
} from "../unibox-thread";

describe("Prism UniboxThreadMessage contract", () => {
  it("bubbleSide: campaign+inbound left, operator right", () => {
    expect(bubbleSide("campaign")).toBe("left");
    expect(bubbleSide("inbound")).toBe("left");
    expect(bubbleSide("operator")).toBe("right");
  });

  it("buildOperatorThreadMessage matches Prism fields", () => {
    const m = buildOperatorThreadMessage({
      id: "abc",
      fromName: "Krish",
      fromEmail: "ops@example.com",
      subject: "Re: Hello",
      bodyText: "Thanks for the note",
      bodyHtml: "",
      sentAt: "2026-09-22T00:00:00.000Z",
    });
    const expectedKeys: (keyof UniboxThreadMessage)[] = [
      "id",
      "direction",
      "fromRole",
      "fromName",
      "fromEmail",
      "subject",
      "bodyHtml",
      "bodyText",
      "sentAt",
    ];
    expect(Object.keys(m).sort()).toEqual([...expectedKeys].sort());
    expect(m.direction).toBe("operator");
    expect(m.fromRole).toBe("operator");
    expect(m.id).toBe("operator:abc");
    expect(m.subject).toBe("Re: Hello");
    expect(m.bodyText).toBe("Thanks for the note");
    expect(m.sentAt).toMatch(/Z$/);
  });

  it("direction / fromRole unions are the Prism literals", () => {
    const sample: UniboxThreadMessage = {
      id: "inbound:1",
      direction: "inbound",
      fromRole: "lead",
      fromName: "Lead",
      fromEmail: "lead@x.com",
      subject: null,
      bodyHtml: "<p>hi</p>",
      bodyText: "hi",
      sentAt: "2026-09-22T00:00:00.000Z",
    };
    expect(["campaign", "inbound", "operator"]).toContain(sample.direction);
    expect(["automation", "lead", "operator"]).toContain(sample.fromRole);
  });
});
