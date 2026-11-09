"use server";

/**
 * One-URL autopilot + reply-agent controls.
 *
 *  startAutopilotAction      URL in → research → plan → (blocked | live)
 *  completeAutopilotSetupAction  booking link + CAN-SPAM identity, then launch
 *  retryAutopilotLaunchAction / retryAutopilotResearchAction  recover failed runs
 *  setBookingUrlAction       change the booking link (launches if that was the blocker)
 *  setReplyAgentModeAction   autopilot | approve | off (the run's "Lead conversations" value)
 *  agent requests            what the agent needs from the client
 *  knowledge base            resources/answers the agent may use
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { getDb } from "./db";
import { requireUser } from "./session";
import { ensureDefaultWorkspace, getActiveWorkspace } from "./workspaces";
import { wsCondition } from "./queries";
import { analyzeWebsiteAction } from "./chad-gtm-actions";
import { loadComplianceIdentity } from "./gtm-launch";
import { APPROVAL_REQUIRED_ERROR, assertCanSend } from "./approval";
import { clampAutopilotDaily, complianceProblems, type RunPhase } from "./autopilot-policy";
import { advanceRunForUser, loadOwnedRun } from "./autopilot-advance";
import { normalizeClientBookingUrl } from "./booking-links";
import { loadOwnedWorkspace, saveWorkspaceBookingUrl } from "./workspace-booking";
import { writeWorkspaceIdentity } from "./workspace-profile";
import { getWorkspaceAiOptions } from "./ai";
import {
  agentOffConversations,
  conversationActivitySince,
  conversationAgentOff,
  conversationKey,
  recordHumanSend,
  releaseBookingLinkRequests,
} from "./lead-conversations-server";
import {
  HUMAN_CLEARABLE_AGENT_STATUSES,
  HUMAN_REPLIED_SUMMARY,
  setConversationHandler,
  suppressedEmails,
} from "@smartreach/email-engine/lead-conversations";
import { setCampaignConversationModeAction, setRunConversationModeAction } from "./lead-conversation-actions";
import { REQUEST_ALREADY_HANDLED, modeFromRun } from "./lead-conversations";
import { createLeadForUser } from "./leads";
import { launchSuccessMessage } from "./audience-summary";
import { AWAITING_APPROVAL_SHORT, LINKED_NOT_STARTED_MESSAGE } from "./approval-copy";

/** Needs you cards that still wait on the client ('sending' = a send is in flight). */
const OPEN_STATUSES = ["open", "sending"] as const;

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/* ─── Autopilot launch ────────────────────────────────────────────────── */

/**
 * Where an autopilot run stands after a start/retry/setup call. The client
 * renders one state per phase; only "live" means emails will go out.
 */
export interface AutopilotOutcome {
  runId: string;
  phase: RunPhase;
  companyName: string;
  campaignId?: string;
  leadCount?: number;
  /** Fields the client still has to provide (phase "needs_details"). */
  missing?: Array<"bookingUrl" | "companyName" | "postalAddress">;
  /** The run's workspace sender identity (what the footer will carry) and that workspace's name. */
  identity?: { companyName: string; postalAddress: string; workspaceName?: string };
  /** The researched company name, offered as a prefill only while the workspace has none. */
  suggestedCompanyName?: string;
  bookingUrl?: string | null;
  /** Client-facing explanation for every non-live phase. */
  reason?: string;
}

export async function startAutopilotAction(input: {
  url: string;
  bookingUrl?: string;
  notes?: string;
  /** Emails per day, follow-ups included (clamped to the allowed range). */
  dailyLimit?: number;
}): Promise<Result<AutopilotOutcome>> {
  const user = await requireUser();
  const url = String(input?.url || "").trim();
  if (url.length < 4 || !url.includes(".")) return { ok: false, error: "Enter your company website, e.g. acme.com" };

  let bookingUrl: string | null = null;
  if (input.bookingUrl?.trim()) {
    bookingUrl = normalizeClientBookingUrl(input.bookingUrl);
    if (!bookingUrl) return { ok: false, error: "That booking link doesn't look like a valid URL." };
  }

  // The chosen volume is saved in the insert that creates the run: an approval
  // launch can pick the run up at any moment and must never see the default.
  const dailyEmailLimit =
    input.dailyLimit !== undefined && Number.isFinite(Number(input.dailyLimit))
      ? clampAutopilotDaily(Number(input.dailyLimit))
      : undefined;
  const analysis = await analyzeWebsiteAction(url, input.notes, { autopilot: true, bookingUrl, dailyEmailLimit });
  if (!analysis.ok || !analysis.runId) {
    return { ok: false, error: analysis.error || "We couldn't analyze that website. Check the address and try again." };
  }
  return advanceAutopilotRun(analysis.runId, user.id);
}

