"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { ensureOutreachSpintax, schema } from "@smartreach/database";
import { localDateKey, nowIso } from "@smartreach/shared";
import { getDb, ensureChadGtmTables, ensureAgentTables } from "./db";
import { requireUser } from "./session";
import { ensureDefaultWorkspace, getActiveWorkspace } from "./workspaces";
import {
  scrapeCompanyWebsite,
  synthesizeGtmStrategy,
  type SynthesizedGtmStrategy,
} from "./chad-gtm-research";
import {
  searchLeadMatcherPreview,
  getMatchingDirectoryLeadsForExport,
} from "./leads-directory";
import {
  generateEmailScriptOnTheFly,
  getWorkspaceAiOptions,
  investigateLeadDossier,
  type CampaignResearchContext,
  type LeadProfile,
} from "./ai";
import { samplePersonaFor } from "./sample-sender";
import { ensureCampaignLeadSnapshot } from "./campaign-drafts";
import { DrizzleAgentStore } from "./agent/store";
import { ToolRegistry } from "./agent/registry";
import { GtmAnalysisPlanner } from "./agent/planner";
import { AgentRuntime } from "./agent/runtime";
import { PHASE_1_TOOLS } from "./agent/tools";
import { campaignAction } from "./actions";
import {
  countBookingLinkWaiting,
  initialRunReplyMode,
  loadRunConversationState,
  loadWorkspaceLeadSettings,
} from "./lead-conversations-server";
import {
  activityTypeForAgentStatus,
  countReplyAuthors,
  type RunActivityAgentType,
} from "./lead-conversations";
import { analysisRateLimit } from "./autopilot-state";
import { campaignRates, getCampaignTotals } from "./analytics";
import {
  bookingLinkNeedle,
  groupInterestedLeads,
  interestedLeadsToCsv,
  isPositiveReply,
  leadKey,
} from "./interested-export";
import { groupUniboxConversations } from "./unibox-conversations";
import { AUTOPILOT_DAILY_DEFAULT, autopilotCountries, clampAutopilotDaily } from "./autopilot-policy";
import { LAUNCH_CLAIM_TTL_MS, withChosenOfferFirst } from "./autopilot-policy";
import {
  buildCampaignContext,
  compactCustomFields,
  fetchTargetedLeads,
  getTargetTitles,
  LEADS_PER_CAMPAIGN,
  LaunchInProgressError,
  launchAudienceCounts,
  launchRunCampaign,
  runStrictRoles,
  runTeamSizes,
} from "./gtm-launch";

export interface CalibrationFeedbackItem {
  id?: string;
  leadId?: string;
  recipientName?: string;
  recipientCompany?: string;
  recipientTitle?: string;
  recipientIndustry?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  approved: boolean;
  rejectedReason?: string;
}

const REJECTION_CONSTRAINTS: Record<string, string> = {
  "Too generic":
    "Never write a generic value proposition. Name a specific workflow, role, or metric in the first two sentences.",
  "Too salesy / pushy":
    "Do not pitch, pressure, or stack benefits. Write like a peer sharing an observation, not a vendor closing a deal.",
  "Too long / verbose":
    "Keep the body under 55 words. One idea per paragraph. Cut every sentence that does not earn the next one.",
  "Weak call to action":
    "End with one specific, low-friction permission question. No 'let me know', no calendar link, no vague 'thoughts?'.",
  "Wrong persona tone":
    "Match the recipient's seniority and function. Use their language; do not explain their own job back to them.",
};

function buildStyleGuidance(feedback?: CalibrationFeedbackItem[]): {
  examples: Array<{ subject: string; bodyText: string; recipientTitle?: string }>;
  negatives: string[];
} {
  if (!feedback || feedback.length === 0) {
    return { examples: [], negatives: [] };
  }

  const approved = feedback.filter((f) => f.approved);
  const rejected = feedback.filter((f) => !f.approved);

  const examples = approved.slice(0, 3).map((f) => ({
    subject: f.subject,
    bodyText: f.bodyText,
    recipientTitle: f.recipientTitle,
  }));

  const negatives = new Set<string>();
  for (const item of rejected) {
    const mapped = item.rejectedReason ? REJECTION_CONSTRAINTS[item.rejectedReason] : "";
    if (mapped) negatives.add(mapped);
  }

  if (approved.length > 0) {
    const avgWords = Math.round(
      approved.reduce(
        (sum, f) => sum + f.bodyText.split(/\s+/).filter(Boolean).length,
        0
      ) / approved.length
    );
    if (avgWords > 0 && avgWords < 80) {
      negatives.add(`Match the approved length: roughly ${avgWords} words, not more.`);
    }
    const firstGreeting = approved
      .map((f) => f.bodyText.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, ""))
      .find((g) => g && /^(hi|hey|hello|dear)$/i.test(g));
    if (!firstGreeting) {
      negatives.add("Do not open with a greeting or a name. Start with the observation.");
    }
  }

  if (rejected.length > 0 && approved.length === 0) {
    negatives.add("The user rejected every draft. Change the angle materially, not just the wording.");
  }

  return { examples, negatives: Array.from(negatives) };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

