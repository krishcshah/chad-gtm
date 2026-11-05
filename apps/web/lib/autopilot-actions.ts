"use server";

/**
 * One-URL autopilot + reply-agent controls.
 *
 *  startAutopilotAction      URL in → research → leads → campaign live
 *  setBookingUrlAction       the one thing we may need to ask for
 *  setReplyAgentModeAction   autopilot | approve | off
 *  agent requests            what the agent needs from the client
 *  knowledge base            resources/answers the agent may use
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { getDb, ensureChadGtmTables } from "./db";
import { requireUser } from "./session";
import { getActiveWorkspace } from "./workspaces";
import { analyzeWebsiteAction } from "./chad-gtm-actions";
import { launchRunCampaign } from "./gtm-launch";
import { normalizeClientBookingUrl } from "./booking-links";
import { getWorkspaceAiOptions } from "./ai";

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const DEFAULT_DAILY = 60;

async function loadOwnedRun(runId: string, userId: string) {
  const db = getDb();
  await ensureChadGtmTables(db);
  const [run] = await db
    .select()
    .from(schema.chadGtmRuns)
    .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.userId, userId)))
    .limit(1);
  return run ?? null;
}

/* ─── Autopilot launch ────────────────────────────────────────────────── */

export async function startAutopilotAction(input: {
  url: string;
  bookingUrl?: string;
  notes?: string;
}): Promise<Result<{ runId: string; needsBookingUrl: boolean; campaignId?: string; companyName?: string }>> {
  const user = await requireUser();
  const url = String(input?.url || "").trim();
  if (url.length < 4 || !url.includes(".")) return { ok: false, error: "Enter your company website, e.g. acme.com" };

  let bookingUrl: string | null = null;
  if (input.bookingUrl?.trim()) {
    bookingUrl = normalizeClientBookingUrl(input.bookingUrl);
    if (!bookingUrl) return { ok: false, error: "That booking link doesn't look like a valid URL." };
  }

  const analysis = await analyzeWebsiteAction(url, input.notes, { autopilot: true, bookingUrl });
  if (!analysis.ok || !analysis.runId) {
    return { ok: false, error: analysis.error || "We couldn't analyze that website." };
  }

  const run = await loadOwnedRun(analysis.runId, user.id);
  if (!run) return { ok: false, error: "Analysis finished but the run could not be loaded." };

  const db = getDb();
  if (!run.bookingUrl) {
    await db
      .update(schema.chadGtmRuns)
      .set({ status: "needs_input", autopilot: true, updatedAt: nowIso() })
      .where(eq(schema.chadGtmRuns.id, run.id));
    revalidatePath("/chad-gtm");
    return {
      ok: true,
      data: { runId: run.id, needsBookingUrl: true, companyName: run.companyName },
      message: "Almost there — we just need your booking link.",
    };
  }

  try {
    const launched = await launchAutopilotRun(run.id, user.id);
    return {
      ok: true,
      data: { runId: run.id, needsBookingUrl: false, campaignId: launched.campaignId, companyName: run.companyName },
      message: `Outreach is live — ${launched.leadCount} prospects queued.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Launch failed." };
  }
}

async function launchAutopilotRun(runId: string, userId: string) {
  const db = getDb();
  const run = await loadOwnedRun(runId, userId);
  if (!run) throw new Error("Run not found.");
  if (run.campaignId) return { campaignId: run.campaignId, leadCount: 0 };
  const workspace = await getActiveWorkspace(userId);
  const out = await launchRunCampaign(db, {
    run,
    userId,
    workspaceId: run.workspaceId ?? workspace.id,
    dailyLimit: run.dailyEmailLimit && run.dailyEmailLimit > 30 ? run.dailyEmailLimit : DEFAULT_DAILY,
    approvedSamples: [],
    selectedOfferIndex: 0,
  });
  await db
    .update(schema.chadGtmRuns)
    .set({ autopilot: true, updatedAt: nowIso() })
    .where(eq(schema.chadGtmRuns.id, run.id));
  revalidatePath("/chad-gtm");
  revalidatePath(`/chad-gtm/${run.id}`);
  revalidatePath("/dashboard");
  return out;
}

export async function setBookingUrlAction(
  runId: string,
  rawUrl: string,
): Promise<Result<{ launched: boolean; campaignId?: string }>> {
  const user = await requireUser();
  const bookingUrl = normalizeClientBookingUrl(rawUrl || "");
  if (!bookingUrl) return { ok: false, error: "Paste a full booking link, e.g. https://cal.com/you/intro" };
  const run = await loadOwnedRun(runId, user.id);
  if (!run) return { ok: false, error: "Run not found." };

  const db = getDb();
  await db
    .update(schema.chadGtmRuns)
    .set({ bookingUrl, updatedAt: nowIso() })
    .where(eq(schema.chadGtmRuns.id, run.id));

  // Requests that were only waiting on a booking link can be retried by the agent.
  const waiting = await db
    .select({ id: schema.agentRequests.id, replyId: schema.agentRequests.replyId })
    .from(schema.agentRequests)
    .where(
      and(
        eq(schema.agentRequests.userId, user.id),
        eq(schema.agentRequests.runId, run.id),
        eq(schema.agentRequests.kind, "booking_url"),
        eq(schema.agentRequests.status, "open"),
      ),
    );
  for (const w of waiting) {
    await db
      .update(schema.agentRequests)
      .set({ status: "resolved", resolution: `Booking link set: ${bookingUrl}`, resolvedAt: nowIso(), updatedAt: nowIso() })
      .where(eq(schema.agentRequests.id, w.id));
    if (w.replyId) {
      await db.update(schema.replies).set({ agentStatus: "pending" }).where(eq(schema.replies.id, w.replyId));
    }
  }

  let launched = false;
  let campaignId: string | undefined = run.campaignId ?? undefined;
  if (run.autopilot && !run.campaignId) {
    try {
      const out = await launchAutopilotRun(run.id, user.id);
      launched = true;
      campaignId = out.campaignId;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Saved the link, but launch failed." };
    }
  }
  revalidatePath(`/chad-gtm/${run.id}`);
  revalidatePath("/requests");
  return {
    ok: true,
    data: { launched, campaignId },
    message: launched ? "Booking link saved — outreach is live." : "Booking link saved.",
  };
}

export async function setReplyAgentModeAction(
  runId: string,
  mode: "autopilot" | "approve" | "off",
): Promise<Result> {
  const user = await requireUser();
  if (!["autopilot", "approve", "off"].includes(mode)) return { ok: false, error: "Unknown mode." };
  const run = await loadOwnedRun(runId, user.id);
  if (!run) return { ok: false, error: "Run not found." };
  await getDb()
    .update(schema.chadGtmRuns)
    .set({ replyAgentMode: mode, updatedAt: nowIso() })
    .where(eq(schema.chadGtmRuns.id, run.id));
  revalidatePath(`/chad-gtm/${run.id}`);
  return {
    ok: true,
    message:
      mode === "autopilot"
        ? "The agent now replies on its own."
        : mode === "approve"
          ? "The agent will draft replies for your approval."
          : "Reply agent paused — reply from the UniBox.",
  };
}

/* ─── Agent requests (human-in-the-loop) ─────────────────────────────── */

export interface AgentRequestView {
  id: string;
  runId: string | null;
  kind: string;
  status: string;
  title: string;
  question: string;
  leadEmail: string;
  leadName: string;
  leadCompany: string;
  draftReply: string;
  resolution: string | null;
  resourceUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
  replySubject: string;
  replyBody: string;
  replyReceivedAt: string | null;
  companyName: string;
}

export async function listAgentRequests(
  status: "open" | "resolved" | "all" = "open",
): Promise<AgentRequestView[]> {
  const user = await requireUser();
  const db = getDb();
  const conds = [eq(schema.agentRequests.userId, user.id)];
  if (status !== "all") conds.push(eq(schema.agentRequests.status, status));
  const rows = await db
    .select({
      r: schema.agentRequests,
      replySubject: schema.replies.subject,
      replyBody: schema.replies.bodyText,
      replyReceivedAt: schema.replies.receivedAt,
      companyName: schema.chadGtmRuns.companyName,
    })
    .from(schema.agentRequests)
    .leftJoin(schema.replies, eq(schema.replies.id, schema.agentRequests.replyId))
    .leftJoin(schema.chadGtmRuns, eq(schema.chadGtmRuns.id, schema.agentRequests.runId))
    .where(and(...conds))
    .orderBy(desc(schema.agentRequests.createdAt))
    .limit(200);
  return rows.map(({ r, replySubject, replyBody, replyReceivedAt, companyName }: any) => ({
    id: r.id,
    runId: r.runId,
    kind: r.kind,
    status: r.status,
    title: r.title,
    question: r.question,
    leadEmail: r.leadEmail,
    leadName: r.leadName,
    leadCompany: r.leadCompany,
    draftReply: r.draftReply,
    resolution: r.resolution,
    resourceUrl: r.resourceUrl,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    replySubject: replySubject || "",
    replyBody: replyBody || "",
    replyReceivedAt: replyReceivedAt || null,
    companyName: companyName || "",
  }));
}

export async function countOpenAgentRequests(): Promise<number> {
  try {
    const user = await requireUser();
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(schema.agentRequests)
      .where(and(eq(schema.agentRequests.userId, user.id), eq(schema.agentRequests.status, "open")));
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

async function loadOwnedRequest(requestId: string, userId: string) {
  const db = getDb();
  const [req] = await db
    .select()
    .from(schema.agentRequests)
    .where(and(eq(schema.agentRequests.id, requestId), eq(schema.agentRequests.userId, userId)))
    .limit(1);
  return req ?? null;
}

const URL_IN_TEXT = /https?:\/\/[^\s<>()"']+/gi;

const KEYWORD_STOP = new Set(
  "about above after again also another before being below between both case could does doing during each even every from have having here into just like look make many more most much need only other over please same send share should some such than that their them then there these they this those through very want were what when where which while with would your yours company similar first thanks thank hello lead asked agent answer something yet cant does work".split(
    " ",
  ),
);

/** Distinct, meaningful words for knowledge matching ("deck", "references", "pricing"). */
function keywordsFrom(text: string): string[] {
  const words = (text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).filter((w) => !KEYWORD_STOP.has(w));
  const phrases: string[] = [];
  if (/case stud/i.test(text)) phrases.push("case study");
  if (/pric/i.test(text)) phrases.push("pricing");
  return Array.from(new Set([...phrases, ...words])).slice(0, 10);
}

/**
 * Turn the client's answer into a reply to the lead. Uses the workspace model
 * when configured (polish only — it may not add links or facts), otherwise a
 * plain template. The client always sees and can edit the draft before sending.
 */
export async function draftRequestReplyAction(input: {
  requestId: string;
  answer: string;
  resourceUrl?: string;
}): Promise<Result<{ draft: string }>> {
  const user = await requireUser();
  const req = await loadOwnedRequest(input.requestId, user.id);
  if (!req) return { ok: false, error: "Request not found." };
  const answer = String(input.answer || "").trim();
  const resourceUrl = input.resourceUrl?.trim() ? normalizeClientBookingUrl(input.resourceUrl) : null;
  if (!answer && !resourceUrl) return { ok: false, error: "Add an answer or a link for the agent to use." };

  const db = getDb();
  const run = req.runId ? await loadOwnedRun(req.runId, user.id) : null;
  const [reply] = req.replyId
    ? await db.select().from(schema.replies).where(eq(schema.replies.id, req.replyId)).limit(1)
    : [];
  const [sender] = reply
    ? await db.select().from(schema.senderAccounts).where(eq(schema.senderAccounts.id, reply.senderId)).limit(1)
    : [];
  const { extractSenderFirstName, callLlmJson } = await import("@smartreach/email-engine");
  const senderFirst = sender ? extractSenderFirstName(sender as any) : "";
  const leadFirst = (req.leadName || "").split(/\s+/)[0] || "";
  const booking = run?.bookingUrl || "";

  const template = [
    leadFirst ? `Hi ${leadFirst},` : "Hi,",
    "",
    answer,
    resourceUrl ? `\n${resourceUrl}` : "",
    booking ? `\nHappy to walk you through it live — grab a time here: ${booking}` : "",
    "",
    "Best,",
    senderFirst,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let draft = template;
  try {
    const ai = await getWorkspaceAiOptions(user.id);
    const out = await callLlmJson<{ draft?: string }>(
      `Rewrite this email reply so it reads naturally and briefly (under 110 words). Keep every fact and link exactly; do not add any new facts, numbers, names, or links.

LEAD ASKED: ${req.question}
LEAD'S EMAIL: ${(reply?.bodyText || "").slice(0, 1500)}

REPLY TO POLISH:
${template}

Return JSON: {"draft": "..."}`,
      { ...ai, system: "You polish sales email replies without changing their substance. Return one JSON object.", timeoutMs: 20_000 },
    );
    const polished = out?.draft?.trim();
    if (polished) {
      const allowed = [resourceUrl, booking].filter(Boolean) as string[];
      const urls = polished.match(URL_IN_TEXT) || [];
      const stray = urls.some((u) => !allowed.some((a) => u.replace(/[).,]+$/, "").startsWith(a)));
      const keptLinks = allowed.every((a) => polished.includes(a));
      if (!stray && keptLinks) draft = polished;
    }
  } catch {
    // Template is fine.
  }
  return { ok: true, data: { draft } };
}

export async function resolveAgentRequestAction(input: {
  requestId: string;
  body: string;
  answer?: string;
  resourceUrl?: string;
  saveToKnowledge?: boolean;
  knowledgeTitle?: string;
}): Promise<Result> {
  const user = await requireUser();
  const req = await loadOwnedRequest(input.requestId, user.id);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "open") return { ok: false, error: "This request is already closed." };
  const body = String(input.body || "").trim();
  if (body.length < 5) return { ok: false, error: "Write the reply before sending." };

  const db = getDb();
  const [reply] = req.replyId
    ? await db.select().from(schema.replies).where(eq(schema.replies.id, req.replyId)).limit(1)
    : [];
  if (!reply) return { ok: false, error: "The original lead reply is gone; reply from the UniBox instead." };
  const [sender] = await db
    .select()
    .from(schema.senderAccounts)
    .where(eq(schema.senderAccounts.id, reply.senderId))
    .limit(1);
  if (!sender) return { ok: false, error: "The mailbox for this thread is no longer available." };

  // Do not message someone who opted out since the request was created.
  const [suppressed] = await db
    .select({ id: schema.suppressions.id })
    .from(schema.suppressions)
    .where(and(eq(schema.suppressions.userId, user.id), eq(schema.suppressions.value, reply.fromEmail.toLowerCase())))
    .limit(1);
  if (suppressed) return { ok: false, error: `${reply.fromEmail} has opted out — the reply was not sent.` };

  const { sendAgentReply } = await import("@smartreach/email-engine/reply-agent");
  const now = nowIso();
  try {
    await sendAgentReply(db, {
      reply,
      sender: sender as any,
      ownerId: user.id,
      workspaceId: req.workspaceId,
      body,
      nowIso: now,
      fromRole: "agent",
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Send failed: ${err.message}` : "Send failed." };
  }

  const resourceUrl = input.resourceUrl?.trim() ? normalizeClientBookingUrl(input.resourceUrl) : null;
  const answer = String(input.answer || "").trim();
  if (input.saveToKnowledge && (answer || resourceUrl) && req.kind !== "approval") {
    // Questions are filed under the question itself so future matching works
    // on the lead's own words; resources under what was asked for.
    const baseTitle =
      input.knowledgeTitle ||
      (req.kind === "resource"
        ? req.title.replace(/^Lead asked for /i, "")
        : req.question || req.title.replace(/^(Question|Objection): /i, "").replace(/[“”]/g, ""));
    const title = (baseTitle || "Resource").replace(/\s+/g, " ").trim().slice(0, 120);
    const keywords = keywordsFrom(`${title} ${req.question} ${answer}`);
    await db.insert(schema.agentKnowledge).values({
      id: crypto.randomUUID(),
      userId: user.id,
      workspaceId: req.workspaceId,
      kind: resourceUrl ? "resource" : "faq",
      title: title.charAt(0).toUpperCase() + title.slice(1),
      content: answer,
      url: resourceUrl,
      keywords,
    });
  }

  await db
    .update(schema.agentRequests)
    .set({
      status: "resolved",
      resolution: answer || body.slice(0, 500),
      resourceUrl,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.agentRequests.id, req.id));
  await db
    .update(schema.replies)
    .set({
      agentStatus: "replied",
      agentHandledAt: now,
      readAt: now,
      agentSummary: req.kind === "approval" ? "You approved the agent's draft." : "You answered — reply sent.",
    })
    .where(eq(schema.replies.id, reply.id));
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId: user.id,
    type: "agent.resolved",
    message: `You unblocked the agent for ${reply.fromEmail}`,
    campaignId: reply.campaignId,
    meta: { requestId: req.id },
  });

  revalidatePath("/requests");
  revalidatePath("/unibox");
  return { ok: true, message: `Reply sent to ${reply.fromEmail}.` };
}