/** Save the booking link and/or CAN-SPAM identity the launcher asked for, then try to launch. */
export async function completeAutopilotSetupAction(
  runId: string,
  input: { bookingUrl?: string; companyName?: string; postalAddress?: string },
): Promise<Result<AutopilotOutcome>> {
  const user = await requireUser();
  const run = await loadOwnedRun(runId, user.id);
  if (!run) return { ok: false, error: "Run not found." };
  const db = getDb();

  if (input.bookingUrl !== undefined && input.bookingUrl.trim()) {
    const bookingUrl = normalizeClientBookingUrl(input.bookingUrl);
    if (!bookingUrl) return { ok: false, error: "Paste a full booking link, e.g. https://cal.com/you/intro" };
    await db.update(schema.chadGtmRuns).set({ bookingUrl, updatedAt: nowIso() }).where(eq(schema.chadGtmRuns.id, run.id));
  }

  if (input.companyName !== undefined || input.postalAddress !== undefined) {
    // Only the run's own workspace (null = the default one): never the active
    // workspace cookie, never the account-wide row, never another workspace (#73).
    const workspaceId = run.workspaceId ?? null;
    const current = await loadComplianceIdentity(db, user.id, workspaceId);
    const identity = {
      companyName: input.companyName !== undefined ? input.companyName.trim() : current.companyName,
      postalAddress: input.postalAddress !== undefined ? input.postalAddress.trim() : current.postalAddress,
    };
    const problems = complianceProblems(identity);
    const firstProblem = problems.companyName || problems.postalAddress;
    if (firstProblem) return { ok: false, error: firstProblem };
    const saved = await writeWorkspaceIdentity(db, user.id, workspaceId, identity);
    if (!saved) return { ok: false, error: "We couldn't save your sender details. Try again." };
    revalidatePath("/settings");
  }

  return advanceAutopilotRun(run.id, user.id);
}

/** Retry a launch that failed or was waiting (capacity, approval, leads). */
export async function retryAutopilotLaunchAction(runId: string): Promise<Result<AutopilotOutcome>> {
  const user = await requireUser();
  const run = await loadOwnedRun(runId, user.id);
  if (!run) return { ok: false, error: "Run not found." };
  return advanceAutopilotRun(run.id, user.id);
}

/** Re-run the website research on the same run (optionally with a note on who to target). */
export async function retryAutopilotResearchAction(
  runId: string,
  notes?: string,
): Promise<Result<AutopilotOutcome>> {
  const user = await requireUser();
  const run = await loadOwnedRun(runId, user.id);
  if (!run) return { ok: false, error: "Run not found." };
  if (run.campaignId) return advanceAutopilotRun(run.id, user.id);
  const analysis = await analyzeWebsiteAction(run.url, notes?.trim() || undefined, {
    autopilot: true,
    bookingUrl: run.bookingUrl,
    existingRunId: run.id,
  });
  if (!analysis.ok) return { ok: false, error: analysis.error || "Research failed. Try again in a minute." };
  return advanceAutopilotRun(run.id, user.id);
}

const PHASE_MESSAGES: Partial<Record<RunPhase, string>> = {
  needs_research: "We couldn't pin down your audience, so nothing was sent.",
  needs_details: "Almost there. We need a couple of details before we send.",
  awaiting_approval: AWAITING_APPROVAL_SHORT,
  launch_failed: "Nothing was sent. Your plan is saved, so you can retry.",
};

const STILL_LAUNCHING_MESSAGE = "Still launching. This page updates when it's live.";

/**
 * Move an autopilot run as far as it can go (lib/autopilot-advance.ts, the
 * session-free launcher), then word the result for the client. Callers pass
 * the signed-in owner's id.
 */
async function advanceAutopilotRun(runId: string, userId: string): Promise<Result<AutopilotOutcome>> {
  const res = await advanceRunForUser(runId, userId);
  if (!res.ok) return res;
  if (res.event === "launched") {
    const fresh = res.run;
    return {
      ok: true,
      data: res.data,
      // The whole audience, never the first batch (which only looks like a cap).
      message: launchSuccessMessage((fresh as { audience?: unknown }).audience),
    };
  }
  const message =
    res.event === "still_launching"
      ? STILL_LAUNCHING_MESSAGE
      : res.event === "linked_not_started"
        ? LINKED_NOT_STARTED_MESSAGE
        : res.event === "launch_failed"
          ? PHASE_MESSAGES.launch_failed
          : res.event === "blocked"
            ? PHASE_MESSAGES[res.data.phase]
            : undefined;
  return message === undefined ? { ok: true, data: res.data } : { ok: true, data: res.data, message };
}