export async function analyzeWebsiteAction(
  rawUrl: string,
  optionalNotes?: string,
  options: { autopilot?: boolean; bookingUrl?: string | null; existingRunId?: string | null } = {}
): Promise<{
  ok: boolean;
  runId?: string;
  strategy?: SynthesizedGtmStrategy;
  agentRunId?: string;
  error?: string;
  rateLimited?: boolean;
}> {
  try {
    const user = await requireUser();
    const workspace = await getActiveWorkspace(user.id);
    const db = getDb();
    await ensureChadGtmTables(db);

    // Each analysis runs a headless browser and LLM calls: cap it per user.
    const limited = await analysisRateLimit(db, user.id);
    if (limited) return { ok: false, error: limited, rateLimited: true };

    // Retrying research on an existing run: it must be the caller's and unlaunched.
    let existingRunId: string | null = null;
    if (options.existingRunId) {
      const [existing] = await db
        .select({ id: schema.chadGtmRuns.id, campaignId: schema.chadGtmRuns.campaignId })
        .from(schema.chadGtmRuns)
        .where(
          and(
            eq(schema.chadGtmRuns.id, options.existingRunId),
            eq(schema.chadGtmRuns.userId, user.id),
            isNull(schema.chadGtmRuns.dismissedAt)
          )
        )
        .limit(1);
      if (!existing) return { ok: false, error: "Run not found." };
      if (existing.campaignId) return { ok: false, error: "This campaign is already live." };
      existingRunId = existing.id;
    }

    // Phase 1: run the analysis through the agent harness. If anything in the
    // harness fails, fall back to the legacy direct path so the user is never
    // blocked by the new runtime.
    if (process.env.AGENT_RUNTIME_ENABLED !== "false") {
      try {
        await ensureAgentTables(db);
        const runtime = new AgentRuntime({
          store: new DrizzleAgentStore(db),
          registry: new ToolRegistry().registerAll(PHASE_1_TOOLS),
          planner: new GtmAnalysisPlanner(),
          db,
          maxSteps: 10,
        });

        const agentRun = await runtime.start({
          userId: user.id,
          workspaceId: workspace.id,
          kind: "gtm_analysis",
          goal: rawUrl,
          input: {
            url: rawUrl,
            notes: optionalNotes ?? "",
            autopilot: Boolean(options.autopilot),
            bookingUrl: options.bookingUrl ?? null,
            existingRunId,
          },
          budgetCents: 200,
        });
        const result = await runtime.runUntilPause(agentRun.id);
        const state = result.run.state as any;

        if (state?.persistence?.chadGtmRunId && state?.strategy) {
          return {
            ok: true,
            runId: state.persistence.chadGtmRunId,
            strategy: state.strategy as SynthesizedGtmStrategy,
            agentRunId: agentRun.id,
          };
        }

        console.warn("[chad-gtm-actions] agent analysis did not complete; using fallback", {
          agentRunId: agentRun.id,
          status: result.run.status,
          stoppedBecause: result.stoppedBecause,
          error: result.run.error,
        });
      } catch (agentErr: any) {
        console.error("[chad-gtm-actions] agent runtime failed; using fallback", agentErr);
      }
    }

    const scraped = await scrapeCompanyWebsite(rawUrl);
    const aiOpts = await getWorkspaceAiOptions(user.id);
    const strategy = await synthesizeGtmStrategy(scraped, optionalNotes, aiOpts);

    if (existingRunId) {
      const bookingUrl = options.bookingUrl || scraped.bookingUrl || null;
      await db
        .update(schema.chadGtmRuns)
        .set({
          companyName: strategy.companyName,
          status: "reviewing",
          businessOverview: strategy.businessOverview,
          icpProfile: strategy.icpProfile,
          offers: strategy.offers,
          selectedIndustries: strategy.icpProfile.industries || [],
          calibrationProfile: {},
          ...(bookingUrl ? { bookingUrl } : {}),
          updatedAt: nowIso(),
        })
        .where(and(eq(schema.chadGtmRuns.id, existingRunId), eq(schema.chadGtmRuns.userId, user.id)));
      return { ok: true, runId: existingRunId, strategy };
    }

    const runId = crypto.randomUUID();
    // With a workspace booking link, a new run uses it unless one was typed in (not one found on the site).
    const workspaceBookingUrl = options.bookingUrl
      ? null
      : await loadWorkspaceLeadSettings(db, user.id, workspace.id === "primary-default" ? null : workspace.id)
          .then((s) => s.bookingUrl)
          .catch(() => null);
    await db.insert(schema.chadGtmRuns).values({
      id: runId,
      userId: user.id,
      workspaceId: workspace.id,
      url: scraped.url,
      companyName: strategy.companyName,
      status: "reviewing",
      businessOverview: strategy.businessOverview,
      icpProfile: strategy.icpProfile,
      offers: strategy.offers,
      selectedIndustries: strategy.icpProfile.industries || [],
      dailyEmailLimit: AUTOPILOT_DAILY_DEFAULT,
      approvedEmailSamples: [],
      bookingUrl: options.bookingUrl || (workspaceBookingUrl ? null : scraped.bookingUrl) || null,
      autopilot: Boolean(options.autopilot),
      // "Lead conversations": the workspace default once it is set up.
      replyAgentMode: await initialRunReplyMode(db, user.id, workspace.id),
    });

    return { ok: true, runId, strategy };
  } catch (err: any) {
    console.error("[chad-gtm-actions] analyzeWebsiteAction error:", err);
    return { ok: false, error: err?.message || "Failed to analyze website." };
  }
}

export async function updateGtmStrategyAction(
  runId: string,
  strategy: {
    businessOverview: any;
    icpProfile: any;
    offers: any[];
    selectedIndustries?: string[];
    /** The offer picked in setup: saved as offers[0], which every reader uses (#51). */
    selectedOfferIndex?: number;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);

    const offers =
      typeof strategy.selectedOfferIndex === "number"
        ? withChosenOfferFirst(strategy.offers || [], strategy.selectedOfferIndex)
        : strategy.offers;
    await db
      .update(schema.chadGtmRuns)
      .set({
        businessOverview: strategy.businessOverview,
        icpProfile: strategy.icpProfile,
        offers,
        selectedIndustries: strategy.selectedIndustries || strategy.icpProfile?.industries || [],
        updatedAt: nowIso(),
      })
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      );

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update strategy." };
  }
}

