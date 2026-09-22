/**
 * Unibox left-list grouping.
 *
 * `replies` is one row per inbound message. There is no in-reply-to or
 * references column, so list queries fall back to the same key the temporary
 * client helper uses: lead (leadId, else fromEmail) + campaignId + subject
 * with Re:/Fwd: prefixes removed.
 *
 * When a row already carries Message-ID plus In-Reply-To or References,
 * `threadKey` is the RFC822 conversation root instead. Those headers are not
 * invented and SMTP send headers are not changed.
 *
 * Fallback `threadKey` === `uniboxConversationKey(row)`.
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
  messageId?: string | null;
  /** Not a column on `replies`. Honored only when the caller already has it. */
  inReplyTo?: string | null;
  /** Not a column on `replies`. Honored only when the caller already has it. */
  references?: string | null;
}

export interface UniboxConversation<T extends UniboxReplyListItem> {
  /** Group id. Equals `threadKey`. */
  key: string;
  /** Stable server id for Prism. Fallback matches `uniboxConversationKey`. */
  threadKey: string;
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

/** Strip angle brackets, trim, lowercase. First id only. */
export function normalizeRfc822MessageId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  const bracket = s.match(/<([^<>]+)>/);
  if (bracket?.[1]) s = bracket[1];
  else s = s.replace(/^<+/, "").replace(/>+$/, "");
  s = s.trim().toLowerCase().split(/\s+/)[0] ?? "";
  s = s.replace(/^<+/, "").replace(/>+$/, "").trim();
  return s || null;
}

function parseReferenceIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const brackets = raw.match(/<[^<>]+>/g);
  const parts = brackets && brackets.length > 0 ? brackets : raw.split(/\s+/);
  for (const part of parts) {
    const id = normalizeRfc822MessageId(part);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function immediateParent(row: UniboxReplyListItem): string | null {
  const irt = normalizeRfc822MessageId(row.inReplyTo);
  if (irt) return irt;
  const refs = parseReferenceIds(row.references);
  return refs.length > 0 ? refs[refs.length - 1]! : null;
}

function rootOf(start: string, parentOf: Map<string, string>): string {
  const seen = new Set<string>();
  let cur = start;
  while (!seen.has(cur)) {
    seen.add(cur);
    const parent = parentOf.get(cur);
    if (!parent || parent === cur) return cur;
    cur = parent;
  }
  return cur;
}

function rfc822ThreadKey(rootMessageId: string): string {
  return `rfc822:${encodeURIComponent(rootMessageId)}`;
}

/**
 * Prefer the RFC822 root when In-Reply-To / References link messages in this set.
 * Otherwise the temporary client key (lead + campaign + normalized subject).
 * A lone Message-ID does not form a root and does not split the fallback group.
 */
export function threadKeysForReplies(rows: readonly UniboxReplyListItem[]): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const row of rows) {
    const mid = normalizeRfc822MessageId(row.messageId);
    const parent = immediateParent(row);
    if (mid && parent && mid !== parent && !parentOf.has(mid)) parentOf.set(mid, parent);
  }
  const referenced = new Set(parentOf.values());
  const keys = new Map<string, string>();
  for (const row of rows) {
    const mid = normalizeRfc822MessageId(row.messageId);
    const parent = immediateParent(row);
    let root: string | null = null;
    if (mid && (parent || referenced.has(mid))) root = rootOf(mid, parentOf);
    else if (!mid && parent) root = rootOf(parent, parentOf);
    keys.set(row.id, root ? rfc822ThreadKey(root) : uniboxConversationKey(row));
  }
  return keys;
}

function receivedAtMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** One conversation per threadKey. Latest row wins snippet/time. Does not write readAt. */
export function groupUniboxConversations<T extends UniboxReplyListItem>(rows: T[]): UniboxConversation<T>[] {
  const keyById = threadKeysForReplies(rows);
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyById.get(row.id) ?? uniboxConversationKey(row);
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
      threadKey: key,
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

/** Flat list row: latest reply plus stable `threadKey`. `readAt` is the latest row's stored value. */
export function summarizeUniboxThreads<T extends UniboxReplyListItem>(rows: readonly T[]) {
  return groupUniboxConversations([...rows]).map((thread) => ({
    ...thread.latest,
    threadKey: thread.threadKey,
    replyIds: thread.memberIds,
    unread: thread.unread,
  }));
}
