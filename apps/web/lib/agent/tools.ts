import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { auditDomainDns } from "@smartreach/email-engine/ai";
import {
  scrapeCompanyWebsite,
  synthesizeGtmStrategy,
  type ScrapedCompanyData,
  type SynthesizedGtmStrategy,
} from "../chad-gtm-research";
import {
  getDirectoryFacets,
  searchLeadsDirectory,
} from "../leads-directory";
import { getWorkspaceAiOptions } from "../ai";
import { ensureChadGtmTables } from "../db";
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
  { url: string; notes?: string },
  { chadGtmRunId: string }
> = {
  name: "persist_gtm_run",
  description:
    "Persist the synthesized strategy as a chad_gtm_runs row so the wizard and mission control can use it.",
  inputSchema: z.object({ url: z.string().min(3), notes: z.string().optional() }),
  outputSchema: z.object({ chadGtmRunId: z.string() }),
  timeoutMs: 30_000,
  async run(_input, ctx) {
    const strategy = ctx.state.strategy as SynthesizedGtmStrategy | undefined;
    if (!strategy) {
      throw new Error("synthesize_strategy must complete before persist_gtm_run");
    }

    await ensureChadGtmTables(ctx.db);
    const runId = crypto.randomUUID();
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
      dailyEmailLimit: 30,
      approvedEmailSamples: [],
      agentRunId: ctx.run.id,
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
  async run(input) {
    const pageSize = input.limit ?? 25;
    const result = searchLeadsDirectory({
      industries: input.industries,
      jobTitles: input.titles,
      hasEmail: true,
      page: input.page ?? 1,
      pageSize,
    });
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

    const today = new Date().toISOString().slice(0, 10);
    const [leadCount] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.campaignLeads)
      .where(eq(schema.campaignLeads.campaignId, input.campaignId));
    const [sentCount] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.campaignLeads)
      .where(
        and(
          eq(schema.campaignLeads.campaignId, input.campaignId),
          eq(schema.campaignLeads.status, "sent")
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