export async function searchMatchingLeadsAction(
  runId: string,
  industries: string[],
  page = 1,
  pageSize = 10,
  opts: { strictRoles?: boolean } = {}
) {
  const empty = { total: 0, roleMatches: 0, otherRoles: 0, perRun: LEADS_PER_CAMPAIGN, bySize: false, sampleMatchesTitles: false, leads: [] as any[] };
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);
    const [run] = await db
      .select()
      .from(schema.chadGtmRuns)
      .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.userId, user.id)))
      .limit(1);
    if (!run) return { ok: false, ...empty, error: "AutoGTM run not found." };

    // Same audience rules as launch: work addresses in AUTOPILOT_COUNTRIES,
    // the run's job titles first, then others in the industries.
    // Masked preview (name/title/company/location only), capped page size.
    const cleanIndustries = Array.isArray(industries) ? industries.filter((i) => typeof i === "string") : [];
    const countries = autopilotCountries();
    const titles = getTargetTitles(run);
    // Company size narrows these the same way launch does (#57).
    const teamSizes = runTeamSizes(run);
    const strictRoles = opts.strictRoles ?? runStrictRoles(run);
    const { roleMatches, otherRoles } = launchAudienceCounts({ industries: cleanIndustries, titles, teamSizes, countries });

    let result = searchLeadMatcherPreview(cleanIndustries, countries, page, pageSize, { jobTitles: titles, teamSizes });
    let sampleMatchesTitles = titles.length > 0;
    if (result.leads.length === 0 && titles.length > 0 && !strictRoles) {
      // Nobody has the titles: launch fills the run from the industries, so show those.
      result = searchLeadMatcherPreview(cleanIndustries, countries, page, pageSize, { teamSizes });
      sampleMatchesTitles = false;
    }
    return {
      ok: true,
      total: roleMatches + (strictRoles ? 0 : otherRoles),
      roleMatches,
      otherRoles,
      perRun: LEADS_PER_CAMPAIGN,
      bySize: teamSizes.length > 0,
      sampleMatchesTitles,
      leads: result.leads,
    };
  } catch (err: any) {
    if (err?.digest?.startsWith?.("NEXT_REDIRECT")) throw err;
    return { ok: false, ...empty, error: err?.message };
  }
}

export async function generateCalibrationEmailsAction(
  runId: string,
  selectedOfferIndex = 0,
  options: {
    feedback?: CalibrationFeedbackItem[];
    count?: number;
    offset?: number;
  } = {}
): Promise<{ ok: boolean; emailSamples?: any[]; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);

    const [run] = await db
      .select()
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      )
      .limit(1);

    if (!run) throw new Error("AutoGTM session not found.");

    const industries = (run.selectedIndustries as string[]) || [];
    const offers = (run.offers as any[]) || [];
    const activeOffer = offers[selectedOfferIndex] || offers[0] || {
      title: "Direct Value Offer",
      angle: "Direct ROI",
      valueProp: "Accelerate your team's workflow and output.",
      cta: "Open to a brief 4-minute demo this Thursday?",
    };

    const count = Math.min(10, Math.max(1, options.count || 10));
    const offset = Math.max(0, Math.floor(options.offset || 0));

    // Pull verified leads from the SQLite directory. Offset lets adaptive
    // re-generation show new prospects instead of repeating the same deck.
    const matchingLeads = fetchTargetedLeads(
      industries,
      getTargetTitles(run),
      count,
      offset,
      { teamSizes: runTeamSizes(run), strictRoles: runStrictRoles(run) }
    );

    if (matchingLeads.length === 0) {
      throw new Error(
        "No verified leads match the selected industries. Pick another industry facet."
      );
    }

    const aiOpts = await getWorkspaceAiOptions(user.id);
    const overview = run.businessOverview as any;
    const guidance = buildStyleGuidance(options.feedback);
    const campaignContext = buildCampaignContext(run, activeOffer);

    // Persist the in-progress feedback vector so it survives a refresh and is
    // available to the final calibration/launch step.
    if (options.feedback && options.feedback.length > 0) {
      await db
        .update(schema.chadGtmRuns)
        .set({ approvedEmailSamples: options.feedback as any, updatedAt: nowIso() })
        .where(eq(schema.chadGtmRuns.id, runId));
    }

    // Real emails rotate across the shared pool, one persona per lead, so the
    // samples rotate the same way. Only pool mailboxes: never another
    // client's own mailbox name. Addresses are never selected.
    const pool = await db
      .select({
        fromName: schema.senderAccounts.fromName,
        senderName: schema.senderAccounts.senderName,
        signature: schema.senderAccounts.signature,
      })
      .from(schema.senderAccounts)
      .where(
        and(
          eq(schema.senderAccounts.isSystemPool, true),
          eq(schema.senderAccounts.status, "active"),
          isNull(schema.senderAccounts.deletedAt)
        )
      )
      .orderBy(asc(schema.senderAccounts.createdAt));

    const emailSamples = await mapWithConcurrency(
      matchingLeads,
      3,
      async (dl, idx) => {
        const persona = samplePersonaFor(pool, offset + idx);
        const resolvedSenderName = persona.firstName;
        const leadProfile: LeadProfile = {
          id: dl.leadId,
          email: dl.email,
          firstName: dl.firstName,
          lastName: dl.lastName,
          company: dl.companyName,
          jobTitle: dl.jobTitle,
          industry: dl.industry,
          location: dl.location,
          customFields: compactCustomFields(dl.rawAttributes),
        };

        const instruction = `Company: ${run.companyName}.
Business summary: ${overview?.summary || "B2B solution"}.
Core value offer: ${activeOffer.valueProp}.
Outreach angle: ${activeOffer.angle}.
Call to action: ${activeOffer.cta}.
Write to ${dl.jobTitle || "the buyer"} at ${dl.companyName || "the target account"}. Use only the offer above, in the prospect's language. Do not mention unrelated services or invent proof.`;

        const dossier = await investigateLeadDossier(
          leadProfile,
          instruction,
          campaignContext
        );

        const script = await generateEmailScriptOnTheFly({
          ...aiOpts,
          lead: leadProfile,
          dossier,
          campaignContext,
          customInstruction: instruction,
          senderName: resolvedSenderName,
          fallbackSubject: `${dossier.suggestedSubject || activeOffer.angle?.toLowerCase() || "quick note"}`,
          fallbackBody: `Hi ${dl.firstName || "there"},\n\n${dossier.humanObservation}\n\n${dossier.frictionPoke}\n\n${dossier.customAssetDeliverable}\n\n${dossier.lowFrictionCta}\n\nBest,\n${resolvedSenderName}`,
          index: offset + idx,
          styleExamples: guidance.examples,
          negativeConstraints: guidance.negatives,
          requireSpintax: false,
        });

        return {
          id: `sample-${offset + idx + 1}`,
          leadId: dl.leadId,
          recipientName:
            dl.fullName || `${dl.firstName} ${dl.lastName}`.trim() || "Decision Maker",
          recipientCompany: dl.companyName || "Organization",
          recipientTitle: dl.jobTitle || "Executive",
          recipientIndustry: dl.industry || "Business",
          subject: script.subject,
          bodyText: script.bodyText,
          bodyHtml: script.bodyHtml,
          personalizationReason: script.personalizationReason,
          outboundMaturity: dossier.outboundMaturity,
          dossier,
          approved: false,
          sender: { name: persona.name, signature: persona.signature, poolSize: persona.poolSize },
        };
      }
    );

    return { ok: true, emailSamples };
  } catch (err: any) {
    console.error("[chad-gtm-actions] generateCalibrationEmails error:", err);
    return { ok: false, error: err?.message || "Failed to generate calibration deck." };
  }
}

