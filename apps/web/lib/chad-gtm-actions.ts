"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
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
  type LeadProfile,
} from "./ai";
import { ensureCampaignLeadSnapshot } from "./campaign-drafts";

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
  selectedOfferIndex = 0
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

    if (!run) throw new Error("ChadGTM session not found.");

    const industries = (run.selectedIndustries as string[]) || [];
    const offers = (run.offers as any[]) || [];
    const activeOffer = offers[selectedOfferIndex] || offers[0] || {
      title: "Direct Value Offer",
      angle: "Direct ROI",
      valueProp: "Accelerate your team's workflow and output.",
      cta: "Open to a brief 4-minute demo this Thursday?",
    };

    // Get 10 sample verified leads from SQLite directory
    const matchingLeads = getMatchingDirectoryLeadsForExport(
      {
        industries: industries.length > 0 ? industries : undefined,
        hasEmail: true,
      },
      10
    );

    const aiOpts = await getWorkspaceAiOptions(user.id);
    const overview = run.businessOverview as any;

    const emailSamples = await Promise.all(
      matchingLeads.map(async (dl, idx) => {
        const leadProfile: LeadProfile = {
          id: dl.leadId,
          email: dl.email,
          firstName: dl.firstName,
          lastName: dl.lastName,
          company: dl.companyName,
          jobTitle: dl.jobTitle,
          industry: dl.industry,
          location: dl.location,
        };

        const instruction = `Product/Company: ${run.companyName}.
Summary: ${overview?.summary || "Leading B2B solution"}.
Core Value Offer: ${activeOffer.valueProp}.
Outreach Angle: ${activeOffer.angle}.
Call to Action: ${activeOffer.cta}.
Pitch this value offer directly to ${dl.jobTitle} at ${dl.companyName}.`;

        const script = await generateEmailScriptOnTheFly({
          ...aiOpts,
          lead: leadProfile,
          customInstruction: instruction,
          senderName: user.name || "Alex",
          fallbackSubject: `${activeOffer.angle}: Quick question for ${dl.companyName || "your team"}`,
          fallbackBody: `Hi ${dl.firstName || "there"},\n\nBetween scaling operations across ${dl.industry || "your industry"} and driving revenue, ${activeOffer.valueProp}\n\n${activeOffer.cta}\n\nBest,\n${user.name || "Alex"}`,
          index: idx,
        });

        return {
          id: `sample-${idx + 1}`,
          leadId: dl.leadId,
          recipientName: dl.fullName || `${dl.firstName} ${dl.lastName}`.trim() || "Decision Maker",
          recipientCompany: dl.companyName || "Organization",
          recipientTitle: dl.jobTitle || "Executive",
          recipientIndustry: dl.industry || "Business",
          subject: script.subject,
          bodyText: script.bodyText,
          bodyHtml: script.bodyHtml,
          approved: false,
        };
      })
    );

    return { ok: true, emailSamples };
  } catch (err: any) {
    console.error("[chad-gtm-actions] generateCalibrationEmails error:", err);
    return { ok: false, error: err?.message || "Failed to generate calibration deck." };
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

    if (!run) throw new Error("ChadGTM session not found.");

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
  }))
)}