export async function setBookingUrlAction(
  runId: string,
  rawUrl: string,
  /** workspaceDefault: also make it the workspace's booking link (only when true; never implied). */
  opts: { workspaceDefault?: boolean } = {},
): Promise<Result<{ launched: boolean; campaignId?: string; phase?: RunPhase; outcome?: AutopilotOutcome }>> {
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

  // Cards waiting only on a booking link: the agent answers those nobody
  // answered since; the rest close as handled in the Inbox.
  let { answered } = await releaseBookingLinkRequests(db, {
    userId: user.id,
    runId: run.id,
    campaignIds: run.campaignId ? [run.campaignId] : [],
    bookingUrl,
    nowIso: nowIso(),
  });

  // The workspace default changes only on an explicit "Also make this the default":
  // a new default also releases other campaigns' booking-link cards, so it is never implied.
  let defaultFor: string | null = null;
  const workspace =
    opts.workspaceDefault === true ? await loadOwnedWorkspace(db, user.id, run.workspaceId ?? null).catch(() => null) : null;
  if (workspace && workspace.bookingUrl !== bookingUrl) {
    const res = await saveWorkspaceBookingUrl(db, { userId: user.id, workspace, bookingUrl, nowIso: nowIso() });
    if (res.saved) {
      defaultFor = workspace.name || "this workspace";
      answered += res.answered;
      revalidatePath("/settings");
    }
  }
  const savedMessage = [
    defaultFor ? `Booking link saved. Also set as the default for ${defaultFor}.` : "Booking link saved.",
    answered > 0 ? `The agent will answer ${answered} waiting ${answered === 1 ? "lead" : "leads"}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  let outcome: AutopilotOutcome | undefined;
  if (run.autopilot && !run.campaignId) {
    const advanced = await advanceAutopilotRun(run.id, user.id);
    if (!advanced.ok) return advanced;
    outcome = advanced.data;
  }
  revalidatePath(`/chad-gtm/${run.id}`);
  revalidatePath("/requests");
  const launched = outcome?.phase === "live";
  return {
    ok: true,
    data: { launched, campaignId: outcome?.campaignId ?? run.campaignId ?? undefined, phase: outcome?.phase, outcome },
    message: launched
      ? `${savedMessage} Outreach is live.`
      : outcome
        ? `${savedMessage} ${PHASE_MESSAGES[outcome.phase] ?? ""}`.trim()
        : savedMessage,
  };
}

/**
 * Remove a launched run's booking link: the agent then asks the client in
 * Needs you whenever a lead wants to talk (it already escalates booking
 * requests without a link). An unlaunched autopilot run needs the link to
 * launch, so it is refused there. Held requests are left alone.
 */
export async function clearBookingUrlAction(runId: string): Promise<Result> {
  const user = await requireUser();
  const run = await loadOwnedRun(runId, user.id);
  if (!run) return { ok: false, error: "Run not found." };
  if (run.autopilot && !run.campaignId) {
    return { ok: false, error: "Add a booking link to launch. You can remove it after launch." };
  }
  const db = getDb();
  await db
    .update(schema.chadGtmRuns)
    .set({ bookingUrl: null, updatedAt: nowIso() })
    .where(and(eq(schema.chadGtmRuns.id, run.id), eq(schema.chadGtmRuns.userId, user.id)));
  // The agent falls back to the workspace's default link: say so instead of promising it asks.
  const workspace = await loadOwnedWorkspace(db, user.id, run.workspaceId ?? null).catch(() => null);
  revalidatePath(`/chad-gtm/${run.id}`);
  return {
    ok: true,
    message: workspace?.bookingUrl
      ? `Booking link removed. This run now uses the ${workspace.name || "workspace"} booking link; remove that in Settings to have the agent ask you instead.`
      : "Booking link removed. The agent will ask you in Needs you when a lead wants to talk.",
  };
}

/** "Use workspace default": drop the run's own link so it uses the workspace's. */
export async function useWorkspaceBookingUrlAction(runId: string): Promise<Result<{ bookingUrl: string }>> {
  const user = await requireUser();
  const run = await loadOwnedRun(runId, user.id);
  if (!run) return { ok: false, error: "Run not found." };
  const db = getDb();
  const workspace = await loadOwnedWorkspace(db, user.id, run.workspaceId ?? null);
  if (!workspace?.bookingUrl) {
    return { ok: false, error: "This workspace has no booking link yet. Add one in Settings › Lead conversations." };
  }
  await db
    .update(schema.chadGtmRuns)
    .set({ bookingUrl: null, updatedAt: nowIso() })
    .where(and(eq(schema.chadGtmRuns.id, run.id), eq(schema.chadGtmRuns.userId, user.id)));
  revalidatePath(`/chad-gtm/${run.id}`);
  return {
    ok: true,
    data: { bookingUrl: workspace.bookingUrl },
    message: `This run now uses the ${workspace.name || "workspace"} booking link.`,
  };
}

/**
 * Older entry point for the run page: the same "Lead conversations" value,
 * stored on the campaign once launched and on the run before that.
 */
export async function setReplyAgentModeAction(
  runId: string,
  mode: "autopilot" | "approve" | "off",
  options: { applyToWaiting?: boolean } = {},
): Promise<Result> {
  if (!["autopilot", "approve", "off"].includes(mode)) return { ok: false, error: "Unknown mode." };
  const res = await setRunConversationModeAction({
    runId,
    mode: modeFromRun(mode),
    applyToWaiting: options.applyToWaiting,
  });
  if (!res.ok) return res;
  return { ok: true, message: res.message };
}

/* ─── Agent requests (human-in-the-loop) ─────────────────────────────── */

export interface AgentRequestView {
  id: string;
  runId: string | null;
  replyId: string | null;
  leadId: string | null;
  campaignId: string | null;
  kind: string;
  status: string;
  title: string;
  question: string;
  leadEmail: string;
  leadName: string;
  leadCompany: string;
  draftReply: string;
  /** Who wrote draftReply: the agent, or the client's own answer. */
  draftSource: "agent" | "you";
  /** Referral cards: the address the lead pointed to, when their message had one. */
  referralEmail: string | null;
  /** The agent is off for this conversation (Manual, paused or taken over): answer it yourself. */
  agentOff: boolean;
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
  // Same workspace scope as the Inbox and the nav badge (legacy rows count as the default workspace's).
  const scope = await requestScope(user.id);
  if (scope) conds.push(scope);
  if (status === "open") conds.push(inArray(schema.agentRequests.status, [...OPEN_STATUSES]));
  else if (status !== "all") conds.push(eq(schema.agentRequests.status, status));
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
  const openRows = rows.filter(({ r }: any) => (OPEN_STATUSES as readonly string[]).includes(r.status));
  const agentOff = await agentOffConversations(
    db,
    user.id,
    openRows.map(({ r }: any) => ({ leadId: r.leadId ?? null, campaignId: r.campaignId ?? null })),
  );
  return rows.map(({ r, replySubject, replyBody, replyReceivedAt, companyName }: any) => ({
    id: r.id,
    runId: r.runId,
    replyId: r.replyId ?? null,
    leadId: r.leadId ?? null,
    campaignId: r.campaignId ?? null,
    kind: r.kind,
    status: r.status,
    title: r.title,
    question: r.question,
    leadEmail: r.leadEmail,
    leadName: r.leadName,
    leadCompany: r.leadCompany,
    draftReply: r.draftReply,
    draftSource: r.draftSource === "you" ? "you" : "agent",
    referralEmail: r.referralEmail ?? null,
    agentOff:
      (OPEN_STATUSES as readonly string[]).includes(r.status) &&
      agentOff.has(conversationKey(r.leadId ?? null, r.campaignId ?? null)),
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
    const scope = await requestScope(user.id);
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(schema.agentRequests)
      .where(
        and(
          eq(schema.agentRequests.userId, user.id),
          inArray(schema.agentRequests.status, [...OPEN_STATUSES]),
          ...(scope ? [scope] : []),
        ),
      );
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

/** Needs you cards of the active workspace (NULL-workspace cards count as the default workspace's). */
async function requestScope(userId: string) {
  const ws = await getActiveWorkspace(userId);
  return wsCondition(schema.agentRequests.workspaceId, ws.id, ws.isDefault);
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

/** A 'sending' card older than this was left by a send that died: it may be claimed again. */
const SENDING_STALE_MS = 10 * 60_000;

/**
 * Claim a Needs you card before acting on it, in one step: open → sending
 * (or a stale 'sending' left by a send that died). Returns false when it was
 * already answered, dismissed or is being sent: the caller must stop.
 */
async function claimRequest(db: any, requestId: string, userId: string): Promise<boolean> {
  const now = nowIso();
  const staleBefore = new Date(Date.now() - SENDING_STALE_MS).toISOString();
  const rows: any[] = await db
    .update(schema.agentRequests)
    .set({ status: "sending", updatedAt: now })
    .where(
      and(
        eq(schema.agentRequests.id, requestId),
        eq(schema.agentRequests.userId, userId),
        or(
          eq(schema.agentRequests.status, "open"),
          and(eq(schema.agentRequests.status, "sending"), lt(schema.agentRequests.updatedAt, staleBefore)),
        ),
      ),
    )
    .returning({ id: schema.agentRequests.id });
  return rows.length > 0;
}

/** Put a claimed card back to open (the action failed before anything happened). */
async function releaseRequest(db: any, requestId: string): Promise<void> {
  await db
    .update(schema.agentRequests)
    .set({ status: "open", updatedAt: nowIso() })
    .where(and(eq(schema.agentRequests.id, requestId), eq(schema.agentRequests.status, "sending")));
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
 * plain template. The draft is saved to the request and shown in the Inbox
 * reply box, where the client checks and sends it.
 */
export async function draftRequestReplyAction(input: {
  requestId: string;
  answer: string;
  resourceUrl?: string;
  /** Save the answer to the knowledge base once the reply is sent. */
  save?: boolean;
}): Promise<Result<{ draft: string; replyId: string | null }>> {
  const user = await requireUser();
  const req = await loadOwnedRequest(input.requestId, user.id);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "open") return { ok: false, error: REQUEST_ALREADY_HANDLED };
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

  // The draft waits in the Inbox reply box; the answer is saved to the
  // knowledge base only once the reply is actually sent.
  const saved = await db
    .update(schema.agentRequests)
    .set({
      draftReply: draft,
      draftSource: "you",
      pendingKnowledge: { answer, resourceUrl, save: input.save !== false },
      updatedAt: nowIso(),
    })
    .where(and(eq(schema.agentRequests.id, req.id), eq(schema.agentRequests.status, "open")))
    .returning({ id: schema.agentRequests.id });
  if (saved.length === 0) return { ok: false, error: REQUEST_ALREADY_HANDLED };
  revalidatePath("/requests");
  revalidatePath("/unibox");
  return { ok: true, data: { draft, replyId: req.replyId ?? null } };
}

/** "Discard" in the Inbox: clear the draft so it isn't prefilled again. The request stays open. */
export async function discardRequestDraftAction(requestId: string): Promise<Result> {
  const user = await requireUser();
  const req = await loadOwnedRequest(requestId, user.id);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "open") return { ok: false, error: REQUEST_ALREADY_HANDLED };
  const cleared: any[] = await getDb()
    .update(schema.agentRequests)
    .set({ draftReply: "", updatedAt: nowIso() })
    .where(and(eq(schema.agentRequests.id, req.id), eq(schema.agentRequests.status, "open")))
    .returning({ id: schema.agentRequests.id });
  if (cleared.length === 0) return { ok: false, error: REQUEST_ALREADY_HANDLED };
  revalidatePath("/unibox");
  return { ok: true, message: "Draft discarded. The conversation still waits on you." };
}

/**
 * Send the reply for a Needs you card (from the Inbox reply box). Refuses
 * when anyone wrote in the conversation after what the person saw, claims the
 * card so it is sent once, then closes every open card for the conversation.
 */
export async function resolveAgentRequestAction(input: {
  requestId: string;
  body: string;
  /** Time of the newest message the person had on screen. */
  seenLatestAt?: string;
  knowledgeTitle?: string;
}): Promise<Result<{ agentOff: boolean }>> {
  const user = await requireUser();
  const req = await loadOwnedRequest(input.requestId, user.id);
  if (!req) return { ok: false, error: "Request not found." };
  // A 'sending' card is claimable only once it is stale (claimRequest decides).
  if (req.status !== "open" && req.status !== "sending") return { ok: false, error: REQUEST_ALREADY_HANDLED };
  const body = String(input.body || "").trim();
  if (body.length < 5) return { ok: false, error: "Write the reply before sending." };

  const db = getDb();
  const [reply] = req.replyId
    ? await db.select().from(schema.replies).where(eq(schema.replies.id, req.replyId)).limit(1)
    : [];
  if (!reply) return { ok: false, error: "The original lead reply is gone; reply from the Inbox instead." };
  const [sender] = await db
    .select()
    .from(schema.senderAccounts)
    .where(eq(schema.senderAccounts.id, reply.senderId))
    .limit(1);
  if (!sender) return { ok: false, error: "The mailbox for this thread is no longer available." };
  // Only the owner's own mailbox, or a shared-pool mailbox the platform sent
  // from on their behalf. Pool mailboxes need an approved account: a revoked
  // account must not keep sending free text from the shared pool.
  if (!sender.isSystemPool && sender.userId !== user.id) {
    return { ok: false, error: "The mailbox for this thread is no longer available." };
  }
  if (sender.isSystemPool) {
    try {
      await assertCanSend(user.id);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : APPROVAL_REQUIRED_ERROR };
    }
  }

  // Do not message someone who opted out since the request was created: the
  // shared check covers your blocklist and anyone's unsubscribe, bounce or
  // complaint. A failed lookup throws, so nothing is sent.
  const { loadRecipientVerdict, recipientBlockMessage } = await import("@smartreach/email-engine/suppression");
  const verdict = await loadRecipientVerdict(db, user.id, reply.fromEmail);
  if (verdict) return { ok: false, error: `${recipientBlockMessage(reply.fromEmail, verdict)} The reply was not sent.` };

  // Someone wrote after this was drafted: read it before sending.
  const since = input.seenLatestAt || reply.receivedAt;
  if (
    await conversationActivitySince(db, user.id, {
      leadId: reply.leadId,
      campaignId: reply.campaignId,
      replyId: reply.id,
      since,
    })
  ) {
    const name = (req.leadName || reply.fromName || reply.fromEmail).trim().split(/\s+/)[0] || reply.fromEmail;
    return {
      ok: false,
      error: `${name} or someone on your team wrote after this was drafted. Check the conversation, then send.`,
    };
  }

  // With the agent off for this conversation (Manual, paused, taken over), the answer is yours.
  const agentOff = await conversationAgentOff(db, user.id, { leadId: reply.leadId, campaignId: reply.campaignId });

  // Claim the card so a second click, tab or teammate cannot send it again.
  if (!(await claimRequest(db, req.id, user.id))) return { ok: false, error: REQUEST_ALREADY_HANDLED };

  // An agent draft sent unchanged is "Agent, approved by you"; anything you wrote or edited is yours.
  const storedDraft = String(req.draftReply || "").trim();
  const approvedAgentDraft = !agentOff && req.draftSource !== "you" && storedDraft.length > 0 && body === storedDraft;

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
      fromRole: approvedAgentDraft ? "agent" : "operator",
      approvedByUser: approvedAgentDraft,
    });
  } catch (err) {
    const delivered = Boolean(err && typeof err === "object" && (err as { delivered?: unknown }).delivered === true);
    if (!delivered) {
      await releaseRequest(db, req.id);
      return { ok: false, error: err instanceof Error ? `Send failed: ${err.message}` : "Send failed." };
    }
    // The email went out but recording it failed: still close the card below.
  }

  const pending = req.pendingKnowledge ?? null;
  const answer = String(pending?.answer || "").trim();
  const resourceUrl = pending?.resourceUrl?.trim() ? normalizeClientBookingUrl(pending.resourceUrl) : null;
  // Only answers to a question or a resource request are worth reusing; a
  // hand-off, approval, referral or booking card would file a junk entry.
  if (pending?.save && (answer || resourceUrl) && (req.kind === "question" || req.kind === "resource")) {
    // Questions are filed under the question itself so future matching works
    // on the lead's own words; resources under what was asked for.
    const baseTitle =
      input.knowledgeTitle ||
      (req.kind === "resource"
        ? req.title.replace(/^Lead asked for /i, "")
        : req.question || req.title.replace(/^(Question|Objection): /i, "").replace(/[“”]/g, ""));
    const title = (baseTitle || "Resource").replace(/\s+/g, " ").trim().slice(0, 120);
    const keywords = keywordsFrom(`${title} ${req.question} ${answer}`);
    // Knowledge is per workspace: a card with no workspace files it under the default one.
    const knowledgeWorkspaceId = req.workspaceId ?? (await knowledgeDefaultWorkspaceId(user.id));
    await db.insert(schema.agentKnowledge).values({
      id: crypto.randomUUID(),
      userId: user.id,
      workspaceId: knowledgeWorkspaceId,
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
    .where(and(eq(schema.agentRequests.id, req.id), eq(schema.agentRequests.status, "sending")));
  // Every other open card for this conversation closes, and no reply in it stays waiting.
  await recordHumanSend(db, {
    userId: user.id,
    workspaceId: req.workspaceId,
    leadId: reply.leadId,
    campaignId: reply.campaignId,
    replyId: reply.id,
    takeOver: false,
    nowIso: now,
    agentStatus: approvedAgentDraft ? "replied" : "human_replied",
    summary: approvedAgentDraft ? APPROVED_BY_YOU_SUMMARY : HUMAN_REPLIED_SUMMARY,
  });
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
  // agentOff: Manual, paused or taken over, so the agent does not pick the conversation back up.
  return { ok: true, data: { agentOff }, message: `Reply sent to ${reply.fromEmail}.` };
}

/** Reply summary for an agent draft you approved unchanged. */
const APPROVED_BY_YOU_SUMMARY = "Agent, approved by you";
const DISMISSED_SUMMARY = "You dismissed the agent's request and took over.";
const DISMISSED_RESOLUTION = "Dismissed: you took over this conversation.";

/**
 * Dismiss means take over: nothing is sent, every open card in the
 * conversation closes, and the conversation becomes "Handled by: You" so the
 * agent stays silent until it is handed back from the Inbox.
 */
export async function dismissAgentRequestAction(requestId: string): Promise<Result> {
  const user = await requireUser();
  const req = await loadOwnedRequest(requestId, user.id);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "open") return { ok: false, error: REQUEST_ALREADY_HANDLED };
  const now = nowIso();
  const db = getDb();

  // Claim the card in one step: if it was answered or dismissed meanwhile, stop.
  const claimed = await db
    .update(schema.agentRequests)
    .set({ status: "dismissed", resolution: DISMISSED_RESOLUTION, resolvedAt: now, updatedAt: now })
    .where(and(eq(schema.agentRequests.id, req.id), eq(schema.agentRequests.status, "open")))
    .returning({ id: schema.agentRequests.id });
  if (claimed.length === 0) return { ok: false, error: REQUEST_ALREADY_HANDLED };

  const conversation = req.leadId && req.campaignId ? { leadId: req.leadId, campaignId: req.campaignId } : null;
  const replyIds = new Set<string>(req.replyId ? [req.replyId] : []);
  if (conversation) {
    // One conversation, one decision: every other open card in it closes too.
    // A card whose send is in flight is left alone (that send records it as
    // resolved); only a stale 'sending' left by a send that died is closed.
    const staleBefore = new Date(Date.now() - SENDING_STALE_MS).toISOString();
    const others: any[] = await db
      .update(schema.agentRequests)
      .set({ status: "dismissed", resolution: DISMISSED_RESOLUTION, resolvedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.agentRequests.userId, user.id),
          eq(schema.agentRequests.leadId, conversation.leadId),
          eq(schema.agentRequests.campaignId, conversation.campaignId),
          or(
            eq(schema.agentRequests.status, "open"),
            and(eq(schema.agentRequests.status, "sending"), lt(schema.agentRequests.updatedAt, staleBefore)),
          ),
        ),
      )
      .returning({ id: schema.agentRequests.id, replyId: schema.agentRequests.replyId });
    for (const o of others) if (o.replyId) replyIds.add(o.replyId);
  }

  // The lead's messages the agent still had open are now yours to answer.
  const replyConds = [
    replyIds.size > 0 ? inArray(schema.replies.id, [...replyIds]) : null,
    conversation
      ? and(
          eq(schema.replies.leadId, conversation.leadId),
          eq(schema.replies.campaignId, conversation.campaignId),
          inArray(schema.replies.agentStatus, ["pending", "escalated", "held"]),
        )
      : null,
  ].filter((c): c is NonNullable<typeof c> => c != null);
  if (replyConds.length > 0) {
    await db
      .update(schema.replies)
      .set({ agentStatus: "skipped", agentIntent: "manual", agentSummary: DISMISSED_SUMMARY, agentHandledAt: now })
      .where(
        and(
          eq(schema.replies.userId, user.id),
          // Never undo a reply that was already answered.
          inArray(schema.replies.agentStatus, [...HUMAN_CLEARABLE_AGENT_STATUSES]),
          replyConds.length === 1 ? replyConds[0]! : or(...replyConds)!,
        ),
      );
  }

  if (conversation) {
    await setConversationHandler(db, {
      userId: user.id,
      workspaceId: req.workspaceId ?? null,
      leadId: conversation.leadId,
      campaignId: conversation.campaignId,
      handler: "you",
      reason: "dismiss",
      nowIso: now,
    });
  }
  revalidatePath("/requests");
  revalidatePath("/unibox");
  return {
    ok: true,
    message: conversation ? "Dismissed. You've taken over this conversation." : "Dismissed. Nothing was sent.",
  };
}

const SIMPLE_EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;

/**
 * Referral card: add the person the lead pointed to as a lead in the same
 * campaign. They are queued like any other lead, so the campaign's normal
 * sending (with every send guard) reaches out; nothing is sent here.
 */
export async function addReferralLeadAction(input: { requestId: string; email: string }): Promise<Result<{ leadId: string }>> {
  const user = await requireUser();
  const req = await loadOwnedRequest(String(input?.requestId ?? ""), user.id);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "open") return { ok: false, error: REQUEST_ALREADY_HANDLED };
  if (req.kind !== "referral") return { ok: false, error: "Only referral cards can add a lead." };
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!SIMPLE_EMAIL.test(email)) return { ok: false, error: "Enter the new contact's email address, e.g. jane@acme.com" };
  if (email === String(req.leadEmail || "").trim().toLowerCase()) {
    return { ok: false, error: "That's the lead's own address. Enter the person they pointed you to." };
  }
  if (!req.campaignId) return { ok: false, error: "This card isn't linked to a campaign, so the contact can't be added." };

  const db = getDb();
  const [campaign]: any[] = await db
    .select({
      id: schema.campaigns.id,
      workspaceId: schema.campaigns.workspaceId,
      leadListId: schema.campaigns.leadListId,
    })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.id, req.campaignId),
        eq(schema.campaigns.userId, user.id),
        isNull(schema.campaigns.deletedAt),
      ),
    )
    .limit(1);
  if (!campaign) return { ok: false, error: "This campaign no longer exists, so the contact can't be added." };
  if (!campaign.leadListId) return { ok: false, error: "This campaign has no lead list, so the contact can't be added." };

  // Opted out, bounced, blocked or erased (own list or a global opt-out): never add.
  if ((await suppressedEmails(db, user.id, [email])).has(email)) {
    return { ok: false, error: `${email} is on your blocklist or has opted out, so they can't be added.` };
  }
  const inCampaign: any[] = await db
    .select({ id: schema.campaignLeads.id })
    .from(schema.campaignLeads)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.campaignLeads.leadId))
    .where(and(eq(schema.campaignLeads.campaignId, campaign.id), sql`lower(${schema.leads.email}) = ${email}`))
    .limit(1);
  if (inCampaign.length > 0) return { ok: false, error: `${email} is already in this campaign.` };
  const [inList]: any[] = await db
    .select({ id: schema.leads.id, status: schema.leads.status })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.listId, campaign.leadListId),
        sql`lower(${schema.leads.email}) = ${email}`,
        isNull(schema.leads.deletedAt),
      ),
    )
    .limit(1);
  if (inList && inList.status !== "new" && inList.status !== "contacted") {
    return { ok: false, error: `${email} is already in this campaign's lead list and can't be emailed.` };
  }

  if (!(await claimRequest(db, req.id, user.id))) return { ok: false, error: REQUEST_ALREADY_HANDLED };

  let leadId: string;
  if (inList) {
    leadId = inList.id;
  } else {
    const created = await createLeadForUser(
      db,
      user.id,
      { listId: campaign.leadListId, email, company: req.leadCompany || null },
      campaign.workspaceId ?? null,
    );
    if (!created.ok || !created.data) {
      await releaseRequest(db, req.id);
      return { ok: false, error: created.ok ? "The contact couldn't be added. Try again." : created.error };
    }
    leadId = created.data.id;
  }
  await db
    .insert(schema.campaignLeads)
    .values({ campaignId: campaign.id, leadId, status: "queued" })
    .onConflictDoNothing();

  const now = nowIso();
  await db
    .update(schema.agentRequests)
    .set({ status: "resolved", resolution: `Added ${email} as a lead`, resolvedAt: now, updatedAt: now })
    .where(and(eq(schema.agentRequests.id, req.id), eq(schema.agentRequests.status, "sending")));
  await db.insert(schema.activityLogs).values({
    id: crypto.randomUUID(),
    userId: user.id,
    type: "agent.resolved",
    message: `You added ${email} as a lead (referred by ${req.leadEmail})`,
    campaignId: campaign.id,
    meta: { requestId: req.id, leadId },
  });
  revalidatePath("/requests");
  revalidatePath(`/campaigns/${campaign.id}`);
  if (req.runId) revalidatePath(`/chad-gtm/${req.runId}`);
  return {
    ok: true,
    data: { leadId },
    message: `Added ${email} to this campaign. They get the campaign's emails like any other lead.`,
  };
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