/**
 * Adaptive mid-deck generation. The client calls this when the user has
 * calibrated enough cards; the returned cards are conditioned on approvals and
 * rejection reasons collected so far.
 */
export async function generateAdaptiveCalibrationSamplesAction(
  runId: string,
  selectedOfferIndex: number,
  feedback: CalibrationFeedbackItem[],
  existingCount: number
): Promise<{ ok: boolean; emailSamples?: any[]; error?: string }> {
  return generateCalibrationEmailsAction(runId, selectedOfferIndex, {
    feedback,
    count: 3,
    offset: Math.max(0, existingCount),
  });
}

export async function saveCalibrationFeedbackAction(
  runId: string,
  feedback: CalibrationFeedbackItem[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);
    await db
      .update(schema.chadGtmRuns)
      .set({ approvedEmailSamples: feedback as any, updatedAt: nowIso() })
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to save calibration feedback." };
  }
}

export interface CalibrationProfile {
  voiceTone: string;
  analysisSummary: string;
  keyAdjustments: string[];
  dos: string[];
  donts: string[];
  customAiInstruction: string;
  calibratedSubjectTemplate: string;
  calibratedBodyTemplate: string;
  approvedCount: number;
  rejectedCount: number;
  styleExemplars?: Array<{ subject: string; bodyText: string; recipientTitle?: string }>;
  rejectionConstraints?: string[];
}

