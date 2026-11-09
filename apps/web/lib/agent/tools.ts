import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { localDateKey } from "@smartreach/shared";
import { auditDomainDns } from "@smartreach/email-engine/ai";
import {
  scrapeCompanyWebsite,
  synthesizeGtmStrategy,
  type ScrapedCompanyData,
  type SynthesizedGtmStrategy,
} from "../chad-gtm-research";
import {
  getDirectoryFacets,
  searchLeadsDirectoryForAccess,
  type DirectoryAccessLevel,
} from "../leads-directory";
import { getDirectoryAccessLevel } from "../b2b-access";
import { getWorkspaceAiOptions } from "../ai";
import { ensureChadGtmTables } from "../db";
import { AUTOPILOT_DAILY_DEFAULT, autopilotCountries, clampAutopilotDaily } from "../autopilot-policy";
import { initialRunReplyMode } from "../lead-conversations-server";
import type { ToolDefinition } from "./types";

const scrapedSchema = z
  .object({
    url: z.string(),
    domain: z.string(),
    title: z.string(),
    description: z.string(),
    headings: z.array(z.string()),
    bodySnippets: z.array(z.string()),
    subpageSnippets: z.array(z.object({ path: z.string(), text: z.string() })),
    fetchFailed: z.boolean(),
  })
  .passthrough();

const strategySchema = z
  .object({
    companyName: z.string(),
    businessOverview: z.record(z.any()),
    icpProfile: z.record(z.any()),
    offers: z.array(z.record(z.any())),
    scrapedData: z.record(z.any()),
  })
  .passthrough();

export const crawlCompanyTool: ToolDefinition<
  { url: string },
  ScrapedCompanyData
> = {
  name: "crawl_company",
  description:
    "Crawl a company website (homepage + high-value subpages) and return structured positioning, pricing, proof, and competitor signals.",
  inputSchema: z.object({ url: z.string().min(3) }),
  outputSchema: scrapedSchema as any,
  timeoutMs: 90_000,
  async run(input, ctx) {
    ctx.logger.info("crawling company", { url: input.url });
    return scrapeCompanyWebsite(input.url);
  },
};

export const synthesizeStrategyTool: ToolDefinition<
  { notes?: string },
  SynthesizedGtmStrategy
> = {
  name: "synthesize_strategy",
  description:
    "Turn the crawled corpus into a company overview, multi-persona ICP, and three evidence-aware outbound offers.",
  inputSchema: z.object({ notes: z.string().optional() }),
  outputSchema: strategySchema as any,
  timeoutMs: 120_000,
  async run(input, ctx) {
    const scraped = ctx.state.scraped as ScrapedCompanyData | undefined;
    if (!scraped) {
      throw new Error("crawl_company must complete before synthesize_strategy");
    }
    const aiOptions = await getWorkspaceAiOptions(ctx.userId);
    return synthesizeGtmStrategy(scraped, input.notes, aiOptions);
  },
};

export const persistGtmRunTool: ToolDefinition<
  {
    url: string;
    notes?: string;
    autopilot?: boolean;
    bookingUrl?: string | null;
    existingRunId?: string | null;
    /** Emails per day chosen before the run existed (else the agent run's input, else the default). */
    dailyEmailLimit?: number | null;
  },
  { chadGtmRunId: string }
