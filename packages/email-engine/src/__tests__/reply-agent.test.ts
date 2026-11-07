import { describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import {
  composeThreadedReply,
  decideAction,
  extractReferralEmail,
  heuristicTriage,
  matchKnowledge,
  RecipientSuppressedError,
  replyAgentTick,
  sendAgentReply,
  ungroundedUrls,
  type DecisionContext,
  type KnowledgeItem,
  type Triage,
} from "../reply-agent";
import { conversationDb } from "./fixtures/conversation-db";

describe("sendAgentReply never emails a suppressed recipient", () => {
  const reply = {
    id: "r-supp",
    leadId: "l1",
    campaignId: "c1",
    fromEmail: "dana@acme-example.com",
    fromName: "Dana",
    subject: "Re: idea",
    bodyText: "What does it cost?",
    receivedAt: "2026-11-06T11:00:00.000Z",
    messageId: "<in@acme-example.com>",
  };
  const sender = { id: "s1", userId: "admin", email: "alex@pool.example", status: "active", deletedAt: null, isSystemPool: true };

  it("throws RecipientSuppressedError for another user's unsubscribe, before SMTP", async () => {
    const { db, writes } = conversationDb(
      new Map<unknown, any>([
        [schema.suppressions, () => [{ value: "dana@acme-example.com", userId: "someone-else", source: "unsubscribe" }]],
      ]),
    );
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out@pool.example>" });
    await expect(
      sendAgentReply(db, {
        reply,
        sender: sender as any,
        ownerId: "u1",
        workspaceId: "w1",
        body: "Plans start at $490/month.",
        nowIso: "2026-11-06T12:00:00.000Z",
        deps: { sendMail },
      }),
    ).rejects.toBeInstanceOf(RecipientSuppressedError);
    expect(sendMail).not.toHaveBeenCalled();
    expect(writes.filter((w) => w.table === schema.uniboxMessages)).toEqual([]);
  });

  it("sends when nothing applies (another user's manual block)", async () => {
    const { db } = conversationDb(
      new Map<unknown, any>([
        [schema.suppressions, () => [{ value: "dana@acme-example.com", userId: "someone-else", source: "manual" }]],
      ]),
    );
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out@pool.example>" });
    await sendAgentReply(db, {
      reply,
      sender: sender as any,
      ownerId: "u1",
      workspaceId: "w1",
      body: "Plans start at $490/month.",
      nowIso: "2026-11-06T12:00:00.000Z",
      deps: { sendMail },
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});

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

  it("an opt-out skip says no reply was sent, without claiming a block decideAction can't write", () => {
    for (const intent of ["unsubscribe", "not_interested"] as const) {
      const d = decideAction(ctx({ intent, confidence: 0.9, summary: "opt-out", source: "llm" }));
      expect(d).toEqual({ action: "skip", summary: "Lead opted out, so no reply was sent.", tag: "not_interested" });
      expect(d.summary).not.toMatch(/suppress/i);
    }
  });

  it("never replies to opt-outs or OOO", () => {
    expect(decideAction(ctx(heuristicTriage("Re", "unsubscribe"))).action).toBe("skip");
    expect(decideAction(ctx(heuristicTriage("Out of office", "I am on vacation"))).action).toBe("skip");
  });

  it("an out-of-office skip says no answer was sent, without claiming anything about the sequence", () => {
    const d = decideAction(ctx(heuristicTriage("Out of office", "I am on vacation")));
    expect(d).toMatchObject({ action: "skip", tag: "out_of_office", summary: "Out-of-office reply; no answer sent." });
    expect(d.summary).not.toMatch(/sequence/i);
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
    expect(d).toMatchObject({
      action: "escalate",
      kind: "handoff",
      title: "Conversation handed to you",
      question: "The agent has replied 4 times in this conversation, so it's handing it to you.",
      summary: "Reply limit reached: handed to you.",
    });
    // What the agent would have said (the booking link for an interested lead) is the draft.
    if (d.action === "escalate") expect(d.draft).toContain(BOOKING);
  });

  it("past the reply limit, an escalation's draft is kept and its kind becomes handoff", () => {
    const triage: Triage = {
      intent: "question",
      confidence: 0.6,
      summary: "Asked a question",
      question: "Do you integrate with Salesforce?",
      draft: "Hi Dana, let me check.",
      source: "heuristic",
    };
    const d = decideAction(ctx(triage, { priorAgentReplies: 5 }));
    expect(d).toMatchObject({ action: "escalate", kind: "handoff", draft: "Hi Dana, let me check." });
  });

  it("opt-outs and auto-replies are still skipped past the reply limit", () => {
    expect(decideAction(ctx(heuristicTriage("Re", "unsubscribe"), { priorAgentReplies: 9 })).action).toBe("skip");
    expect(decideAction(ctx(heuristicTriage("Out of office", "I am on vacation"), { priorAgentReplies: 9 })).action).toBe("skip");
  });

  it("a referral names the address the lead pointed to and never promises a step that doesn't exist", () => {
    const d = decideAction(
      ctx(heuristicTriage("Re", "Please talk to my colleague jane@acme.com, she runs this."), { referralEmail: "jane@acme.com" }),
    );
    expect(d).toMatchObject({
      action: "escalate",
      kind: "referral",
      question: "The lead pointed you to jane@acme.com. Add them as a lead to this campaign, or reply to the lead yourself.",
      summary: "Referral: waiting on you.",
      referralEmail: "jane@acme.com",
    });
    const none = decideAction(ctx(heuristicTriage("Re", "Please talk to my colleague in finance, she runs this.")));
    expect(none).toMatchObject({ kind: "referral", referralEmail: null });
    if (none.action === "escalate") expect(none.question).toContain("pointed you to someone else");
  });
});

describe("extractReferralEmail", () => {
  it("finds the colleague's address and skips the lead's own and the mailbox's", () => {
    const body = "Thanks dana@acme.com here. Loop in Jane.Doe@Acme.com, cc alex@pool.example";
    expect(extractReferralEmail(body, ["dana@acme.com", "alex@pool.example"])).toBe("jane.doe@acme.com");
  });

  it("ignores quoted text and the earlier thread", () => {
    const body = [
      "Not me, sorry. Try our ops lead.",
      "",
      "> From: alex@pool.example",
      "> someone@else.example",
      "On Tue, Nov 4, 2026 at 9:00 AM Alex <alex@pool.example> wrote:",
      "Reach me at other@pool.example",
    ].join("\n");
    expect(extractReferralEmail(body, ["dana@acme.com", "alex@pool.example"])).toBeNull();
  });

  it("returns null when only excluded addresses are present", () => {
    expect(extractReferralEmail("Write to DANA@acme.com", ["dana@acme.com"])).toBeNull();
    expect(extractReferralEmail("", [])).toBeNull();
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

/* ─── #35: an opt-out the agent reads is actually blocked ──────────────── */

describe("the agent blocks an opt-out it reads", () => {
  const NOW = new Date("2026-11-06T12:00:00.000Z");
  const CLAIM = NOW.toISOString();
  let seq = 0;

  /** One pending reply in a campaign the agent handles; `failSuppression` makes the blocklist write throw. */
  function optOutWorld(opts: { failSuppression?: boolean } = {}) {
    const id = `r-opt-${++seq}`;
    const reply = {
      id,
      userId: "u1",
      senderId: "s1",
      campaignId: "c1",
      leadId: "l1",
      fromEmail: "Dana@Acme-Example.com",
      fromName: "Dana",
      subject: "Re: idea",
      bodyText: "Please never write to me again.",
      receivedAt: "2026-11-06T11:00:00.000Z",
      messageId: "<in-opt@acme-example.com>",
      tag: null,
      agentStatus: "processing",
      agentClaimedAt: CLAIM,
    };
    const { db, writes } = conversationDb(
      new Map<unknown, any>([
        [
          schema.replies,
          ({ fields }: { fields: string[] }) => {
            if (fields.includes("agentAttempts") && fields.includes("agentClaimedAt")) return [];
            if (fields.includes("agentAttempts")) return [{ id, agentAttempts: 0 }];
            return [reply];
          },
        ],
        [
          schema.campaigns,
          () => [{ id: "c1", userId: "u1", workspaceId: "w1", status: "running", deletedAt: null, leadConversationMode: "agent", agentOffer: "" }],
        ],
        [
          schema.chadGtmRuns,
          () => [
            {
              id: "run1",
              userId: "u1",
              workspaceId: "w1",
              companyName: "Acme",
              bookingUrl: "https://cal.example/dana",
              businessOverview: { summary: "Acme automates reporting for finance teams." },
              offers: [{ title: "Reporting audit", valueProp: "Cut a week of reporting work" }],
            },
          ],
        ],
        [schema.workspaces, () => [{ id: "w1", leadConversationMode: "manual", agentPaused: false, companySummary: "", mainOffer: "", bookingUrl: null, companyName: "Acme" }]],
        [schema.senderAccounts, () => [{ id: "s1", userId: "admin", email: "alex@pool.example", fromName: "", status: "active", deletedAt: null, isSystemPool: true }]],
        [schema.users, () => [{ id: "u1", role: "user", approvedAt: "2026-01-01", email: "owner@client.example", name: "Owner" }]],
        [schema.leads, () => [{ id: "l1", firstName: "Dana", lastName: "Lee", company: "Acme Example", email: "dana@acme-example.com" }]],
        [schema.engineHeartbeats, () => [{ lastTickAt: NOW.toISOString() }]],
      ]),
    );
    if (opts.failSuppression) {
      const insert = db.insert;
      db.insert = (table: unknown) => {
        if (table === schema.suppressions) throw new Error("db write failed: connection lost");
        return insert(table);
      };
    }
    return { db, writes };
  }

  const triageAs = (intent: "unsubscribe" | "not_interested") => async () => ({
    intent,
    confidence: 0.9,
    summary: "asked not to be contacted",
    source: "llm" as const,
  });

  const finishWrite = (writes: ReturnType<typeof optOutWorld>["writes"]) =>
    writes.find((w) => w.table === schema.replies && w.set?.agentSummary !== undefined);

  it("an unsubscribe the keyword check missed is a global block, and the summary says so", async () => {
    const { db, writes } = optOutWorld();
    const sendMail = vi.fn();
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: triageAs("unsubscribe") });
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    const block = writes.find((w) => w.op === "insert" && w.table === schema.suppressions);
    expect(block?.values).toMatchObject({
      userId: "u1",
      workspaceId: "w1",
      value: "dana@acme-example.com",
      source: "unsubscribe",
      reason: "Asked to be removed (agent)",
    });
    expect(finishWrite(writes)?.set).toMatchObject({
      agentStatus: "skipped",
      agentIntent: "unsubscribe",
      agentSummary: "Lead opted out, so no reply was sent. Added to your blocklist.",
    });
    // The lead is marked unsubscribed.
    expect(writes.some((w) => w.op === "update" && w.table === schema.leads && w.set?.status === "unsubscribed")).toBe(true);
  });

  it("'not interested' is a block for this client only and never marks the lead unsubscribed", async () => {
    const { db, writes } = optOutWorld();
    await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail: vi.fn(), triage: triageAs("not_interested") });
    const block = writes.find((w) => w.op === "insert" && w.table === schema.suppressions);
    expect(block?.values).toMatchObject({ source: "not_interested", reason: "Replied not interested (agent)" });
    expect(finishWrite(writes)?.set?.agentSummary).toBe("Lead opted out, so no reply was sent. Added to your blocklist.");
    expect(writes.some((w) => w.table === schema.leads && w.set?.status === "unsubscribed")).toBe(false);
  });

  it("when the blocklist write fails, the summary says so, nothing is sent and the reply stays skipped", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, writes } = optOutWorld({ failSuppression: true });
    const sendMail = vi.fn();
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: triageAs("unsubscribe") });
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(0);
    expect(finishWrite(writes)?.set).toMatchObject({
      agentStatus: "skipped",
      agentSummary: "Lead opted out, so no reply was sent. Adding them to your blocklist failed; add them by hand.",
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
