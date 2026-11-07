/**
 * #68 / #69: pool mailbox mail that does not thread to one lead goes to a
 * customer only when exactly one customer is a candidate.
 */
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";
import {
  FREE_MAIL_DOMAINS,
  domainOf,
  insertUnmatchedInbound,
  isTriageCandidate,
  loadAddressOwners,
  loadDomainOwners,
  pickUnambiguousOwner,
  routeUnmatched,
  type InboundOwner,
} from "../inbound-routing";
import { routingDb } from "./fixtures/routing-db";

const human = {
  headers: {},
  subject: "Question about your note",
  bodyText: "Hi, my colleague forwarded your email. Can we talk next week?",
  fromEmail: "dana@acme.example",
  autoReply: false,
  isOwnMailbox: false,
};

describe("isTriageCandidate", () => {
  it("accepts a plain human email", () => {
    expect(isTriageCandidate(human)).toBe(true);
  });
  it("rejects auto-replies", () => {
    expect(isTriageCandidate({ ...human, autoReply: true })).toBe(false);
  });
  it("rejects mailing-list mail (List-Id or List-Unsubscribe)", () => {
    expect(isTriageCandidate({ ...human, headers: { "list-id": "<news.acme.example>" } })).toBe(false);
    expect(isTriageCandidate({ ...human, headers: { "list-unsubscribe": "<mailto:u@acme.example>" } })).toBe(false);
  });
  it("rejects Precedence bulk / list / junk", () => {
    for (const p of ["bulk", "list", "junk", " Bulk "]) {
      expect(isTriageCandidate({ ...human, headers: { precedence: p } })).toBe(false);
    }
  });
  it("rejects noreply and system senders", () => {
    for (const from of [
      "noreply@acme.example",
      "no-reply@acme.example",
      "mailer-daemon@acme.example",
      "postmaster@acme.example",
      "notifications@acme.example",
      "notification@acme.example",
      "donotreply@acme.example",
    ]) {
      expect(isTriageCandidate({ ...human, fromEmail: from })).toBe(false);
    }
  });
  it("rejects warm-up traffic", () => {
    expect(isTriageCandidate({ ...human, bodyText: 'Hello <!--SR_WARMUP:{"n":3}-->' })).toBe(false);
  });
  it("rejects mail from our own mailboxes", () => {
    expect(isTriageCandidate({ ...human, isOwnMailbox: true })).toBe(false);
  });
});

const owner = (userId: string, campaignId = `c-${userId}`): InboundOwner => ({ userId, campaignId, workspaceId: `w-${userId}` });

describe("pickUnambiguousOwner", () => {
  it("returns the owner for one candidate", () => {
    expect(pickUnambiguousOwner([owner("A")])?.userId).toBe("A");
  });
  it("returns null for zero or two candidates", () => {
    expect(pickUnambiguousOwner([])).toBeNull();
    expect(pickUnambiguousOwner([owner("A"), owner("B")])).toBeNull();
  });
});

describe("routeUnmatched", () => {
  it("routes a company domain that exactly one customer emailed", () => {
    const r = routeUnmatched({ domain: "acme.example", owners: [owner("A")] });
    expect(r).toEqual({ kind: "route", owner: owner("A") });
  });
  it("sends a free-mail domain to triage even with one candidate", () => {
    expect(FREE_MAIL_DOMAINS.has("gmail.com")).toBe(true);
    expect(routeUnmatched({ domain: "gmail.com", owners: [owner("A")] })).toEqual({
      kind: "triage",
      candidateUserIds: ["A"],
    });
  });
  it("sends two customers to triage with both as candidates", () => {
    expect(routeUnmatched({ domain: "acme.example", owners: [owner("A"), owner("B")] })).toEqual({
      kind: "triage",
      candidateUserIds: ["A", "B"],
    });
  });
  it("sends a domain nobody emailed to triage with no candidates", () => {
    expect(routeUnmatched({ domain: "acme.example", owners: [] })).toEqual({ kind: "triage", candidateUserIds: [] });
  });
});