/**
 * Knowledge is per workspace: the list shows exactly what the agent may use
 * in the active workspace (items with no workspace count as the default
 * workspace's, the same rule the reply agent applies).
 */
async function knowledgeScope(userId: string) {
  const ws = await getActiveWorkspace(userId);
  return and(eq(schema.agentKnowledge.userId, userId), wsCondition(schema.agentKnowledge.workspaceId, ws.id, ws.isDefault));
}

/** Where knowledge from a card with no workspace is filed: the default workspace (null if it can't be read). */
async function knowledgeDefaultWorkspaceId(userId: string): Promise<string | null> {
  try {
    const ws = await ensureDefaultWorkspace(userId);
    return ws.id === "primary-default" ? null : ws.id;
  } catch {
    return null;
  }
}

export async function listKnowledge(): Promise<KnowledgeView[]> {
  const user = await requireUser();
  const rows = await getDb()
    .select()
    .from(schema.agentKnowledge)
    .where(await knowledgeScope(user.id))
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

/** Items the agent may use in the active workspace (Settings › Lead conversations). */
export async function countKnowledgeAction(): Promise<number> {
  try {
    const user = await requireUser();
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(schema.agentKnowledge)
      .where(await knowledgeScope(user.id));
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
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
      // Only items of the active workspace (what the panel shows) can be edited.
      .where(and(eq(schema.agentKnowledge.id, input.id), await knowledgeScope(user.id)))
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
