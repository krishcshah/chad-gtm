/**
 * Reply agent — answers inbound replies on autopilot campaigns.
 *
 * Design: the LLM proposes, deterministic guardrails dispose.
 *
 *   inbound reply ─▶ triage (LLM, or heuristics without a key)
 *                 ─▶ decideAction()  ← pure, unit-tested policy
 *                 ─▶ reply      (booking link / known resource / known answer)
 *                    escalate   (client must supply a resource or answer)
 *                    skip       (OOO, opt-out, nothing to say)
 *
 * The agent never invents resources or facts: it can only share URLs that
 * are the client's booking link or items in the client's knowledge base, and
 * anything it cannot ground is escalated to the client as an agent_request.
 * When the client answers, the answer is saved to the knowledge base so the
 * same question is handled automatically next time.
 */
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { classifyReplyTag } from "./sync-replies";
import { callLlmJson, type AiEngineOptions } from "./ai";
import { loadEngineAiOptions } from "./ai-options";
import { sendMail as realSendMail, type SendParams } from "./mailer";
import { extractSenderFirstName } from "./sequence";
import type { EngineDb, SenderRow } from "./db-port";

/* ─── Types ──────────────────────────────────────────────────────────── */

export const REPLY_INTENTS = [
  "interested",
  "meeting_request",
  "question",
  "resource_request",
  "objection",
  "not_now",
  "referral",
  "not_interested",
  "unsubscribe",
  "out_of_office",
  "other",
] as const;
export type ReplyIntent = (typeof REPLY_INTENTS)[number];

export interface KnowledgeItem {
  id: string;
  kind: "resource" | "faq" | "fact";
  title: string;
  content: string;
  url: string | null;
  keywords: string[];
}

export interface Triage {
  intent: ReplyIntent;
  confidence: number;
  /** Short description of what the lead wants, e.g. "case study deck". */
  summary: string;
  /** What resource the lead asked for, if any. */
  requestedResource?: string;
  /** The lead's open question, if any. */
  question?: string;
  /** Model-proposed reply (only trusted after guardrails). */
  draft?: string;
  /** Knowledge ids the model grounded the draft in. */
  knowledgeIds?: string[];
  /** Model's own judgement that the knowledge base answers the question. */
  answerable?: boolean;
  source: "llm" | "heuristic";
}

export type AgentRequestKind = "resource" | "question" | "approval" | "referral" | "booking_url" | "other";

export type AgentDecision =
  | {
      action: "reply";
      body: string;
      tag: "interested" | "not_interested" | null;
      summary: string;
      usedKnowledgeIds: string[];
    }
  | {
      action: "escalate";
      kind: AgentRequestKind;
      title: string;
      question: string;
      draft: string;
      tag: "interested" | null;
      summary: string;
    }
  | { action: "skip"; summary: string; tag: "out_of_office" | "not_interested" | null };

export interface DecisionContext {
  triage: Triage;
  mode: "autopilot" | "approve";
  bookingUrl: string | null;
  knowledge: KnowledgeItem[];
  leadFirstName: string;
  senderFirstName: string;
  companyName: string;
  /** Agent replies already sent in this thread. */
  priorAgentReplies: number;
  maxAgentReplies?: number;
}

/* ─── Heuristic triage (no API key, or LLM failure) ───────────────────── */

