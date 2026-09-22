/**
 * Reply detection — poll INBOX over IMAP, find new replies, thread them to
 * leads (via In-Reply-To / References against our sent Message-IDs, falling
 * back to from-address matching) and stop future sends for replied leads.
 *
 * Bodies: store plain (`bodyText`) and HTML (`bodyHtml`) separately. Decode
 * quoted-printable as UTF-8 (never latin1 char codes) to avoid mojibake.
 */
import { schema } from "@smartreach/database";
import { parseSenderAddress } from "@smartreach/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { EngineDb, SenderRow } from "./db-port";
import { makeImapClient } from "./mailer";

export interface SyncResult {
  checked: number;
  repliesFound: number;
  errors: string[];
}

/** Decode quoted-printable octets as UTF-8 (not latin1 / fromCharCode). */
export function decodeQuotedPrintable(input: string): string {
  const soft = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === "=" && i + 2 < soft.length && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(soft.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode common HTML entities (named + numeric) without double-encoding. */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
    })
    .replace(/&#(\d+);/g, (_m, d) => {
      const cp = parseInt(d, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
    })
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** Strip MIME boundary lines and Content-* header lines that leak into parts. */
export function stripMimeNoise(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n");
  // Mid-body MIME boundaries + their Content-* headers
  s = s.replace(/^\s*--[0-9A-Za-z=_-]{8,}.*$/gm, "");
  s = s.replace(/^\s*content-(?:type|transfer-encoding|disposition|id|description):[^\n]*\n/gim, "");
  // Leading header block before first blank line
  if (/^[A-Za-z-]+:\s/m.test(s.slice(0, 400))) {
    const firstBlank = s.search(/\n\n/);
    if (firstBlank > 0) s = s.slice(firstBlank + 2);
  }
  // Do not paste List-Unsubscribe header lines into body
  s = s.replace(/^\s*List-Unsubscribe(?:-Post)?:\s*[^\n]*\n?/gim, "");
  return s.trim();
}

/**
 * Remove compliance / staging leakage from stored reply bodies:
 * - bare unsubscribe token URLs (`/api/unsubscribe?token=` or `/unsubscribe?token=`)
 * - angle-bracketed List-Unsubscribe URLs
 * - trailing SmartReach postal / unsub footers (`-- physical address --`, data-sr-*)
 * Does not invent replacement content.
 */