export async function refineGtmCalibrationAction(
  runId: string,
  calibrationDeck: Array<{
    id?: string;
    leadId?: string;
    recipientName?: string;
    recipientCompany?: string;
    recipientTitle?: string;
    recipientIndustry?: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    approved: boolean;
    rejectedReason?: string;
  }>,
  selectedOfferIndex = 0
): Promise<{
  ok: boolean;
  profile?: CalibrationProfile;
  refinedSamples?: any[];
  error?: string;
}> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);

    const [run] = await db
      .select()
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      )
      .limit(1);

    if (!run) throw new Error("AutoGTM session not found.");

    const offers = (run.offers as any[]) || [];
    const activeOffer = offers[selectedOfferIndex] || offers[0] || {
      title: "Direct Value Offer",
      angle: "Direct ROI",
      valueProp: "Accelerate your team's workflow and output.",
      cta: "Open to a brief 4-minute demo this Thursday?",
    };

    const overview = (run.businessOverview as any) || {};
    const icp = (run.icpProfile as any) || {};

    const approved = calibrationDeck.filter((c) => c.approved);
    const rejected = calibrationDeck.filter((c) => !c.approved);

    const aiOpts = await getWorkspaceAiOptions(user.id);
    const apiKey =
      aiOpts.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    let profile: CalibrationProfile | null = null;
    let refinedSamples: any[] = [];

    if (apiKey) {
      const prompt = `You are an elite B2B cold outreach strategist and voice calibration engine.
The user just completed a swipe/approval deck reviewing sample cold emails for their company.
Analyze the exact stylistic contrast between the emails the user APPROVED and the emails they REJECTED to adjust future outbound copy to their preferences.

TARGET COMPANY & OFFER CONTEXT:
- Company: ${run.companyName}
- Summary: ${overview.summary || "B2B platform"}
- Key Value Offer: ${activeOffer.valueProp}
- Angle: ${activeOffer.angle}
- Call to Action: ${activeOffer.cta}
- Target Titles: ${JSON.stringify(icp.targetTitles || [])}

USER'S APPROVED COPIES (${approved.length} approved):
${JSON.stringify(
  approved.map((a) => ({
    subject: a.subject,
    body: a.bodyText,
    toTitle: a.recipientTitle,
    toCompany: a.recipientCompany,
  }))
)}

USER'S REJECTED COPIES (${rejected.length} rejected):
${JSON.stringify(
  rejected.map((r) => ({
    subject: r.subject,
    body: r.bodyText,
    toTitle: r.recipientTitle,
    toCompany: r.recipientCompany,
    rejectedReason: (r as any).rejectedReason || "General tone / style mismatch",
  }))
)}

TASK:
1. In "voiceTone", synthesize the user's desired tone in 4-8 words (e.g. "Direct, low-friction, peer-to-peer technical").
2. In "analysisSummary", write 2 punchy sentences summarizing what they liked about the approved emails and what specific traits they rejected.
3. In "keyAdjustments", list exactly 3 concrete adjustments made to all future copies (e.g. "Eliminated introductory fluff greetings", "Kept body strictly under 60 words", "Replaced calendar links with 4-minute curiosity questions").
4. In "dos", list 3 strict writing rules to follow for this campaign.
5. In "donts", list 3 strict rules of what to NEVER do.
6. In "calibratedSubjectTemplate", formulate an optimal subject line template with variables like {{company}} or {{first_name}}. Include 2-3 spintax variants where natural, e.g. "{quick|brief} question re: {{company}}".
7. In "calibratedBodyTemplate", formulate the calibrated email body template with variables {{first_name}}, {{company}}, {{job_title}}, {{industry}}, and {{sender_name}}. Include a greeting spintax group like {Hi|Hey|Hello} and at least one other low-risk {a|b} variant. Never spin names, companies, numbers, or factual claims.
8. In "customAiInstruction", create a comprehensive instruction prompt for the dynamic AI sending engine so that every future lead receives a personalized email adhering strictly to these calibrated preferences.
9. In "refinedSamples", provide 2-3 freshly refined sample emails demonstrating the adjusted copy for sample decision makers.

Respond STRICTLY with a valid JSON object matching this structure:
{
  "voiceTone": "...",
  "analysisSummary": "...",
  "keyAdjustments": ["...", "...", "..."],
  "dos": ["...", "...", "..."],
  "donts": ["...", "...", "..."],
  "calibratedSubjectTemplate": "...",
  "calibratedBodyTemplate": "...",
  "customAiInstruction": "...",
  "refinedSamples": [
    {
      "recipientName": "...",
      "recipientTitle": "...",
      "recipientCompany": "...",
      "recipientIndustry": "...",
      "subject": "...",
      "bodyText": "..."
    }
  ]
}`;

      try {
        const model = aiOpts.model || "gemini-3.8-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.3,
            },
          }),
        });

        if (res.ok) {
          const resData = await res.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            profile = {
              voiceTone: parsed.voiceTone || "Direct, peer-to-peer technical",
              analysisSummary: parsed.analysisSummary || "Adjusted copy to favor direct, low-friction value propositions.",
              keyAdjustments: Array.isArray(parsed.keyAdjustments) ? parsed.keyAdjustments : [
                "Eliminated introductory pleasantries in favor of immediate value hooks",
                "Trimmed copy length for rapid mobile scanning",
                "Shifted to low-friction curiosity CTAs"
              ],
              dos: Array.isArray(parsed.dos) ? parsed.dos : [
                "Lead with specific operational bottleneck in line 1",
                "Reference recipient industry and role context",
                "Keep body under 65 words"
              ],
              donts: Array.isArray(parsed.donts) ? parsed.donts : [
                "Never use 'Hope this email finds you well'",
                "Avoid aggressive calendar booking links",
                "No generic corporate fluff"
              ],
              customAiInstruction: parsed.customAiInstruction || `Write cold outreach for ${run.companyName}. Voice: Direct, technical peer-to-peer. Keep under 65 words. Highlight: ${activeOffer.valueProp}. CTA: ${activeOffer.cta}.`,
              calibratedSubjectTemplate: parsed.calibratedSubjectTemplate || `Quick question re: {{company}} workflow`,
              calibratedBodyTemplate: parsed.calibratedBodyTemplate || `Hi {{first_name}},\n\nSaw your team at {{company}} scaling operations.\n\n${activeOffer.valueProp}\n\n${activeOffer.cta}\n\nBest,\n{{sender_name}}`,
              approvedCount: approved.length,
              rejectedCount: rejected.length,
            };
            if (Array.isArray(parsed.refinedSamples) && parsed.refinedSamples.length > 0) {
              refinedSamples = parsed.refinedSamples.map((s: any, idx: number) => ({
                id: `refined-${idx + 1}`,
                recipientName: s.recipientName || "Alex Rivera",
                recipientTitle: s.recipientTitle || "VP of Engineering",
                recipientCompany: s.recipientCompany || "TechScale IO",
                recipientIndustry: s.recipientIndustry || "Enterprise Software",
                subject: s.subject || profile!.calibratedSubjectTemplate,
                bodyText: s.bodyText || profile!.calibratedBodyTemplate,
                approved: true,
              }));
            }
          }
        }
      } catch (geminiErr) {
        console.error("[chad-gtm-actions] Gemini refinement call error:", geminiErr);
      }
    }

    // Algorithmic Fallback if offline or API error
    if (!profile) {
      const primarySample = approved[0] || calibrationDeck[0] || {
        subject: `Quick question for {{company}}`,
        bodyText: `Hi {{first_name}},\n\nBetween scaling operations and driving growth, ${activeOffer.valueProp}\n\n${activeOffer.cta}\n\nBest,\n{{sender_name}}`,
      };

      const wordCount = Math.round(
        (primarySample.bodyText || "").split(/\s+/).filter(Boolean).length || 55
      );

      profile = {
        voiceTone: approved.length > 0 ? "Direct, calibrated peer-to-peer" : "Concise, value-first B2B",
        analysisSummary: approved.length > 0
          ? `Calibrated copy to match ${approved.length} approved angle(s) focusing on ${activeOffer.angle}. Rejected conversational fluff and aggressive sales pitches.`
          : `Calibrated outreach model to default high-converting ${activeOffer.angle} cadence.`,
        keyAdjustments: [
          "Eliminated conversational filler and pleasantries in favor of immediate value hooks",
          `Calibrated email length to ~${wordCount} words for optimal mobile scanning`,
          `Anchored call to action around ${activeOffer.cta || "a low-friction 4-minute demo question"}`
        ],
        dos: [
          "State the core operational bottleneck in line 1",
          "Reference recipient's specific company and industry context",
          "Ask a single low-friction permission question"
        ],
        donts: [
          "Never start with 'I hope this email finds you well'",
          "Do not include aggressive calendar links or ask for 30 minutes",
          "Avoid multi-paragraph corporate background explanations"
        ],
        customAiInstruction: `Write cold outreach for ${run.companyName}. Voice: Direct, technical peer-to-peer. Length: Under 65 words. Zero generic pleasantries. Focus on: ${activeOffer.valueProp}. Call to action: ${activeOffer.cta}.`,
        calibratedSubjectTemplate: primarySample.subject,
        calibratedBodyTemplate: primarySample.bodyText,
        approvedCount: approved.length,
        rejectedCount: rejected.length,
      };

      refinedSamples = approved.length > 0 ? approved.slice(0, 3) : calibrationDeck.slice(0, 3);
    }

    // Persist into database. Keep the full deck (approved + rejected with
    // reasons) so the feedback vector survives refreshes and later re-calibration.
    const guidance = buildStyleGuidance(calibrationDeck as CalibrationFeedbackItem[]);
    if (profile) {
      profile.styleExemplars = guidance.examples;
      profile.rejectionConstraints = guidance.negatives;
    }

    await db
      .update(schema.chadGtmRuns)
      .set({
        calibrationProfile: profile,
        approvedEmailSamples: calibrationDeck,
        updatedAt: nowIso(),
      })
      .where(eq(schema.chadGtmRuns.id, runId));

    return {
      ok: true,
      profile,
      refinedSamples: refinedSamples.length > 0 ? refinedSamples : (approved.length > 0 ? approved : calibrationDeck.slice(0, 3)),
    };
  } catch (err: any) {
    console.error("[chad-gtm-actions] refineGtmCalibrationAction error:", err);
    return { ok: false, error: err?.message || "Failed to refine calibration." };
  }
}