export async function dismissAgentRequestAction(requestId: string): Promise<Result> {
  const user = await requireUser();
  const req = await loadOwnedRequest(requestId, user.id);
  if (!req) return { ok: false, error: "Request not found." };
  const now = nowIso();
  const db = getDb();
  await db
    .update(schema.agentRequests)
    .set({ status: "dismissed", resolvedAt: now, updatedAt: now })
    .where(eq(schema.agentRequests.id, req.id));
  if (req.replyId) {
    await db.update(schema.replies).set({ agentStatus: "skipped", agentHandledAt: now }).where(eq(schema.replies.id, req.replyId));
  }
  revalidatePath("/requests");
  return { ok: true, message: "Dismissed — no reply will be sent." };
}

/* ─── Knowledge base ─────────────────────────────────────────────────── */

export interface KnowledgeView {
  id: string;
  kind: "resource" | "faq" | "fact";
  title: string;
  content: string;
  url: string | null;
  keywords: string[];
  usageCount: number;
  updatedAt: string;
}

export async function listKnowledge(): Promise<KnowledgeView[]> {
  const user = await requireUser();
  const rows = await getDb()
    .select()
    .from(schema.agentKnowledge)
    .where(eq(schema.agentKnowledge.userId, user.id))
    .orderBy(desc(schema.agentKnowledge.updatedAt))
    .limit(200);
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    content: r.content,
    url: r.url,
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    usageCount: r.usageCount,
    updatedAt: r.updatedAt,
  }));
}

