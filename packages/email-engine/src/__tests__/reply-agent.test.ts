import { describe, expect, it } from "vitest";
import {
  composeThreadedReply,
  decideAction,
  heuristicTriage,
  matchKnowledge,
  ungroundedUrls,
  type DecisionContext,
  type KnowledgeItem,
  type Triage,
} from "../reply-agent";

const BOOKING = "https://cal.com/acme/intro";

const KB: KnowledgeItem[] = [
  {
    id: "k1",
    kind: "resource",
    title: "Fintech case study deck",
    content: "",
    url: "https://acme.com/case-studies.pdf",
    keywords: ["case study", "deck", "references"],
  },
  {
    id: "k2",
    kind: "faq",
    title: "Pricing",
    content: "Plans start at $490/month, billed annually, with no setup fee.",
    url: null,
    keywords: ["pricing", "price", "cost", "how much"],
  },
];

function ctx(triage: Triage, over: Partial<DecisionContext> = {}): DecisionContext {
  return {
    triage,
    mode: "autopilot",
    bookingUrl: BOOKING,
    knowledge: KB,
    leadFirstName: "Dana",
    senderFirstName: "Alex",
    companyName: "Acme",
    priorAgentReplies: 0,
    ...over,
  };
}

describe("heuristicTriage", () => {
  it("detects resource requests", () => {
    const t = heuristicTriage("Re: quick idea", "Interesting. Can you send over a case study deck first?");
    expect(t.intent).toBe("resource_request");
    expect(t.requestedResource).toMatch(/case stud/);
  });

  it("detects meeting requests", () => {
    expect(heuristicTriage("Re: hi", "Sure, happy to chat. Send me a link.").intent).toBe("meeting_request");
  });

  it("detects opt-outs and auto-replies", () => {
    expect(heuristicTriage("Re: hi", "Please remove me from your list").intent).toBe("unsubscribe");
    expect(heuristicTriage("Automatic reply: Out of office", "I am out of the office until Monday").intent).toBe(
      "out_of_office",
    );
  });

  it("detects not-now and plain questions", () => {
    expect(heuristicTriage("Re: hi", "Not a priority right now, maybe next quarter.").intent).toBe("not_now");
    const q = heuristicTriage("Re: hi", "How does this work with Salesforce?");
    expect(q.intent).toBe("question");
    expect(q.question).toMatch(/Salesforce/);
  });
});

describe("matchKnowledge", () => {
  it("matches by keywords and title", () => {
    expect(matchKnowledge("case study deck", KB, ["resource"])?.id).toBe("k1");
    expect(matchKnowledge("what's the pricing?", KB, ["faq"])?.id).toBe("k2");
  });
  it("returns null without a confident match", () => {
    expect(matchKnowledge("SOC 2 report", KB)).toBeNull();
  });
});

describe("decideAction", () => {
  it("sends the booking link to interested leads", () => {
    const d = decideAction(ctx(heuristicTriage("Re: hi", "Sounds good, let's talk.")));
    expect(d.action).toBe("reply");
    if (d.action === "reply") {
      expect(d.body).toContain(BOOKING);
      expect(d.body).toContain("Dana");
      expect(d.tag).toBe("interested");
    }
  });

  it("escalates for a booking link when none is configured", () => {
    const d = decideAction(ctx(heuristicTriage("Re: hi", "Let's book a call"), { bookingUrl: null }));
    expect(d.action).toBe("escalate");
    if (d.action === "escalate") expect(d.kind).toBe("booking_url");
  });

  it("shares a known resource", () => {
    const d = decideAction(ctx(heuristicTriage("Re", "Could you share a case study deck?")));
    expect(d.action).toBe("reply");
    if (d.action === "reply") {
      expect(d.body).toContain("https://acme.com/case-studies.pdf");
      expect(d.usedKnowledgeIds).toEqual(["k1"]);
    }
  });

  it("escalates an unknown resource to the client", () => {
    const d = decideAction(ctx(heuristicTriage("Re", "Do you have a demo video I could see?")));
    expect(d.action).toBe("escalate");
    if (d.action === "escalate") {
      expect(d.kind).toBe("resource");
      expect(d.tag).toBe("interested");
    }
  });

  it("answers FAQ questions from the knowledge base", () => {
    const d = decideAction(ctx(heuristicTriage("Re", "What's the pricing like?")));
    expect(d.action).toBe("reply");
    if (d.action === "reply") expect(d.body).toContain("$490/month");
  });

  it("never replies to opt-outs or OOO", () => {
    expect(decideAction(ctx(heuristicTriage("Re", "unsubscribe"))).action).toBe("skip");
    expect(decideAction(ctx(heuristicTriage("Out of office", "I am on vacation"))).action).toBe("skip");
  });

  it("holds drafts in approve mode", () => {
    const d = decideAction(ctx(heuristicTriage("Re", "Let's talk"), { mode: "approve" }));
    expect(d.action).toBe("escalate");
    if (d.action === "escalate") {
      expect(d.kind).toBe("approval");
      expect(d.draft).toContain(BOOKING);
    }
  });

  it("blocks LLM drafts with invented links", () => {
    const triage: Triage = {
      intent: "question",
      confidence: 0.9,
      summary: "integration question",
      question: "Do you integrate with HubSpot?",
      answerable: true,
      draft: "Yes! See https://made-up.example.com/hubspot — and book here " + BOOKING,
      knowledgeIds: [],
      source: "llm",
    };
    const d = decideAction(ctx(triage));
    expect(d.action).toBe("escalate");
    if (d.action === "escalate") expect(d.kind).toBe("approval");
  });

  it("hands long threads to a human", () => {
    const d = decideAction(ctx(heuristicTriage("Re", "Let's talk"), { priorAgentReplies: 4 }));
    expect(d.action).toBe("escalate");
  });
});

describe("helpers", () => {
  it("ungroundedUrls allows booking and knowledge urls", () => {
    expect(ungroundedUrls(`see ${BOOKING} and https://acme.com/case-studies.pdf.`, [BOOKING, "https://acme.com/case-studies.pdf"])).toEqual([]);
    expect(ungroundedUrls("see https://evil.example", [BOOKING])).toEqual(["https://evil.example"]);
  });

  it("composeThreadedReply quotes the lead", () => {
    const m = composeThreadedReply({
      body: "Thanks Dana",
      priorFrom: "Dana <dana@x.com>",
      priorAt: "2026-11-01T10:00:00.000Z",
      priorText: "Send me the deck",
    });
    expect(m.text).toContain("> Send me the deck");
    expect(m.html).toContain("<blockquote");
  });
});