export async function launchChadGtmCampaignAction(
  runId: string,
  dailyLimit: number,
  approvedSamples: any[],
  selectedOfferIndex = 0
): Promise<{ ok: boolean; campaignId?: string; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);

    const [run] = await db
      .select()
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      )
      .limit(1);

    if (!run || run.dismissedAt) throw new Error("AutoGTM run not found.");
    if (run.campaignId) {
      // Idempotent: a double-click must not create two campaigns.
      return { ok: true, campaignId: run.campaignId };
    }

    const { campaignId } = await launchRunCampaign(db, {
      run,
      userId: user.id,
      // The run's own workspace (not whichever is active), so its sender details apply.
      workspaceId: run.workspaceId ?? (await ensureDefaultWorkspace(user.id)).id,
      dailyLimit,
      approvedSamples,
      selectedOfferIndex,
    });

    revalidatePath("/chad-gtm");
    revalidatePath(`/chad-gtm/${runId}`);
    return { ok: true, campaignId };
  } catch (err: any) {
    if (err instanceof LaunchInProgressError) {
      // Another click or tab is launching this run: report its result, never start a second.
      try {
        const user = await requireUser();
        const [fresh] = await getDb()
          .select({ campaignId: schema.chadGtmRuns.campaignId })
          .from(schema.chadGtmRuns)
          .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.userId, user.id)))
          .limit(1);
        if (fresh?.campaignId) return { ok: true, campaignId: fresh.campaignId };
      } catch (readErr: any) {
        if (readErr?.digest?.startsWith?.("NEXT_REDIRECT")) throw readErr;
      }
      return { ok: false, error: "This campaign is already launching. This page updates when it's live." };
    }
    console.error("[chad-gtm-actions] launchChadGtmCampaign error:", err);
    return { ok: false, error: err?.message || "Failed to launch AutoGTM campaign." };
  }
}