export function stripLeakageFromBody(body: string): string {
  let s = body;
  // Angle-bracketed List-Unsubscribe style URLs
  s = s.replace(/<https?:\/\/[^>\s]*unsubscribe[^>\s]*>/gi, "");
  // Bare token URLs (staging + prod paths)
  s = s.replace(/https?:\/\/[^\s<>"']*\/api\/unsubscribe\?token=[^\s<>"']+/gi, "");
  s = s.replace(/https?:\/\/[^\s<>"']*\/unsubscribe\?token=[^\s<>"']+/gi, "");
  // Relative token URLs that sometimes leak
  s = s.replace(/(?:^|\s)\/api\/unsubscribe\?token=[^\s<>"']+/gim, "");
  s = s.replace(/(?:^|\s)\/unsubscribe\?token=[^\s<>"']+/gim, "");
  // "Unsubscribe: <url>" plaintext footer line
  s = s.replace(/\n*Unsubscribe:\s*\S*/gi, "");
  // HTML SmartReach unsub / postal blocks
  s = s.replace(/<p[^>]*data-sr-unsub[^>]*>[\s\S]*?<\/p>/gi, "");
  s = s.replace(/<p[^>]*data-sr-postal[^>]*>[\s\S]*?<\/p>/gi, "");
  // Plaintext postal marker + trailing lines until end (auto-appended pattern)
  s = s.replace(/\n*-- physical address --[\s\S]*$/i, "");
  // Collapse leftover blank runs
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/** Convert HTML to plain text for bodyText/snippet when no text part exists. */
export function htmlToPlainText(html: string): string {
  let s = html;
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeHtmlEntities(s);
  s = s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

function getRawPart(msg: any, ...keys: string[]): string {
  for (const k of keys) {
    const buf = msg.bodyParts?.get?.(k);
    if (!buf) continue;
    // QP/base64 payloads are ASCII; utf8 is safe. Already-decoded UTF-8 parts stay correct.
    const v = typeof buf === "string" ? buf : Buffer.isBuffer(buf) ? buf.toString("utf8") : buf.toString?.("utf8") ?? buf.toString?.() ?? "";
    if (v) return v;
  }
  return "";
}

function classifyPart(raw: string): { kind: "html" | "text" | "empty"; content: string } {
  if (!raw || !raw.trim()) return { kind: "empty", content: "" };
  let s = stripMimeNoise(raw);
  // Detect CTE before decoding if header leaked
  const cteMatch = raw.match(/content-transfer-encoding:\s*([^\r\n]+)/i);
  const cte = (cteMatch?.[1] ?? "").trim().toLowerCase();
  if (cte.includes("quoted-printable") || /=[0-9A-Fa-f]{2}/.test(s)) {
    s = decodeQuotedPrintable(s);
  } else if (cte.includes("base64")) {
    try {
      s = Buffer.from(s.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      /* keep as-is */
    }
  }
  s = stripMimeNoise(s);
  if (looksLikeHtml(s)) {
    return { kind: "html", content: decodeHtmlEntities(s) };
  }
  return { kind: "text", content: decodeHtmlEntities(s) };
}

/**
 * Pull text + html body parts separately from an imapflow message.
 * Prefers dedicated text/html; never dumps a mishmash into one field.
 */
export function extractTextAndHtml(msg: any): { text: string; html: string } {
  const candidates = [
    getRawPart(msg, "text"),
    getRawPart(msg, "1"),
    getRawPart(msg, "1.1"),
    getRawPart(msg, "1.2"),
    getRawPart(msg, "2"),
    getRawPart(msg, "2.1"),
    getRawPart(msg, "2.2"),
  ].filter(Boolean);

  let text = "";
  let html = "";
  for (const raw of candidates) {
    const { kind, content } = classifyPart(raw);
    if (kind === "html" && !html) html = content;
    else if (kind === "text" && !text) text = content;
  }
  // If imapflow's "text" was HTML-only, classifyPart already assigned html.
  // If we only got HTML, leave text empty for prepareReplyBodies to derive.
  return { text, html };
}

export interface PreparedBodies {
  bodyText: string;
  bodyHtml: string;
  snippet: string;
}

/** Normalize, strip leakage, derive snippet from plain text only. Caps length. */
export function prepareReplyBodies(rawText: string, rawHtml: string): PreparedBodies {
  let bodyHtml = stripLeakageFromBody(rawHtml.trim());
  let bodyText = stripLeakageFromBody(rawText.trim());
  if (!bodyText && bodyHtml) {
    bodyText = stripLeakageFromBody(htmlToPlainText(bodyHtml));
  }
  // Cap stored bodies
  bodyHtml = bodyHtml.slice(0, 100_000);
  bodyText = bodyText.slice(0, 50_000);
  const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 280);
  return { bodyText, bodyHtml, snippet };
}

/** Sync one sender's inbox. Returns count of new replies recorded. */
export async function syncSenderReplies(db: EngineDb, sender: SenderRow): Promise<{ found: number; error?: string }> {
  if (!sender.imapHost || !sender.imapPasswordEnc) return { found: 0 };
  const client = makeImapClient(sender);
  let found = 0;
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    // Look back ~7 days or since last sync (whichever is newer)
    const since = sender.lastSyncAt
      ? new Date(Math.max(Date.parse(sender.lastSyncAt) - 3_600_000, Date.now() - 7 * 86_400_000))
      : new Date(Date.now() - 7 * 86_400_000);

    const uids = await client.search({ since }, { uid: true });
    const list = (Array.isArray(uids) ? uids : []).slice(-200); // cap per poll
    if (list.length > 0) {
      for await (const msg of client.fetch(
        list,
        // Fetch text + common multipart part numbers for text/html split
        { uid: true, envelope: true, bodyParts: ["text", "1", "1.1", "1.2", "2", "2.1", "2.2"] },
        { uid: true },
      )) {
        try {
          found += (await recordReplyIfNew(db, sender, msg)) ? 1 : 0;
        } catch (err) {
          console.error(`[sync] record reply failed for sender ${sender.id}`, err);
        }
      }
    }
    await client.logout();
    await db
      .update(schema.senderAccounts)
      .set({ lastSyncAt: new Date().toISOString(), imapStatus: "ok" })
      .where(eq(schema.senderAccounts.id, sender.id));
    return { found };
  } catch (err: any) {
    const message = String(err?.responseText || err?.message || "IMAP sync failed");
    await db
      .update(schema.senderAccounts)
      .set({ imapStatus: "failed" })
      .where(eq(schema.senderAccounts.id, sender.id));
    return { found, error: message };
  } finally {
    try {
      if (client.usable) await client.logout();
    } catch {
      /* noop */
    }
  }
}

async function recordReplyIfNew(db: EngineDb, sender: SenderRow, msg: any): Promise<boolean> {
  const env = msg.envelope ?? {};
  const fromRaw: string = env.from?.[0]?.address ?? "";
  const from = parseSenderAddress(fromRaw ? `${env.from?.[0]?.name ?? ""} <${fromRaw}>` : "");
  const fromEmail = (env.from?.[0]?.address ?? from.email ?? "").toLowerCase();
  if (!fromEmail || fromEmail === sender.email.toLowerCase()) return false; // skip self

  const messageId: string | null = env.messageId ?? null;
  if (messageId) {
    const dup: { id: string }[] = await db
      .select({ id: schema.replies.id })
      .from(schema.replies)
      .where(and(eq(schema.replies.senderId, sender.id), eq(schema.replies.messageId, messageId)))
      .limit(1);
    if (dup.length > 0) return false;
  }

  // Thread to a lead: In-Reply-To/References → our sent job's messageId → lead;
  // else fall back to "we sent this address something from this sender".
  const refs: string[] = [];
  if (env.inReplyTo) refs.push(env.inReplyTo);
  if (typeof env.references === "string") refs.push(...env.references.split(/\s+/));

  let lead: any | undefined;
  let campaignId: string | null = null;

  if (refs.length > 0) {
    const jobs: any[] = await db
      .select()
      .from(schema.emailJobs)
      .where(and(eq(schema.emailJobs.senderId, sender.id), inArray(schema.emailJobs.messageId, refs)))
      .orderBy(desc(schema.emailJobs.sentAt))
      .limit(1);
    if (jobs[0]) {
      campaignId = jobs[0].campaignId;
      const rows = await db.select().from(schema.leads).where(eq(schema.leads.id, jobs[0].leadId)).limit(1);
      lead = rows[0];
    }
  }
  if (!lead) {
    const jobs: any[] = await db
      .select()
      .from(schema.emailJobs)
      .where(and(eq(schema.emailJobs.senderId, sender.id), eq(schema.emailJobs.toEmail, fromEmail), eq(schema.emailJobs.status, "sent")))
      .orderBy(desc(schema.emailJobs.sentAt))
      .limit(1);
    if (jobs[0]) {
      campaignId = jobs[0].campaignId;
      const rows = await db.select().from(schema.leads).where(eq(schema.leads.id, jobs[0].leadId)).limit(1);
      lead = rows[0];
    }
  }
  if (!lead) return false; // not a campaign recipient — ignore

  const { text, html } = extractTextAndHtml(msg);
  const { bodyText, bodyHtml, snippet } = prepareReplyBodies(text, html);
  const receivedAt = (env.date ? new Date(env.date) : new Date()).toISOString();
  const nowS = new Date().toISOString();

  try {
    await db.insert(schema.replies).values({
      id: crypto.randomUUID(),
      userId: sender.userId,
      senderId: sender.id,
      leadId: lead.id,
      campaignId,
      fromName: from.name || env.from?.[0]?.name || "",
      fromEmail,
      subject: env.subject ?? "",
      snippet,
      bodyText,
      bodyHtml,
      messageId,
      receivedAt,
    });
  } catch {
    return false; // unique constraint — already recorded concurrently
  }

  // Stop future sends & mark statuses
  await db
    .update(schema.campaignLeads)
    .set({ status: "replied", updatedAt: nowS })
    .where(eq(schema.campaignLeads.leadId, lead.id));
  await db
    .update(schema.emailJobs)
    .set({ status: "cancelled", lastError: "lead-replied", updatedAt: nowS })
    .where(and(eq(schema.emailJobs.leadId, lead.id), inArray(schema.emailJobs.status, ["pending", "retry", "processing"])));
  await db
    .update(schema.leads)
    .set({ status: "replied", updatedAt: nowS })
    .where(eq(schema.leads.id, lead.id));
  await db
    .update(schema.senderAccounts)
    .set({ repliedCount: sql`${schema.senderAccounts.repliedCount} + 1` })
    .where(eq(schema.senderAccounts.id, sender.id));
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId: sender.userId,
    type: "reply_received",
    message: `${fromEmail} replied via ${sender.email}`,
    campaignId,
  });
  return true;
}

/** Sync all senders that have IMAP configured and are not failed. */
export async function syncTick(db: EngineDb): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, repliesFound: 0, errors: [] };
  const senders: SenderRow[] = await db
    .select()
    .from(schema.senderAccounts)
    .where(sql`${schema.senderAccounts.deletedAt} is null and ${schema.senderAccounts.imapHost} != ''`);
  for (const s of senders) {
    result.checked++;
    const r = await syncSenderReplies(db, s);
    result.repliesFound += r.found;
    if (r.error) result.errors.push(`${s.email}: ${r.error}`);
  }
  return result;
}