> = {
  name: "persist_gtm_run",
  description:
    "Persist the synthesized strategy as a chad_gtm_runs row so the wizard and mission control can use it. With existingRunId, re-research that run in place (retry).",
  inputSchema: z.object({
    url: z.string().min(3),
    notes: z.string().optional(),
    autopilot: z.boolean().optional(),
    bookingUrl: z.string().nullable().optional(),
    existingRunId: z.string().nullable().optional(),
    dailyEmailLimit: z.number().nullable().optional(),
  }),
  outputSchema: z.object({ chadGtmRunId: z.string() }),
  timeoutMs: 30_000,
  async run(input, ctx) {
    const strategy = ctx.state.strategy as SynthesizedGtmStrategy | undefined;
    if (!strategy) {
      throw new Error("synthesize_strategy must complete before persist_gtm_run");
    }

    await ensureChadGtmTables(ctx.db);

    if (input.existingRunId) {
      // Retry: refresh the research on the client's existing (unlaunched) run.
      const bookingUrl = input.bookingUrl || strategy.scrapedData.bookingUrl || null;
      const updated = await ctx.db
        .update(schema.chadGtmRuns)
        .set({
          companyName: strategy.companyName,
          status: "reviewing",
          businessOverview: strategy.businessOverview,
          icpProfile: strategy.icpProfile,
          offers: strategy.offers,
          selectedIndustries: strategy.icpProfile.industries || [],
          calibrationProfile: {},
          agentRunId: ctx.run.id,
          ...(bookingUrl ? { bookingUrl } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(schema.chadGtmRuns.id, input.existingRunId),
            eq(schema.chadGtmRuns.userId, ctx.userId),
            isNull(schema.chadGtmRuns.campaignId)
          )
        )
        .returning({ id: schema.chadGtmRuns.id });
      if (updated.length === 0) throw new Error("Run not found or already launched.");
      return { chadGtmRunId: input.existingRunId };
    }
    const runId = crypto.randomUUID();
    // Saved in the insert itself: an approval launch may pick the run up at once.
    const chosenDaily = input.dailyEmailLimit ?? ctx.run?.input?.dailyEmailLimit;
    await ctx.db.insert(schema.chadGtmRuns).values({
      id: runId,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      url: strategy.scrapedData.url,
      companyName: strategy.companyName,
      status: "reviewing",
      businessOverview: strategy.businessOverview,
      icpProfile: strategy.icpProfile,
      offers: strategy.offers,
      selectedIndustries: strategy.icpProfile.industries || [],
      dailyEmailLimit: chosenDaily != null ? clampAutopilotDaily(chosenDaily) : AUTOPILOT_DAILY_DEFAULT,
      approvedEmailSamples: [],
      agentRunId: ctx.run.id,
      bookingUrl: input.bookingUrl || strategy.scrapedData.bookingUrl || null,
      autopilot: Boolean(input.autopilot),
      // "Lead conversations": the workspace default once it is set up.
      replyAgentMode: await initialRunReplyMode(ctx.db, ctx.userId, ctx.workspaceId ?? null),
    });

    return { chadGtmRunId: runId };
  },
};

export const getDirectoryFacetsTool: ToolDefinition<
  Record<string, never>,
  ReturnType<typeof getDirectoryFacets>
> = {
  name: "get_directory_facets",
  description:
    "Read the available B2B directory industries, countries, revenue bands, and team sizes with counts.",
  inputSchema: z.object({}).strict(),
  outputSchema: z
    .object({
      totalLeads: z.number(),
      industries: z.array(
        z.object({ value: z.string(), label: z.string(), count: z.number() })
      ),
      countries: z.array(
        z.object({ value: z.string(), label: z.string(), count: z.number() })
      ),
      revenueRanges: z.array(
        z.object({ value: z.string(), label: z.string(), count: z.number() })
      ),
      teamSizes: z.array(
        z.object({ value: z.string(), label: z.string(), count: z.number() })
      ),
    })
    .passthrough(),
  timeoutMs: 20_000,
  async run() {
    return getDirectoryFacets();
  },
};

const directoryLeadSchema = z
  .object({
    leadId: z.string(),
    email: z.string(),
    fullName: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    jobTitle: z.string(),
    companyName: z.string(),
    industry: z.string(),
    location: z.string(),
  })
  .passthrough();

export const searchLeadsTool: ToolDefinition<
  {
    industries?: string[];
    titles?: string[];
    limit?: number;
    page?: number;
  },
  {
    leads: Array<z.infer<typeof directoryLeadSchema>>;
    total: number;
    page: number;
    pageSize: number;
  }
> = {
  name: "search_leads",
  description:
    "Query the verified B2B directory by industry and job title. Returns a page of leads plus the total match count.",
  inputSchema: z.object({
    industries: z.array(z.string()).optional(),
    titles: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
  }),
  outputSchema: z.object({
    leads: z.array(directoryLeadSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  }),
  timeoutMs: 30_000,
  async run(input, ctx) {
    const level = await resolveAgentDirectoryAccess(ctx);
    const pageSize = input.limit ?? 25;
    // Same paywall as the directory UI: admins and paid accounts see full
    // records; everyone else gets the masked one-page preview.
    const result = searchLeadsDirectoryForAccess(
      {
        industries: input.industries,
        jobTitles: input.titles,
        countries: autopilotCountries(),
        hasEmail: true,
        hasWorkEmail: true,
        page: input.page ?? 1,
        pageSize,
      },
      level
    );
    return {
      leads: result.leads.map((lead) => ({
        leadId: lead.leadId,
        email: lead.email,
        fullName: lead.fullName,
        firstName: lead.firstName,
        lastName: lead.lastName,
        jobTitle: lead.jobTitle,
        companyName: lead.companyName,
        industry: lead.industry,
        location: lead.location,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  },
};

/**
 * Directory access level of the user the agent run belongs to. Unknown users
 * (or lookup failures) get the masked preview.
 */
export async function resolveAgentDirectoryAccess(ctx: {
  userId: string;
  db: any;
}): Promise<DirectoryAccessLevel> {
  try {
    const [user] = await ctx.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        emailVerified: schema.users.emailVerified,
      })
      .from(schema.users)
      .where(eq(schema.users.id, ctx.userId))
      .limit(1);
    if (!user) return "none";
    return await getDirectoryAccessLevel(user);
  } catch {
    return "none";
  }
}

export const getCampaignStatsTool: ToolDefinition<
  { campaignId: string },
  {
    campaignId: string;
    name: string;
    status: string;
    leads: number;
    sent: number;
    sentToday: number;
    opens: number;
    replies: number;
    positiveReplies: number;
  }
> = {
  name: "get_campaign_stats",
  description:
    "Read deterministic campaign KPIs (leads, sent, opens, replies, positive replies) for monitoring and analysis.",
  inputSchema: z.object({ campaignId: z.string().min(1) }),
  outputSchema: z.object({
    campaignId: z.string(),
    name: z.string(),
    status: z.string(),
    leads: z.number(),
    sent: z.number(),
    sentToday: z.number(),
    opens: z.number(),
    replies: z.number(),
    positiveReplies: z.number(),
  }),
  timeoutMs: 20_000,
  async run(input, ctx) {
    const [campaign] = await ctx.db
      .select()
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.id, input.campaignId),
          eq(schema.campaigns.userId, ctx.userId)
        )
      )
      .limit(1);
    if (!campaign) throw new Error("Campaign not found");

    // The campaign counter is keyed by the campaign's local day.
    const today = localDateKey(new Date(), campaign.sendingTimezone || "UTC");
    const [leadCount] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.campaignLeads)
      .where(eq(schema.campaignLeads.campaignId, input.campaignId));
    const [sentCount] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emailJobs)
      .where(
        and(
          eq(schema.emailJobs.campaignId, input.campaignId),
          eq(schema.emailJobs.status, "sent")
        )
      );
    const [opensCount] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emailTrackingEvents)
      .where(
        and(
          eq(schema.emailTrackingEvents.campaignId, input.campaignId),
          eq(schema.emailTrackingEvents.type, "open")
        )
      );
    const replyRows = await ctx.db
      .select({ tag: schema.replies.tag })
      .from(schema.replies)
      .where(eq(schema.replies.campaignId, input.campaignId));
    const [sentTodayRow] = await ctx.db
      .select({ count: schema.usageCounters.count })
      .from(schema.usageCounters)
      .where(
        and(
          eq(schema.usageCounters.entityType, "campaign"),
          eq(schema.usageCounters.entityId, input.campaignId),
          eq(schema.usageCounters.date, today)
        )
      );

    return {
      campaignId: campaign.id,
      name: campaign.name,
      status: campaign.status,
      leads: Number(leadCount?.count ?? 0),
      sent: Number(sentCount?.count ?? 0),
      sentToday: Number(sentTodayRow?.count ?? 0),
      opens: Number(opensCount?.count ?? 0),
      replies: replyRows.length,
      positiveReplies: replyRows.filter(
        (row: { tag: string | null }) =>
          row.tag === "interested" || row.tag === "meeting_booked"
      ).length,
    };
  },
};

export const checkDomainDnsTool: ToolDefinition<
  { domain: string },
  { hasDefect: boolean; description?: string }
> = {
  name: "check_domain_dns",
  description:
    "Check a domain's DMARC and SPF records using the system resolver.",
  inputSchema: z.object({ domain: z.string().min(3) }),
  outputSchema: z.object({
    hasDefect: z.boolean(),
    description: z.string().optional(),
  }),
  timeoutMs: 15_000,
  async run(input) {
    return auditDomainDns(input.domain);
  },
};

export const PHASE_1_TOOLS = [
  crawlCompanyTool,
  synthesizeStrategyTool,
  persistGtmRunTool,
  getDirectoryFacetsTool,
  searchLeadsTool,
  getCampaignStatsTool,
  checkDomainDnsTool,
];
