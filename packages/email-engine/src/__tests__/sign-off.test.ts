import { describe, expect, it } from "vitest";
import { appendSignature, appendSignatureHtml } from "../scheduler";
import { bodyAboveSignature, joinSignature } from "../signature";
import type { SenderRow } from "../db-port";

const sender = (signature: string) => ({ signature }) as unknown as SenderRow;

describe("one sign-off per email (#66)", () => {
  it("drops the bare {{sender_name}} line when the signature starts with that name", () => {
    expect(appendSignature("Hi Sam,\n\nWorth a chat?\n\nBest,\nDana", sender("Dana Lee\nHead of Growth"))).toBe(
      "Hi Sam,\n\nWorth a chat?\n\nBest,\nDana Lee\nHead of Growth"
    );
  });

  it("matches the name case-insensitively and allows a full-name sign-off", () => {
    expect(joinSignature("Thanks,\nDana Lee\n", "dana lee | Acme")).toBe("Thanks,\ndana lee | Acme");
  });

  it("keeps the paragraph break when the name was its own paragraph", () => {
    expect(joinSignature("Worth a chat?\n\nDana", "Dana Lee")).toBe("Worth a chat?\n\nDana Lee");
  });

  it("keeps the old join when the signature does not start with the sign-off name", () => {
    expect(appendSignature("Best,\nDana", sender("Head of Growth, Acme"))).toBe("Best,\nDana\n\nHead of Growth, Acme");
    // "Dan" is not "Dana": prefix inside a word does not count.
    expect(joinSignature("Best,\nDan", "Dana Lee")).toBe("Best,\nDan\n\nDana Lee");
    // A last line that is a sentence, not a name.
    expect(joinSignature("Best,\nDana, call me", "Dana Lee")).toBe("Best,\nDana, call me\n\nDana Lee");
  });

  it("leaves the body alone without a signature, and never drops a body that is only the name", () => {
    expect(appendSignature("Best,\nDana", sender(""))).toBe("Best,\nDana");
    expect(joinSignature("Dana", "Dana Lee")).toBe("Dana\n\nDana Lee");
  });

  it("strips the warm-up marker before comparing and appending", () => {
    expect(joinSignature("Best,\nDana", "Dana Lee <!--SR_WARMUP:{\"a\":1}-->")).toBe("Best,\nDana Lee");
  });

  it("previews the same split the engine sends", () => {
    expect(bodyAboveSignature("Best,\nDana", "Dana Lee")).toEqual({ body: "Best,", separator: "\n" });
    expect(bodyAboveSignature("Best,\nDana", "")).toEqual({ body: "Best,\nDana", separator: "" });
  });

  it("removes a trailing bare name from the HTML part too", () => {
    expect(appendSignatureHtml("<p>Best,<br>Dana</p>", sender("Dana Lee"))).toBe("<p>Best,</p>\n<p>Dana Lee</p>");
    expect(appendSignatureHtml("<html><body><p>Hi</p><p>Dana</p></body></html>", sender("Dana Lee"))).toBe(
      "<html><body><p>Hi</p><p>Dana Lee</p></body></html>"
    );
    expect(appendSignatureHtml("<p>Best,<br>Dan</p>", sender("Dana Lee"))).toBe("<p>Best,<br>Dan</p>\n<p>Dana Lee</p>");
  });
});
