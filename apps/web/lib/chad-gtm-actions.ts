"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ensureOutreachSpintax, schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { getDb, ensureChadGtmTables, ensureAgentTables } from "./db";
import { requireUser } from "./session";
import { getActiveWorkspace } from "./workspaces";
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
import { extractSenderFirstName } from "@smartreach/email-engine";
import { ensureCampaignLeadSnapshot } from "./campaign-drafts";
import { DrizzleAgentStore } from "./agent/store";
import { ToolRegistry } from "./agent/registry";
import { GtmAnalysisPlanner } from "./agent/planner";
import { AgentRuntime } from "./agent/runtime";
import { PHASE_1_TOOLS } from "./agent/tools";
import { assertCanSend } from "./approval";
import { analysisRateLimit } from "./autopilot-state";
import { autopilotCountries } from "./autopilot-policy";
import {
  buildCampaignContext,
  compactCustomFields,
  fetchTargetedLeads,
  getTargetTitles,
  launchRunCampaign,
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
        .where(and(eq(schema.chadGtmRuns.id, options.existingRunId), eq(schema.chadGtmRuns.userId, user.id)))
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
      dailyEmailLimit: 30,
      approvedEmailSamples: [],
      bookingUrl: options.bookingUrl || scraped.bookingUrl || null,
      autopilot: Boolean(options.autopilot),
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
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await ensureChadGtmTables(db);

    await db
      .update(schema.chadGtmRuns)
      .set({
        businessOverview: strategy.businessOverview,
        icpProfile: strategy.icpProfile,
        offers: strategy.offers,
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
  industries: string[],
  page = 1,
  pageSize = 10
) {
  try {
    await requireUser();
    // Same audience rules as launch: work addresses in AUTOPILOT_COUNTRIES.
    // Masked preview (name/title/company/location only), capped page size.
    const result = searchLeadMatcherPreview(
      Array.isArray(industries) ? industries.filter((i) => typeof i === "string") : [],
      autopilotCountries(),
      page,
      pageSize
    );
    return { ok: true, total: result.total, leads: result.leads };
  } catch (err: any) {
    if (err?.digest?.startsWith?.("NEXT_REDIRECT")) throw err;
    return { ok: false, total: 0, leads: [], error: err?.message };
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
      offset
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

    // Resolve sender first name from active sender account or system pool
    const activeSender = (await db
      .select()
      .from(schema.senderAccounts)
      .where(
        and(
          eq(schema.senderAccounts.status, "active"),
          isNull(schema.senderAccounts.deletedAt)
        )
      )
      .orderBy(desc(schema.senderAccounts.isSystemPool), asc(schema.senderAccounts.createdAt))
      .limit(1)
      .then((rows) => rows[0])) || null;

    const resolvedSenderName = extractSenderFirstName(activeSender);

    const emailSamples = await mapWithConcurrency(
      matchingLeads,
      3,
      async (dl, idx) => {
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
    const workspace = await getActiveWorkspace(user.id);
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

    if (!run) throw new Error("AutoGTM run not found.");
    if (run.campaignId) {
      // Idempotent: a double-click must not create two campaigns.
      return { ok: true, campaignId: run.campaignId };
    }

    const { campaignId } = await launchRunCampaign(db, {
      run,
      userId: user.id,
      workspaceId: workspace.id,
      dailyLimit,
      approvedSamples,
      selectedOfferIndex,
    });

    revalidatePath("/chad-gtm");
    revalidatePath(`/chad-gtm/${runId}`);
    return { ok: true, campaignId };
  } catch (err: any) {
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

    if (!run) return null;

    let campaign = null;
    let kpis = {
      queuedProspects: 0,
      sentToday: 0,
      sentLifetime: 0,
      openCount: 0,
      openRate: 0,
      repliesCount: 0,
      replyRate: 0,
      positiveSentimentCount: 0,
      agentReplies: 0,
      openRequests: 0,
      meetingsBooked: 0,
    };
    let recentActivity: Array<{
      id: string;
      type: "send" | "reply" | "open" | "agent";
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

      // Sent Today
      const today = new Date().toISOString().slice(0, 10);
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

      // Sent Lifetime
      // Count delivered jobs, not campaign_leads.status: a lead moves on to
      // "active"/"replied" after its first send, which hid real volume.
      const [sentLifetimeRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.emailJobs)
        .where(
          and(
            eq(schema.emailJobs.campaignId, run.campaignId),
            eq(schema.emailJobs.status, "sent")
          )
        );
      kpis.sentLifetime = Number(sentLifetimeRow?.count || 0);

      // Opens
      const [opensRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.emailTrackingEvents)
        .where(
          and(
            eq(schema.emailTrackingEvents.campaignId, run.campaignId),
            eq(schema.emailTrackingEvents.type, "open")
          )
        );
      kpis.openCount = Number(opensRow?.count || 0);
      kpis.openRate =
        kpis.sentLifetime > 0 ? Math.round((kpis.openCount / kpis.sentLifetime) * 100) : 0;

      // Replies
      const replyRows = await db
        .select()
        .from(schema.replies)
        .where(eq(schema.replies.campaignId, run.campaignId));
      kpis.repliesCount = replyRows.length;
      // Rate = share of contacted leads who replied at all (follow-up replies
      // in the same thread must not push this above 100%).
      const repliedLeads = new Set(replyRows.map((r) => r.leadId || r.fromEmail)).size;
      kpis.replyRate =
        kpis.sentLifetime > 0 ? Math.min(100, Math.round((repliedLeads / kpis.sentLifetime) * 100)) : 0;

      kpis.positiveSentimentCount = replyRows.filter(
        (r) => r.tag === "interested" || r.tag === "meeting_booked"
      ).length;
      kpis.agentReplies = replyRows.filter((r) => r.agentStatus === "replied").length;
      kpis.meetingsBooked = replyRows.filter((r) => r.tag === "meeting_booked").length;
      const [openReqRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.agentRequests)
        .where(and(eq(schema.agentRequests.runId, run.id), eq(schema.agentRequests.status, "open")));
      kpis.openRequests = Number(openReqRow?.count || 0);

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
        if (r.agentStatus && r.agentHandledAt && r.agentStatus !== "pending" && r.agentStatus !== "processing") {
          recentActivity.push({
            id: `${r.id}:agent`,
            type: "agent",
            recipient: r.fromEmail,
            timestamp: r.agentHandledAt,
            detail: r.agentSummary || r.agentStatus,
          });
        }
      }

      recentActivity.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
      recentActivity = recentActivity.slice(0, 20);
    }

    return {
      run,
      campaign,
      kpis,
      recentActivity,
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
    if (newStatus === "active") {
      if (!run.campaignId) return { ok: false, error: "This campaign hasn't launched yet." };
      await assertCanSend(user.id);
    }

    await db
      .update(schema.chadGtmRuns)
      .set({ status: newStatus, updatedAt: nowIso() })
      .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.userId, user.id)));

    if (run.campaignId) {
      await db
        .update(schema.campaigns)
        .set({
          status: newStatus === "active" ? "running" : "paused",
          updatedAt: nowIso(),
        })
        .where(eq(schema.campaigns.id, run.campaignId));
    }

    revalidatePath(`/chad-gtm/${runId}`);
    return { ok: true };
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
    const safeLimit = Math.min(500, Math.max(30, Math.round(Number(dailyLimit) || 30)));

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
