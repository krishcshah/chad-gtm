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
      subject: `Accelerating growth for {{company}}`,
      bodyText: `Hi {{first_name}},\n\nWould love to share how our team helps companies in your space scale operations.\n\nBest,\n${user.name || "Alex"}`,
      bodyHtml: `<p>Hi {{first_name}},</p><p>Would love to share how our team helps companies in your space scale operations.</p>`,
    };

    const templateId = crypto.randomUUID();
    await db.insert(schema.emailTemplates).values({
      id: templateId,
      userId: user.id,
      name: `${companyName} Calibrated Template`,
      subject: primarySample.subject,
      bodyText: primarySample.bodyText,
      bodyHtml: primarySample.bodyHtml || primarySample.bodyText,
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