export async function saveKnowledgeAction(input: {
  id?: string;
  kind: "resource" | "faq" | "fact";
  title: string;
  content?: string;
  url?: string;
  keywords?: string;
}): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const title = String(input.title || "").trim();
  if (title.length < 2) return { ok: false, error: "Give it a short title, e.g. “Case study deck”." };
  const kind = ["resource", "faq", "fact"].includes(input.kind) ? input.kind : "resource";
  const url = input.url?.trim() ? normalizeClientBookingUrl(input.url) : null;
  if (input.url?.trim() && !url) return { ok: false, error: "That link doesn't look valid." };
  const content = String(input.content || "").trim();
  if (kind === "resource" && !url && !content) return { ok: false, error: "Resources need a link or some text." };
  if (kind !== "resource" && !content) return { ok: false, error: "Write the answer the agent should give." };
  const keywords = String(input.keywords || "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

  const db = getDb();
  const workspace = await getActiveWorkspace(user.id);
  const now = nowIso();
  if (input.id) {
    const updated = await db
      .update(schema.agentKnowledge)
      .set({ kind, title, content, url, keywords, updatedAt: now })
      .where(and(eq(schema.agentKnowledge.id, input.id), eq(schema.agentKnowledge.userId, user.id)))
      .returning({ id: schema.agentKnowledge.id });
    if (updated.length === 0) return { ok: false, error: "Item not found." };
    revalidatePath("/requests");
    return { ok: true, data: { id: input.id }, message: "Saved." };
  }
  const id = crypto.randomUUID();
  await db.insert(schema.agentKnowledge).values({
    id,
    userId: user.id,
    workspaceId: workspace.id,
    kind,
    title,
    content,
    url,
    keywords,
  });
  revalidatePath("/requests");
  return { ok: true, data: { id }, message: "Added — the agent can use this now." };
}

export async function deleteKnowledgeAction(id: string): Promise<Result> {
  const user = await requireUser();
  await getDb()
    .delete(schema.agentKnowledge)
    .where(and(eq(schema.agentKnowledge.id, id), eq(schema.agentKnowledge.userId, user.id)));
  revalidatePath("/requests");
  return { ok: true, message: "Removed." };
}