export async function getChadGtmRunAction(runId: string) {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);

    const [run] = await db
      .select()
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      )
      .limit(1);

    // A deleted (dismissed) draft is gone for the client: the page 404s.
    if (!run || run.dismissedAt) return null;

    let campaign = null;
    let kpis = {
      queuedProspects: 0,
      sentToday: 0,
      sentLifetime: 0,
      /** Each lead counted once. */
      leadsEmailed: 0,
      openCount: 0,
      openRate: 0,
      repliesCount: 0,
      replyRate: 0,
      positiveSentimentCount: 0,
      agentReplies: 0,
      approvedReplies: 0,
      youReplies: 0,
      openRequests: 0,
      /** Booking-link cards the agent answers once a link is saved. */
      bookingWaiting: 0,
      meetingsBooked: 0,
      /** Leads sent the run's booking link (by the agent or by you). */
      bookingLinksSent: 0,
    };
    let recentActivity: Array<{
      id: string;
      type: "send" | "reply" | "open" | RunActivityAgentType;
      recipient: string;
      timestamp: string;
      detail?: string;
    }> = [];

    if (run.campaignId) {
      const [campRow] = await db
        .select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, run.campaignId))
        .limit(1);
      campaign = campRow || null;

      // Calculate Telemetry
      const [totalLeadsRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.campaignLeads)
        .where(eq(schema.campaignLeads.campaignId, run.campaignId));
      kpis.queuedProspects = Number(totalLeadsRow?.count || 0);

      // Sent Today: the campaign counter is keyed by its local day.
      const today = localDateKey(new Date(), campRow?.sendingTimezone || "UTC");
      const [sentTodayRow] = await db
        .select({ count: schema.usageCounters.count })
        .from(schema.usageCounters)
        .where(
          and(
            eq(schema.usageCounters.entityType, "campaign"),
            eq(schema.usageCounters.entityId, run.campaignId),
            eq(schema.usageCounters.date, today)
          )
        );
      kpis.sentToday = Number(sentTodayRow?.count || 0);

      // Emails sent, leads emailed, replies and opens: one definition (lib/analytics.ts).
      const totals = await getCampaignTotals(run.campaignId);
      const rates = campaignRates(totals);
      kpis.sentLifetime = totals.emailsSent;
      kpis.leadsEmailed = totals.leadsEmailed;
      kpis.repliesCount = totals.repliedLeads;
      kpis.replyRate = Math.round(rates.replyRate);
      kpis.openCount = totals.openedLeads;
      kpis.openRate = Math.round(rates.openRate ?? 0);

      // Reply rows: activity, interested leads and meetings (each lead counted once).
      const replyRows = await db
        .select()
        .from(schema.replies)
        .where(eq(schema.replies.campaignId, run.campaignId));
      // One tag per conversation (#86): a tag you set wins over automatic
      // tags on later replies, so a regressed auto tag never counts twice.
      const replyById = new Map(replyRows.map((r) => [r.id, r]));
      const positiveLeads = new Set<string>();
      const meetingLeads = new Set<string>();
      for (const c of groupUniboxConversations(replyRows)) {
        const positive =
          c.tagSource === "human"
            ? isPositiveReply({ tag: c.tag })
            : c.memberIds.some((id) => {
                const m = replyById.get(id);
                return Boolean(m && isPositiveReply(m));
              });
        if (positive) positiveLeads.add(leadKey(c.latest));
        if (c.tag === "meeting_booked") meetingLeads.add(leadKey(c.latest));
      }
      kpis.positiveSentimentCount = positiveLeads.size;
      // Who actually wrote each answer: the agent on its own, an agent draft
      // you approved, or you. agentStatus alone can't tell them apart.
      const authorRows = await db
        .select({
          fromRole: schema.uniboxMessages.fromRole,
          approvedByUser: schema.uniboxMessages.approvedByUser,
          n: sql<number>`count(*)`,
        })
        .from(schema.uniboxMessages)
        .where(and(eq(schema.uniboxMessages.campaignId, run.campaignId), eq(schema.uniboxMessages.direction, "operator")))
        .groupBy(schema.uniboxMessages.fromRole, schema.uniboxMessages.approvedByUser);
      const authors = countReplyAuthors(authorRows);
      kpis.agentReplies = authors.agent;
      kpis.approvedReplies = authors.approved;
      kpis.youReplies = authors.you;
      // Only hand-set tags record a meeting; the headline counts booking links the agent or you sent.
      kpis.meetingsBooked = meetingLeads.size;
      // The run's own link, else the workspace one it uses.
      const needle = bookingLinkNeedle(
        run.bookingUrl ||
          (await loadWorkspaceLeadSettings(db, user.id, run.workspaceId ?? null)
            .then((s) => s.bookingUrl)
            .catch(() => null)),
      );
      if (needle) {
        const [linkRow] = await db
          .select({
            n: sql<number>`count(distinct coalesce(${schema.uniboxMessages.leadId}, ${schema.uniboxMessages.replyId}))`,
          })
          .from(schema.uniboxMessages)
          .where(
            and(
              eq(schema.uniboxMessages.campaignId, run.campaignId),
              inArray(schema.uniboxMessages.fromRole, ["agent", "operator"]),
              sql`position(${needle} in lower(${schema.uniboxMessages.bodyText})) > 0`,
            ),
          )
          .catch(() => [{ n: 0 }]);
        kpis.bookingLinksSent = Number(linkRow?.n || 0);
      }
      const [openReqRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.agentRequests)
        .where(and(eq(schema.agentRequests.runId, run.id), inArray(schema.agentRequests.status, ["open", "sending"])));
      kpis.openRequests = Number(openReqRow?.count || 0);
      kpis.bookingWaiting = await countBookingLinkWaiting(db, { userId: user.id, runId: run.id }).catch(() => 0);

      // Recent Activity Stream
      const latestSends = await db
        .select({
          id: schema.emailJobs.id,
          toEmail: schema.emailJobs.toEmail,
          sentAt: schema.emailJobs.sentAt,
          subject: schema.emailJobs.subject,
        })
        .from(schema.emailJobs)
        .where(
          and(
            eq(schema.emailJobs.campaignId, run.campaignId),
            eq(schema.emailJobs.status, "sent")
          )
        )
        .orderBy(desc(schema.emailJobs.sentAt))
        .limit(10);

      for (const s of latestSends) {
        recentActivity.push({
          id: s.id,
          type: "send",
          recipient: s.toEmail,
          timestamp: s.sentAt || nowIso(),
          detail: s.subject,
        });
      }

      const latestReplies = [...replyRows].sort((a, b) => (b.receivedAt > a.receivedAt ? 1 : -1)).slice(0, 10);
      for (const r of latestReplies) {
        recentActivity.push({
          id: r.id,
          type: "reply",
          recipient: r.fromEmail,
          timestamp: r.receivedAt,
          detail: r.snippet || (r.tag ? r.tag.replace(/_/g, " ") : ""),
        });
        const agentType = activityTypeForAgentStatus(r.agentStatus);
        if (agentType && r.agentHandledAt) {
          recentActivity.push({
            id: `${r.id}:agent`,
            type: agentType,
            recipient: r.fromEmail,
            timestamp: r.agentHandledAt,
            // "You replied." would repeat the title.
            detail: agentType === "you" ? undefined : r.agentSummary || undefined,
          });
        }
      }

      recentActivity.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
      recentActivity = recentActivity.slice(0, 20);
    }

    const leadConversation = await loadRunConversationState(db, user.id, run.id).catch((err: unknown) => {
      console.error("[chad-gtm-actions] lead conversation state error:", err);
      return null;
    });

    return {
      run,
      campaign,
      kpis,
      recentActivity,
      leadConversation,
    };
  } catch (err) {
    console.error("[chad-gtm-actions] getChadGtmRun error:", err);
    return null;
  }
}

export async function toggleChadGtmStatusAction(
  runId: string,
  newStatus: "active" | "paused"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);

    const [run] = await db
      .select({ campaignId: schema.chadGtmRuns.campaignId })
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      )
      .limit(1);
    if (!run) return { ok: false, error: "Run not found." };
    if (!run.campaignId) return { ok: false, error: "This campaign hasn't launched yet." };

    // One on/off for the outreach: the same action (and the same start
    // checks, lead snapshot and run write-through) as Campaigns & leads.
    const res = await campaignAction(run.campaignId, newStatus === "active" ? "resume" : "pause");
    revalidatePath("/chad-gtm");
    revalidatePath(`/chad-gtm/${runId}`);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update status." };
  }
}