TASK:
1. In "voiceTone", synthesize the user's desired tone in 4-8 words (e.g. "Direct, low-friction, peer-to-peer technical").
2. In "analysisSummary", write 2 punchy sentences summarizing what they liked about the approved emails and what specific traits they rejected.
3. In "keyAdjustments", list exactly 3 concrete adjustments made to all future copies (e.g. "Eliminated introductory fluff greetings", "Kept body strictly under 60 words", "Replaced calendar links with 4-minute curiosity questions").
4. In "dos", list 3 strict writing rules to follow for this campaign.
5. In "donts", list 3 strict rules of what to NEVER do.
6. In "calibratedSubjectTemplate", formulate an optimal subject line template with variables like {{company}} or {{first_name}}.
7. In "calibratedBodyTemplate", formulate the calibrated email body template with variables {{first_name}}, {{company}}, {{job_title}}, {{industry}}, and {{sender_name}}.
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

    // Persist into database
    await db
      .update(schema.chadGtmRuns)
      .set({
        calibrationProfile: profile,
        approvedEmailSamples: approved.length > 0 ? approved : calibrationDeck.slice(0, 3),
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

    if (!run) throw new Error("ChadGTM run not found.");

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
      name: `${companyName} ChadGTM Leads (${dateStr})`,
    });

    // 2. Fetch matched verified leads from SQLite directory (pull 500 targeted leads)
    const matchingDirectoryLeads = getMatchingDirectoryLeadsForExport(
      {
        industries: industries.length > 0 ? industries : undefined,
        hasEmail: true,
      },
      500
    );

    if (matchingDirectoryLeads.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < matchingDirectoryLeads.length; i += CHUNK) {
        const batch = matchingDirectoryLeads.slice(i, i + CHUNK);
        await db.insert(schema.leads).values(
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
            customFields: {},
            tags: ["chad-gtm", "b2b-verified"],
          }))
        );
      }
    }

    // 3. Create calibrated Email Template in PostgreSQL
    const primarySample = approvedSamples[0] || {
      subject: calibratedProfile.calibratedSubjectTemplate || `Accelerating growth for {{company}}`,
      bodyText: calibratedProfile.calibratedBodyTemplate || `Hi {{first_name}},\n\nWould love to share how our team helps companies in your space scale operations.\n\nBest,\n${user.name || "Alex"}`,
      bodyHtml: `<p>Hi {{first_name}},</p><p>Would love to share how our team helps companies in your space scale operations.</p>`,
    };

    const finalSubject = calibratedProfile.calibratedSubjectTemplate || primarySample.subject;
    const finalBodyText = calibratedProfile.calibratedBodyTemplate || primarySample.bodyText;
    const finalBodyHtml = primarySample.bodyHtml || `<p>${finalBodyText.replace(/\n/g, "<br/>")}</p>`;

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
      name: `ChadGTM: ${companyName}`,
      status: "running",
      leadListId: listId,
      templateId,
      dailyLimit: Math.min(500, Math.max(10, dailyLimit)),
      minDelaySec: 60,
      maxDelaySec: 180,
      maxEmailsPerSenderPerDay: 30, // Target pace 30 emails/mailbox
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

    const aiPromptStep1 =
      calibratedProfile.customAiInstruction ||
      `Product/Company: ${companyName}. Value Offer: ${primarySample.bodyText}. Voice: Direct, technical peer-to-peer. Keep under 65 words. Zero fluff greetings.`;

    await db.insert(schema.sequenceStepVariants).values({
      id: crypto.randomUUID(),
      stepId: step1Id,
      label: "A",
      subject: finalSubject,
      bodyText: finalBodyText,
      bodyHtml: finalBodyHtml,
      aiGenerateOnTheFly: true,
      aiPrompt: aiPromptStep1,
    });

    // Step 2: Follow-Up #1 (Day 3, +3 days delay) - Value & Social Proof Bump
    const step2Id = crypto.randomUUID();
    await db.insert(schema.sequenceSteps).values({
      id: step2Id,
      campaignId,
      position: 2,
      delayDays: 3,
    });

    const step2Subject = finalSubject.toLowerCase().startsWith("re:")
      ? finalSubject
      : `Re: ${finalSubject}`;
    const step2BodyText = `Hi {{first_name}},\n\nWanted to quickly follow up on my previous note. Most {{industry}} leaders we speak with are looking to scale outbound pipeline without adding $400/mo in fragmented SaaS tools.\n\nDid you have 4 minutes this week to compare notes?\n\nBest,\n${user.name || "Alex"}`;
    const step2BodyHtml = `<p>Hi {{first_name}},</p><p>Wanted to quickly follow up on my previous note. Most {{industry}} leaders we speak with are looking to scale outbound pipeline without adding $400/mo in fragmented SaaS tools.</p><p>Did you have 4 minutes this week to compare notes?</p><p>Best,<br/>${user.name || "Alex"}</p>`;
    const aiPromptStep2 = `Write follow-up #1 (sent 3 days after initial message) for ${companyName}. Recipient is {{job_title}} at {{company}}. Reference previous note regarding ${activeOffer.valueProp}. Keep under 45 words. Soft, professional bump.`;

    await db.insert(schema.sequenceStepVariants).values({
      id: crypto.randomUUID(),
      stepId: step2Id,
      label: "A",
      subject: step2Subject,
      bodyText: step2BodyText,
      bodyHtml: step2BodyHtml,
      aiGenerateOnTheFly: true,
      aiPrompt: aiPromptStep2,
    });

    // Step 3: Follow-Up #2 (Day 7, +4 days delay) - Clean Permission Breakup Hook
    const step3Id = crypto.randomUUID();
    await db.insert(schema.sequenceSteps).values({
      id: step3Id,
      campaignId,
      position: 3,
      delayDays: 4,
    });

    const step3Subject = finalSubject.toLowerCase().startsWith("re:")
      ? finalSubject
      : `Re: ${finalSubject}`;
    const step3BodyText = `Hi {{first_name}},\n\nAssuming you're heads-down scaling {{company}} right now and outbound automation isn't top of mind.\n\nShould I close your file for now, or check back with you next quarter?\n\nBest,\n${user.name || "Alex"}`;
    const step3BodyHtml = `<p>Hi {{first_name}},</p><p>Assuming you're heads-down scaling {{company}} right now and outbound automation isn't top of mind.</p><p>Should I close your file for now, or check back with you next quarter?</p><p>Best,<br/>${user.name || "Alex"}</p>`;
    const aiPromptStep3 = `Write follow-up #2 (final breakup email, sent 7 days after initial outreach) for ${companyName}. Recipient is {{job_title}} at {{company}}. Polite, zero-pressure permission to close file or check back next quarter. Under 35 words.`;

    await db.insert(schema.sequenceStepVariants).values({
      id: crypto.randomUUID(),
      stepId: step3Id,
      label: "A",
      subject: step3Subject,
      bodyText: step3BodyText,
      bodyHtml: step3BodyHtml,
      aiGenerateOnTheFly: true,
      aiPrompt: aiPromptStep3,
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

    if (systemSenders.length > 0) {
      await db.insert(schema.campaignSenders).values(
        systemSenders.map((s) => ({
          campaignId,
          senderId: s.id,
        }))
      );
    }

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
    return { ok: false, error: err?.message || "Failed to launch ChadGTM campaign." };
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