describe("domainOf", () => {
  it("lowercases the domain", () => {
    expect(domainOf("Dana@ACME.example")).toBe("acme.example");
    expect(domainOf("nobody")).toBe("");
  });
});

const dialect = new PgDialect();

describe("owner loaders", () => {
  function capture() {
    const calls: { on: unknown; where: unknown }[] = [];
    const chain = (call: { on: unknown; where: unknown }): any =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              const p = Promise.resolve([]);
              return p.then.bind(p);
            }
            return (...args: any[]) => {
              if (prop === "where") call.where = args[0];
              return chain(call);
            };
          },
        },
      );
    const db: any = {
      selectDistinctOn: (on: unknown) => {
        const call = { on, where: undefined as unknown };
        calls.push(call);
        return chain(call);
      },
    };
    return { db, calls };
  }

  it("loadAddressOwners keeps one row per customer for sent jobs to that exact address on this mailbox", async () => {
    const { db, calls } = capture();
    await loadAddressOwners(db, "pool-1", "Bob@X.example");
    expect(calls[0].on).toEqual([schema.campaigns.userId]);
    const q = dialect.sqlToQuery(calls[0].where as any);
    expect(q.sql).toContain('lower("email_jobs"."to_email") =');
    expect(q.params).toEqual(expect.arrayContaining(["pool-1", "bob@x.example", "sent"]));
  });

  it("loadDomainOwners looks at sent/bounced jobs to the domain since the window", async () => {
    const { db, calls } = capture();
    await loadDomainOwners(db, "pool-1", "acme_co.example", "2026-10-08T00:00:00.000Z");
    const q = dialect.sqlToQuery(calls[0].where as any);
    expect(q.sql).toContain('lower("email_jobs"."to_email") like');
    expect(q.params).toEqual(
      expect.arrayContaining(["pool-1", "sent", "bounced", "%@acme\\_co.example", "2026-10-08T00:00:00.000Z"]),
    );
  });

  it("returns every customer, newest job each", async () => {
    const { db } = routingDb({
      campaigns: [
        { id: "cA1", userId: "A", workspaceId: "wA", stopOnReply: true },
        { id: "cA2", userId: "A", workspaceId: "wA", stopOnReply: true },
        { id: "cB", userId: "B", workspaceId: "wB", stopOnReply: true },
      ],
      jobs: [
        { id: "j1", campaignId: "cA1", senderId: "P", leadId: "l1", toEmail: "bob@x.example", status: "sent", sentAt: "2026-10-01" },
        { id: "j2", campaignId: "cA2", senderId: "P", leadId: "l2", toEmail: "bob@x.example", status: "sent", sentAt: "2026-10-05" },
        { id: "j3", campaignId: "cB", senderId: "P", leadId: "l3", toEmail: "bob@x.example", status: "sent", sentAt: "2026-09-01" },
      ],
    });
    const owners = await loadAddressOwners(db, "P", "bob@x.example");
    expect(owners.map((o) => [o.userId, o.campaignId, o.leadId])).toEqual([
      ["A", "cA2", "l2"],
      ["B", "cB", "l3"],
    ]);
  });
});

describe("insertUnmatchedInbound", () => {
  it("inserts an open row with its candidates", async () => {
    const { db, writes } = routingDb({});
    await insertUnmatchedInbound(db, {
      senderId: "P",
      messageId: "<m1@x>",
      fromEmail: "bob@x.example",
      receivedAt: "2026-11-07T10:00:00.000Z",
      candidateUserIds: ["A", "B", "A"],
      reason: "ambiguous_owner",
    });
    const row = writes.find((w) => w.table === schema.unmatchedInbound);
    expect(row?.values).toMatchObject({
      senderId: "P",
      messageId: "<m1@x>",
      candidateUserIds: ["A", "B"],
      reason: "ambiguous_owner",
      status: "open",
    });
  });
});