export async function updateChadGtmVelocityAction(
  runId: string,
  dailyLimit: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);

    const [run] = await db
      .select({ campaignId: schema.chadGtmRuns.campaignId })
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      )
      .limit(1);
    if (!run) return { ok: false, error: "Run not found." };
    const safeLimit = clampAutopilotDaily(dailyLimit);

    await db
      .update(schema.chadGtmRuns)
      .set({ dailyEmailLimit: safeLimit, updatedAt: nowIso() })
      .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.userId, user.id)));

    if (run.campaignId) {
      await db
        .update(schema.campaigns)
        .set({ dailyLimit: safeLimit, updatedAt: nowIso() })
        .where(eq(schema.campaigns.id, run.campaignId));
    }

    revalidatePath(`/chad-gtm/${runId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update daily velocity." };
  }
}

/* ─── Pitch (what the agent tells leads) ─────────────────────────────── */

// Not exported: a "use server" module may only export async functions.
const PITCH_TITLE_ERROR = "Give the offer a short title.";
const PITCH_VALUE_ERROR = "Describe what the lead gets in a sentence or two.";
const PITCH_SUMMARY_ERROR = "Keep the company description under 1,200 characters.";

/**
 * Edit the pitch a run's agent works from: offers[0].title / valueProp and
 * businessOverview.summary. Every other offer and overview field, the
 * industries and the target profile are kept. Emails already in the
 * sequence keep the pitch they launched with.
 */
export async function updateRunPitchAction(
  runId: string,
  input: { title: string; valueProp: string; summary: string }
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const user = await requireUser();
    const title = String(input?.title ?? "").trim();
    const valueProp = String(input?.valueProp ?? "").trim();
    const summary = String(input?.summary ?? "").trim();
    if (title.length < 1 || title.length > 120) return { ok: false, error: PITCH_TITLE_ERROR };
    if (valueProp.length < 10 || valueProp.length > 600) return { ok: false, error: PITCH_VALUE_ERROR };
    if (summary.length > 1200) return { ok: false, error: PITCH_SUMMARY_ERROR };

    const db = getDb();
    await ensureChadGtmTables(db);
    const [run] = await db
      .select({
        offers: schema.chadGtmRuns.offers,
        businessOverview: schema.chadGtmRuns.businessOverview,
        // "What this campaign offers" wins over the pitch offer in agent replies.
        campaignOffer: schema.campaigns.agentOffer,
      })
      .from(schema.chadGtmRuns)
      .leftJoin(
        schema.campaigns,
        and(eq(schema.campaigns.id, schema.chadGtmRuns.campaignId), eq(schema.campaigns.userId, user.id))
      )
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id),
          isNull(schema.chadGtmRuns.dismissedAt)
        )
      )
      .limit(1);
    if (!run) return { ok: false, error: "Run not found." };

    const offers: any[] = Array.isArray(run.offers) ? [...(run.offers as any[])] : [];
    const first = offers[0] && typeof offers[0] === "object" ? offers[0] : {};
    offers[0] = { ...first, title, valueProp };
    const overview =
      run.businessOverview && typeof run.businessOverview === "object" ? (run.businessOverview as Record<string, unknown>) : {};

    await db
      .update(schema.chadGtmRuns)
      .set({ offers, businessOverview: { ...overview, summary }, updatedAt: nowIso() })
      .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.userId, user.id)));

    revalidatePath(`/chad-gtm/${runId}`);
    revalidatePath("/dashboard");
    if (String(run.campaignOffer ?? "").trim()) {
      return {
        ok: true,
        message:
          "Pitch saved. Replies still describe the offer from \"What this campaign offers\"; clear that field to use this one.",
      };
    }
    return { ok: true, message: "Pitch saved. The agent uses it in replies from now on." };
  } catch (err: any) {
    if (err?.digest?.startsWith?.("NEXT_REDIRECT")) throw err;
    return { ok: false, error: err?.message || "Couldn't save the pitch. Try again." };
  }
}

/* ─── Delete an unlaunched run ───────────────────────────────────────── */

const DISMISS_LAUNCHED_ERROR =
  "This run has launched or is launching, so it can't be deleted. Pause it instead.";

/**
 * Remove a run that never launched (a guided draft, or an autopilot run stuck
 * before launch). Soft delete: the row stays, so the research rate limit
 * still counts it. Refused once the run has a campaign or holds a live
 * launch claim.
 */
export async function dismissRunAction(runId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);
    const now = nowIso();
    const staleClaim = new Date(Date.now() - LAUNCH_CLAIM_TTL_MS).toISOString();
    const dismissed: Array<{ id: string }> = await db
      .update(schema.chadGtmRuns)
      .set({ dismissedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.chadGtmRuns.id, runId),
          eq(schema.chadGtmRuns.userId, user.id),
          isNull(schema.chadGtmRuns.campaignId),
          isNull(schema.chadGtmRuns.dismissedAt),
          or(isNull(schema.chadGtmRuns.launchStartedAt), lt(schema.chadGtmRuns.launchStartedAt, staleClaim))
        )
      )
      .returning({ id: schema.chadGtmRuns.id });
    if (dismissed.length === 0) return { ok: false, error: DISMISS_LAUNCHED_ERROR };

    revalidatePath("/chad-gtm");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err: any) {
    if (err?.digest?.startsWith?.("NEXT_REDIRECT")) throw err;
    return { ok: false, error: err?.message || "Couldn't delete this run. Try again." };
  }
}

/** CSV of every interested lead in the run (all replies, not just recent activity), one row per lead. */
export async function exportInterestedLeadsAction(
  runId: string
): Promise<{ ok: true; csv: string; count: number } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);
    const [run] = await db
      .select({ campaignId: schema.chadGtmRuns.campaignId })
      .from(schema.chadGtmRuns)
      .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.userId, user.id)))
      .limit(1);
    if (!run) return { ok: false, error: "This run no longer exists." };
    if (!run.campaignId) return { ok: true, csv: interestedLeadsToCsv([]), count: 0 };

    const rows = await db
      .select({
        leadId: schema.replies.leadId,
        fromEmail: schema.replies.fromEmail,
        fromName: schema.replies.fromName,
        tag: schema.replies.tag,
        agentIntent: schema.replies.agentIntent,
        receivedAt: schema.replies.receivedAt,
        snippet: schema.replies.snippet,
        firstName: schema.leads.firstName,
        lastName: schema.leads.lastName,
        company: schema.leads.company,
        jobTitle: schema.leads.jobTitle,
      })
      .from(schema.replies)
      .leftJoin(schema.leads, eq(schema.replies.leadId, schema.leads.id))
      .where(and(eq(schema.replies.campaignId, run.campaignId), eq(schema.replies.userId, user.id)));

    const leads = groupInterestedLeads(rows);
    return { ok: true, csv: interestedLeadsToCsv(leads), count: leads.length };
  } catch (err: any) {
    if (err?.digest?.startsWith?.("NEXT_REDIRECT")) throw err;
    return { ok: false, error: "Couldn't build the export. Try again." };
  }
}
