/**
 * Who counts as an interested lead, and how leads are counted (once each).
 * Pure helpers shared by mission control's KPIs and the interested-leads export.
 */

/** Reply tags that mean the lead wants to go further. */
export const POSITIVE_TAGS = ["interested", "meeting_booked", "won"] as const;
/** What the agent read in the reply that means the same. */
export const POSITIVE_INTENTS = ["interested", "meeting_request"] as const;
export const NEGATIVE_TAGS = ["not_interested", "lost"] as const;

export function isPositiveReply(r: { tag?: string | null; agentIntent?: string | null }): boolean {
  if (r.tag && (NEGATIVE_TAGS as readonly string[]).includes(r.tag)) return false;
  return (
    Boolean(r.tag && (POSITIVE_TAGS as readonly string[]).includes(r.tag)) ||
    Boolean(r.agentIntent && (POSITIVE_INTENTS as readonly string[]).includes(r.agentIntent))
  );
}

/** One key per person: the lead, else the address they wrote from. */
export function leadKey(r: { leadId?: string | null; fromEmail?: string | null }): string {
  return r.leadId || String(r.fromEmail ?? "").trim().toLowerCase();
}

/**
 * The part of a booking link to look for in a sent email: no protocol, no
 * trailing slash, lowercase. Null when there is no link.
 */
export function bookingLinkNeedle(url: string | null | undefined): string | null {
  const needle = String(url ?? "")
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return needle || null;
}

/** Agent intents that mean the lead turned the offer down. */
const NEGATIVE_INTENTS = ["not_interested", "unsubscribe"] as const;

/** One reply joined to its lead (lead fields are null when the reply matched no lead). */
export type InterestedReplyRow = {
  leadId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  tag: string | null;
  agentIntent: string | null;
  receivedAt: string;
  snippet: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
};

export type InterestedSignal = "Won" | "Meeting booked" | "Interested" | "Agent: interested";

export type InterestedLead = {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  signal: InterestedSignal;
  lastReplyAt: string;
  lastReplySnippet: string;
};

/** Strongest first. */
const SIGNAL_RANK: InterestedSignal[] = ["Won", "Meeting booked", "Interested", "Agent: interested"];

function replySignal(r: { tag?: string | null; agentIntent?: string | null }): InterestedSignal | null {
  if (!isPositiveReply(r)) return null;
  if (r.tag === "won") return "Won";
  if (r.tag === "meeting_booked") return "Meeting booked";
  if (r.tag === "interested") return "Interested";
  return "Agent: interested";
}

/**
 * Every interested lead, once each. A lead counts when any reply was positive
 * (tagged by hand or read so by the agent) and the latest reply hasn't turned it down.
 * Newest reply first.
 */
export function groupInterestedLeads(rows: InterestedReplyRow[]): InterestedLead[] {
  const groups = new Map<string, InterestedReplyRow[]>();
  for (const r of rows) {
    const key = leadKey(r);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }

  const out: InterestedLead[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)));
    const latest = group[group.length - 1];
    if (latest.tag && (NEGATIVE_TAGS as readonly string[]).includes(latest.tag)) continue;
    if (latest.agentIntent && (NEGATIVE_INTENTS as readonly string[]).includes(latest.agentIntent)) continue;

    let best: InterestedSignal | null = null;
    for (const r of group) {
      const s = replySignal(r);
      if (s && (best === null || SIGNAL_RANK.indexOf(s) < SIGNAL_RANK.indexOf(best))) best = s;
    }
    if (!best) continue;

    // Lead fields come from the join; a reply that matched no lead falls back to its sender name.
    const withLead = group.find((r) => r.firstName || r.lastName || r.company || r.jobTitle) ?? latest;
    let firstName = String(withLead.firstName ?? "").trim();
    let lastName = String(withLead.lastName ?? "").trim();
    if (!firstName && !lastName) {
      const name = String(latest.fromName ?? "").trim();
      const space = name.indexOf(" ");
      firstName = space === -1 ? name : name.slice(0, space);
      lastName = space === -1 ? "" : name.slice(space + 1).trim();
    }

    out.push({
      email: String(latest.fromEmail ?? "").trim().toLowerCase(),
      firstName,
      lastName,
      company: String(withLead.company ?? "").trim(),
      title: String(withLead.jobTitle ?? "").trim(),
      signal: best,
      lastReplyAt: latest.receivedAt,
      lastReplySnippet: String(latest.snippet ?? "").trim(),
    });
  }
  return out.sort((a, b) => b.lastReplyAt.localeCompare(a.lastReplyAt));
}

/** One CSV cell: formulas neutralised, quoted when it holds a comma, quote or line break. */
export function csvCell(value: unknown): string {
  let s = String(value ?? "");
  // A spreadsheet runs a cell that starts with one of these as a formula.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const INTERESTED_CSV_HEADER = "email,first_name,last_name,company,title,signal,last_reply_at,last_reply";

export function interestedLeadsToCsv(leads: InterestedLead[]): string {
  const lines = leads.map((l) =>
    [l.email, l.firstName, l.lastName, l.company, l.title, l.signal, l.lastReplyAt, l.lastReplySnippet]
      .map(csvCell)
      .join(","),
  );
  return [INTERESTED_CSV_HEADER, ...lines].join("\n") + "\n";
}
