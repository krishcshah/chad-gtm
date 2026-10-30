"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ensureOutreachSpintax, schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { getDb, ensureChadGtmTables } from "./db";
import { requireUser } from "./session";
import { getActiveWorkspace } from "./workspaces";
import {
  scrapeCompanyWebsite,
  synthesizeGtmStrategy,
  type SynthesizedGtmStrategy,
} from "./chad-gtm-research";
import {
  searchLeadsDirectory,
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

function buildCampaignContext(
  run: typeof schema.chadGtmRuns.$inferSelect,
  activeOffer: { title?: string; angle?: string; valueProp?: string; cta?: string }
): CampaignResearchContext {
  const overview = (run.businessOverview as any) || {};
  const icp = (run.icpProfile as any) || {};
  const isOwnOffer = /autogtm|chadgtm|smartreach/i.test(
    `${run.url || ""} ${run.companyName || ""}`
  );

  return {
    companyName: run.companyName || "our company",
    companySummary: overview.summary,
    valueProposition: activeOffer.valueProp,
    angle: activeOffer.angle,
    cta: activeOffer.cta,
    offerTitle: activeOffer.title,
    painPoints: Array.isArray(icp.painPoints) ? icp.painPoints : [],
    targetTitles: Array.isArray(icp.targetTitles) ? icp.targetTitles : [],
    isOutboundInfrastructure: isOwnOffer,
  };
}

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTargetTitles(run: typeof schema.chadGtmRuns.$inferSelect): string[] {
  const icp = (run.icpProfile as any) || {};
  const flat = Array.isArray(icp.targetTitles) ? icp.targetTitles : [];
  const personaTitles = Array.isArray(icp.personas)
    ? icp.personas.flatMap((p: any) => (Array.isArray(p?.titles) ? p.titles : []))
    : [];
  return Array.from(
    new Set(
      [...flat, ...personaTitles]
        .map((t) => String(t || "").trim())
        .filter((t) => t.length >= 2)
    )
  ).slice(0, 8);
}

/**
 * Prefer leads whose titles match the ICP, then top up with industry-only
 * matches. Prevents a campaign from starving when title formats vary wildly.
 */
function fetchTargetedLeads(
  industries: string[],
  targetTitles: string[],
  desired: number,
  offset: number
) {
  const base = {
    industries: industries.length > 0 ? industries : undefined,
    hasEmail: true,
  };
  if (targetTitles.length === 0) {
    return getMatchingDirectoryLeadsForExport(base, desired, offset);
  }

  const targeted = getMatchingDirectoryLeadsForExport(
    { ...base, jobTitles: targetTitles },
    desired,
    offset
  );
  if (targeted.length >= desired) return targeted;

  const seen = new Set(targeted.map((lead) => lead.email.toLowerCase()));
  const fallback = getMatchingDirectoryLeadsForExport(base, desired * 3, offset);
  for (const lead of fallback) {
    if (targeted.length >= desired) break;
    const key = lead.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targeted.push(lead);
  }
  return targeted;
}

function compactCustomFields(raw: Record<string, string> | undefined): Record<string, string> {  if (!raw) return {};
  const skip = /^(email|first|last|full|name|job|title|company|industry|location|city|state|country|phone|website|linkedin)/i;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= 12) break;
    if (skip.test(key)) continue;
    const text = String(value ?? "").trim();
    if (!text) continue;
    out[key] = text.slice(0, 200);
  }
  return out;
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
  optionalNotes?: string
): Promise<{ ok: boolean; runId?: string; strategy?: SynthesizedGtmStrategy; error?: string }> {
  try {
    const user = await requireUser();
    const workspace = await getActiveWorkspace(user.id);
    const db = getDb();
    await ensureChadGtmTables(db);

    const scraped = await scrapeCompanyWebsite(rawUrl);
    const aiOpts = await getWorkspaceAiOptions(user.id);
    const strategy = await synthesizeGtmStrategy(scraped, optionalNotes, aiOpts);

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
    const result = searchLeadsDirectory({
      industries: industries.length > 0 ? industries : undefined,
      hasEmail: true,
      page,
      pageSize,
    });
    return { ok: true, total: result.total, leads: result.leads };
  } catch (err: any) {
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

    const industries = (run.selectedIndustries as string[]) || [];
    const dateStr = new Date().toISOString().slice(0, 10);
    const companyName = run.companyName || "Autonomous GTM";
    const calibratedProfile = (run.calibrationProfile as any) || {};

    // 1. Create a dedicated lead list in PostgreSQL
    const listId = crypto.randomUUID();
    await db.insert(schema.leadLists).values({
      id: listId,
      userId: user.id,
      workspaceId: workspace.id,
      name: `${companyName} AutoGTM Leads (${dateStr})`,
    });

    // 2. Fetch matched verified leads from SQLite directory. Rotate the offset
    // by run id so consecutive campaigns do not target the same first 500 rows.
    const leadOffset = stableHash(runId) % 5000;
    const matchingDirectoryLeads = fetchTargetedLeads(
      industries,
      getTargetTitles(run),
      500,
      leadOffset
    );

    if (matchingDirectoryLeads.length === 0) {
      throw new Error(
        "No verified leads match the selected industries. Refine the ICP or pick another industry facet."
      );
    }

    const CHUNK = 100;
    for (let i = 0; i < matchingDirectoryLeads.length; i += CHUNK) {
      const batch = matchingDirectoryLeads.slice(i, i + CHUNK);
      await db
        .insert(schema.leads)
        .values(
          batch.map((dl) => ({
            id: crypto.randomUUID(),
            userId: user.id,
            workspaceId: workspace.id,
            listId,
            email: dl.email,
            firstName: dl.firstName,
            lastName: dl.lastName,
            company: dl.companyName,
            website: dl.companyWebsite,
            linkedin: dl.linkedinUrl,
            jobTitle: dl.jobTitle,
            location: dl.location,
            phone: dl.phone,
            industry: dl.industry,
            status: "new" as const,
            customFields: compactCustomFields(dl.rawAttributes),
            tags: ["autogtm", "b2b-verified"],
          }))
        )
        .onConflictDoNothing();
    }

    // 3. Create calibrated Email Template in PostgreSQL.
    // The user explicitly approved these samples, so prefer them over a
    // synthesized template. Spintax is added deterministically at this layer.
    const primarySample = approvedSamples[0] || {
      subject: calibratedProfile.calibratedSubjectTemplate || `Accelerating growth for {{company}}`,
      bodyText:
        calibratedProfile.calibratedBodyTemplate ||
        `Hi {{first_name}},\n\nWould love to share how our team helps companies in your space scale operations.\n\nBest,\n{{sender_name}}`,
      bodyHtml: `<p>Hi {{first_name}},</p><p>Would love to share how our team helps companies in your space scale operations.</p><p>Best,<br/>{{sender_name}}</p>`,
    };

    const finalSubject = primarySample.subject || calibratedProfile.calibratedSubjectTemplate;
    const finalBodyText = ensureOutreachSpintax(
      primarySample.bodyText || calibratedProfile.calibratedBodyTemplate
    );
    const finalBodyHtml = ensureOutreachSpintax(
      primarySample.bodyHtml || `<p>${finalBodyText.replace(/\n/g, "<br/>")}</p>`
    );

    const templateId = crypto.randomUUID();
    await db.insert(schema.emailTemplates).values({
      id: templateId,
      userId: user.id,
      name: `${companyName} Calibrated Template`,
      subject: finalSubject,
      bodyText: finalBodyText,
      bodyHtml: finalBodyHtml,
      format: "text",
    });

    // 4. Create running Campaign
    const campaignId = crypto.randomUUID();
    await db.insert(schema.campaigns).values({
      id: campaignId,
      userId: user.id,
      workspaceId: workspace.id,
      name: `AutoGTM: ${companyName}`,
      status: "running",
      leadListId: listId,
      templateId,
      dailyLimit: Math.min(500, Math.max(30, dailyLimit)),
      minDelaySec: 45,
      maxDelaySec: 120,
      maxEmailsPerSenderPerDay: 30, // hard per-mailbox ceiling
      stopOnReply: true,
      retryFailed: true,
      trackOpens: true,
      startedAt: nowIso(),
    });

    const offers = (run.offers as any[]) || [];
    const activeOffer = offers[selectedOfferIndex] || offers[0] || {
      title: "Direct Value Offer",
      angle: "Direct ROI",
      valueProp: "Accelerate your team's workflow and output.",
      cta: "Open to a brief 4-minute demo this Thursday?",
    };

    // 4b. Create 3-touch sequence: Step 1 (Opener), Step 2 (Follow-Up 1, +3d), Step 3 (Follow-Up 2, +4d)
    // Step 1: Main Opener (Day 0)
    const step1Id = crypto.randomUUID();
    await db.insert(schema.sequenceSteps).values({
      id: step1Id,
      campaignId,
      position: 1,
      delayDays: 0,
    });

    const styleExemplars: Array<{ subject: string; bodyText: string; recipientTitle?: string }> =
      Array.isArray(calibratedProfile.styleExemplars) && calibratedProfile.styleExemplars.length > 0
        ? calibratedProfile.styleExemplars
        : (approvedSamples || [])
            .filter((s) => s && s.approved !== false)
            .slice(0, 3)
            .map((s) => ({
              subject: s.subject || "",
              bodyText: s.bodyText || "",
              recipientTitle: s.recipientTitle,
            }));

    const aiPromptStep1 = [
      calibratedProfile.customAiInstruction ||
        `Company: ${companyName}. Value offer: ${activeOffer.valueProp}. Angle: ${activeOffer.angle}. Call to action: ${activeOffer.cta}. Write a first-touch cold email in 35-70 words. No pleasantries, no self-intro, no feature dump. One specific observation, one friction, one low-friction permission question.`,
      `SPINTAX: include {Hi|Hey|Hello} and at least one other {a|b} variant group. Never spin names, companies, numbers, or factual claims.`,
      `Do not mention DNS, mailboxes, inbox warmup, or deliverability unless the campaign explicitly asks for it.`,
    ].join("\n\n");

    // Structured envelope: carries the user's offer, approved exemplars, and
    // rejection constraints to the send-time generator through the DB.
    const sendContext = buildCampaignContext(run, activeOffer);
    const stepPrompt = (instruction: string) =>
      JSON.stringify({
        instruction,
        context: sendContext,
        styleExamples: styleExemplars,
        negativeConstraints: calibratedProfile.rejectionConstraints || [],
        requireSpintax: true,
      });

    await db.insert(schema.sequenceStepVariants).values({
      id: crypto.randomUUID(),
      stepId: step1Id,
      label: "A",
      subject: finalSubject,
      bodyText: finalBodyText,
      bodyHtml: finalBodyHtml,
      aiGenerateOnTheFly: true,
      aiPrompt: stepPrompt(aiPromptStep1),
    });

    // Step 2: Follow-Up #1 (Day 3, +3 days delay) - Value & Asset Drop (NO "just checking in")
    const step2Id = crypto.randomUUID();
    await db.insert(schema.sequenceSteps).values({
      id: step2Id,
      campaignId,
      position: 2,
      delayDays: 3,
    });

    const step2Subject = finalSubject.toLowerCase().startsWith("re:")
      ? finalSubject
      : `re: ${finalSubject}`;
    const step2BodyText = ensureOutreachSpintax(
      `Hi {{first_name}},\n\nPut together a short breakdown of where {{company}} is likely losing time in this workflow.\n\nWould you prefer I share the link here or send it to another email?\n\nBest,\n{{sender_name}}`
    );
    const step2BodyHtml = ensureOutreachSpintax(
      `<p>Hi {{first_name}},</p><p>Put together a short breakdown of where {{company}} is likely losing time in this workflow.</p><p>Would you prefer I share the link here or send it to another email?</p><p>Best,<br/>{{sender_name}}</p>`
    );
    const aiPromptStep2 = `Write follow-up #1 (sent 3 days after initial message) for ${companyName}. Recipient is {{job_title}} at {{company}}. Never say "just checking in" or "following up". Offer a 60-second asset or micro-audit tailored to ${activeOffer.valueProp}. Strictly under 35 words. Low-friction permission CTA.`;

    await db.insert(schema.sequenceStepVariants).values({
      id: crypto.randomUUID(),
      stepId: step2Id,
      label: "A",
      subject: step2Subject,
      bodyText: step2BodyText,
      bodyHtml: step2BodyHtml,
      aiGenerateOnTheFly: true,
      aiPrompt: stepPrompt(aiPromptStep2),
    });

    // Step 3: Follow-Up #2 (Day 7, +4 days delay) - 9-Word Permission Breakup
    const step3Id = crypto.randomUUID();
    await db.insert(schema.sequenceSteps).values({
      id: step3Id,
      campaignId,
      position: 3,
      delayDays: 4,
    });

    const step3Subject = finalSubject.toLowerCase().startsWith("re:")
      ? finalSubject
      : `re: ${finalSubject}`;
    const step3BodyText = ensureOutreachSpintax(
      `Hi {{first_name}},\n\nAssuming you're heads-down scaling {{company}} right now and this isn't a priority.\n\nShould I close your file for now, or check back with you next quarter?\n\nBest,\n{{sender_name}}`
    );
    const step3BodyHtml = ensureOutreachSpintax(
      `<p>Hi {{first_name}},</p><p>Assuming you're heads-down scaling {{company}} right now and this isn't a priority.</p><p>Should I close your file for now, or check back with you next quarter?</p><p>Best,<br/>{{sender_name}}</p>`
    );
    const aiPromptStep3 = `Write follow-up #2 (final breakup email, sent 7 days after initial outreach) for ${companyName}. Recipient is {{job_title}} at {{company}}. Zero guilt, polite permission close. Under 25 words. Ask if we should close the file or check back next quarter.`;

    await db.insert(schema.sequenceStepVariants).values({
      id: crypto.randomUUID(),
      stepId: step3Id,
      label: "A",
      subject: step3Subject,
      bodyText: step3BodyText,
      bodyHtml: step3BodyHtml,
      aiGenerateOnTheFly: true,
      aiPrompt: stepPrompt(aiPromptStep3),
    });

    // 5. Bind Active System Pool Mailboxes to campaign_senders
    const systemSenders = await db
      .select({ id: schema.senderAccounts.id })
      .from(schema.senderAccounts)
      .where(
        and(
          eq(schema.senderAccounts.isSystemPool, true),
          eq(schema.senderAccounts.status, "active"),
          isNull(schema.senderAccounts.deletedAt)
        )
      );

    if (systemSenders.length === 0) {
      throw new Error(
        "No active shared mailboxes are available. Ask an admin to add or reactivate a system-pool sender before launching."
      );
    }

    await db
      .insert(schema.campaignSenders)
      .values(
        systemSenders.map((s) => ({
          campaignId,
          senderId: s.id,
        }))
      )
      .onConflictDoNothing();

    // 6. Snapshot Leads into campaignLeads
    await ensureCampaignLeadSnapshot(db, campaignId, listId);

    // 7. Update ChadGTM Run to active
    await db
      .update(schema.chadGtmRuns)
      .set({
        status: "active",
        campaignId,
        dailyEmailLimit: dailyLimit,
        approvedEmailSamples: approvedSamples,
        updatedAt: nowIso(),
      })
      .where(eq(schema.chadGtmRuns.id, runId));

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
    };
    let recentActivity: Array<{
      id: string;
      type: "send" | "reply" | "open";
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
      const [sentLifetimeRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.campaignLeads)
        .where(
          and(
            eq(schema.campaignLeads.campaignId, run.campaignId),
            eq(schema.campaignLeads.status, "sent")
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
      kpis.replyRate =
        kpis.sentLifetime > 0 ? Math.round((kpis.repliesCount / kpis.sentLifetime) * 100) : 0;

      kpis.positiveSentimentCount = replyRows.filter(
        (r) => r.tag === "interested" || r.tag === "meeting_booked"
      ).length;

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

      for (const r of replyRows.slice(0, 5)) {
        recentActivity.push({
          id: r.id,
          type: "reply",
          recipient: r.fromEmail,
          timestamp: r.receivedAt,
          detail: r.tag ? `Disposition: ${r.tag.replace(/_/g, " ")}` : r.snippet,
        });
      }

      recentActivity.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
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

    await db
      .update(schema.chadGtmRuns)
      .set({ status: newStatus, updatedAt: nowIso() })
      .where(eq(schema.chadGtmRuns.id, runId));

    if (run?.campaignId) {
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

    await db
      .update(schema.chadGtmRuns)
      .set({ dailyEmailLimit: dailyLimit, updatedAt: nowIso() })
      .where(eq(schema.chadGtmRuns.id, runId));

    if (run?.campaignId) {
      await db
        .update(schema.campaigns)
        .set({ dailyLimit, updatedAt: nowIso() })
        .where(eq(schema.campaigns.id, run.campaignId));
    }

    revalidatePath(`/chad-gtm/${runId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update daily velocity." };
  }
}
