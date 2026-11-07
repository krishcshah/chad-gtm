import { describe, expect, it } from "vitest";
import {
  bookingLinkNeedle,
  groupInterestedLeads,
  INTERESTED_CSV_HEADER,
  interestedLeadsToCsv,
  isPositiveReply,
  leadKey,
  type InterestedLead,
  type InterestedReplyRow,
} from "../interested-export";

function reply(over: Partial<InterestedReplyRow>): InterestedReplyRow {
  return {
    leadId: "l1",
    fromEmail: "dana@acme.com",
    fromName: "Dana Lee",
    tag: null,
    agentIntent: null,
    receivedAt: "2026-11-01T10:00:00.000Z",
    snippet: "",
    firstName: "Dana",
    lastName: "Lee",
    company: "Acme",
    jobTitle: "Head of Growth",
    ...over,
  };
}

describe("groupInterestedLeads", () => {
  it("includes a lead tagged Interested by hand with no agent activity", () => {
    const out = groupInterestedLeads([reply({ tag: "interested", agentIntent: null, snippet: "Sounds good" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      email: "dana@acme.com",
      firstName: "Dana",
      lastName: "Lee",
      company: "Acme",
      title: "Head of Growth",
      signal: "Interested",
      lastReplySnippet: "Sounds good",
    });
  });

  it("returns one row per lead across several replies, with the latest reply", () => {
    const out = groupInterestedLeads([
      reply({ receivedAt: "2026-11-03T10:00:00.000Z", snippet: "Thursday works" }),
      reply({ receivedAt: "2026-11-01T10:00:00.000Z", agentIntent: "interested", snippet: "Tell me more" }),
      reply({ receivedAt: "2026-11-02T10:00:00.000Z", agentIntent: "question" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lastReplyAt).toBe("2026-11-03T10:00:00.000Z");
    expect(out[0].lastReplySnippet).toBe("Thursday works");
    expect(out[0].signal).toBe("Agent: interested");
  });

  it("excludes a lead whose latest reply is tagged not interested or unsubscribes", () => {
    expect(
      groupInterestedLeads([
        reply({ receivedAt: "2026-11-01T10:00:00.000Z", tag: "interested" }),
        reply({ receivedAt: "2026-11-02T10:00:00.000Z", tag: "not_interested" }),
      ]),
    ).toEqual([]);
    expect(
      groupInterestedLeads([
        reply({ receivedAt: "2026-11-01T10:00:00.000Z", tag: "meeting_booked" }),
        reply({ receivedAt: "2026-11-02T10:00:00.000Z", agentIntent: "unsubscribe" }),
      ]),
    ).toEqual([]);
  });

  it("excludes leads with no positive reply", () => {
    expect(groupInterestedLeads([reply({ agentIntent: "question" }), reply({ tag: "out_of_office" })])).toEqual([]);
  });

  it("picks the strongest signal", () => {
    const out = groupInterestedLeads([
      reply({ receivedAt: "2026-11-01T10:00:00.000Z", agentIntent: "interested" }),
      reply({ receivedAt: "2026-11-02T10:00:00.000Z", tag: "won" }),
      reply({ receivedAt: "2026-11-03T10:00:00.000Z", tag: "meeting_booked" }),
    ]);
    expect(out.map((l) => l.signal)).toEqual(["Won"]);
  });

  it("keys replies without a lead by address and falls back to the sender name", () => {
    const out = groupInterestedLeads([
      reply({ leadId: null, fromEmail: "Sam@Beta.io", fromName: "Sam Ortiz Ruiz", firstName: null, lastName: null, company: null, jobTitle: null, tag: "interested" }),
      reply({ leadId: null, fromEmail: "sam@beta.io", fromName: "Sam Ortiz Ruiz", firstName: null, lastName: null, company: null, jobTitle: null, receivedAt: "2026-11-05T10:00:00.000Z" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ email: "sam@beta.io", firstName: "Sam", lastName: "Ortiz Ruiz", company: "", title: "" });
  });

  it("lists the most recent reply first", () => {
    const out = groupInterestedLeads([
      reply({ leadId: "a", fromEmail: "a@x.com", tag: "interested", receivedAt: "2026-11-01T10:00:00.000Z" }),
      reply({ leadId: "b", fromEmail: "b@x.com", tag: "interested", receivedAt: "2026-11-04T10:00:00.000Z" }),
    ]);
    expect(out.map((l) => l.email)).toEqual(["b@x.com", "a@x.com"]);
  });
});

describe("interestedLeadsToCsv", () => {
  const lead: InterestedLead = {
    email: "dana@acme.com",
    firstName: "Dana",
    lastName: "Lee",
    company: "Acme, Inc.",
    title: "Head of Growth",
    signal: "Meeting booked",
    lastReplyAt: "2026-11-03T10:00:00.000Z",
    lastReplySnippet: 'She said "yes"\nsee you then',
  };

  it("has a header with name, company and title columns", () => {
    const [header] = interestedLeadsToCsv([]).split("\n");
    expect(header).toBe(INTERESTED_CSV_HEADER);
    expect(header.split(",")).toEqual([
      "email",
      "first_name",
      "last_name",
      "company",
      "title",
      "signal",
      "last_reply_at",
      "last_reply",
    ]);
  });

  it("writes first/last name, company and title, quoting commas, quotes and line breaks", () => {
    const csv = interestedLeadsToCsv([lead]);
    expect(csv).toBe(
      `${INTERESTED_CSV_HEADER}\n` +
        `dana@acme.com,Dana,Lee,"Acme, Inc.",Head of Growth,Meeting booked,2026-11-03T10:00:00.000Z,"She said ""yes""\nsee you then"\n`,
    );
  });

  it("neutralises cells that start with = + - or @", () => {
    const csv = interestedLeadsToCsv([
      { ...lead, firstName: "=HYPERLINK(\"http://x\")", lastName: "+1", company: "-2", title: "@cmd", lastReplySnippet: "ok" },
    ]);
    const row = csv.split("\n")[1];
    expect(row).toBe(
      `dana@acme.com,"'=HYPERLINK(""http://x"")",'+1,'-2,'@cmd,Meeting booked,2026-11-03T10:00:00.000Z,ok`,
    );
  });
});

describe("bookingLinkNeedle", () => {
  it("drops the protocol and trailing slashes and lowercases", () => {
    expect(bookingLinkNeedle("https://cal.com/acme/30min/")).toBe("cal.com/acme/30min");
    expect(bookingLinkNeedle("  HTTP://Calendly.com/Dana// ")).toBe("calendly.com/dana");
  });

  it("is null for an empty link", () => {
    expect(bookingLinkNeedle("")).toBeNull();
    expect(bookingLinkNeedle("   ")).toBeNull();
    expect(bookingLinkNeedle(null)).toBeNull();
  });
});

describe("isPositiveReply", () => {
  it("is true for positive tags or a positive agent intent", () => {
    for (const tag of ["interested", "meeting_booked", "won"]) expect(isPositiveReply({ tag, agentIntent: null })).toBe(true);
    for (const agentIntent of ["interested", "meeting_request"]) expect(isPositiveReply({ tag: null, agentIntent })).toBe(true);
  });

  it("is false for not interested, lost or nothing", () => {
    expect(isPositiveReply({ tag: "not_interested", agentIntent: null })).toBe(false);
    expect(isPositiveReply({ tag: "lost", agentIntent: "interested" })).toBe(false);
    expect(isPositiveReply({ tag: null, agentIntent: null })).toBe(false);
  });
});

describe("leadKey", () => {
  it("uses the lead id, else the lowercased address", () => {
    expect(leadKey({ leadId: "l1", fromEmail: "Dana@Acme.com" })).toBe("l1");
    expect(leadKey({ leadId: null, fromEmail: " Dana@Acme.com " })).toBe("dana@acme.com");
  });
});