const RESOURCE_RE =
  /\b(case stud(?:y|ies)|deck|slides?|references?|testimonials?|portfolio|one[- ]pager|brochure|white ?paper|pricing (?:sheet|page|deck|doc)|price list|rate card|demo video|video|examples?|samples?|proof|clients? you(?:'ve)? worked with|who (?:else )?(?:do you|have you) work(?:ed)? with|security (?:docs?|questionnaire)|soc ?2|documentation|docs)\b/i;
const SEND_VERB_RE = /\b(send|share|see|show|forward|attach|have|get|look at|got)\b/i;
const REFERRAL_RE =
  /\b(reach out to|talk to|speak (?:to|with)|contact|loop(?:ing)? in|cc'?(?:ing|d)?|better person|right person|handles? (?:this|that)|in charge of|responsible for)\b.*@?|\bforwarded (?:this|your email)\b/i;
const NOT_NOW_RE =
  /\b(not (?:right )?now|not a priority|next (?:quarter|year|month)|maybe later|circle back|reach out (?:again )?in|bad timing|no budget|budget (?:is )?(?:frozen|locked)|after (?:q[1-4]|the holidays))\b/i;
const MEETING_RE =
  /\b(book|schedule|set up|hop on|jump on|grab) (?:a |some )?(?:call|time|meeting|chat|demo)|\b(calendar|calendly|availability|available|free (?:on|at|next)|what times?|send (?:me )?(?:a )?(?:link|invite)|let'?s (?:talk|chat|meet)|happy to (?:chat|talk|meet)|open to (?:a )?(?:call|chat))\b/i;
const OBJECTION_RE =
  /\b(already (?:use|have|work with)|we use|too expensive|happy with (?:our|the) current|built (?:it|this) in[- ]house|not a fit|don'?t need)\b/i;

export function heuristicTriage(subject: string, body: string): Triage {
  const text = `${subject || ""}\n${body || ""}`;
  const base = classifyReplyTag(subject, body);
  const firstQuestion = (body.match(/[^.!?\n]*\?/) || [""])[0].trim();

  if (base === "out_of_office") {
    return { intent: "out_of_office", confidence: 0.95, summary: "Auto-reply / out of office", source: "heuristic" };
  }
  if (/\b(unsubscribe|remove me|stop emailing|do not contact|don'?t contact|take me off)\b/i.test(text)) {
    return { intent: "unsubscribe", confidence: 0.95, summary: "Asked to be removed", source: "heuristic" };
  }
  if (base === "not_interested") {
    return { intent: "not_interested", confidence: 0.85, summary: "Not interested", source: "heuristic" };
  }
  const resourceMatch = text.match(RESOURCE_RE);
  if (resourceMatch && (SEND_VERB_RE.test(text) || /\?/.test(text))) {
    return {
      intent: "resource_request",
      confidence: 0.75,
      summary: `Asked for ${resourceMatch[0].toLowerCase()}`,
      requestedResource: resourceMatch[0].toLowerCase(),
      question: firstQuestion || undefined,
      source: "heuristic",
    };
  }
  if (REFERRAL_RE.test(body) && /@|\b(colleague|cofounder|co-founder|team|head of|vp|director|manager)\b/i.test(body)) {
    return { intent: "referral", confidence: 0.6, summary: "Pointed to someone else", source: "heuristic" };
  }
  if (NOT_NOW_RE.test(text)) {
    return { intent: "not_now", confidence: 0.7, summary: "Timing is off", source: "heuristic" };
  }
  if (OBJECTION_RE.test(text)) {
    return {
      intent: "objection",
      confidence: 0.6,
      summary: "Raised an objection",
      question: firstQuestion || undefined,
      source: "heuristic",
    };
  }
  if (MEETING_RE.test(text)) {
    return { intent: "meeting_request", confidence: 0.8, summary: "Wants to meet", source: "heuristic" };
  }
  if (firstQuestion) {
    return { intent: "question", confidence: 0.6, summary: "Asked a question", question: firstQuestion, source: "heuristic" };
  }
  if (base === "interested") {
    return { intent: "interested", confidence: 0.7, summary: "Positive reply", source: "heuristic" };
  }
  return { intent: "other", confidence: 0.3, summary: "Unclear reply", source: "heuristic" };
}

/* ─── Knowledge matching ──────────────────────────────────────────────── */

const STOP = new Set(
  "a an the and or of to for in on at is are be do you your our we me my it this that with from by can could would please any some have has".split(
    " ",
  ),
);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .map((t) => t.replace(/(ies|es|s)$/, (m) => (m === "ies" ? "y" : "")))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Best knowledge item for a request, or null when nothing is a confident match. */
export function matchKnowledge(
  request: string,
  items: KnowledgeItem[],
  kinds: Array<KnowledgeItem["kind"]> = ["resource", "faq", "fact"],
): KnowledgeItem | null {
  const want = new Set(tokens(request));
  if (want.size === 0) return null;
  let best: { item: KnowledgeItem; score: number } | null = null;
  for (const item of items) {
    if (!kinds.includes(item.kind)) continue;
    const have = new Set([
      ...tokens(item.title),
      ...item.keywords.flatMap((k) => tokens(k)),
      ...(item.kind === "faq" ? tokens(item.content).slice(0, 40) : []),
    ]);
    let score = 0;
    for (const t of want) if (have.has(t)) score += 1;
    // Keywords are explicit client intent — weight exact phrase hits.
    for (const k of item.keywords) if (k && request.toLowerCase().includes(k.toLowerCase())) score += 2;
    if (score > (best?.score ?? 0)) best = { item, score };
  }
  return best && best.score >= 2 ? best.item : null;
}

/* ─── Copy helpers ────────────────────────────────────────────────────── */

function greet(name: string): string {
  return name ? `Hi ${name},` : "Hi,";
}

function signoff(sender: string): string {
  return sender ? `\n\nBest,\n${sender}` : "\n\nBest,";
}

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;

/** URLs in a draft that are not the booking link or a knowledge-base URL. */
export function ungroundedUrls(body: string, allowed: string[]): string[] {
  const allow = allowed.filter(Boolean).map((u) => u.replace(/[).,]+$/, "").toLowerCase());
  return (body.match(URL_RE) || [])
    .map((u) => u.replace(/[).,]+$/, ""))
    .filter((u) => !allow.some((a) => u.toLowerCase().startsWith(a)));
}

function bookingLine(url: string | null, warm = true): string {
  if (!url) return "";
  return warm
    ? `Here's my calendar — grab whatever slot suits you: ${url}`
    : `If it's easier to talk it through, my calendar is here: ${url}`;
}

/* ─── Policy ──────────────────────────────────────────────────────────── */

/**
 * Pure decision policy. Every branch is grounded: a reply may only contain the
 * booking link, knowledge-base content, or model text that passes
 * ungroundedUrls(). Everything else escalates to the client.
 */
export function decideAction(ctx: DecisionContext): AgentDecision {
  const { triage, bookingUrl, knowledge, leadFirstName, senderFirstName } = ctx;
  const max = ctx.maxAgentReplies ?? 4;
  const hi = greet(leadFirstName);
  const bye = signoff(senderFirstName);

  // 1. Never answer opt-outs or auto-replies.
  if (triage.intent === "out_of_office") {
    return { action: "skip", summary: "Out-of-office auto-reply — sequence kept running.", tag: "out_of_office" };
  }
  if (triage.intent === "unsubscribe" || triage.intent === "not_interested") {
    return { action: "skip", summary: "Lead opted out — suppressed, no reply sent.", tag: "not_interested" };
  }

  const escalate = (
    kind: AgentRequestKind,
    title: string,
    question: string,
    draft = "",
    summary = title,
  ): AgentDecision => ({
    action: "escalate",
    kind,
    title,
    question,
    draft,
    tag: ["interested", "meeting_request", "resource_request", "question"].includes(triage.intent)
      ? "interested"
      : null,
    summary,
  });

  // 2. Thread budget: long back-and-forths go to a human.
  if (ctx.priorAgentReplies >= max) {
    return escalate(
      "question",
      "Conversation needs a human",
      `The agent has already replied ${ctx.priorAgentReplies} times in this thread. Please take it from here.`,
      triage.draft || "",
      "Thread reply budget reached — handed to you.",
    );
  }

  let decision: AgentDecision;

  switch (triage.intent) {
    case "interested":
    case "meeting_request": {
      if (!bookingUrl) {
        decision = escalate(
          "booking_url",
          "Add your booking link",
          "A lead wants to meet but no booking link is set. Add one so the agent can send it automatically.",
          "",
          "Lead wants to meet — booking link missing.",
        );
        break;
      }
      const body =
        triage.source === "llm" && triage.draft && triage.draft.includes(bookingUrl)
          ? triage.draft
          : `${hi}\n\nGlad this is relevant. ${bookingLine(bookingUrl)}\n\nIf none of those times work, reply with two or three that do and I'll make it happen.${bye}`;
      decision = {
        action: "reply",
        body,
        tag: "interested",
        summary: "Interested — sent booking link.",
        usedKnowledgeIds: [],
      };
      break;
    }
    case "resource_request": {
      const request = triage.requestedResource || triage.question || triage.summary;
      const item = matchKnowledge(request, knowledge, ["resource"]);
      if (!item) {
        decision = escalate(
          "resource",
          `Lead asked for ${triage.requestedResource || "a resource"}`,
          triage.question || triage.summary,
          "",
          `Asked for ${triage.requestedResource || "a resource"} — waiting on you.`,
        );
        break;
      }
      const llmOk =
        triage.source === "llm" &&
        triage.draft &&
        (!item.url || triage.draft.includes(item.url)) &&
        (triage.knowledgeIds || []).includes(item.id);
      const body = llmOk
        ? triage.draft!
        : `${hi}\n\nOf course — here's our ${item.title.toLowerCase()}${item.url ? `: ${item.url}` : "."}${
            item.content && !item.url ? `\n\n${item.content.trim()}` : ""
          }${bookingUrl ? `\n\n${bookingLine(bookingUrl, false)}` : ""}${bye}`;
      decision = {
        action: "reply",
        body,
        tag: "interested",
        summary: `Shared "${item.title}".`,
        usedKnowledgeIds: [item.id],
      };
      break;
    }
    case "question":
    case "objection": {
      const q = triage.question || triage.summary;
      const item = matchKnowledge(q, knowledge, ["faq", "fact", "resource"]);
      if (triage.source === "llm" && triage.answerable && triage.draft) {
        decision = {
          action: "reply",
          body: triage.draft,
          tag: "interested",
          summary: triage.intent === "objection" ? "Handled objection from knowledge base." : "Answered from knowledge base.",
          usedKnowledgeIds: triage.knowledgeIds || [],
        };
        break;
      }
      if (item && item.kind !== "resource") {
        decision = {
          action: "reply",
          body: `${hi}\n\n${item.content.trim()}${bookingUrl ? `\n\n${bookingLine(bookingUrl, false)}` : ""}${bye}`,
          tag: "interested",
          summary: `Answered with "${item.title}".`,
          usedKnowledgeIds: [item.id],
        };
        break;
      }
      const short = q.replace(/\s+/g, " ").trim().slice(0, 70);
      decision = escalate(
        "question",
        triage.intent === "objection"
          ? `Objection: “${short}${q.length > 70 ? "…" : ""}”`
          : `Question: “${short}${q.length > 70 ? "…" : ""}”`,
        q,
        triage.draft || "",
        "Question needs your answer.",
      );
      break;
    }
    case "not_now": {
      decision = {
        action: "reply",
        body: `${hi}\n\nTotally understand — thanks for the honest answer. I'll leave it here.${
          bookingUrl ? ` If timing changes, ${bookingLine(bookingUrl, false).replace(/^If it's easier to talk it through, /, "")}` : ""
        }${bye}`,
        tag: null,
        summary: "Not now — closed politely.",
        usedKnowledgeIds: [],
      };
      break;
    }
    case "referral": {
      decision = escalate(
        "referral",
        "Lead referred you to someone else",
        "The lead pointed to a colleague. Confirm the new contact before the agent reaches out.",
        triage.draft || "",
        "Referral — needs your OK to contact the new person.",
      );
      break;
    }
    default: {
      decision = escalate(
        "other",
        "Reply needs a human read",
        triage.summary || "The agent could not classify this reply confidently.",
        triage.draft || "",
        "Unclear reply — handed to you.",
      );
    }
  }

  // 3. Grounding check: replies may only link to the booking page or knowledge URLs.
  if (decision.action === "reply") {
    const allowed = [bookingUrl || "", ...knowledge.map((k) => k.url || "")];
    const stray = ungroundedUrls(decision.body, allowed);
    if (stray.length > 0) {
      return escalate(
        "approval",
        "Review agent draft",
        `The drafted reply contained a link the agent could not verify (${stray[0]}).`,
        decision.body,
        "Draft held for review — unverified link.",
      );
    }
    if (ctx.mode === "approve") {
      return escalate("approval", "Approve reply", triage.summary, decision.body, "Draft ready for your approval.");
    }
  }

  return decision;
}

/* ─── LLM triage ──────────────────────────────────────────────────────── */

export async function llmTriage(input: {
  subject: string;
  body: string;
  companyName: string;
  companySummary: string;
  offer: string;
  bookingUrl: string | null;
  knowledge: KnowledgeItem[];
  leadFirstName: string;
  senderFirstName: string;
  aiOptions: AiEngineOptions;
}): Promise<Triage | null> {
  const kb = input.knowledge
    .slice(0, 25)
    .map(
      (k) =>
        `- id=${k.id} [${k.kind}] ${k.title}${k.url ? ` (url: ${k.url})` : ""}${k.content ? ` — ${k.content.slice(0, 400)}` : ""}`,
    )
    .join("\n");

  const prompt = `You triage replies to cold emails sent on behalf of ${input.companyName}.

ABOUT THE COMPANY: ${input.companySummary || "(no summary)"}
OFFER: ${input.offer || "(not specified)"}
BOOKING LINK: ${input.bookingUrl || "(none — do not invent one)"}

KNOWLEDGE BASE (the ONLY facts and links you may use):
${kb || "(empty)"}

LEAD REPLY:
Subject: ${input.subject}
${input.body.slice(0, 4000)}

Classify the reply and, when appropriate, draft a short answer from ${input.senderFirstName || "the sender"} to ${input.leadFirstName || "the lead"}.

Rules for the draft:
- 25-90 words, plain text, warm and direct, no marketing fluff, no subject line.
- Only include URLs that are the booking link or a knowledge-base url. Never invent facts, customers, numbers, or links.
- If they are interested or want to meet, include the booking link.
- If they ask for something not in the knowledge base, set answerable=false and leave draft empty.
- Sign off with the sender's first name.

Return JSON:
{
  "intent": one of ${JSON.stringify(REPLY_INTENTS)},
  "confidence": 0..1,
  "summary": "max 12 words, what the lead wants",
  "requestedResource": "the thing they asked to see, or empty",
  "question": "their open question, or empty",
  "answerable": true|false,
  "knowledgeIds": ["ids you used"],
  "draft": "the reply body or empty"
}`;

  const raw = await callLlmJson<any>(prompt, {
    ...input.aiOptions,
    system: "You are a careful SDR assistant. Return exactly one JSON object.",
    timeoutMs: 25_000,
  });
  if (!raw) return null;
  const intent = (REPLY_INTENTS as readonly string[]).includes(raw.intent) ? (raw.intent as ReplyIntent) : "other";
  const validIds = new Set(input.knowledge.map((k) => k.id));
  return {
    intent,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    summary: String(raw.summary || "").slice(0, 160),
    requestedResource: raw.requestedResource ? String(raw.requestedResource).slice(0, 120) : undefined,
    question: raw.question ? String(raw.question).slice(0, 500) : undefined,
    answerable: Boolean(raw.answerable),
    knowledgeIds: Array.isArray(raw.knowledgeIds) ? raw.knowledgeIds.map(String).filter((id: string) => validIds.has(id)) : [],
    draft: raw.draft ? String(raw.draft).trim().slice(0, 2000) : undefined,
    source: "llm",
  };
}

/* ─── Mail composition ────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>").replace(URL_RE, (u) => `<a href="${u}">${u}</a>`)}</p>`)
    .join("");
}

export function composeThreadedReply(input: {
  body: string;
  priorFrom: string;
  priorAt: string;
  priorText: string;
}): { text: string; html: string } {
  const when = (() => {
    const d = new Date(input.priorAt);
    return Number.isNaN(d.getTime()) ? input.priorAt : d.toUTCString();
  })();
  const quoted = input.priorText
    .trim()
    .split("\n")
    .slice(0, 40)
    .map((l) => `> ${l}`)
    .join("\n");
  const text = `${input.body.trim()}\n\nOn ${when}, ${input.priorFrom} wrote:\n${quoted}`;
  const html = `${textToHtml(input.body)}<br><div class="gmail_quote">On ${escapeHtml(when)}, ${escapeHtml(
    input.priorFrom,
  )} wrote:<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${textToHtml(
    input.priorText.slice(0, 4000),
  )}</blockquote></div>`;
  return { text, html };
}

/* ─── Engine tick ─────────────────────────────────────────────────────── */

export interface ReplyAgentDeps {
  sendMail?: (sender: SenderRow, params: SendParams) => Promise<{ messageId: string }>;
  /** Override triage (tests). Return null to fall back to heuristics. */
  triage?: (args: Parameters<typeof llmTriage>[0]) => Promise<Triage | null>;
  now?: () => Date;
  notifyClient?: boolean;
}

export interface ReplyAgentResult {
  processed: number;
  replied: number;
  escalated: number;
  skipped: number;
  failed: number;
  /** Errors that will be retried with backoff. */
  retried: number;
  /** Replies handed to the client after the last attempt failed. */
  gaveUp: number;
  /** Replies recovered from a worker that died mid-processing. */
  reclaimed: number;
  /** Open requests the client was reminded about. */
  renotified: number;
}

/** Attempts before the agent gives up and hands the reply to the client. */
export const AGENT_MAX_ATTEMPTS = 3;
/** A reply left in 'processing' longer than this belonged to a dead worker. */
export const AGENT_STUCK_AFTER_MS = 10 * 60_000;
/** Remind the client once about a request still open after this long. */
export const AGENT_RENOTIFY_AFTER_MS = 24 * 3_600_000;
export const AGENT_GAVE_UP_TITLE = "The agent couldn't handle this reply";

/** Backoff before retry after `attempts` failures: 2^attempts minutes. */
export function agentRetryDelayMs(attempts: number): number {
  return 2 ** Math.max(0, attempts) * 60_000;
}

/** Is a pending reply (failed `attempts` times, last at `claimedAt`) due again? */
export function isAgentRetryDue(attempts: number, claimedAt: string | null | undefined, now: Date): boolean {
  if (!attempts || !claimedAt) return true;
  const t = Date.parse(claimedAt);
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t >= agentRetryDelayMs(attempts);
}

/**
 * Remind once: the request is old enough and the only notification so far is
 * the original one (sent around creation time) or none at all.
 */
export function needsRenotify(
  req: { createdAt: string; notifiedAt: string | null },
  now: Date,
): boolean {
  const created = Date.parse(req.createdAt);
  if (!Number.isFinite(created) || now.getTime() - created < AGENT_RENOTIFY_AFTER_MS) return false;
  if (!req.notifiedAt) return true;
  const notified = Date.parse(req.notifiedAt);
  if (!Number.isFinite(notified)) return true;
  return notified - created < AGENT_RENOTIFY_AFTER_MS / 2;
}

/** SQL: pending replies whose backoff has elapsed. */
function pendingDueCondition(now: Date) {
  const due = [isNull(schema.replies.agentClaimedAt), eq(schema.replies.agentAttempts, 0)];
  for (let a = 1; a < AGENT_MAX_ATTEMPTS; a++) {
    due.push(
      and(
        eq(schema.replies.agentAttempts, a),
        lte(schema.replies.agentClaimedAt, new Date(now.getTime() - agentRetryDelayMs(a)).toISOString()),
      )!,
    );
  }
  return and(eq(schema.replies.agentStatus, "pending"), or(...due));
}

/**
 * Process pending agent replies. Safe to run concurrently: each reply is
 * claimed with a conditional UPDATE before any side effect happens.
 *
 * Reliability: a handling error puts the reply back to 'pending' with
 * agent_attempts+1 and agent_claimed_at as the backoff marker (retry after
 * 2^attempts minutes). After AGENT_MAX_ATTEMPTS the reply is handed to the
 * client as an agent_request. Replies stuck in 'processing' (worker died) are
 * reclaimed after 10 minutes, and open requests get one reminder after 24h.
 */
export async function replyAgentTick(
  db: EngineDb,
  deps: ReplyAgentDeps = {},
  limit = 15,
): Promise<ReplyAgentResult> {
  const result: ReplyAgentResult = {
    processed: 0,
    replied: 0,
    escalated: 0,
    skipped: 0,
    failed: 0,
    retried: 0,
    gaveUp: 0,
    reclaimed: 0,
    renotified: 0,
  };
  const now = deps.now?.() ?? new Date();

  try {
    result.reclaimed = await reclaimStuckReplies(db, deps, now, result);
  } catch (err) {
    console.error("[reply-agent] reclaim failed", err);
  }

  const pending: any[] = await db
    .select({ id: schema.replies.id, agentAttempts: schema.replies.agentAttempts })
    .from(schema.replies)
    .where(pendingDueCondition(now))
    .orderBy(schema.replies.receivedAt)
    .limit(limit);

  for (const row of pending) {
    const claimed: any[] = await db
      .update(schema.replies)
      .set({ agentStatus: "processing", agentClaimedAt: now.toISOString() })
      .where(and(eq(schema.replies.id, row.id), eq(schema.replies.agentStatus, "pending")))
      .returning({ id: schema.replies.id });
    if (claimed.length === 0) continue;
    result.processed++;
    try {
      const outcome = await handleReply(db, row.id, deps);
      result[outcome]++;
    } catch (err) {
      console.error("[reply-agent] failed", row.id, err);
      result.failed++;
      const attempts = Number(row.agentAttempts ?? 0) + 1;
      await recordAgentFailure(db, row.id, attempts, String((err as Error)?.message || err), deps, now, result);
    }
  }

  try {
    result.renotified = await renotifyStaleRequests(db, deps, now);
  } catch (err) {
    console.error("[reply-agent] re-notify failed", err);
  }
  return result;
}

/** After a handling error: back off and retry, or give up after the last attempt. */
async function recordAgentFailure(
  db: EngineDb,
  replyId: string,
  attempts: number,
  message: string,
  deps: ReplyAgentDeps,
  now: Date,
  result: ReplyAgentResult,
): Promise<void> {
  if (attempts >= AGENT_MAX_ATTEMPTS) {
    await giveUpOnReply(db, replyId, attempts, message, deps, now);
    result.gaveUp++;
    return;
  }
  await db
    .update(schema.replies)
    .set({
      agentStatus: "pending",
      agentAttempts: attempts,
      agentClaimedAt: now.toISOString(),
      agentSummary: `Agent error (attempt ${attempts} of ${AGENT_MAX_ATTEMPTS}), retrying: ${message.slice(0, 160)}`,
    })
    .where(eq(schema.replies.id, replyId));
  result.retried++;
}

/** Replies left in 'processing' by a worker that died: retry (counts as an attempt). */
async function reclaimStuckReplies(
  db: EngineDb,
  deps: ReplyAgentDeps,
  now: Date,
  result: ReplyAgentResult,
): Promise<number> {
  const cutoff = new Date(now.getTime() - AGENT_STUCK_AFTER_MS).toISOString();
  const stuck: { id: string; agentAttempts: number | null; agentClaimedAt: string | null }[] = await db
    .select({
      id: schema.replies.id,
      agentAttempts: schema.replies.agentAttempts,
      agentClaimedAt: schema.replies.agentClaimedAt,
    })
    .from(schema.replies)
    .where(
      and(
        eq(schema.replies.agentStatus, "processing"),
        or(isNull(schema.replies.agentClaimedAt), lte(schema.replies.agentClaimedAt, cutoff)),
      ),
    )
    .limit(50);
  let reclaimed = 0;
  for (const row of stuck) {
    const attempts = Number(row.agentAttempts ?? 0) + 1;
    if (attempts >= AGENT_MAX_ATTEMPTS) {
      // Claim it first so two workers do not both give up on it.
      const claimed: any[] = await db
        .update(schema.replies)
        .set({ agentClaimedAt: now.toISOString() })
        .where(
          and(
            eq(schema.replies.id, row.id),
            eq(schema.replies.agentStatus, "processing"),
            row.agentClaimedAt
              ? eq(schema.replies.agentClaimedAt, row.agentClaimedAt)
              : isNull(schema.replies.agentClaimedAt),
          ),
        )
        .returning({ id: schema.replies.id });
      if (claimed.length === 0) continue;
      await giveUpOnReply(db, row.id, attempts, "The worker stopped while handling this reply.", deps, now);
      result.gaveUp++;
      reclaimed++;
      continue;
    }
    const res: any[] = await db
      .update(schema.replies)
      .set({ agentStatus: "pending", agentAttempts: attempts, agentClaimedAt: now.toISOString() })
      .where(
        and(
          eq(schema.replies.id, row.id),
          eq(schema.replies.agentStatus, "processing"),
          row.agentClaimedAt
            ? eq(schema.replies.agentClaimedAt, row.agentClaimedAt)
            : isNull(schema.replies.agentClaimedAt),
        ),
      )
      .returning({ id: schema.replies.id });
    if (res.length > 0) reclaimed++;
  }
  return reclaimed;
}

/** Last attempt failed: mark the reply failed and put it in front of the client. */
async function giveUpOnReply(
  db: EngineDb,
  replyId: string,
  attempts: number,
  message: string,
  deps: ReplyAgentDeps,
  now: Date,
): Promise<void> {
  const nowIso = now.toISOString();
  await db
    .update(schema.replies)
    .set({
      agentStatus: "failed",
      agentAttempts: attempts,
      agentSummary: `Agent gave up after ${attempts} attempts: ${message.slice(0, 160)}`,
      agentHandledAt: nowIso,
    })
    .where(eq(schema.replies.id, replyId));

  const [reply] = await db.select().from(schema.replies).where(eq(schema.replies.id, replyId)).limit(1);
  if (!reply) return;
  const [run] = reply.campaignId
    ? await db.select().from(schema.chadGtmRuns).where(eq(schema.chadGtmRuns.campaignId, reply.campaignId)).limit(1)
    : [];
  const [lead] = reply.leadId
    ? await db.select().from(schema.leads).where(eq(schema.leads.id, reply.leadId)).limit(1)
    : [];
  const ownerId: string = run?.userId || reply.userId;

  const existing: any[] = await db
    .select({ id: schema.agentRequests.id })
    .from(schema.agentRequests)
    .where(and(eq(schema.agentRequests.replyId, replyId), eq(schema.agentRequests.status, "open")))
    .limit(1);
  if (existing.length > 0) return;

  const requestId = crypto.randomUUID();
  const said = String(reply.bodyText || reply.snippet || "").replace(/\s+/g, " ").trim().slice(0, 500);
  await db.insert(schema.agentRequests).values({
    id: requestId,
    userId: ownerId,
    workspaceId: run?.workspaceId ?? null,
    runId: run?.id ?? null,
    campaignId: reply.campaignId,
    replyId,
    leadId: reply.leadId,
    kind: "other",
    status: "open",
    title: AGENT_GAVE_UP_TITLE,
    question: said || `${reply.fromEmail} replied (subject: ${reply.subject || "no subject"})`,
    leadEmail: reply.fromEmail,
    leadName: [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || reply.fromName || "",
    leadCompany: lead?.company || "",
    draftReply: "",
  });
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId: ownerId,
    type: "agent.failed",
    message: `Agent couldn't handle a reply from ${reply.fromEmail}; it's waiting for you`,
    campaignId: reply.campaignId,
    meta: { replyId, attempts },
  });

  if (deps.notifyClient !== false) {
    const [sender] = await db
      .select()
      .from(schema.senderAccounts)
      .where(eq(schema.senderAccounts.id, reply.senderId))
      .limit(1);
    if (sender) {
      await notifyClientOfRequest(
        db,
        sender as SenderRow,
        ownerId,
        AGENT_GAVE_UP_TITLE,
        said,
        reply.fromEmail,
        deps,
      ).catch((err) => console.warn("[reply-agent] client notification failed", err));
    }
  }
  // Stamp it even if the email failed, so the 24h reminder logic has a baseline.
  await db.update(schema.agentRequests).set({ notifiedAt: nowIso }).where(eq(schema.agentRequests.id, requestId));
}

/** Remind the client once about requests still open after 24 hours. */
async function renotifyStaleRequests(db: EngineDb, deps: ReplyAgentDeps, now: Date): Promise<number> {
  if (deps.notifyClient === false) return 0;
  const cutoff = new Date(now.getTime() - AGENT_RENOTIFY_AFTER_MS).toISOString();
  const rows: any[] = await db
    .select()
    .from(schema.agentRequests)
    .where(
      and(
        eq(schema.agentRequests.status, "open"),
        lte(schema.agentRequests.createdAt, cutoff),
        or(
          isNull(schema.agentRequests.notifiedAt),
          sql`${schema.agentRequests.notifiedAt}::timestamptz < ${schema.agentRequests.createdAt}::timestamptz + interval '12 hours'`,
        ),
      ),
    )
    .limit(10);
  let sent = 0;
  for (const req of rows) {
    if (!needsRenotify({ createdAt: req.createdAt, notifiedAt: req.notifiedAt ?? null }, now)) continue;
    // Claim the reminder (conditional on the notifiedAt we read) so it goes out once.
    const claimed: any[] = await db
      .update(schema.agentRequests)
      .set({ notifiedAt: now.toISOString() })
      .where(
        and(
          eq(schema.agentRequests.id, req.id),
          eq(schema.agentRequests.status, "open"),
          req.notifiedAt ? eq(schema.agentRequests.notifiedAt, req.notifiedAt) : isNull(schema.agentRequests.notifiedAt),
        ),
      )
      .returning({ id: schema.agentRequests.id });
    if (claimed.length === 0) continue;
    const [reply] = req.replyId
      ? await db.select().from(schema.replies).where(eq(schema.replies.id, req.replyId)).limit(1)
      : [];
    const [sender] = reply
      ? await db.select().from(schema.senderAccounts).where(eq(schema.senderAccounts.id, reply.senderId)).limit(1)
      : [];
    if (!sender) continue;
    await notifyClientOfRequest(
      db,
      sender as SenderRow,
      req.userId,
      `Reminder: ${req.title}`,
      req.question || "",
      req.leadEmail || reply?.fromEmail || "",
      deps,
    )
      .then(() => {
        sent++;
      })
      .catch((err) => console.warn("[reply-agent] reminder failed", err));
    // notifyClientOfRequest may stamp sibling requests; keep this one's stamp.
    await db
      .update(schema.agentRequests)
      .set({ notifiedAt: now.toISOString() })
      .where(eq(schema.agentRequests.id, req.id));
  }
  return sent;
}

async function handleReply(
  db: EngineDb,
  replyId: string,
  deps: ReplyAgentDeps,
): Promise<"replied" | "escalated" | "skipped"> {
  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  const [reply] = await db.select().from(schema.replies).where(eq(schema.replies.id, replyId)).limit(1);
  if (!reply) throw new Error("reply vanished");

  const [run] = reply.campaignId
    ? await db.select().from(schema.chadGtmRuns).where(eq(schema.chadGtmRuns.campaignId, reply.campaignId)).limit(1)
    : [];
  const [lead] = reply.leadId
    ? await db.select().from(schema.leads).where(eq(schema.leads.id, reply.leadId)).limit(1)
    : [];
  const [sender] = await db
    .select()
    .from(schema.senderAccounts)
    .where(eq(schema.senderAccounts.id, reply.senderId))
    .limit(1);

  const finish = async (
    status: "replied" | "escalated" | "skipped",
    intent: string,
    summary: string,
    tag?: string | null,
  ) => {
    await db
      .update(schema.replies)
      .set({
        agentStatus: status,
        agentIntent: intent,
        agentSummary: summary,
        agentHandledAt: nowIso,
        ...(tag !== undefined && tag !== null ? { tag: tag as any } : {}),
      })
      .where(eq(schema.replies.id, replyId));
    return status;
  };

  if (!run || run.replyAgentMode === "off" || !sender) {
    return finish("skipped", "other", run ? "Reply agent is off for this campaign." : "Not an autopilot campaign.");
  }

  const ownerId: string = run.userId;
  const workspaceId: string | null = run.workspaceId ?? null;

  const knowledgeRows: any[] = await db
    .select()
    .from(schema.agentKnowledge)
    .where(
      workspaceId
        ? and(eq(schema.agentKnowledge.userId, ownerId), eq(schema.agentKnowledge.workspaceId, workspaceId))
        : eq(schema.agentKnowledge.userId, ownerId),
    )
    .orderBy(desc(schema.agentKnowledge.updatedAt))
    .limit(60);
  const knowledge: KnowledgeItem[] = knowledgeRows.map((k) => ({
    id: k.id,
    kind: k.kind,
    title: k.title,
    content: k.content || "",
    url: k.url || null,
    keywords: Array.isArray(k.keywords) ? k.keywords : [],
  }));

  const priorAgentRows: any[] = reply.leadId
    ? await db
        .select({ c: sql<number>`count(*)` })
        .from(schema.uniboxMessages)
        .where(and(eq(schema.uniboxMessages.leadId, reply.leadId), eq(schema.uniboxMessages.fromRole, "agent" as any)))
    : [{ c: 0 }];
  const priorAgentReplies = Number(priorAgentRows[0]?.c || 0);

  const leadFirstName = String(lead?.firstName || reply.fromName?.split(/\s+/)[0] || "").trim();
  const senderFirstName = extractSenderFirstName(sender as SenderRow);
  const overview: any = run.businessOverview || {};
  const offers: any[] = Array.isArray(run.offers) ? run.offers : [];
  const offer = offers[0] ? `${offers[0].title}: ${offers[0].valueProp}` : "";

  let triage: Triage | null = null;
  try {
    const aiOptions = await loadEngineAiOptions(db, ownerId);
    const triageFn = deps.triage ?? llmTriage;
    triage = await triageFn({
      subject: reply.subject || "",
      body: reply.bodyText || reply.snippet || "",
      companyName: run.companyName || "our company",
      companySummary: overview.summary || "",
      offer,
      bookingUrl: run.bookingUrl || null,
      knowledge,
      leadFirstName,
      senderFirstName,
      aiOptions,
    });
  } catch (err) {
    console.warn("[reply-agent] LLM triage failed; using heuristics", err);
  }
  if (!triage) triage = heuristicTriage(reply.subject || "", reply.bodyText || reply.snippet || "");

  const decision = decideAction({
    triage,
    mode: run.replyAgentMode === "approve" ? "approve" : "autopilot",
    bookingUrl: run.bookingUrl || null,
    knowledge,
    leadFirstName,
    senderFirstName,
    companyName: run.companyName || "",
    priorAgentReplies,
  });

  if (decision.action === "skip") {
    return finish("skipped", triage.intent, decision.summary, decision.tag);
  }

  if (decision.action === "escalate") {
    // One open request per reply.
    const existing: any[] = await db
      .select({ id: schema.agentRequests.id })
      .from(schema.agentRequests)
      .where(and(eq(schema.agentRequests.replyId, replyId), eq(schema.agentRequests.status, "open")))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(schema.agentRequests).values({
        id: crypto.randomUUID(),
        userId: ownerId,
        workspaceId,
        runId: run.id,
        campaignId: reply.campaignId,
        replyId,
        leadId: reply.leadId,
        kind: decision.kind,
        status: "open",
        title: decision.title,
        question: decision.question,
        leadEmail: reply.fromEmail,
        leadName: [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || reply.fromName || "",
        leadCompany: lead?.company || "",
        draftReply: decision.draft,
      });
      await db.insert(schema.activityLogs).values({
        id: crypto.randomUUID(),
        userId: ownerId,
        type: "agent.escalated",
        message: `Agent needs you: ${decision.title} (${reply.fromEmail})`,
        campaignId: reply.campaignId,
        meta: { replyId, kind: decision.kind },
      });
      if (deps.notifyClient !== false) {
        await notifyClientOfRequest(db, sender as SenderRow, ownerId, decision.title, decision.question, reply.fromEmail, deps).catch(
          (err) => console.warn("[reply-agent] client notification failed", err),
        );
      }
    }
    return finish("escalated", triage.intent, decision.summary, decision.tag);
  }

  // decision.action === "reply"
  const sent = await sendAgentReply(db, {
    reply,
    sender: sender as SenderRow,
    ownerId,
    workspaceId,
    body: decision.body,
    nowIso,
    deps,
  });
  if (decision.usedKnowledgeIds.length > 0) {
    await db
      .update(schema.agentKnowledge)
      .set({ usageCount: sql`${schema.agentKnowledge.usageCount} + 1`, updatedAt: nowIso })
      .where(inArray(schema.agentKnowledge.id, decision.usedKnowledgeIds));
  }
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId: ownerId,
    type: "agent.replied",
    message: `Agent replied to ${reply.fromEmail}: ${decision.summary}`,
    campaignId: reply.campaignId,
    meta: { replyId, uniboxMessageId: sent.uniboxMessageId },
  });
  return finish("replied", triage.intent, decision.summary, decision.tag);
}

/** Send a threaded reply as the mailbox that received the lead's message. */
export async function sendAgentReply(
  db: EngineDb,
  input: {
    reply: any;
    sender: SenderRow;
    ownerId: string;
    workspaceId: string | null;
    body: string;
    nowIso: string;
    deps?: ReplyAgentDeps;
    fromRole?: "agent" | "operator";
  },
): Promise<{ uniboxMessageId: string; messageId: string }> {
  const { reply, sender } = input;
  const send = input.deps?.sendMail ?? realSendMail;
  const baseSubject = String(reply.subject || "").trim();
  const subject = /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject || "your note"}`;
  const mail = composeThreadedReply({
    body: input.body,
    priorFrom: reply.fromName ? `${reply.fromName} <${reply.fromEmail}>` : reply.fromEmail,
    priorAt: reply.receivedAt,
    priorText: reply.bodyText || reply.snippet || "",
  });
  const info = await send(sender, {
    to: reply.fromEmail,
    subject,
    text: mail.text,
    html: mail.html,
    inReplyTo: reply.messageId || undefined,
    references: reply.messageId || undefined,
  });
  const uniboxMessageId = crypto.randomUUID();
  await db.insert(schema.uniboxMessages).values({
    id: uniboxMessageId,
    userId: input.ownerId,
    workspaceId: input.workspaceId,
    replyId: reply.id,
    leadId: reply.leadId,
    campaignId: reply.campaignId,
    senderId: sender.id,
    direction: "operator",
    fromRole: (input.fromRole ?? "agent") as any,
    fromName: (sender.fromName || sender.senderName || "").trim(),
    fromEmail: sender.email,
    subject,
    bodyText: input.body.trim(),
    bodyHtml: textToHtml(input.body),
    sentAt: input.nowIso,
  });
  return { uniboxMessageId, messageId: info.messageId };
}

export async function notifyClientOfRequest(
  db: EngineDb,
  sender: SenderRow,
  ownerId: string,
  title: string,
  question: string,
  leadEmail: string,
  deps: ReplyAgentDeps,
): Promise<void> {
  const [owner] = await db
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, ownerId))
    .limit(1);
  if (!owner?.email) return;
  const appUrl = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "").replace(/\/$/, "");
  const link = appUrl ? `${appUrl}/requests` : "your AutoGTM requests page";
  const firstName = String(owner.name || "").split(/\s+/)[0] || "there";
  const body = `Hi ${firstName},\n\nYour outreach agent needs a hand with a lead (${leadEmail}).\n\n${title}\n"${question}"\n\nAnswer it here and the agent will pick the conversation back up: ${link}\n\nAnything you share is saved, so the agent won't ask twice.\n\n— AutoGTM`;
  const message = {
    to: owner.email,
    subject: `Your agent needs you: ${title}`,
    text: body,
    html: textToHtml(body),
  };
  // Prefer the dedicated system sender (neutral "AutoGTM" From, outside the
  // cold-outreach pool). Fall back to the pool mailbox that received the
  // reply only when no system mailer is configured. Any send failure throws,
  // so notified_at is only set after a successful send.
  const { isSystemMailerConfigured, sendSystemEmail } = await import("./system-mailer");
  if (isSystemMailerConfigured()) {
    await sendSystemEmail(message);
  } else {
    const send = deps.sendMail ?? realSendMail;
    await send(sender, message);
  }
  await db
    .update(schema.agentRequests)
    .set({ notifiedAt: (deps.now?.() ?? new Date()).toISOString() })
    .where(
      and(
        eq(schema.agentRequests.userId, ownerId),
        eq(schema.agentRequests.leadEmail, leadEmail),
        sql`${schema.agentRequests.notifiedAt} is null`,
      ),
    );
}
