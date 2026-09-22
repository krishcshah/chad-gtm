/**
 * Unibox left-list grouping.
 *
 * `replies` is one row per inbound message. There is no threadId,
 * conversationId, rootMessageId, or in-reply-to column on that table, so the
 * sidebar cannot group on a server thread key.
 *
 * Best-effort key: lead (leadId, else fromEmail) + campaignId + subject with
 * Re:/Fwd: prefixes removed. Forge gap: a stored thread key is still needed
 * when a follow-up rewrites the subject but stays in the same mailbox thread.
 */

export interface UniboxReplyListItem {
  id: string;
  leadId?: string | null;
  campaignId?: string | null;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  readAt: string | null;
  tag?: string | null;
}

export interface UniboxConversation<T extends UniboxReplyListItem> {
  key: string;
  latest: T;
  memberIds: string[];
  unread: boolean;
  /** Newest non-empty tag among the grouped replies. */
  tag: string | null;
  /** Reply id that owns `tag`, or the latest reply when the thread is untagged. */
  tagReplyId: string;
}

const SUBJECT_PREFIX = /^(?:(?:re|fwd?|fw|aw)\s*(?:\[\d+\])?\s*:\s*)+/i;

/** Collapse reply/forward prefixes so "Re: Re: Hello" matches "Hello". */
export function normalizeThreadSubject(subject: string | null | undefined): string {
  let s = (subject ?? "").replace(/\s+/g, " ").trim();
  let guard = 0;
  while (guard++ < 8) {
    const next = s.replace(SUBJECT_PREFIX, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.toLowerCase();
}

export function uniboxConversationKey(
  row: Pick<UniboxReplyListItem, "leadId" | "campaignId" | "fromEmail" | "subject">,
): string {
  const lead = row.leadId?.trim() || row.fromEmail.trim().toLowerCase();
  const campaign = row.campaignId?.trim() || "";
  return `${lead}\u0000${campaign}\u0000${normalizeThreadSubject(row.subject)}`;
}

function receivedAtMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** One sidebar conversation per lead + campaign + normalized subject. Latest row wins snippet/time. */
export function groupUniboxConversations<T extends UniboxReplyListItem>(rows: T[]): UniboxConversation<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = uniboxConversationKey(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const conversations: UniboxConversation<T>[] = [];
  for (const [key, members] of groups) {
    const sorted = [...members].sort((a, b) => {
      const delta = receivedAtMs(b.receivedAt) - receivedAtMs(a.receivedAt);
      if (delta !== 0) return delta;
      return b.id.localeCompare(a.id);
    });
    const latest = sorted[0];
    if (!latest) continue;
    const tagged = sorted.find((m) => m.tag);
    conversations.push({
      key,
      latest,
      memberIds: sorted.map((m) => m.id),
      unread: sorted.some((m) => !m.readAt),
      tag: tagged?.tag ?? null,
      tagReplyId: tagged?.id ?? latest.id,
    });
  }

  conversations.sort((a, b) => {
    const delta = receivedAtMs(b.latest.receivedAt) - receivedAtMs(a.latest.receivedAt);
    if (delta !== 0) return delta;
    return b.latest.id.localeCompare(a.latest.id);
  });
  return conversations;
}
